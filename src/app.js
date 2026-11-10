import logoUrl from "../assets/emprende-plus-logo.jpeg";
import { modules, findModule } from "./modules.js";
import { businessCategories, getBusinessModules } from "./business-categories.js";
import { calculateColombianPayroll } from "./colombian-payroll.js";
import {
  platformCompanyFields, platformModules, platformRequestFields, platformUserFields
} from "./platform-modules.js";
import {
  deleteModuleData, getPlatformRecords, getPlatformSetting, getRecords, getSetting, previewModuleDataDeletion,
  reviewPlatformRequest, saveFinancialTransaction, savePlatformRecord, savePlatformSetting,
  saveRecord, saveSetting, setCloudIdentity
} from "./cloud-data.js";
import {
  buildExpenseTransaction, buildPayrollTransaction, buildProductionTransaction,
  buildPurchaseTransaction, buildPayablePaymentTransaction,
  buildReceivablePaymentTransaction, buildSaleTransaction, buildServiceSaleTransaction
} from "./financial-ledger.js";
import { deleteBackups } from "./db.js";
import { downloadBackup, getBackups, restoreBackupFile } from "./backup.js";
import { isBackendConfigured, loadIdentity, registerBusiness, signIn, signOut } from "./supabase.js";

const page = document.querySelector("#page-content");
const nav = document.querySelector("#main-nav");
const modalRoot = document.querySelector("#modal-root");
const toastRegion = document.querySelector("#toast-region");
const sidebar = document.querySelector("#sidebar");
const BUSINESS_WORKSPACE = "business";
const PLATFORM_WORKSPACE = "platform";
const DEVICE_BUSINESS_KEY = "emprendePlusBusinessAccount";
const workspaceLabel = document.querySelector("#workspace-label");
const businessName = document.querySelector("#business-name");
const workspaceSwitch = document.querySelector("#workspace-switch");
const sessionBadge = document.querySelector("#session-badge");
let activeModule = "dashboard";
let workspace = null;
let currentIdentity = null;
let authView = "login";

function currentModules() {
  if (workspace === PLATFORM_WORKSPACE) return platformModules;
  return getBusinessModules(currentIdentity?.company?.activity, modules);
}

function currentModule(id) {
  return currentModules().find((item) => item.id === id);
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function showToast(message, isError = false) {
  const toast = element("div", `toast${isError ? " error" : ""}`, message);
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function showError(error) {
  console.error(error);
  showToast(error instanceof Error ? error.message : "Ocurrió un error inesperado.", true);
}

function addButton(label, className, onClick) {
  const button = element("button", `button ${className}`, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function renderNavigation() {
  nav.replaceChildren();
  let lastGroup = "";
  for (const item of currentModules()) {
    if (item.group !== lastGroup) {
      nav.append(element("div", "nav-section-label", item.group));
      lastGroup = item.group;
    }
    const button = element("button", `nav-link${activeModule === item.id ? " active" : ""}`);
    button.type = "button";
    const icon = element("span", "nav-icon", item.icon);
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, element("span", "", item.label));
    button.addEventListener("click", () => navigate(item.id));
    nav.append(button);
  }
}

function navigate(id) {
  if (!currentIdentity || !workspace || !currentModule(id)) return;
  activeModule = id;
  sidebar.classList.remove("open");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  renderNavigation();
  renderPage().catch(showError);
}

async function renderPage() {
  page.replaceChildren();
  if (!currentIdentity || !workspace) return renderAuthScreen();
  const item = currentModule(activeModule);
  if (!item) {
    activeModule = workspace === PLATFORM_WORKSPACE ? "platform-dashboard" : "dashboard";
    return renderPage();
  }
  if (workspace === PLATFORM_WORKSPACE) return renderPlatformPage(item);
  if (activeModule === "dashboard") return renderDashboard();
  if (activeModule === "reports") return renderReports();
  if (activeModule === "settings") return renderSettings();
  if (activeModule === "backups") return renderBackups();
  return renderRecords(item);
}

function renderAuthScreen() {
  page.replaceChildren();
  document.body.classList.add("auth-screen");
  sidebar.classList.remove("open");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  nav.replaceChildren();
  workspaceSwitch.hidden = true;
  workspaceLabel.textContent = "EMPRENDE +";
  businessName.textContent = "Acceso a tu cuenta";
  const card = element("section", "auth-card");
  const logo = document.createElement("img");
  logo.className = "auth-logo";
  logo.src = logoUrl;
  logo.alt = "Emprende +, tu negocio bajo control";
  const title = authView === "register" ? "Registra tu empresa" : "Inicia sesión";
  card.append(logo, element("h1", "", title));
  const description = element("p", "auth-description",
    authView === "register"
      ? "Crea la cuenta del propietario y el perfil empresarial."
      : "Ingresa con el correo y la contraseña de tu cuenta."
  );
  card.append(description);

  const registrationLocked = authView === "register" && localStorage.getItem(DEVICE_BUSINESS_KEY);
  if (registrationLocked) {
    const notice = element("div", "notice warning");
    notice.textContent = "Este perfil de navegador ya se usó para una cuenta empresarial. Inicia sesión con esa cuenta; usa otro perfil del navegador para registrar un negocio distinto.";
    card.append(notice);
    const backToLogin = element("button", "auth-toggle", "Ir a iniciar sesión");
    backToLogin.type = "button";
    backToLogin.addEventListener("click", () => {
      authView = "login";
      renderAuthScreen();
    });
    card.append(backToLogin);
    page.append(card);
    return;
  }

  if (!isBackendConfigured) {
    const notice = element("div", "notice warning");
    notice.textContent = "El acceso central aún no está configurado. Crea el proyecto Supabase, aplica la migración indicada en el README y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar ingreso y registro.";
    card.append(notice);
  }

  const form = element("form", "auth-form");
  const grid = element("div", "form-grid");
  const fields = authView === "register"
    ? [
      { name: "ownerName", label: "Nombre del propietario", type: "text", required: true, maxLength: 160 },
      { name: "businessName", label: "Nombre comercial", type: "text", required: true, maxLength: 160 },
      { name: "activity", label: "Tipo de negocio", type: "select", options: businessCategories.map((category) => category.label), required: true },
      { name: "phone", label: "Teléfono", type: "tel", maxLength: 80 },
      { name: "email", label: "Correo electrónico", type: "email", required: true },
      { name: "password", label: "Contraseña (mínimo 12 caracteres)", type: "password", required: true, minLength: 12 },
      { name: "passwordConfirmation", label: "Confirmar contraseña", type: "password", required: true, minLength: 12 }
    ]
    : [
      { name: "email", label: "Correo electrónico", type: "email", required: true },
      { name: "password", label: "Contraseña", type: "password", required: true }
    ];
  for (const field of fields) {
    const wrapper = addFormField(field);
    if (field.minLength) wrapper.querySelector("input").minLength = field.minLength;
    if (field.maxLength) wrapper.querySelector("input").maxLength = field.maxLength;
    if (field.name === "email") wrapper.querySelector("input").autocomplete = "email";
    if (field.name === "password") wrapper.querySelector("input").autocomplete = authView === "register" ? "new-password" : "current-password";
    grid.append(wrapper);
  }
  form.append(grid);
  const submit = element("button", "button button-primary auth-submit",
    authView === "register" ? "Crear cuenta y empresa" : "Ingresar"
  );
  submit.type = "submit";
  submit.disabled = !isBackendConfigured;
  form.append(submit);
  form.addEventListener("submit", (event) => handleAuthSubmit(event, form, submit));
  card.append(form);

  const toggle = element("button", "auth-toggle", authView === "register"
    ? "¿Ya tienes una cuenta? Inicia sesión"
    : "¿Tu negocio es nuevo? Regístralo aquí"
  );
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    authView = authView === "register" ? "login" : "register";
    renderAuthScreen();
  });
  card.append(toggle);
  page.append(card);
}

async function handleAuthSubmit(event, form, submit) {
  event.preventDefault();
  if (!isBackendConfigured) return;
  if (!form.reportValidity()) return;
  submit.disabled = true;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (authView === "register") {
      if (localStorage.getItem(DEVICE_BUSINESS_KEY)) {
        throw new Error("Este perfil de navegador ya está asociado a una cuenta empresarial.");
      }
      values.ownerName = values.ownerName.trim();
      values.businessName = values.businessName.trim();
      values.email = values.email.trim();
      values.phone = values.phone.trim();
      if (!values.ownerName || !values.businessName) {
        throw new Error("Escribe el nombre del propietario y el nombre comercial.");
      }
      if (values.password !== values.passwordConfirmation) {
        throw new Error("Las contraseñas no coinciden.");
      }
      const result = await registerBusiness(values);
      if (!result.user?.id) throw new Error("Supabase no devolvió la cuenta creada; no se puede continuar.");
      localStorage.setItem(DEVICE_BUSINESS_KEY, result.user.id);
      if (result.session) await signOut();
      authView = "login";
      renderAuthScreen();
      showToast(result.session
        ? "Solicitud enviada. Podrás ingresar cuando el administrador apruebe tu empresa."
        : "Solicitud creada. Confirma tu correo si Supabase te lo solicita; después espera la aprobación de tu empresa.");
      return;
    } else {
      await signIn(values.email.trim(), values.password);
    }
    await activateIdentity();
  } catch (error) {
    if (error?.code === "email_not_confirmed") {
      showError(new Error("Este correo aún no está confirmado. Que la empresa figure activa no confirma el email; abre el enlace de verificación enviado a ese correo."));
    } else {
      showError(error);
    }
    submit.disabled = false;
  }
}

