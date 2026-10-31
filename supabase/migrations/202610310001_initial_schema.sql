create extension if not exists pgcrypto with schema extensions;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  activity text not null check (activity in (
    'Papelería',
    'Accesorios para el hogar',
    'Restaurante de comidas rápidas',
    'Otro'
  )),
  owner_name text not null check (length(trim(owner_name)) between 1 and 160),
  contact_email text not null,
  contact_phone text not null default '',
  location text not null default '',
  currency text not null default 'COP',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete restrict,
  full_name text not null default '',
  email text not null,
  role text not null check (role in (
    'platform_admin',
    'owner',
    'administrator',
    'employee',
    'unassigned'
  )),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  constraint platform_admin_has_no_company check (role <> 'platform_admin' or company_id is null),
  constraint company_profile_has_company check (
    role not in ('owner', 'administrator', 'employee') or company_id is not null
  )
);

create index profiles_company_id_idx on public.profiles (company_id);

create table public.business_records (
  id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  module text not null check (module in (
    'sales',
    'expenses',
    'purchases',
    'inventory',
    'customers',
    'suppliers',
    'employees',
    'payroll',
    'cash',
    'money-movements',
    'receivables',
    'payables'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_records_company_module_updated_idx
  on public.business_records (company_id, module, updated_at desc);

create table public.business_settings (
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.platform_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  activity text not null,
  owner_name text not null,
  contact_email text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'platform_admin'
      and status = 'active'
  );
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select profile.company_id
  from public.profiles as profile
  join public.companies as company on company.id = profile.company_id
  where profile.id = (select auth.uid())
    and profile.status = 'active'
    and profile.role in ('owner', 'administrator', 'employee')
    and company.status = 'active';
$$;

create or replace function public.current_company_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and status = 'active'
    and role in ('owner', 'administrator', 'employee');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  new_company_id uuid;
  signup_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', '');
  owner_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160);
  business_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 160);
  activity_name text := coalesce(new.raw_user_meta_data ->> 'activity', '');
begin
  if account_type = 'business' then
    if owner_name = ''
       or business_name = ''
       or activity_name not in (
         'Papelería',
         'Accesorios para el hogar',
         'Restaurante de comidas rápidas',
         'Otro'
       ) then
      raise exception 'Business signup information is incomplete or invalid';
    end if;

    insert into public.companies (
      owner_user_id, name, activity, owner_name, contact_email, contact_phone
    )
    values (
      new.id,
      business_name,
      activity_name,
      owner_name,
      coalesce(new.email, ''),
      left(coalesce(new.raw_user_meta_data ->> 'contact_phone', ''), 80)
    )
    returning id into new_company_id;

    insert into public.profiles (id, company_id, full_name, email, role, status)
    values (new.id, new_company_id, owner_name, coalesce(new.email, ''), 'owner', 'active');
  else
    insert into public.profiles (id, full_name, email, role, status)
    values (
      new.id,
      owner_name,
      coalesce(new.email, ''),
      'unassigned',
      'inactive'
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.admin_update_company(
  p_company_id uuid,
  p_name text,
  p_activity text,
  p_owner_name text,
  p_contact_email text,
  p_contact_phone text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 160
     or length(trim(coalesce(p_owner_name, ''))) not between 1 and 160
     or coalesce(p_activity, '') not in (
       'Papelería',
       'Accesorios para el hogar',
       'Restaurante de comidas rápidas',
       'Otro'
     )
     or coalesce(p_status, '') not in ('active', 'inactive') then
    raise exception 'Invalid company metadata';
  end if;

  update public.companies
  set name = trim(p_name),
      activity = p_activity,
      owner_name = trim(p_owner_name),
      contact_email = coalesce(p_contact_email, ''),
      contact_phone = left(coalesce(p_contact_phone, ''), 80),
      status = p_status
  where id = p_company_id;
  if not found then
    raise exception 'Company not found';
  end if;
end;
$$;

create or replace function public.admin_update_company_user(
  p_user_id uuid,
  p_role text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if coalesce(p_role, '') not in ('administrator', 'employee')
     or coalesce(p_status, '') not in ('active', 'inactive') then
    raise exception 'Invalid company user access settings';
  end if;

  update public.profiles
  set role = p_role,
      status = p_status
  where id = p_user_id
    and company_id is not null
    and role in ('administrator', 'employee');
  if not found then
    raise exception 'Company user not found or cannot be modified';
  end if;
end;
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.business_records enable row level security;
alter table public.business_settings enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_requests enable row level security;

create policy "company members and platform admins read company metadata"
  on public.companies for select to authenticated
  using (id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "users read their own profile or same-company profile"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      company_id = (select public.current_company_id())
      and company_id is not null
    )
    or (select public.is_platform_admin())
  );

create policy "company members read company operations"
  on public.business_records for select to authenticated
  using (company_id = (select public.current_company_id()));

create policy "company members create company operations"
  on public.business_records for insert to authenticated
  with check (company_id = (select public.current_company_id()));

create policy "company members update company operations"
  on public.business_records for update to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

create policy "company members delete company operations"
  on public.business_records for delete to authenticated
  using (company_id = (select public.current_company_id()));

create policy "company members read company settings"
  on public.business_settings for select to authenticated
  using (company_id = (select public.current_company_id()));

create policy "company owners and administrators write company settings"
  on public.business_settings for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_company_role()) in ('owner', 'administrator')
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_company_role()) in ('owner', 'administrator')
  );

create policy "platform admins manage platform settings"
  on public.platform_settings for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create policy "platform admins manage registration requests"
  on public.platform_requests for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create or replace function public.restore_company_backup(
  backup_records jsonb,
  backup_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  company_id_for_user uuid := public.current_company_id();
begin
  if company_id_for_user is null
     or public.current_company_role() not in ('owner', 'administrator') then
    raise exception 'Only a company owner or administrator can restore a backup';
  end if;
  if jsonb_typeof(backup_records) <> 'array'
     or jsonb_typeof(backup_settings) <> 'array' then
    raise exception 'Backup collections must be arrays';
  end if;

  delete from public.business_records where company_id = company_id_for_user;
  delete from public.business_settings where company_id = company_id_for_user;

  insert into public.business_records (id, company_id, module, payload, created_at, updated_at)
  select
    (record ->> 'id')::uuid,
    company_id_for_user,
    record ->> 'module',
    record -> 'payload',
    coalesce((record ->> 'created_at')::timestamptz, now()),
    coalesce((record ->> 'updated_at')::timestamptz, now())
  from jsonb_array_elements(backup_records) as record;

  insert into public.business_settings (company_id, key, value, updated_at)
  select
    company_id_for_user,
    setting ->> 'key',
    setting -> 'value',
    coalesce((setting ->> 'updated_at')::timestamptz, now())
  from jsonb_array_elements(backup_settings) as setting;
end;
$$;

revoke all on function public.restore_company_backup(jsonb, jsonb) from public, anon;
grant execute on function public.restore_company_backup(jsonb, jsonb) to authenticated;

grant usage on schema public to authenticated;
grant select on public.companies to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.business_records to authenticated;
grant select, insert, update, delete on public.business_settings to authenticated;
grant select, insert, update, delete on public.platform_settings to authenticated;
grant select, insert, update, delete on public.platform_requests to authenticated;

revoke all on function public.admin_update_company(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_company(uuid, text, text, text, text, text, text) to authenticated;
revoke all on function public.admin_update_company_user(uuid, text, text) from public, anon;
grant execute on function public.admin_update_company_user(uuid, text, text) to authenticated;
