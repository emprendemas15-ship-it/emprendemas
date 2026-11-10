import { getSupabase } from "./supabase.js";
import { createBackupSnapshot } from "./db.js";

let identity;

function requireCompany() {
  if (!identity?.company?.id) throw new Error("No hay una empresa activa para esta sesión.");
  return identity.company.id;
}

function databaseError(error, fallback) {
  if (error?.message?.includes("platform_requests.auth_user_id does not exist")) {
    return new Error("Falta aplicar la migración 202610310002_registration_approval_and_user_access.sql en Supabase. Ejecútala en el SQL Editor y vuelve a intentar.");
  }
  if (error?.code === "PGRST202") {
    return new Error("El servidor aún no tiene la migración de operaciones financieras. Aplica 202611060001_linked_financial_transactions.sql en Supabase y vuelve a intentarlo.");
  }
  if (error?.code === "42501" || error?.code === "PGRST301") {
    return new Error("El servidor rechazó este acceso. Verifica tu empresa, rol y permisos.");
  }
  if (error?.message?.toLowerCase().includes("failed to fetch")) {
    return new Error("No hay conexión con Supabase. Conéctate a internet para sincronizar y vuelve a intentar.");
  }
  return new Error(error?.message || fallback);
}

export function setCloudIdentity(value) {
  identity = value;
}