async function activateIdentity() {
  const identity = await loadIdentity();
  if (!identity) {
    currentIdentity = null;
    workspace = null;
    setCloudIdentity(null);
    renderAuthScreen();
    return;
  }
  if (identity.profile.role !== "platform_admin") {
    const assignedAccount = localStorage.getItem(DEVICE_BUSINESS_KEY);
    if (assignedAccount && assignedAccount !== identity.profile.id) {
      await signOut();
      throw new Error("Este perfil de navegador ya está asociado a otra cuenta empresarial. Usa otro perfil de navegador para una empresa distinta.");
    }
    localStorage.setItem(DEVICE_BUSINESS_KEY, identity.profile.id);
  }
  currentIdentity = identity;
  setCloudIdentity(identity);
  workspace = identity.profile.role === "platform_admin" ? PLATFORM_WORKSPACE : BUSINESS_WORKSPACE;
  activeModule = workspace === PLATFORM_WORKSPACE ? "platform-dashboard" : "dashboard";
  document.body.classList.remove("auth-screen");
  workspaceSwitch.hidden = false;
  updateWorkspaceHeader();
  renderNavigation();
  await renderPage();
}

function updateWorkspaceHeader() {
  const isPlatform = workspace === PLATFORM_WORKSPACE;
  workspaceLabel.textContent = isPlatform ? "ADMINISTRADOR DE EMPRENDE +" : "GESTIÓN EMPRESARIAL";
  businessName.textContent = isPlatform ? "Emprende +" : currentIdentity?.company?.name || "Mi negocio";
  workspaceSwitch.textContent = "Cerrar sesión";
  workspaceSwitch.setAttribute("aria-label", `Cerrar sesión de ${currentIdentity?.profile?.email || "la cuenta"}`);
  sessionBadge.lastChild.textContent = isPlatform ? " Administración de plataforma" : " Empresa sincronizada";
}

function pageHeading(title, description, action) {
  const heading = element("div", "page-heading");
  const copy = element("div");
  copy.append(element("h1", "", title), element("p", "", description));
  heading.append(copy);
  if (action) heading.append(action);
  page.append(heading);
}

function platformNotice() {
  const notice = element("div", "notice warning platform-notice");
  notice.textContent = "Este panel consulta metadatos administrativos sincronizados. No permite consultar ventas, gastos, nómina, clientes ni otros datos operativos privados de las empresas.";
  page.append(notice);
}

async function renderPlatformPage(module) {
  if (module.id === "platform-dashboard" || module.id === "platform-statistics") {
    return renderPlatformDashboard(module.id === "platform-statistics");
  }
  if (module.id === "platform-settings") return renderPlatformSettings();
  if (module.id === "platform-access") return renderPlatformAccess();
  return renderPlatformDirectory(module);
}

async function renderPlatformDashboard(statisticsOnly = false) {
  const companies = await getPlatformRecords("platformCompanies");
  const users = await getPlatformRecords("platformUsers");
  const requests = await getPlatformRecords("platformRequests");
  const title = statisticsOnly ? "Estadísticas generales" : "Panel de Emprende +";
  const description = statisticsOnly
    ? "Indicadores de empresas y usuarios registrados en la plataforma."
    : "Resumen administrativo de las empresas y usuarios registrados.";
  pageHeading(title, description);
  platformNotice();

  const currentMonth = new Date();
  const recentCompanyCount = companies.filter((company) => {
    const date = new Date(`${company.registeredAt}T00:00:00`);
    return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  }).length;
  const stats = element("div", "stats-grid");
  stats.append(
    statCard("Empresas registradas", formatNumber(companies.length), "Registradas en la plataforma", "▣"),
    statCard("Empresas activas", formatNumber(companies.filter((company) => company.status === "Activa").length), "Estado de acceso empresarial", "●"),
    statCard("Empresas inactivas", formatNumber(companies.filter((company) => company.status === "Inactiva").length), "Estado de acceso empresarial", "○"),
    statCard("Usuarios registrados", formatNumber(users.length), "Perfiles empresariales", "♙"),
    statCard("Usuarios activos", formatNumber(users.filter((user) => user.status === "Activo").length), "Cuentas con acceso habilitado", "●"),
    statCard("Nuevas empresas este mes", formatNumber(recentCompanyCount), "Fecha de registro", "＋"),
    statCard("Solicitudes pendientes", formatNumber(requests.filter((request) => request.status === "Pendiente").length), "Solicitudes administrativas", "◷")
  );
  page.append(stats);

  const activities = activityDistribution(companies);
  const distributionPanel = element("section", "panel");
  const header = element("div", "panel-header");
  header.append(element("h2", "", "Distribución por actividad comercial"));
  const body = element("div", "panel-body");
  if (!activities.length) {
    body.append(emptyState("Sin empresas registradas", "Los indicadores aparecerán cuando se creen cuentas empresariales."));
  } else {
    const chart = element("div", "platform-chart");
    const max = Math.max(...activities.map((entry) => entry.count));
    for (const entry of activities) {
      const row = element("div", "platform-chart-row");
      const label = element("span", "", entry.activity);
      const track = element("div", "platform-chart-track");
      const fill = element("div", "platform-chart-fill");
      fill.style.width = `${Math.max(8, entry.count / max * 100)}%`;
      track.append(fill);
      row.append(label, track, element("strong", "", String(entry.count)));
      chart.append(row);
    }
    body.append(chart);
  }
  distributionPanel.append(header, body);
  page.append(distributionPanel);

  if (!statisticsOnly) {
    const latestPanel = element("section", "panel");
    latestPanel.style.marginTop = "18px";
    const latestHeader = element("div", "panel-header");
    latestHeader.append(element("h2", "", "Empresas registradas recientemente"));
    const latestBody = element("div", "table-wrap");
    renderPlatformTable(latestBody, companies.slice(0, 5), "companies", false);
    latestPanel.append(latestHeader, latestBody);
    page.append(latestPanel);
  }
}

function activityDistribution(companies) {
  const counts = new Map();
  for (const company of companies) {
    const activity = company.activity || "Sin actividad";
    counts.set(activity, (counts.get(activity) || 0) + 1);
  }
  return [...counts].map(([activity, count]) => ({ activity, count }))
    .sort((a, b) => b.count - a.count || a.activity.localeCompare(b.activity, "es"));
}

