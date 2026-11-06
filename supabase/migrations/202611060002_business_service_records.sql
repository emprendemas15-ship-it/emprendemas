alter table public.business_records
  drop constraint business_records_module_check,
  add constraint business_records_module_check check (module in (
    'sales', 'expenses', 'purchases', 'inventory', 'customers', 'suppliers',
    'employees', 'payroll', 'cash', 'money-movements', 'receivables', 'payables',
    'raw-materials', 'production', 'receivable-payments', 'payable-payments',
    'stock-movements', 'services'
  ));