function mapBusinessRecord(row) {
  return {
    ...row.payload,
    id: row.id,
    module: row.module,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getRecords(moduleId) {
  const companyId = requireCompany();
  let query = getSupabase().from("business_records")
    .select("id,module,payload,created_at,updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (moduleId) query = query.eq("module", moduleId);
  const { data, error } = await query;
  if (error) throw databaseError(error, "No fue posible consultar los registros del negocio.");
  return data.map(mapBusinessRecord);
}

async function snapshotCompany() {
  const [records, settings] = await Promise.all([getRecords(), getSettings()]);
  await createBackupSnapshot(records, settings, requireCompany());
}

export async function saveRecord(moduleId, values, existingId) {
  const companyId = requireCompany();
  const supabase = getSupabase();
  let createdAt = new Date().toISOString();
  if (existingId) {
    const { data: existing, error: existingError } = await supabase
      .from("business_records")
      .select("id,company_id,module,created_at")
      .eq("id", existingId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError) throw databaseError(existingError, "No fue posible consultar el registro.");
    if (!existing || existing.module !== moduleId) throw new Error("No se encontró el registro que intentas editar.");
    createdAt = existing.created_at;
  }
  const record = {
    id: existingId || crypto.randomUUID(),
    company_id: companyId,
    module: moduleId,
    payload: values,
    created_at: createdAt,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("business_records").upsert(record, { onConflict: "id" });
  if (error) throw databaseError(error, "No fue posible guardar el registro.");
  await snapshotCompany();
  return mapBusinessRecord(record);
}

export async function saveFinancialTransaction(transaction) {
  const companyId = requireCompany();
  if (!transaction || !Array.isArray(transaction.records) || transaction.records.length === 0 ||
      !Array.isArray(transaction.stockAdjustments)) {
    throw new Error("La operación financiera no contiene registros válidos.");
  }
  const rootRecord = transaction.records.find((record) =>
    ["sales", "purchases", "expenses", "payroll", "production", "receivable-payments", "payable-payments"].includes(record.module)
  ) || transaction.records[0];
  const rootTransactionId = rootRecord.id;
  const records = transaction.records.map((record) => ({
    id: record.id,
    module: record.module,
    payload: Object.fromEntries(
      Object.entries({ ...record, linkedTransactionId: rootTransactionId })
        .filter(([key]) => !["id", "module", "createdAt", "updatedAt"].includes(key))
    ),
    created_at: record.createdAt,
    updated_at: record.updatedAt
  }));
  const { error } = await getSupabase().rpc("apply_financial_transaction", {
    p_records: records,
    p_stock_adjustments: transaction.stockAdjustments
  });
  if (error) throw databaseError(error, "No fue posible aplicar la operación financiera.");
  await snapshotCompany();
  return { companyId, records: transaction.records };
}

export async function deleteRecord(id) {
  const companyId = requireCompany();
  const { error, count } = await getSupabase()
    .from("business_records")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw databaseError(error, "No fue posible eliminar el registro.");
  if (count === 0) throw new Error("No se encontró el registro que intentas eliminar.");
  await snapshotCompany();
}

const transactionRootModules = new Set(["sales", "purchases", "expenses", "payroll", "production"]);
const paymentModules = new Set(["receivable-payments", "payable-payments"]);

function deletionModuleRecords(records, moduleId) {
  if (moduleId === "service-sales") {
    return records.filter((record) => record.module === "sales" && record.serviceId);
  }
  return records.filter((record) => record.module === moduleId);
}

function buildModuleDeletionPlan(records, moduleId, recordId) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const selected = deletionModuleRecords(records, moduleId)
    .filter((record) => !recordId || record.id === recordId);
  if (!selected.length) return { records: [], removedCount: 0, affectedModules: [] };

  const removeIds = new Set(selected.map((record) => record.id));
  const rootQueue = [];
  const queuedRoots = new Set();
  const deletedAccountIds = new Set();
  const paymentRootsToRestore = new Set();

  const enqueueRoot = (id) => {
    if (!id || queuedRoots.has(id)) return;
    queuedRoots.add(id);
    rootQueue.push(id);
  };

  for (const record of selected) {
    if (record.linkedTransactionId) enqueueRoot(record.linkedTransactionId);
    if (transactionRootModules.has(record.module)) enqueueRoot(record.id);
    if (moduleId === "receivable-payments" || moduleId === "payable-payments") {
      enqueueRoot(record.linkedTransactionId || record.id);
    }
    if (moduleId === "money-movements") {
      if (transactionRootModules.has(record.relatedModule)) enqueueRoot(record.relatedId);
      if (record.linkedTransactionId) enqueueRoot(record.linkedTransactionId);
    }
    if (moduleId === "receivables") {
      deletedAccountIds.add(record.id);
      if (record.saleId) enqueueRoot(record.saleId);
    }
    if (moduleId === "payables") {
      deletedAccountIds.add(record.id);
      if (record.purchaseId) enqueueRoot(record.purchaseId);
      if (record.payrollId) enqueueRoot(record.payrollId);
    }
  }

  if (moduleId === "inventory" || moduleId === "raw-materials") {
    const itemIds = new Set(selected.map((record) => record.id));
    for (const movement of records.filter((record) => record.module === "stock-movements" && itemIds.has(record.itemId))) {
      enqueueRoot(movement.linkedTransactionId);
    }
  }

  if (moduleId === "stock-movements") {
    for (const movement of selected) enqueueRoot(movement.linkedTransactionId);
  }

  if (moduleId === "money-movements" || paymentModules.has(moduleId)) {
    for (const rootId of queuedRoots) {
      if (paymentModules.has(byId.get(rootId)?.module)) paymentRootsToRestore.add(rootId);
    }
  }

  for (let index = 0; index < rootQueue.length; index += 1) {
    const rootId = rootQueue[index];
    const root = byId.get(rootId);
    for (const record of records) {
      if (record.id === rootId || record.linkedTransactionId === rootId) removeIds.add(record.id);
    }

    if (root?.module === "sales") {
      const receivables = records.filter((record) => record.module === "receivables" && record.saleId === rootId);
      for (const account of receivables) {
        deletedAccountIds.add(account.id);
        removeIds.add(account.id);
      }
      for (const payment of records.filter((record) => record.module === "receivable-payments" && record.saleId === rootId)) {
        enqueueRoot(payment.linkedTransactionId || payment.id);
      }
    }

    if (root?.module === "purchases") {
      const payables = records.filter((record) => record.module === "payables" && record.purchaseId === rootId);
      for (const account of payables) {
        deletedAccountIds.add(account.id);
        removeIds.add(account.id);
      }
      for (const payment of records.filter((record) => record.module === "payable-payments" && record.purchaseId === rootId)) {
        enqueueRoot(payment.linkedTransactionId || payment.id);
      }
    }

    if (root?.module === "payroll") {
      for (const account of records.filter((record) => record.module === "payables" && record.payrollId === rootId)) {
        deletedAccountIds.add(account.id);
        removeIds.add(account.id);
      }
    }
  }

  const removedPayments = records.filter((record) => removeIds.has(record.id) && paymentModules.has(record.module));
  const restoredAccounts = new Map();
  for (const payment of removedPayments) {
    const accountId = payment.module === "receivable-payments" ? payment.receivableId : payment.payableId;
    if (!accountId || deletedAccountIds.has(accountId) || !paymentRootsToRestore.has(payment.linkedTransactionId || payment.id)) continue;
    const current = restoredAccounts.get(accountId) || { amount: 0, module: payment.module === "receivable-payments" ? "receivables" : "payables" };
    current.amount += Number(payment.amount) || 0;
    restoredAccounts.set(accountId, current);
  }

  const remaining = records
    .filter((record) => !removeIds.has(record.id) || restoredAccounts.has(record.id))
    .map((record) => {
      const restore = restoredAccounts.get(record.id);
      if (!restore) return record;
      const balance = Math.max(0, (Number(record.outstandingAmount ?? record.amount) || 0) + restore.amount);
      const paid = Math.max(0, (Number(record.paidAmount) || 0) - restore.amount);
      const originId = restore.module === "receivables"
        ? (record.saleId || "")
        : (record.purchaseId || record.payrollId || "");
      return {
        ...record,
        amount: balance,
        outstandingAmount: balance,
        paidAmount: paid,
        status: balance === 0 ? "Pagada" : "Pendiente",
        linkedTransactionId: originId,
        updatedAt: new Date().toISOString()
      };
    });

  const deletedItems = new Set(selected
    .filter((record) => ["inventory", "raw-materials"].includes(record.module))
    .map((record) => record.id));
  const stockDeltas = new Map();
  for (const movement of records.filter((record) => removeIds.has(record.id) && record.module === "stock-movements")) {
    const signed = (recordDirection(movement.direction) * (Number(movement.quantity) || 0));
    stockDeltas.set(movement.itemId, (stockDeltas.get(movement.itemId) || 0) + signed);
  }
  const adjusted = remaining.map((record) => {
    const delta = stockDeltas.get(record.id);
    if (delta === undefined || !["inventory", "raw-materials"].includes(record.module) || deletedItems.has(record.id)) return record;
    const quantity = (Number(record.quantity) || 0) - delta;
    if (quantity < 0) {
      throw new Error(`No se puede vaciar el mÃ³dulo: al retirar esas operaciones, ${record.name} quedarÃ­a con inventario negativo. Elimina primero las ventas que consumieron ese stock.`);
    }
    return { ...record, quantity, updatedAt: new Date().toISOString() };
  });

  const affectedModules = [...new Set(records
    .filter((record) => removeIds.has(record.id))
    .map((record) => record.module))];
  return { records: adjusted, removedCount: removeIds.size, affectedModules };
}

function recordDirection(direction) {
  return direction === "Entrada" ? 1 : direction === "Salida" ? -1 : 0;
}

export async function previewModuleDataDeletion(moduleId, recordId) {
  const records = await getRecords();
  return buildModuleDeletionPlan(records, moduleId, recordId);
}

export async function deleteModuleData(moduleId, recordId) {
  const plan = await previewModuleDataDeletion(moduleId, recordId);
  if (!plan.removedCount) return plan;
  const settings = await getSettings();
  await replaceCompanyData(plan.records, settings);
  await snapshotCompany();
  return plan;
}

export async function getSetting(key) {
  const companyId = requireCompany();
  const { data, error } = await getSupabase().from("business_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw databaseError(error, "No fue posible consultar la configuración.");
  return data?.value;
}

export async function getSettings() {
  const companyId = requireCompany();
  const { data, error } = await getSupabase().from("business_settings")
    .select("key,value,updated_at")
    .eq("company_id", companyId);
  if (error) throw databaseError(error, "No fue posible consultar la configuración.");
  return data.map((item) => ({
    key: item.key,
    value: item.value,
    updatedAt: item.updated_at
  }));
}

export async function saveSetting(key, value) {
  const companyId = requireCompany();
  const { error } = await getSupabase().from("business_settings").upsert({
    company_id: companyId,
    key,
    value,
    updated_at: new Date().toISOString()
  }, { onConflict: "company_id,key" });
  if (error) throw databaseError(error, "No fue posible guardar la configuración.");
  await snapshotCompany();
}

export async function replaceCompanyData(records, settings) {
  const companyId = requireCompany();
  await snapshotCompany();
  const payload = {
    backup_records: records.map((record) => ({
      id: record.id,
      module: record.module,
      payload: Object.fromEntries(
        Object.entries(record).filter(([key]) => !["id", "module", "createdAt", "updatedAt"].includes(key))
      ),
      created_at: record.createdAt,
      updated_at: record.updatedAt
    })),
    backup_settings: settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      updated_at: setting.updatedAt
    }))
  };
  const { error } = await getSupabase().rpc("restore_company_backup", payload);
  if (error) throw databaseError(error, "No fue posible restaurar la copia en el servidor.");
  return companyId;
}

function displayStatus(value) {
  return value === "active" ? "Activa" : "Inactiva";
}

function displayProfileStatus(value) {
  return value === "active" ? "Activo" : "Inactivo";
}

export async function getPlatformRecords(storeName) {
  const supabase = getSupabase();
  if (storeName === "platformCompanies") {
    const { data, error } = await supabase.from("companies")
      .select("id,name,activity,owner_name,contact_email,contact_phone,created_at,status")
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error, "No fue posible consultar las empresas.");
    const { data: owners, error: ownersError } = await supabase.from("profiles")
      .select("company_id,email")
      .eq("role", "owner")
      .not("company_id", "is", null);
    if (ownersError) throw databaseError(ownersError, "No fue posible consultar los correos de acceso de las empresas.");
    const ownerEmails = new Map(owners.map((owner) => [owner.company_id, owner.email]));
    return data.map((company) => ({
      id: company.id,
      name: company.name,
      activity: company.activity,
      ownerName: company.owner_name,
      ownerEmail: ownerEmails.get(company.id) || "",
      contactEmail: company.contact_email,
      contactPhone: company.contact_phone,
      registeredAt: company.created_at.slice(0, 10),
      status: displayStatus(company.status),
      createdAt: company.created_at,
      updatedAt: company.created_at
    }));
  }

  if (storeName === "platformUsers") {
    const { data, error } = await supabase.from("profiles")
      .select("id,company_id,full_name,email,role,status,created_at")
      .neq("role", "unassigned")
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error, "No fue posible consultar los perfiles empresariales.");
    const { data: pendingRequests, error: requestsError } = await supabase.from("platform_requests")
      .select("auth_user_id")
      .eq("status", "pending")
      .not("auth_user_id", "is", null);
    if (requestsError) throw databaseError(requestsError, "No fue posible comprobar las solicitudes pendientes.");
    const { data: companies, error: companiesError } = await supabase.from("companies")
      .select("id,name,status");
    if (companiesError) throw databaseError(companiesError, "No fue posible consultar las empresas asociadas.");
    const pendingUserIds = new Set(pendingRequests.map((request) => request.auth_user_id));
    const companyNames = new Map(companies.map((company) => [company.id, company.name]));
    const companyStatuses = new Map(companies.map((company) => [company.id, company.status]));
    return data.filter((profile) => profile.role !== "platform_admin" && !pendingUserIds.has(profile.id)).map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      companyId: profile.company_id,
      companyName: companyNames.get(profile.company_id) || "—",
      role: profile.role === "owner" ? "Propietario"
        : profile.role === "administrator" ? "Administrador" : "Empleado",
      status: displayProfileStatus(
        profile.status === "active" && companyStatuses.get(profile.company_id) === "active" ? "active" : "inactive"
      ),
      createdAt: profile.created_at,
      updatedAt: profile.created_at
    }));
  }

  if (storeName === "platformRequests") {
    const { data, error } = await supabase.from("platform_requests")
      .select("id,auth_user_id,company_name,activity,owner_name,contact_email,requested_at,status,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error, "No fue posible consultar las solicitudes.");
    return data.map((request) => ({
      id: request.id,
      authUserId: request.auth_user_id,
      companyName: request.company_name,
      activity: request.activity,
      ownerName: request.owner_name,
      contactEmail: request.contact_email,
      requestedAt: request.requested_at.slice(0, 10),
      status: request.status === "pending" ? "Pendiente"
        : request.status === "approved" ? "Aprobada" : "Rechazada",
      createdAt: request.created_at,
      updatedAt: request.updated_at
    }));
  }

  throw new Error("Colección de plataforma no válida.");
}