async function renderPlatformDirectory(module) {
  const entity = module.id.includes("companies") ? "companies"
    : module.id.includes("users") ? "users" : "requests";
  const storeName = entity === "companies" ? "platformCompanies"
    : entity === "users" ? "platformUsers" : "platformRequests";
  const fieldDefinitions = entity === "companies" ? platformCompanyFields
    : entity === "users" ? platformUserFields : platformRequestFields;
  const collection = await getPlatformRecords(storeName);
  const rows = module.status ? collection.filter((entry) => entry.status === module.status) : collection;
  const title = module.label;
  const description = entity === "companies"
    ? "Consulta los datos administrativos de las empresas registradas."
    : entity === "users"
      ? "Perfiles empresariales autenticados y su estado de acceso."
      : "Solicitudes administrativas de registro.";
  pageHeading(title, description);
  platformNotice();

  if (entity === "requests") {
    const requestNotice = element("div", "notice");
    requestNotice.textContent = "Las nuevas cuentas aparecen aquí como pendientes. Aprobar habilita la empresa y el acceso de su propietario; rechazar mantiene la cuenta bloqueada.";
    page.append(requestNotice);
  }

  if (entity === "users" && !module.status) {
    const note = element("div", "notice");
    note.textContent = "Estos perfiles corresponden a cuentas autenticadas. El Administrador de Emprende + es un rol interno separado y no aparece como usuario empresarial.";
    page.append(note);
  }
  if (entity === "companies") {
    const companyNotice = element("div", "notice");
    companyNotice.textContent = "Las empresas se crean desde el formulario público de registro. Desde aquí puedes consultar sus datos y cambiar su estado.";
    page.append(companyNotice);
  }
  const toolbar = element("div", "toolbar");
  const search = element("input", "field-control search-box");
  search.type = "search";
  search.placeholder = "Buscar...";
  search.setAttribute("aria-label", `Buscar en ${title.toLowerCase()}`);
  toolbar.append(search);
  page.append(toolbar);
  const panel = element("section", "panel");
  const tableContainer = element("div", "table-wrap");
  panel.append(tableContainer);
  page.append(panel);
  const count = element("div", "result-count");
  page.append(count);

  const companyMap = new Map((entity === "users" ? await getPlatformRecords("platformCompanies") : [])
    .map((company) => [company.id, company.name]));
  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const searchableFields = module.id === "platform-active-companies"
      ? [...fieldDefinitions, { name: "ownerEmail" }]
      : fieldDefinitions;
    const filtered = rows.filter((entry) => searchableFields.some((field) => {
      const value = field.name === "companyId" ? companyMap.get(entry.companyId) : entry[field.name];
      return String(value ?? "").toLocaleLowerCase().includes(query);
    }));
    renderPlatformTable(
      tableContainer, filtered, entity, true, fieldDefinitions, companyMap,
      module.id === "platform-active-companies"
    );
    count.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
  };
  search.addEventListener("input", paint);
  paint();
}

function renderPlatformTable(container, rows, entity, withActions, fields, companyMap = new Map(), showOwnerEmail = false) {
  container.replaceChildren();
  if (!rows.length) {
    container.append(emptyState("Sin registros", "Todavía no hay datos disponibles para esta vista."));
    return;
  }
  const definitions = fields || (entity === "companies" ? platformCompanyFields
    : entity === "users" ? platformUserFields : platformRequestFields);
  const columns = entity === "companies"
    ? ["name", ...(showOwnerEmail ? ["ownerEmail"] : []), "activity", "ownerName", "registeredAt", "status"]
    : entity === "users"
      ? ["name", "email", "companyId", "role", "status"]
      : ["companyName", "activity", "ownerName", "requestedAt", "status"];
  const hasActions = withActions && (entity === "companies" || entity === "users"
    ? rows.length > 0
    : entity === "requests" && rows.some((record) => record.authUserId && record.status === "Pendiente"));
  const table = element("table", "data-table");
  const head = element("thead");
  const headRow = element("tr");
  for (const name of columns) {
    const field = definitions.find((definition) => definition.name === name);
    headRow.append(element("th", "", name === "ownerEmail" ? "Correo de acceso" : field?.label || name));
  }
  if (hasActions) headRow.append(element("th", "", "Acciones"));
  head.append(headRow);
  const body = element("tbody");
  for (const record of rows) {
    const row = element("tr");
    for (const name of columns) {
      const field = definitions.find((definition) => definition.name === name);
      const value = name === "companyId" ? companyMap.get(record.companyId) || "Empresa sin nombre"
        : displayValue(record[name], field?.type);
      const cell = element("td");
      if (name === "status") {
        const pill = element("span", `status-pill${["Inactiva", "Inactivo", "Rechazada"].includes(record[name]) ? " inactive" : ""}`, value);
        cell.append(pill);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    }
    if (hasActions) {
      const actions = element("td");
      const group = element("div", "table-actions");
      if (entity === "requests") {
        if (record.authUserId && record.status === "Pendiente") {
          const approve = element("button", "", "Aprobar");
          approve.type = "button";
          approve.addEventListener("click", () => decideRegistration(record, "approved"));
          const reject = element("button", "", "Rechazar");
          reject.type = "button";
          reject.addEventListener("click", () => decideRegistration(record, "rejected"));
          group.append(approve, reject);
        } else {
          group.append(element("span", "permission-note", record.authUserId ? "Revisada" : "Registro histórico"));
        }
      } else {
        const edit = element("button", "", entity === "users" ? "Gestionar acceso" : "Editar");
        edit.type = "button";
        edit.addEventListener("click", () => openPlatformForm(entity, record));
        group.append(edit);
      }
      actions.append(group);
      row.append(actions);
    }
    body.append(row);
  }
  table.append(head, body);
  container.append(table);
}

async function renderPlatformAccess() {
  const users = await getPlatformRecords("platformUsers");
  const companies = await getPlatformRecords("platformCompanies");
  pageHeading("Control de accesos", "Activa o bloquea cuentas y asigna el perfil de acceso correspondiente.");
  platformNotice();
  const notice = element("div", "notice warning");
  notice.textContent = "Puedes activar o bloquear cada perfil y asignar Administrador o Empleado. El perfil Propietario no se puede cambiar; solo se puede activar o bloquear. Esto no da acceso a los datos operativos de la empresa desde el panel de plataforma.";
  page.append(notice);
  const panel = element("section", "panel");
  const header = element("div", "panel-header");
  header.append(element("h2", "", "Perfiles empresariales registrados"));
  const table = element("div", "table-wrap");
  renderPlatformTable(table, users, "users", false, platformUserFields,
    new Map(companies.map((company) => [company.id, company.name])));
  panel.append(header, table);
  page.append(panel);
}

async function renderPlatformSettings() {
  const settings = await getPlatformSetting("platformProfile") || {};
  pageHeading("Configuración general de la plataforma", "Preferencias administrativas de Emprende +.");
  platformNotice();
  const form = element("form", "form-card");
  const fields = [
    { name: "platformName", label: "Nombre de la plataforma", type: "text", required: true },
    { name: "contactEmail", label: "Correo de contacto", type: "email" },
    { name: "supportPhone", label: "Teléfono de soporte", type: "tel" }
  ];
  const grid = element("div", "form-grid");
  for (const field of fields) grid.append(addFormField(field, settings[field.name]));
  form.append(grid);
  const submit = element("button", "button button-primary", "Guardar configuración local");
  submit.type = "submit";
  const actions = element("div", "form-actions");
  actions.append(submit);
  form.append(actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    try {
      const values = new FormData(form);
      const profile = Object.fromEntries(fields.map((field) => [field.name, values.get(field.name) || ""]));
      await savePlatformSetting("platformProfile", profile);
      showToast("Configuración administrativa guardada en este navegador.");
    } catch (error) {
      showError(error);
    } finally {
      submit.disabled = false;
    }
  });
  page.append(form);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(number);
}

function statCard(title, value, note, icon) {
  const card = element("article", "stat-card");
  const top = element("div", "stat-top");
  top.append(element("span", "", title), element("span", "stat-icon", icon));
  card.append(top, element("div", "stat-value", value), element("div", "stat-note", note));
  return card;
}

