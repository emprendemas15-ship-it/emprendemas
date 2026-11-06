alter table public.business_records
  drop constraint business_records_module_check,
  add constraint business_records_module_check check (module in (
    'sales', 'expenses', 'purchases', 'inventory', 'customers', 'suppliers',
    'employees', 'payroll', 'cash', 'money-movements', 'receivables', 'payables',
    'raw-materials', 'production', 'receivable-payments', 'payable-payments', 'stock-movements'
  ));

create or replace function public.apply_financial_transaction(
  p_records jsonb,
  p_stock_adjustments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  company_id_for_user uuid := public.current_company_id();
  record_item jsonb;
  stock_item jsonb;
  current_record public.business_records%rowtype;
  current_quantity numeric;
  delta numeric;
  new_quantity numeric;
  incoming_cost numeric;
  current_cost numeric;
  updated_count integer;
begin
  if company_id_for_user is null then
    raise exception 'No active business is associated with this user';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0
     or jsonb_typeof(p_stock_adjustments) <> 'array' then
    raise exception 'Transaction records and stock adjustments must be arrays';
  end if;

  for record_item in select value from jsonb_array_elements(p_records)
  loop
    if nullif(record_item ->> 'id', '') is null
       or nullif(record_item ->> 'module', '') is null
       or jsonb_typeof(record_item -> 'payload') is distinct from 'object' then
      raise exception 'Each transaction record requires an id, module and object payload';
    end if;
    insert into public.business_records as target (id, company_id, module, payload, created_at, updated_at)
    values (
      (record_item ->> 'id')::uuid,
      company_id_for_user,
      record_item ->> 'module',
      record_item -> 'payload',
      coalesce(nullif(record_item ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_item ->> 'updated_at', '')::timestamptz, now())
    )
    on conflict (id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at
      where target.company_id = company_id_for_user
        and target.module = excluded.module;
    get diagnostics updated_count = row_count;
    if updated_count = 0 then
      raise exception 'Transaction record is not owned by the active business';
    end if;
  end loop;

  for stock_item in select value from jsonb_array_elements(p_stock_adjustments)
  loop
    select * into current_record
    from public.business_records
    where id = (stock_item ->> 'id')::uuid
      and company_id = company_id_for_user
      and module in ('inventory', 'raw-materials')
    for update;
    if not found then
      raise exception 'Stock item not found in the active business';
    end if;
    current_quantity := coalesce(nullif(current_record.payload ->> 'quantity', '')::numeric, 0);
    delta := (stock_item ->> 'delta')::numeric;
    new_quantity := current_quantity + delta;
    if new_quantity < 0 then
      raise exception 'Insufficient stock: available %, requested %', current_quantity, abs(delta);
    end if;
    current_cost := coalesce(nullif(current_record.payload ->> 'cost', '')::numeric, 0);
    incoming_cost := nullif(stock_item ->> 'cost', '')::numeric;
    if delta > 0 and incoming_cost is not null and new_quantity > 0 then
      current_record.payload := jsonb_set(
        current_record.payload,
        '{cost}',
        to_jsonb(((current_quantity * current_cost) + (delta * incoming_cost)) / new_quantity),
        true
      );
    end if;
    current_record.payload := jsonb_set(current_record.payload, '{quantity}', to_jsonb(new_quantity), true);
    update public.business_records
    set payload = current_record.payload, updated_at = now()
    where id = current_record.id and company_id = company_id_for_user;
  end loop;
end;
$$;

revoke all on function public.apply_financial_transaction(jsonb, jsonb) from public, anon;
grant execute on function public.apply_financial_transaction(jsonb, jsonb) to authenticated;