export async function savePlatformRecord(storeName, values, existingId) {
  const supabase = getSupabase();
  if (storeName === "platformCompanies") {
    if (!existingId) throw new Error("Las empresas se crean mediante el registro empresarial.");
    const { error } = await supabase.rpc("admin_update_company", {
      p_company_id: existingId,
      p_name: values.name,
      p_activity: values.activity,
      p_owner_name: values.ownerName,
      p_contact_email: values.contactEmail,
      p_contact_phone: values.contactPhone,
      p_status: values.status === "Activa" ? "active" : "inactive"
    });
    if (error) throw databaseError(error, "No fue posible actualizar la empresa.");
    return { id: existingId };
  }

  if (storeName === "platformUsers") {
    if (!existingId) throw new Error("Las cuentas empresariales se crean mediante un flujo autenticado de invitación.");
    const roles = { Propietario: "owner", Administrador: "administrator", Empleado: "employee" };
    if (!Object.hasOwn(roles, values.role)) throw new Error("Selecciona un perfil empresarial válido.");
    const role = roles[values.role];
    const { error } = await supabase.rpc("admin_update_company_user", {
      p_user_id: existingId,
      p_role: role,
      p_status: values.status === "Activo" ? "active" : "inactive"
    });
    if (error) throw databaseError(error, "No fue posible actualizar los permisos del usuario.");
    return { id: existingId };
  }

  throw new Error("Los usuarios y roles se administran mediante las cuentas autenticadas, no como registros manuales.");
}

export async function reviewPlatformRequest(id, decision) {
  if (!["approved", "rejected"].includes(decision)) {
    throw new Error("La decisión de solicitud no es válida.");
  }
  const { error } = await getSupabase().rpc("admin_decide_registration", {
    p_request_id: id,
    p_decision: decision
  });
  if (error) throw databaseError(error, "No fue posible revisar la solicitud.");
}

export async function getPlatformSetting(key) {
  const { data, error } = await getSupabase().from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw databaseError(error, "No fue posible consultar la configuración de plataforma.");
  return data?.value;
}

export async function savePlatformSetting(key, value) {
  const { error } = await getSupabase().from("platform_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString()
  }, { onConflict: "key" });
  if (error) throw databaseError(error, "No fue posible guardar la configuración de plataforma.");
}