function activeAmount(records, moduleId) {
  return records
    .filter((record) => record.module === moduleId && record.status !== "Anulado")
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

function outstandingAmount(records, moduleId) {
  return records
    .filter((record) => record.module === moduleId && ["Pendiente", "Vencida"].includes(record.status))
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

async function renderDashboard() {
  const allRecords = await getRecords();
  const profile = await getSetting("businessProfile") || {};
  const businessName = profile.businessName?.trim() || currentIdentity.company.name || "Mi negocio";
  document.querySelector("#business-name").textContent = businessName;
  pageHeading("Panel principal", "Un resumen de la operación de tu empresa.");

  const lowStock = allRecords.filter((record) =>
    record.module === "inventory" && record.minimum !== "" && record.minimum !== undefined &&
    Number(record.quantity) <= Number(record.minimum)
  ).length;
  const stats = element("div", "stats-grid");
  stats.append(
    statCard("Ventas registradas", formatNumber(activeAmount(allRecords, "sales")), "Suma de ventas no anuladas", "↗"),
    statCard("Gastos registrados", formatNumber(activeAmount(allRecords, "expenses")), "Suma de gastos no anulados", "↘"),
    statCard("Registros del negocio", formatNumber(allRecords.length), "Información de esta empresa", "▤"),
    statCard("Alertas de existencias", formatNumber(lowStock), "Productos bajo su mínimo configurado", "!")
  );
  page.append(stats);

  const dashboardGrid = element("div", "dashboard-grid");
  const recentPanel = element("section", "panel");
  const recentHeader = element("div", "panel-header");
  recentHeader.append(element("h2", "", "Actividad reciente"));
  const recentBody = element("div", "panel-body");
  const recent = allRecords.slice(0, 7);
  if (recent.length === 0) {
    recentBody.append(emptyState("Aún no hay registros", "Usa un acceso rápido para comenzar a registrar la operación del negocio."));
  } else {
    const list = element("div", "activity-list");
    for (const record of recent) {
      const definition = findModule(record.module);
      const main = element("div", "activity-main");
      main.append(
        element("strong", "", record.detail || record.name || record.customer || record.supplier || definition?.label || "Registro"),
        element("small", "", `${definition?.label || "Registro"} · ${record.date || new Date(record.updatedAt).toLocaleDateString("es")}`)
      );
      const amount = element("span", "activity-amount", record.amount !== undefined ? formatNumber(record.amount) : "");
      const row = element("div", "activity-item");
      row.append(main, amount);
      list.append(row);
    }
    recentBody.append(list);
  }
  recentPanel.append(recentHeader, recentBody);

  const shortcutsPanel = element("section", "panel");
  const shortcutsHeader = element("div", "panel-header");
  shortcutsHeader.append(element("h2", "", "Accesos rápidos"));
  const shortcutsBody = element("div", "panel-body");
  const shortcuts = element("div", "shortcut-list");
  for (const id of ["sales", "expenses", "purchases", "inventory"]) {
    const module = findModule(id);
    const shortcut = element("button", "shortcut");
    shortcut.type = "button";
    shortcut.append(element("span", "", `Registrar ${module.label.toLowerCase()}`), element("span", "", "+"));
    shortcut.addEventListener("click", () => {
      navigate(id);
      openRecordForm(id);
    });
    shortcuts.append(shortcut);
  }
  shortcutsBody.append(shortcuts);
  shortcutsPanel.append(shortcutsHeader, shortcutsBody);
  dashboardGrid.append(recentPanel, shortcutsPanel);
  page.append(dashboardGrid);
}

function emptyState(title, message) {
  const state = element("div", "empty-state");
  state.append(element("strong", "", title), element("span", "", message));
  return state;
}

async function renderRecords(module) {
  const records = module.id === "service-sales"
    ? (await getRecords("sales")).filter((record) => record.serviceId)
    : await getRecords(module.id);
  const canManage = ["owner", "administrator"].includes(currentIdentity?.profile?.role);
  const headingActions = element("div", "page-actions");
  headingActions.append(addButton("+ Agregar registro", "button-primary", () => openRecordForm(module.id)));
  if (canManage) {
    const clearButton = addButton(`Eliminar datos (${records.length})`, "button-danger", () => clearModuleRecords(module.id));
    clearButton.disabled = records.length === 0;
    clearButton.title = records.length ? "Elimina los registros del mÃ³dulo y sus operaciones enlazadas" : "No hay datos para eliminar";
    headingActions.append(clearButton);
  }
  pageHeading(module.label, module.description, headingActions);
  if (module.id === "users") {
    const note = element("div", "notice warning");
    note.textContent = "Este módulo solo conserva un directorio de usuarios y permisos previstos. No crea cuentas con inicio de sesión ni protege los datos frente a otras personas que puedan abrir este perfil del navegador.";
    page.append(note);
  }
  const toolbar = element("div", "toolbar");
  const search = element("input", "field-control search-box");
  search.type = "search";
  search.placeholder = "Buscar en los registros...";
  search.setAttribute("aria-label", `Buscar en ${module.label.toLowerCase()}`);
  toolbar.append(search);
  page.append(toolbar);
  const panel = element("section", "panel");
  const tableContainer = element("div", "table-wrap");
  panel.append(tableContainer);
  page.append(panel);
  const count = element("div", "result-count");
  page.append(count);

  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = records.filter((record) =>
      module.fields.some((field) => String(record[field.name] ?? "").toLocaleLowerCase().includes(query))
    );
    tableContainer.replaceChildren();
    if (!filtered.length) {
      tableContainer.append(emptyState(
        records.length ? "No hay resultados" : "Todavía no hay registros",
        records.length ? "Prueba con otro término de búsqueda." : "Agrega un registro para comenzar."
      ));
      count.textContent = records.length ? "0 resultados" : "";
      return;
    }
    const table = element("table", "data-table");
    const columns = module.fields.slice(0, 5);
    const head = element("thead");
    const headerRow = element("tr");
    for (const field of columns) headerRow.append(element("th", "", field.label));
    headerRow.append(element("th", "", "Acciones"));
    head.append(headerRow);
    const body = element("tbody");
    for (const record of filtered) {
      const row = element("tr");
      for (const field of columns) {
        const value = field.name === "service" ? record.serviceName : record[field.name];
        row.append(element("td", "", displayValue(value, field.type)));
      }
      const actions = element("td");
      if (canManage && record.linkedTransactionId) {
        actions.append(addButton("Eliminar operación", "button-danger", () => removeRecord(module.id, record.id)));
      }
      if (module.id === "payroll") {
        actions.append(addButton("Ver desprendible", "button-secondary", () => openPayrollDetail(record)));
      } else if (record.linkedTransactionId) {
        actions.append(element("small", "", "Operación enlazada"));
      } else {
        const actionGroup = element("div", "table-actions");
        const edit = element("button", "", "Editar");
        edit.type = "button";
        edit.addEventListener("click", () => openRecordForm(module.id, record));
        const remove = element("button", "", "Eliminar");
        remove.type = "button";
        remove.addEventListener("click", () => removeRecord(module.id, record.id));
        actionGroup.append(edit, remove);
        actions.append(actionGroup);
      }
      row.append(actions);
      body.append(row);
    }
    table.append(head, body);
    tableContainer.append(table);
    count.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
  };
  search.addEventListener("input", paint);
  paint();
}

function openPayrollDetail(record) {
  modalRoot.replaceChildren();
  const modal = element("section", "modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const header = element("div", "modal-header");
  header.append(element("h2", "", `Desprendible de nómina · ${record.period || "Periodo"}`));
  const close = element("button", "modal-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar desprendible");
  close.addEventListener("click", () => modalRoot.replaceChildren());
  header.append(close);
  modal.append(header, element("p", "auth-description", `${record.employee || "Empleado"} · ${record.daysWorked ?? "—"} días liquidados · Pago: ${record.status || "—"}`));
  if (record.minimumWageWarning) {
    modal.append(element("div", "notice warning", "El salario base registrado está por debajo del mínimo proporcional configurado para 2026; verifica jornada, días y régimen del trabajador."));
  }

  const formatCOP = (value) => value === undefined || value === null ? "—" : `COP ${formatNumber(value)}`;
  const sections = [
    ["Devengado", [
      ["Salario básico liquidado", record.base], ["Recargos y otros salariales", record.additions],
      ["Auxilio de transporte", record.transportAllowance], ["Devengado bruto", record.grossPay]
    ]],
    ["Deducciones del trabajador", [
      ["Salud (4%)", record.deductionDetails?.health], ["Pensión (4%)", record.deductionDetails?.pension],
      ["Fondo de solidaridad pensional", record.deductionDetails?.solidarityFund],
      ["Otras deducciones autorizadas", record.deductionDetails?.other],
      ["Retención en la fuente ingresada", record.deductionDetails?.incomeTaxWithholding],
      ["Total deducciones", record.deductions]
    ]],
    ["Seguridad social y parafiscales · empleador", [
      ["IBC", record.ibc], ["Salud patronal", record.employerContributions?.health],
      ["Pensión patronal", record.employerContributions?.pension], ["ARL", record.employerContributions?.arl],
      ["Caja de compensación", record.employerContributions?.familyCompensation],
      ["SENA", record.employerContributions?.sena], ["ICBF", record.employerContributions?.icbf],
      ["Total aportes patronales", record.totalEmployerContributions]
    ]],
    ["Provisiones y pago", [
      ["Prima de servicios", record.provisions?.prima], ["Cesantías", record.provisions?.cesantias],
      ["Intereses de cesantías", record.provisions?.cesantiasInterest], ["Vacaciones", record.provisions?.vacation],
      ["Neto pagado al trabajador", record.netPay], ["Costo total para la empresa", record.employerCost]
    ]]
  ];
  for (const [title, rows] of sections) {
    const panel = element("section", "panel");
    panel.append(element("div", "panel-header", title));
    const body = element("div", "panel-body");
    const table = element("table", "data-table");
    const tbody = element("tbody");
    for (const [label, amount] of rows) {
      const row = element("tr");
      row.append(element("th", "", label), element("td", "", formatCOP(amount)));
      tbody.append(row);
    }
    table.append(tbody);
    body.append(table);
    panel.append(body);
    modal.append(panel);
  }
  const notes = element("div", "notice");
  notes.textContent = "Liquidación ordinaria 2026. Verifica novedades, afiliaciones, topes y tarifas con la PILA y el operador de nómina; la retención en la fuente se captura manualmente.";
  modal.append(notes);
  modalRoot.append(modal);
}

function displayValue(value, type) {
  if (value === undefined || value === null || value === "") return "—";
  if (type === "number") return formatNumber(value);
  if (type === "date") {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("es");
  }
  return String(value);
}

function addFormField(field, value = "", choices = field.options || []) {
  const wrapper = element("div", `field${field.type === "textarea" ? " full" : ""}`);
  const label = element("label", "", field.label);
  const control = field.type === "textarea" ? element("textarea", "field-control") : element("input", "field-control");
  if (field.type === "select" || field.type === "company") {
    const select = element("select", "field-control");
    const blank = element("option", "", "Seleccionar...");
    blank.value = "";
    select.append(blank);
    for (const choice of choices) {
      const option = element("option", "", typeof choice === "string" ? choice : choice.label);
      option.value = typeof choice === "string" ? choice : choice.value;
      select.append(option);
    }
    select.value = String(value ?? "");
    select.id = `field-${field.name}`;
    label.htmlFor = select.id;
    wrapper.append(label, select);
    select.required = Boolean(field.required);
    select.name = field.name;
    return wrapper;
  }
  control.name = field.name;
  control.id = `field-${field.name}`;
  control.required = Boolean(field.required);
  if (field.type !== "textarea") control.type = field.type || "text";
  if (field.type === "number") {
    if (field.min !== undefined) control.min = String(field.min);
    if (field.step !== undefined) control.step = String(field.step);
  }
  control.value = String(value ?? "");
  label.htmlFor = control.id;
  wrapper.append(label, control);
  return wrapper;
}

async function openPlatformForm(entity, record = null) {
  if ((entity === "companies" || entity === "users") && !record) {
    showToast("Este registro se crea mediante el alta empresarial autenticada.", true);
    return;
  }
  const storeName = entity === "companies" ? "platformCompanies" : "platformUsers";
  const fields = entity === "companies"
    ? platformCompanyFields.filter((field) => field.name !== "registeredAt")
    : entity === "users"
      ? platformUserFields.filter((field) => field.name === "status"
        || (field.name === "role" && record?.role !== "Propietario"))
        .map((field) => field.name === "role"
          ? { ...field, options: ["Administrador", "Empleado"] }
          : field)
      : [];
  const companies = entity === "users" ? await getPlatformRecords("platformCompanies") : [];
  if (entity === "users" && !companies.length) {
    showToast("Registra primero una empresa para poder asociar usuarios.", true);
    return;
  }
  modalRoot.replaceChildren();
  const modal = element("section", "modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "platform-modal-title");
  const header = element("div", "modal-header");
  const heading = element("h2", "", `${record ? "Editar" : "Registrar"} ${entity === "companies" ? "empresa" : entity === "users" ? "usuario empresarial" : "solicitud"}`);
  heading.id = "platform-modal-title";
  const close = element("button", "modal-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar");
  close.addEventListener("click", () => modalRoot.replaceChildren());
  header.append(heading, close);

  const form = element("form", "modal-form");
  const grid = element("div", "form-grid");
  for (const field of fields) {
    let value = record?.[field.name] || "";
    if (!record && field.name === "registeredAt") value = new Date().toISOString().slice(0, 10);
    if (!record && field.name === "requestedAt") value = new Date().toISOString().slice(0, 10);
    if (!record && field.name === "status") {
      value = entity === "companies" || entity === "users" ? "Activa" : "Pendiente";
      if (entity === "users") value = "Activo";
    }
    if (field.type === "company") {
      grid.append(addFormField(field, value, companies.map((company) => ({
        value: company.id,
        label: `${company.name}${company.status === "Inactiva" ? " (Inactiva)" : ""}`
      }))));
    } else {
      grid.append(addFormField(field, value));
    }
  }
  form.append(grid);
  if (entity === "users") {
    const hint = element("p", "permission-note", record.role === "Propietario"
      ? "El propietario puede activarse o bloquearse. Su perfil no se puede cambiar desde el control de accesos."
      : "El perfil determina el nivel de acceso de esta cuenta: Administrador o Empleado. El estado permite bloquearla o reactivarla.");
    form.append(hint);
  }
  const actions = element("div", "form-actions");
  actions.append(addButton("Cancelar", "button-secondary", () => modalRoot.replaceChildren()));
  const save = element("button", "button button-primary", record ? "Guardar cambios" : "Guardar registro");
  save.type = "submit";
  actions.append(save);
  form.append(actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      const formValues = new FormData(form);
      const values = Object.fromEntries(fields.map((field) => [field.name, formValues.get(field.name) || ""]));
      if (entity === "users" && !values.role) values.role = record.role;
      await savePlatformRecord(storeName, values, record?.id);
      modalRoot.replaceChildren();
      showToast(entity === "users" ? "Acceso del usuario actualizado." : "Datos de empresa actualizados.");
      await renderPage();
    } catch (error) {
      showError(error);
      save.disabled = false;
    }
  });
  modal.append(header, form);
  modalRoot.append(modal);
  form.querySelector("input, select, textarea")?.focus();
}

async function getWorkflowFields(workflow) {
  const date = { name: "date", label: "Fecha", type: "date", required: true, defaultValue: new Date().toISOString().slice(0, 10) };
  const method = { name: "paymentMethod", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Otro"], required: true };
  const text = (name, label, required = true) => ({ name, label, type: "text", required });
  const number = (name, label, required = true) => ({ name, label, type: "number", min: 0, step: 0.01, required });
  const select = (name, label, items, getLabel, required = true) => ({
    name, label, type: "select", required,
    options: items.map((item) => ({ value: item.id, label: getLabel(item) }))
  });
  if (workflow === "sale") {
    const [items, customers] = await Promise.all([getRecords("inventory"), getRecords("customers")]);
    return [date, select("productId", "Producto", items.filter((item) => Number(item.quantity) > 0), (item) => `${item.name} · ${item.quantity} disponibles · ${formatNumber(item.price)}`),
      select("customerId", "Cliente (opcional)", customers, (item) => item.name, false),
      number("quantity", "Cantidad"), number("paidAmount", "Valor recibido", false),
      { name: "dueDate", label: "Vencimiento del saldo", type: "date" }, method];
  }
  if (workflow === "purchase") {
    const [items, suppliers] = await Promise.all([getRecords(), getRecords("suppliers")]);
    const itemSelector = {
      name: "itemId", label: "Artículo comprado", type: "select", required: true,
      options: [
        ...items.filter((item) => ["inventory", "raw-materials"].includes(item.module)).map((item) => ({
          value: item.id,
          label: `${item.name} · ${item.quantity} ${item.unit || "unidades"} · costo ${formatNumber(item.cost)}`,
          cost: item.cost
        })),
        { value: "__new__", label: "Crear artículo nuevo…" }
      ]
    };
    return [date, itemSelector,
      { name: "newItemModule", label: "Tipo de artículo", type: "select", options: [
        { value: "inventory", label: "Producto para vender" }, { value: "raw-materials", label: "Materia prima" }
      ] },
      text("newItemName", "Nombre del artículo"), text("newItemCode", "Código / referencia", false),
      text("newItemCategory", "Categoría", false), text("newItemUnit", "Unidad", false),
      number("newItemPrice", "Precio de venta", false), number("newItemMinimum", "Existencia mínima", false),
      select("supplierId", "Proveedor", suppliers, (item) => item.name),
      number("quantity", "Cantidad"), number("unitCost", "Costo por unidad"), number("paidAmount", "Valor pagado", false),
      { name: "dueDate", label: "Vencimiento del saldo", type: "date" }, method];
  }
  if (workflow === "appointment") {
    const [customers, services, employees] = await Promise.all([
      getRecords("customers"), getRecords("services"), getRecords("employees")
    ]);
    return [date, { name: "time", label: "Hora", type: "time", required: true },
      select("customerId", "Cliente", customers, (item) => item.name),
      select("serviceId", "Servicio", services, (item) => `${item.name} · ${item.durationMinutes} min · ${formatNumber(item.price)}`),
      select("employeeId", "Profesional (opcional)", employees.filter((item) => item.status !== "Inactivo"), (item) => item.name, false),
      text("notes", "Notas", false)];
  }
  if (workflow === "service-sale") {
    const [customers, services, employees] = await Promise.all([
      getRecords("customers"), getRecords("services"), getRecords("employees")
    ]);
    return [date,
      select("serviceId", "Servicio prestado", services, (item) => `${item.name} · ${formatNumber(item.price)}`),
      select("customerId", "Cliente (opcional)", customers, (item) => item.name, false),
      select("employeeId", "Profesional", employees.filter((item) => item.status !== "Inactivo"), (item) => item.name, false),
      number("paidAmount", "Valor recibido", false),
      { name: "dueDate", label: "Vencimiento del saldo", type: "date" }, method];
  }
  if (workflow === "expense") return [date, text("category", "Categoría"), text("detail", "Descripción"), number("amount", "Valor"),
    { name: "status", label: "Estado", type: "select", options: ["Pagado", "Pendiente"], required: true }, method];
  if (workflow === "payroll") {
    const employees = await getRecords("employees");
    return [date, select("employeeId", "Empleado", employees.filter((item) => item.status !== "Inactivo"),
      (item) => `${item.name} · salario ${formatNumber(item.salary)} · ARL ${item.arlRate ?? 0.522}%`),
      { name: "period", label: "Periodo de nómina", type: "month", required: true, defaultValue: new Date().toISOString().slice(0, 7) },
      { name: "daysWorked", label: "Días laborados", type: "number", min: 1, max: 30, step: 1, defaultValue: 30, required: true },
      number("nightHours", "Horas nocturnas ordinarias", false),
      number("overtimeDayHours", "Horas extra diurnas", false),
      number("overtimeNightHours", "Horas extra nocturnas", false),
      number("restDayDayHours", "Horas en día de descanso (diurnas)", false),
      number("restDayNightHours", "Horas en día de descanso (nocturnas)", false),
      number("overtimeRestDayDayHours", "Horas extra diurnas en descanso", false),
      number("overtimeRestDayNightHours", "Horas extra nocturnas en descanso", false),
      number("additionalSalary", "Otros devengados salariales", false),
      number("otherDeductions", "Otras deducciones autorizadas", false),
      number("incomeTaxWithholding", "Retención en la fuente (valor calculado externamente)", false),
      { name: "status", label: "Pago al trabajador", type: "select", options: ["Pagado", "Pendiente"], required: true }, method];
  }
  if (workflow === "production") {
    const [materials, products] = await Promise.all([getRecords("raw-materials"), getRecords("inventory")]);
    return [date, text("detail", "Detalle"), select("materialId", "Materia prima", materials, (item) => `${item.name} · ${item.quantity} ${item.unit || "unidades"}`),
      number("inputQuantity", "Cantidad consumida"), select("productId", "Producto terminado", products, (item) => item.name), number("outputQuantity", "Cantidad producida")];
  }
  if (workflow === "receivable-payment") {
    const accounts = (await getRecords("receivables")).filter((item) => Number(item.outstandingAmount ?? item.amount) > 0);
    return [date, select("receivableId", "Cuenta por cobrar", accounts,
      (item) => `${item.customer} · ${item.detail} · saldo ${formatNumber(item.outstandingAmount ?? item.amount)}`),
      number("amount", "Valor del abono"), method];
  }
  if (workflow === "payable-payment") {
    const accounts = (await getRecords("payables")).filter((item) => Number(item.outstandingAmount ?? item.amount) > 0);
    return [date, select("payableId", "Cuenta por pagar", accounts,
      (item) => `${item.supplier} · ${item.detail} · saldo ${formatNumber(item.outstandingAmount ?? item.amount)}`),
      number("amount", "Valor del abono"), method];
  }
  return [];
}

async function openWorkflowForm(module) {
  try {
    const fields = await getWorkflowFields(module.workflow);
    if (!fields.length) throw new Error("No se encontró el formulario para esta operación.");
    const payrollEmployees = module.workflow === "payroll" ? await getRecords("employees") : [];
    modalRoot.replaceChildren();
    const modal = element("section", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const header = element("div", "modal-header");
    const title = element("h2", "", `Registrar ${module.label.toLowerCase()}`);
    title.id = "record-modal-title";
    const close = element("button", "modal-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Cerrar");
    close.addEventListener("click", () => modalRoot.replaceChildren());
    header.append(title, close);
    const form = element("form", "modal-form");
    const grid = element("div", "form-grid");
    const workflowControls = new Map();
    for (const field of fields) {
      const wrapper = addFormField(field, field.defaultValue || "", field.options || []);
      if (field.name.startsWith("newItem")) wrapper.hidden = true;
      workflowControls.set(field.name, wrapper.querySelector("input, select, textarea"));
      grid.append(wrapper);
    }
    if (module.workflow === "purchase") {
      const itemSelect = workflowControls.get("itemId");
      const purchaseItemField = fields.find((field) => field.name === "itemId");
      const newItemFields = ["newItemModule", "newItemName", "newItemCode", "newItemCategory", "newItemUnit", "newItemPrice", "newItemMinimum"];
      const updatePurchaseItemFields = () => {
        const creating = itemSelect.value === "__new__";
        for (const name of newItemFields) {
          const control = workflowControls.get(name);
          control.closest(".field").hidden = !creating;
          control.required = creating && ["newItemModule", "newItemName"].includes(name);
        }
        workflowControls.get("newItemPrice").required = creating && workflowControls.get("newItemModule").value === "inventory";
      };
      itemSelect.addEventListener("change", updatePurchaseItemFields);
      workflowControls.get("newItemModule").addEventListener("change", updatePurchaseItemFields);
      itemSelect.addEventListener("change", () => {
        const selected = purchaseItemField.options.find((item) => item.value === itemSelect.value);
        workflowControls.get("unitCost").value = selected?.value !== "__new__" ? selected?.cost ?? "" : "";
      });
      updatePurchaseItemFields();
    }
    const workflowNotice = element("div", "notice", module.workflow === "payroll"
      ? "Liquidación ordinaria colombiana configurada para 2026. La retención en la fuente se ingresa manualmente; el sistema no genera PILA ni reemplaza su revisión contable/laboral."
      : "Los cambios relacionados de caja, cartera y stock se aplican como una sola operación.");
    if (module.workflow === "sale") {
      const productSelect = workflowControls.get("productId");
      const quantityInput = workflowControls.get("quantity");
      const itemField = fields.find((field) => field.name === "productId");
      const updateSalePreview = async () => {
        const selected = itemField.options.find((item) => item.value === productSelect.value);
        if (!selected) {
          workflowNotice.textContent = "Selecciona un producto para ver precio, existencias y total estimado.";
          quantityInput.removeAttribute("max");
          return;
        }
        const products = await getRecords("inventory");
        const current = products.find((entry) => entry.id === productSelect.value);
        if (!current) return;
        const qty = Number(quantityInput.value) || 0;
        workflowNotice.textContent = `${current.name}: ${formatNumber(current.price)} por unidad · ${formatNumber(current.quantity)} disponibles · total estimado: ${formatNumber(qty * Number(current.price || 0))}.`;
        quantityInput.max = String(current.quantity);
      };
      productSelect.addEventListener("change", updateSalePreview);
      quantityInput.addEventListener("input", updateSalePreview);
    }
    if (module.workflow === "payroll") {
      const updatePayrollPreview = () => {
        const data = new FormData(form);
        const values = Object.fromEntries(fields.map((field) => {
          const value = data.get(field.name);
          return [field.name, field.type === "number" && value !== "" ? Number(value) : value || ""];
        }));
        const employee = payrollEmployees.find((item) => item.id === values.employeeId);
        if (!employee) {
          workflowNotice.textContent = "Selecciona un empleado con salario pactado para ver el estimado de nómina.";
          return;
        }
        try {
          const result = calculateColombianPayroll({ ...values, employee });
          workflowNotice.textContent = `Estimado ${values.period}: bruto ${formatNumber(result.grossPay)} · deducciones ${formatNumber(result.totalDeductions)} · neto ${formatNumber(result.netPay)} · costo total empresa ${formatNumber(result.totalEmployerCost)}. Exoneración patronal ${result.employerExonerated ? "aplicada" : "no aplicada"}.${result.minimumWageWarning ? " ADVERTENCIA: el salario está por debajo del mínimo proporcional configurado." : ""}`;
        } catch (error) {
          workflowNotice.textContent = error.message;
        }
      };
      grid.addEventListener("input", updatePayrollPreview);
      grid.addEventListener("change", updatePayrollPreview);
    }
    form.append(grid, workflowNotice);
    const actions = element("div", "form-actions");
    actions.append(addButton("Cancelar", "button-secondary", () => modalRoot.replaceChildren()));
    const save = element("button", "button button-primary", "Guardar operación");
    save.type = "submit";
    actions.append(save);
    form.append(actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        const data = new FormData(form);
        const values = Object.fromEntries(fields.map((field) => {
          const value = data.get(field.name);
          return [field.name, field.type === "number" && value !== "" ? Number(value) : value || ""];
        }));
        let transaction;
        if (module.workflow === "sale") {
          const [items, customers] = await Promise.all([getRecords("inventory"), getRecords("customers")]);
          const item = items.find((entry) => entry.id === values.productId);
          const customer = customers.find((entry) => entry.id === values.customerId);
          transaction = buildSaleTransaction({ product: item, customer: customer?.name, customerId: customer?.id,
            quantity: values.quantity, unitPrice: item?.price, paidAmount: values.paidAmount,
            dueDate: values.dueDate, paymentMethod: values.paymentMethod, date: values.date });
        } else if (module.workflow === "purchase") {
          const [items, suppliers] = await Promise.all([getRecords(), getRecords("suppliers")]);
          const supplier = suppliers.find((entry) => entry.id === values.supplierId);
          let item = items.find((entry) => entry.id === values.itemId);
          if (values.itemId === "__new__") {
            if (values.newItemModule === "inventory" && !(Number(values.newItemPrice) > 0)) {
              throw new Error("Indica un precio de venta mayor que cero para el nuevo producto.");
            }
            const timestamp = new Date().toISOString();
            item = {
              id: crypto.randomUUID(), module: values.newItemModule, name: values.newItemName.trim(),
              code: values.newItemCode, category: values.newItemCategory, unit: values.newItemUnit || "unidades",
              quantity: 0, cost: 0, price: Number(values.newItemPrice) || 0, minimum: Number(values.newItemMinimum) || 0,
              createdAt: timestamp, updatedAt: timestamp
            };
          }
          transaction = buildPurchaseTransaction({ item,
            supplier: supplier?.name, supplierId: supplier?.id, quantity: values.quantity, unitCost: values.unitCost,
            paidAmount: values.paidAmount, dueDate: values.dueDate, paymentMethod: values.paymentMethod, date: values.date });
          if (values.itemId === "__new__") transaction.records.unshift(item);
        } else if (module.workflow === "service-sale") {
          const [customers, services, employees] = await Promise.all([
            getRecords("customers"), getRecords("services"), getRecords("employees")
          ]);
          transaction = buildServiceSaleTransaction({
            ...values,
            service: services.find((entry) => entry.id === values.serviceId),
            customer: customers.find((entry) => entry.id === values.customerId),
            employee: employees.find((entry) => entry.id === values.employeeId)
          });
        } else if (module.workflow === "expense") transaction = buildExpenseTransaction(values);
        else if (module.workflow === "payroll") {
          const [employees, payrolls] = await Promise.all([getRecords("employees"), getRecords("payroll")]);
          if (payrolls.some((entry) => entry.employeeId === values.employeeId
              && entry.period === values.period && entry.status !== "Anulado")) {
            throw new Error("Ya existe una liquidación para este empleado y periodo. Revisa el desprendible antes de crear otra.");
          }
          transaction = buildPayrollTransaction({ ...values, employee: employees.find((entry) => entry.id === values.employeeId) });
        } else if (module.workflow === "production") {
          const [materials, products] = await Promise.all([getRecords("raw-materials"), getRecords("inventory")]);
          transaction = buildProductionTransaction({ ...values,
            material: materials.find((entry) => entry.id === values.materialId),
            product: products.find((entry) => entry.id === values.productId) });
        } else if (module.workflow === "receivable-payment") {
          const accounts = await getRecords("receivables");
          transaction = buildReceivablePaymentTransaction({ receivable: accounts.find((entry) => entry.id === values.receivableId),
            amount: values.amount, date: values.date, method: values.paymentMethod });
        } else if (module.workflow === "payable-payment") {
          const accounts = await getRecords("payables");
          transaction = buildPayablePaymentTransaction({ payable: accounts.find((entry) => entry.id === values.payableId),
            amount: values.amount, date: values.date, method: values.paymentMethod });
        }
        await saveFinancialTransaction(transaction);
        modalRoot.replaceChildren();
        showToast("Operación aplicada: caja, cartera e inventario quedaron sincronizados.");
        await renderPage();
      } catch (error) {
        showError(error);
        save.disabled = false;
      }
    });
    modal.append(header, form);
    modalRoot.append(modal);
    form.querySelector("input, select, textarea")?.focus();
  } catch (error) {
    showError(error);
  }
}

function openRecordForm(moduleId, record = null) {
  const module = findModule(moduleId);
  if (!module?.fields) return;
  if (module.workflow && !record) {
    openWorkflowForm(module);
    return;
  }
  modalRoot.replaceChildren();
  const modal = element("section", "modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "record-modal-title");
  const header = element("div", "modal-header");
  header.append(element("h2", "", `${record ? "Editar" : "Agregar"} ${module.label.toLowerCase()}`));
  const close = element("button", "modal-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar");
  close.addEventListener("click", () => modalRoot.replaceChildren());
  header.firstChild.id = "record-modal-title";
  header.append(close);
  const form = element("form", "modal-form");
  const grid = element("div", "form-grid");
  for (const field of module.fields) grid.append(addFormField(field, record?.[field.name] ?? field.defaultValue ?? ""));
  form.append(grid);
  const actions = element("div", "form-actions");
  const cancel = addButton("Cancelar", "button-secondary", () => modalRoot.replaceChildren());
  const save = element("button", "button button-primary", record ? "Guardar cambios" : "Guardar registro");
  save.type = "submit";
  actions.append(cancel, save);
  form.append(actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      const formValues = new FormData(form);
      const values = {};
      for (const field of module.fields) {
        const value = formValues.get(field.name);
        values[field.name] = field.type === "number" && value !== "" ? Number(value) : value;
      }
      await saveRecord(module.id, values, record?.id);
      modalRoot.replaceChildren();
      showToast("Registro guardado. Se creó una copia interna automática.");
      await renderPage();
    } catch (error) {
      showError(error);
      save.disabled = false;
    }
  });
  modal.append(header, form);
  modalRoot.append(modal);
  form.querySelector("input, select, textarea")?.focus();
}

