alter table public.platform_requests
  add column auth_user_id uuid references auth.users (id) on delete cascade;

create unique index platform_requests_auth_user_id_idx
  on public.platform_requests (auth_user_id)
  where auth_user_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  new_company_id uuid;
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
      owner_user_id, name, activity, owner_name, contact_email, contact_phone, status
    )
    values (
      new.id,
      business_name,
      activity_name,
      owner_name,
      coalesce(new.email, ''),
      left(coalesce(new.raw_user_meta_data ->> 'contact_phone', ''), 80),
      'inactive'
    )
    returning id into new_company_id;

    insert into public.profiles (id, company_id, full_name, email, role, status)
    values (new.id, new_company_id, owner_name, coalesce(new.email, ''), 'owner', 'inactive');

    insert into public.platform_requests (
      auth_user_id, company_name, activity, owner_name, contact_email, requested_at, status
    )
    values (
      new.id, business_name, activity_name, owner_name, coalesce(new.email, ''), now(), 'pending'
    );
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
declare
  existing_role text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if coalesce(p_role, '') not in ('owner', 'administrator', 'employee')
     or coalesce(p_status, '') not in ('active', 'inactive') then
    raise exception 'Invalid company user access settings';
  end if;

  select role into existing_role
  from public.profiles
  where id = p_user_id
    and company_id is not null
    and role in ('owner', 'administrator', 'employee')
  for update;

  if not found then
    raise exception 'Company user not found or cannot be modified';
  end if;
  if (existing_role = 'owner' and p_role <> 'owner')
     or (existing_role <> 'owner' and p_role = 'owner') then
    raise exception 'The owner role cannot be reassigned';
  end if;

  if existing_role = 'owner' then
    if exists (
      select 1
      from public.platform_requests
      where auth_user_id = p_user_id
        and status = 'pending'
    ) then
      raise exception 'Review the owner registration from the registration requests queue';
    end if;
    if p_status = 'active' then
      update public.companies
      set status = 'active'
      where owner_user_id = p_user_id;
      if not found then
        raise exception 'Owner company not found';
      end if;
      update public.platform_requests
      set status = 'approved',
          updated_at = now()
      where auth_user_id = p_user_id
        and status = 'rejected';
    end if;
  end if;

  update public.profiles
  set role = p_role,
      status = p_status
  where id = p_user_id;
end;
$$;

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

  if p_status = 'active' and exists (
    select 1
    from public.companies as company
    join public.platform_requests as request
      on request.auth_user_id = company.owner_user_id
    where company.id = p_company_id
      and request.status = 'pending'
  ) then
    raise exception 'Review the owner registration from the registration requests queue';
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

create or replace function public.admin_decide_registration(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  registration public.platform_requests%rowtype;
  target_company_id uuid;
  target_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if coalesce(p_decision, '') not in ('approved', 'rejected') then
    raise exception 'Invalid registration decision';
  end if;

  select * into registration
  from public.platform_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Registration request not found';
  end if;
  if registration.status <> 'pending' then
    raise exception 'Registration request has already been reviewed';
  end if;
  if registration.auth_user_id is null then
    raise exception 'This historical request is not linked to an account';
  end if;

  select company.id into target_company_id
  from public.companies as company
  join public.profiles as profile on profile.company_id = company.id
  where profile.id = registration.auth_user_id
    and profile.role = 'owner'
  for update of company, profile;

  if target_company_id is null then
    raise exception 'The registration account has no owner profile and company';
  end if;

  target_status := case when p_decision = 'approved' then 'active' else 'inactive' end;

  update public.companies
  set status = target_status
  where id = target_company_id;

  update public.profiles
  set status = target_status
  where id = registration.auth_user_id
    and company_id = target_company_id
    and role = 'owner';

  update public.platform_requests
  set status = p_decision,
      updated_at = now()
  where id = registration.id;
end;
$$;

create policy "users read their own registration request"
  on public.platform_requests for select to authenticated
  using (auth_user_id = (select auth.uid()));

revoke all on function public.admin_update_company_user(uuid, text, text) from public, anon;
grant execute on function public.admin_update_company_user(uuid, text, text) to authenticated;

revoke all on function public.admin_decide_registration(uuid, text) from public, anon;
grant execute on function public.admin_decide_registration(uuid, text) to authenticated;
