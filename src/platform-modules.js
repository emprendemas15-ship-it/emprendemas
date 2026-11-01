export const platformModules = [
  { id: "platform-dashboard", label: "Panel principal", icon: "⌂", group: "PLATAFORMA" },
  { id: "platform-companies", label: "Empresas registradas", icon: "▣", group: "EMPRESAS" },
  { id: "platform-active-companies", label: "Empresas activas", icon: "●", group: "EMPRESAS", status: "Activa" },
  { id: "platform-inactive-companies", label: "Empresas inactivas", icon: "○", group: "EMPRESAS", status: "Inactiva" },
  { id: "platform-users", label: "Usuarios registrados", icon: "♙", group: "USUARIOS" },
  { id: "platform-active-users", label: "Usuarios activos", icon: "●", group: "USUARIOS", status: "Activo" },
  { id: "platform-inactive-users", label: "Usuarios inactivos", icon: "○", group: "USUARIOS", status: "Inactivo" },
  { id: "platform-requests", label: "Solicitudes y registros", icon: "▤", group: "GESTIÓN" },
  { id: "platform-access", label: "Control de accesos", icon: "⚿", group: "GESTIÓN" },
  { id: "platform-settings", label: "Configuración general", icon: "⚙", group: "PLATAFORMA" },
  { id: "platform-statistics", label: "Estadísticas generales", icon: "▧", group: "PLATAFORMA" }
];

export const platformCompanyFields = [
  { name: "name", label: "Nombre comercial", type: "text", required: true },
  { name: "activity", label: "Actividad comercial", type: "select", options: ["Papelería", "Accesorios para el hogar", "Restaurante de comidas rápidas", "Otro"], required: true },
  { name: "ownerName", label: "Propietario", type: "text", required: true },
  { name: "contactEmail", label: "Correo de contacto", type: "email" },
  { name: "contactPhone", label: "Teléfono de contacto", type: "tel" },
  { name: "registeredAt", label: "Fecha de registro", type: "date", required: true },
  { name: "status", label: "Estado", type: "select", options: ["Activa", "Inactiva"], required: true }
];

export const platformUserFields = [
  { name: "name", label: "Nombre del usuario", type: "text", required: true },
  { name: "email", label: "Correo electrónico", type: "email", required: true },
  { name: "companyId", label: "Empresa asociada", type: "company", required: true },
  { name: "role", label: "Perfil empresarial", type: "select", options: ["Propietario", "Administrador", "Empleado"], required: true },
  { name: "status", label: "Estado", type: "select", options: ["Activo", "Inactivo"], required: true }
];

export const platformRequestFields = [
  { name: "companyName", label: "Nombre comercial propuesto", type: "text", required: true },
  { name: "activity", label: "Actividad comercial", type: "select", options: ["Papelería", "Accesorios para el hogar", "Restaurante de comidas rápidas", "Otro"], required: true },
  { name: "ownerName", label: "Propietario solicitante", type: "text", required: true },
  { name: "contactEmail", label: "Correo de contacto", type: "email" },
  { name: "requestedAt", label: "Fecha de solicitud", type: "date", required: true },
  { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Aprobada", "Rechazada"], required: true }
];

export function findPlatformModule(id) {
  return platformModules.find((module) => module.id === id);
}