function closeOnBackdrop(event) {
  if (event.target === modalRoot) modalRoot.replaceChildren();
}

async function removeRecord(moduleId, id) {
  try {
    const preview = await previewModuleDataDeletion(moduleId, id);
    if (!preview.removedCount) throw new Error("No se encontró el registro que intentas eliminar.");
    const affected = preview.affectedModules.map((item) => findModule(item)?.label || item).join(", ");
    if (!window.confirm(`¿Eliminar esta operación? Se eliminarán ${preview.removedCount} registros de: ${affected}. Se guardará una copia previa y se ajustarán los saldos e inventario.`)) return;
    const result = await deleteModuleData(moduleId, id);
    if (!result.removedCount) throw new Error("No se encontró el registro que intentas eliminar.");
    showToast(`Se eliminaron ${result.removedCount} registros relacionados y se guardó una copia previa.`);
    await renderPage();
  } catch (error) {
    showError(error);
  }
}

async function clearModuleRecords(moduleId) {
  const module = currentModule(moduleId);
  if (!module) return;
  try {
    const preview = await previewModuleDataDeletion(moduleId);
    if (!preview.removedCount) {
      showToast("No hay datos para eliminar.");
      return;
    }
    const affected = preview.affectedModules.map((item) => findModule(item)?.label || item).join(", ");
    if (!window.confirm(`¿Eliminar todos los datos de «${module.label}»? Se eliminarán ${preview.removedCount} registros de: ${affected}. Se guardará una copia previa y se ajustarán los saldos e inventario.`)) return;
    const result = await deleteModuleData(moduleId);
    if (!result.removedCount) {
      showToast("No hay datos para eliminar.");
      return;
    }
    showToast(`Se eliminaron ${result.removedCount} registros. Módulos afectados: ${affected}.`);
    await renderPage();
  } catch (error) {
    showError(error);
  }
}
async function decideRegistration(request, decision) {
  const action = decision === "approved" ? "aprobar" : "rechazar";
  if (!window.confirm(`¿Confirmas ${action} la solicitud de ${request.ownerName} para ${request.companyName}?`)) return;
  try {
    await reviewPlatformRequest(request.id, decision);
    showToast(decision === "approved"
      ? "Solicitud aprobada. El propietario ya puede ingresar a su empresa."
      : "Solicitud rechazada. La cuenta permanece bloqueada.");
    await renderPage();
  } catch (error) {
    showError(error);
  }
}

