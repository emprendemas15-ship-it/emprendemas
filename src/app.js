import logoUrl from "../assets/emprende-plus-logo.jpeg";
import { modules, findModule } from "./modules.js";
import {
  platformCompanyFields, platformModules, platformRequestFields, platformUserFields
} from "./platform-modules.js";
import {
  deletePlatformRecord, deleteRecord, getPlatformRecords, getPlatformSetting, getRecords, getSetting,
  savePlatformRecord, savePlatformSetting, saveRecord, saveSetting, setCloudIdentity
} from "./cloud-data.js";
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
  return workspace === PLATFORM_WORKSPACE ? platformModules : modules;
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
      { name: "activity", label: "Actividad comercial", type: "select", options: ["Papelería", "Accesorios para el hogar", "Restaurante de comidas rápidas", "Otro"], required: true },
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
      if (!result.session) {
        showToast("Cuenta creada. Confirma tu correo para activar el ingreso.");
        return;
      }
      showToast("Empresa registrada. Inicia sesión para continuar.");
      return;
    } else {
      await signIn(values.email.trim(), values.password);
    }
    await activateIdentity();
  } catch (error) {
    showError(error);
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
  const action = entity === "requests" && module.id === "platform-requests"
    ? addButton("+ Registrar solicitud", "button-primary", () => openPlatformForm(entity))
    : null;
  pageHeading(title, description, action);
  platformNotice();

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
    const filtered = rows.filter((entry) => fieldDefinitions.some((field) => {
      const value = field.name === "companyId" ? companyMap.get(entry.companyId) : entry[field.name];
      return String(value ?? "").toLocaleLowerCase().includes(query);
    }));
    renderPlatformTable(tableContainer, filtered, entity, true, fieldDefinitions, companyMap);
    count.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
  };
  search.addEventListener("input", paint);
  paint();
}

function renderPlatformTable(container, rows, entity, withActions, fields, companyMap = new Map()) {
  container.replaceChildren();
  if (!rows.length) {
    container.append(emptyState("Sin registros", "Todavía no hay datos disponibles para esta vista."));
    return;
  }
  const definitions = fields || (entity === "companies" ? platformCompanyFields
    : entity === "users" ? platformUserFields : platformRequestFields);
  const columns = entity === "companies"
    ? ["name", "activity", "ownerName", "registeredAt", "status"]
    : entity === "users"
      ? ["name", "email", "companyId", "role", "status"]
      : ["companyName", "activity", "ownerName", "requestedAt", "status"];
  const hasActions = withActions && (entity !== "users" || rows.some((record) => record.role !== "Propietario"));
  const table = element("table", "data-table");
  const head = element("thead");
  const headRow = element("tr");
  for (const name of columns) {
    const field = definitions.find((definition) => definition.name === name);
    headRow.append(element("th", "", field?.label || name));
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
    if (hasActions && (entity === "companies" || entity === "users" || entity === "requests")) {
      const actions = element("td");
      const group = element("div", "table-actions");
      const edit = element("button", "", "Editar");
      edit.type = "button";
      edit.addEventListener("click", () => openPlatformForm(entity, record));
      group.append(edit);
      if (entity === "requests") {
        const remove = element("button", "", "Eliminar");
        remove.type = "button";
        remove.addEventListener("click", () => removePlatformRecord(entity, record.id));
        group.append(remove);
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
  pageHeading("Control de accesos", "Revisa perfiles empresariales registrados, sin crear sesiones de usuario.");
  platformNotice();
  const notice = element("div", "notice warning");
  notice.textContent = "El administrador de plataforma puede consultar y desactivar perfiles empresariales, pero no puede leer sus datos operativos.";
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
  return new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(number);
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
  pageHeading(module.label, module.description, addButton("+ Agregar registro", "button-primary", () => openRecordForm(module.id)));
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

  const records = await getRecords(module.id);
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
        row.append(element("td", "", displayValue(record[field.name], field.type)));
      }
      const actions = element("td");
      const actionGroup = element("div", "table-actions");
      const edit = element("button", "", "Editar");
      edit.type = "button";
      edit.addEventListener("click", () => openRecordForm(module.id, record));
      const remove = element("button", "", "Eliminar");
      remove.type = "button";
      remove.addEventListener("click", () => removeRecord(module.id, record.id));
      actionGroup.append(edit, remove);
      actions.append(actionGroup);
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
  const storeName = entity === "companies" ? "platformCompanies"
    : entity === "users" ? "platformUsers" : "platformRequests";
  const fields = entity === "companies"
    ? platformCompanyFields.filter((field) => field.name !== "registeredAt")
    : entity === "users"
      ? platformUserFields.filter((field) => ["role", "status"].includes(field.name))
        .map((field) => field.name === "role"
          ? { ...field, options: ["Administrador", "Empleado"] }
          : field)
      : platformRequestFields;
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
    const hint = element("p", "permission-note", "El rol y el estado actualizan los permisos de esta cuenta autenticada. Los perfiles de propietario se administran desde el estado de su empresa.");
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
      await savePlatformRecord(storeName, values, record?.id);
      modalRoot.replaceChildren();
      showToast(entity === "users" ? "Acceso del usuario actualizado." : entity === "requests"
        ? "Solicitud guardada." : "Datos de empresa actualizados.");
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

function openRecordForm(moduleId, record = null) {
  const module = findModule(moduleId);
  if (!module?.fields) return;
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
  for (const field of module.fields) grid.append(addFormField(field, record?.[field.name]));
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
  if (!window.confirm("¿Eliminar este registro? Esta acción no se puede deshacer desde la lista.")) return;
  try {
    const records = await getRecords(moduleId);
    if (!records.some((record) => record.id === id)) throw new Error("No se encontró el registro que intentas eliminar.");
    await deleteRecord(id);
    showToast("Registro eliminado y copia interna actualizada.");
    await renderPage();
  } catch (error) {
    showError(error);
  }
}

async function removePlatformRecord(entity, id) {
  const storeName = entity === "companies" ? "platformCompanies"
    : entity === "users" ? "platformUsers" : "platformRequests";
  if (entity === "companies") {
    const users = await getPlatformRecords("platformUsers");
    if (users.some((user) => user.companyId === id)) {
      showToast("No se puede eliminar una empresa asociada a usuarios. Cámbiala a Inactiva.", true);
      return;
    }
  }
  if (!window.confirm("¿Eliminar este registro administrativo local?")) return;
  try {
    await deletePlatformRecord(storeName, id);
    showToast("Registro administrativo eliminado.");
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
  pageHeading("Configuración del negocio", "Información general guardada únicamente en este perfil de navegador.");
  const profile = await getSetting("businessProfile") || {};
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
    navigator.serviceWorker.register("./sw.js").catch(showError);
  }
}

start();