async function renderReports() {
  pageHeading("Informes generales", "Totales calculados a partir de los registros de esta empresa; no reemplazan informes contables o fiscales.");
  const allRecords = await getRecords();
  const reportModules = ["sales", "expenses", "purchases", "receivables", "payables", "money-movements"];
  const stats = element("div", "stats-grid");
  const labels = {
    sales: "Ventas no anuladas", expenses: "Gastos no anulados", purchases: "Compras",
    receivables: "Por cobrar", payables: "Por pagar", "money-movements": "Movimientos"
  };
  for (const moduleId of reportModules) {
    const amount = moduleId === "receivables" || moduleId === "payables"
      ? outstandingAmount(allRecords, moduleId)
      : activeAmount(allRecords, moduleId);
    const entries = allRecords.filter((record) => record.module === moduleId).length;
    stats.append(statCard(labels[moduleId], formatNumber(amount), `${entries} ${entries === 1 ? "registro" : "registros"}`, "▧"));
  }
  page.append(stats);
  const note = element("div", "notice");
  note.textContent = "Los valores se suman tal como fueron ingresados y utilizan la unidad monetaria que corresponda a tu negocio. Las cuentas por cobrar/pagar reflejan los importes registrados; no se calculan saldos parciales.";
  page.append(note);
}

async function renderSettings() {
  const profile = await getSetting("businessProfile") || {};
  const headingActions = element("div", "page-actions");
  if (["owner", "administrator"].includes(currentIdentity?.profile?.role)) {
    headingActions.append(addButton("Eliminar configuración", "button-danger", async () => {
      if (!window.confirm("¿Eliminar la configuración del negocio? Se limpiarán el nombre y los datos de contacto guardados.")) return;
      try {
        await saveSetting("businessProfile", {});
        showToast("Configuración eliminada.");
        await renderSettings();
      } catch (error) {
        showError(error);
      }
    }));
  }
  pageHeading("Configuración del negocio", "Información general guardada únicamente en este perfil de navegador.", headingActions);
  const card = element("form", "form-card");
  const grid = element("div", "form-grid");
  const fields = [
    { name: "businessName", label: "Nombre comercial", type: "text", required: true },
    { name: "contactName", label: "Persona de contacto", type: "text" },
    { name: "phone", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo electrónico", type: "email" },
    { name: "address", label: "Dirección", type: "text" }
  ];
  for (const field of fields) grid.append(addFormField(field, profile[field.name]));
  card.append(grid);
  const help = element("p", "permission-note", "El registro independiente, la actividad económica y la configuración avanzada se abordarán en la Etapa 2.");
  card.append(help);
  const actions = element("div", "form-actions");
  const save = element("button", "button button-primary", "Guardar configuración");
  save.type = "submit";
  actions.append(save);
  card.append(actions);
  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!card.reportValidity()) return;
    save.disabled = true;
    try {
      const values = new FormData(card);
      const updatedProfile = Object.fromEntries(fields.map((field) => [field.name, values.get(field.name) || ""]));
      await saveSetting("businessProfile", updatedProfile);
      document.querySelector("#business-name").textContent = updatedProfile.businessName;
      showToast("Configuración empresarial guardada.");
    } catch (error) {
      showError(error);
    } finally {
      save.disabled = false;
    }
  });
  page.append(card);
}

async function renderBackups() {
  page.replaceChildren();
  pageHeading("Copias de seguridad", "Exporta una copia externa o restaura un archivo validado.");
  const warning = element("div", "notice warning");
  warning.textContent = "Las copias automáticas se guardan en este mismo dispositivo y perfil de navegador. No protegen si se pierde o daña el dispositivo. Descarga y conserva copias externas en un lugar seguro.";
  page.append(warning);
  const actions = element("section", "panel");
  const body = element("div", "panel-body");
  const actionRow = element("div", "toolbar");
  actionRow.append(
    addButton("Descargar copia externa", "button-primary", () => downloadBackup().catch(showError)),
    addButton("Restaurar desde archivo", "button-secondary", () => fileInput.click())
  );
  const fileInput = element("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const restored = await restoreBackupFile(file);
      if (restored) {
        showToast("Copia restaurada.");
        await renderBackups();
      }
    } catch (error) {
      showError(error);
    } finally {
      fileInput.value = "";
    }
  });
  body.append(actionRow, fileInput);
  const title = element("h2", "", "Copias automáticas internas");
  title.style.cssText = "margin:24px 0 4px;color:#102b46;font-size:13px";
  body.append(title, element("p", "permission-note", "Se conserva un máximo de 10 estados recientes en IndexedDB. La copia previa a una restauración también se guarda internamente."));
  const backups = await getBackups(currentIdentity.company.id);
  if (["owner", "administrator"].includes(currentIdentity?.profile?.role)) {
    const clearBackups = addButton("Eliminar copias internas", "button-danger", async () => {
      if (!window.confirm("¿Eliminar todas las copias internas guardadas en este dispositivo para esta empresa? Las copias externas descargadas no se afectan.")) return;
      try {
        await deleteBackups(currentIdentity.company.id);
        showToast("Copias internas eliminadas.");
        await renderBackups();
      } catch (error) {
        showError(error);
      }
    });
    clearBackups.disabled = backups.length === 0;
    clearBackups.title = backups.length ? "Elimina las copias internas locales de esta empresa" : "No hay copias internas";
    actionRow.append(clearBackups);
  }
  if (!backups.length) {
    body.append(emptyState("Aún no hay copias internas", "Se crearán después de guardar o modificar datos."));
  } else {
    const list = element("div");
    for (const backup of backups) {
      const row = element("div", "backup-row");
      const details = element("div");
      details.append(
        element("strong", "", new Date(backup.createdAt).toLocaleString("es")),
        element("small", "", `${backup.kind === "automatic" ? "Automática" : "Interna"} · ${backup.records.length} ${backup.records.length === 1 ? "registro" : "registros"}`)
      );
      row.append(details);
      list.append(row);
    }
    body.append(list);
  }
  actions.append(body);
  page.append(actions);
}

document.querySelector("#menu-toggle").addEventListener("click", (event) => {
  const isOpen = sidebar.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(isOpen));
});

workspaceSwitch.addEventListener("click", () => {
  signOut().then(() => {
    currentIdentity = null;
    setCloudIdentity(null);
    workspace = null;
    activeModule = "dashboard";
    authView = "login";
    modalRoot.replaceChildren();
    renderAuthScreen();
  }).catch(showError);
});

modalRoot.addEventListener("click", closeOnBackdrop);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.childElementCount) modalRoot.replaceChildren();
});

async function start() {
  try {
    currentIdentity = null;
    workspace = null;
    setCloudIdentity(null);
    authView = "login";
    renderAuthScreen();
  } catch (error) {
    showError(error);
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(showError);
  }
}

start();
