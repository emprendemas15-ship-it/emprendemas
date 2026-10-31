const commonStatus = ["Pendiente", "Pagado", "Anulado"];

export const modules = [
  { id: "dashboard", label: "Panel principal", icon: "⌂", group: "INICIO", description: "Resumen de la actividad de tu negocio." },
  { id: "sales", label: "Ventas", icon: "↗", group: "OPERACIÓN", description: "Registra y consulta las ventas del negocio.", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "customer", label: "Cliente", type: "text" },
    { name: "detail", label: "Detalle de la venta", type: "text", required: true },
    { name: "quantity", label: "Cantidad", type: "number", min: 0.01, step: 0.01, required: true },
    { name: "amount", label: "Total", type: "number", min: 0, step: 0.01, required: true },
    { name: "paymentMethod", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Otro"] },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "expenses", label: "Gastos", icon: "↘", group: "OPERACIÓN", description: "Registra los gastos generales del negocio.", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "category", label: "Categoría", type: "text", required: true },
    { name: "detail", label: "Descripción", type: "text", required: true },
    { name: "amount", label: "Valor", type: "number", min: 0, step: 0.01, required: true },
    { name: "paymentMethod", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Otro"] },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "purchases", label: "Compras", icon: "▣", group: "OPERACIÓN", description: "Registra compras realizadas a proveedores.", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "supplier", label: "Proveedor", type: "text", required: true },
    { name: "detail", label: "Detalle de compra", type: "text", required: true },
    { name: "amount", label: "Total", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "inventory", label: "Inventario básico", icon: "▤", group: "OPERACIÓN", description: "Consulta las existencias y datos básicos de productos.", fields: [
    { name: "name", label: "Producto", type: "text", required: true },
    { name: "code", label: "Código / referencia", type: "text" },
    { name: "category", label: "Categoría", type: "text" },
    { name: "quantity", label: "Existencias", type: "number", min: 0, step: 0.01, required: true },
    { name: "unit", label: "Unidad", type: "text" },
    { name: "cost", label: "Costo unitario", type: "number", min: 0, step: 0.01 },
    { name: "price", label: "Precio de venta", type: "number", min: 0, step: 0.01 },
    { name: "minimum", label: "Existencia mínima", type: "number", min: 0, step: 0.01 }
  ] },
  { id: "customers", label: "Clientes", icon: "♙", group: "CONTACTOS", description: "Mantén un directorio local de clientes.", fields: [
    { name: "name", label: "Nombre", type: "text", required: true },
    { name: "phone", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo electrónico", type: "email" },
    { name: "notes", label: "Notas", type: "textarea" }
  ] },
  { id: "suppliers", label: "Proveedores", icon: "♧", group: "CONTACTOS", description: "Mantén un directorio local de proveedores.", fields: [
    { name: "name", label: "Nombre comercial", type: "text", required: true },
    { name: "contact", label: "Persona de contacto", type: "text" },
    { name: "phone", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo electrónico", type: "email" },
    { name: "notes", label: "Notas", type: "textarea" }
  ] },
  { id: "employees", label: "Empleados", icon: "♟", group: "PERSONAL", description: "Registra información básica del personal.", fields: [
    { name: "name", label: "Nombre", type: "text", required: true },
    { name: "position", label: "Cargo", type: "text" },
    { name: "phone", label: "Teléfono", type: "tel" },
    { name: "salary", label: "Salario acordado", type: "number", min: 0, step: 0.01 },
    { name: "startDate", label: "Fecha de ingreso", type: "date" },
    { name: "status", label: "Estado", type: "select", options: ["Activo", "Inactivo"] }
  ] },
  { id: "payroll", label: "Nómina", icon: "▥", group: "PERSONAL", description: "Registra pagos de nómina. No calcula obligaciones legales o fiscales.", fields: [
    { name: "date", label: "Fecha de pago", type: "date", required: true },
    { name: "employee", label: "Empleado", type: "text", required: true },
    { name: "period", label: "Periodo", type: "text", required: true },
    { name: "base", label: "Pago base", type: "number", min: 0, step: 0.01 },
    { name: "additions", label: "Adiciones", type: "number", min: 0, step: 0.01 },
    { name: "deductions", label: "Descuentos", type: "number", min: 0, step: 0.01 },
    { name: "amount", label: "Total pagado", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "cash", label: "Caja", icon: "▣", group: "FINANZAS", description: "Registra aperturas y cierres de caja.", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "openedBy", label: "Responsable", type: "text", required: true },
    { name: "openingAmount", label: "Saldo inicial", type: "number", min: 0, step: 0.01, required: true },
    { name: "closingAmount", label: "Saldo de cierre", type: "number", min: 0, step: 0.01 },
    { name: "difference", label: "Diferencia", type: "number", step: 0.01 },
    { name: "status", label: "Estado", type: "select", options: ["Abierta", "Cerrada"] }
  ] },
  { id: "money-movements", label: "Movimientos de dinero", icon: "⇄", group: "FINANZAS", description: "Registra entradas y salidas de dinero.", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "type", label: "Tipo", type: "select", options: ["Entrada", "Salida"], required: true },
    { name: "detail", label: "Descripción", type: "text", required: true },
    { name: "amount", label: "Valor", type: "number", min: 0, step: 0.01, required: true },
    { name: "reference", label: "Referencia", type: "text" }
  ] },
  { id: "receivables", label: "Cuentas por cobrar", icon: "◷", group: "FINANZAS", description: "Controla saldos pendientes de clientes.", fields: [
    { name: "customer", label: "Cliente", type: "text", required: true },
    { name: "detail", label: "Concepto", type: "text", required: true },
    { name: "date", label: "Fecha de origen", type: "date", required: true },
    { name: "dueDate", label: "Fecha de vencimiento", type: "date" },
    { name: "amount", label: "Valor pendiente", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagada", "Vencida"], required: true }
  ] },
  { id: "payables", label: "Cuentas por pagar", icon: "◴", group: "FINANZAS", description: "Controla saldos pendientes con proveedores.", fields: [
    { name: "supplier", label: "Proveedor", type: "text", required: true },
    { name: "detail", label: "Concepto", type: "text", required: true },
    { name: "date", label: "Fecha de origen", type: "date", required: true },
    { name: "dueDate", label: "Fecha de vencimiento", type: "date" },
    { name: "amount", label: "Valor pendiente", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagada", "Vencida"], required: true }
  ] },
  { id: "reports", label: "Informes generales", icon: "▧", group: "CONSULTAS", description: "Consulta totales generales a partir de los registros locales." },
  { id: "settings", label: "Configuración del negocio", icon: "⚙", group: "ADMINISTRACIÓN", description: "Guarda información general de este negocio en el dispositivo." },
  { id: "users", label: "Usuarios y permisos", icon: "♙", group: "ADMINISTRACIÓN", description: "Lleva un registro local de usuarios y roles; no es autenticación segura.", fields: [
    { name: "name", label: "Nombre", type: "text", required: true },
    { name: "role", label: "Rol", type: "select", options: ["Administrador", "Operador", "Consulta"], required: true },
    { name: "permissions", label: "Permisos previstos", type: "textarea" },
    { name: "status", label: "Estado", type: "select", options: ["Activo", "Inactivo"] }
  ] },
  { id: "backups", label: "Copias de seguridad", icon: "⤓", group: "ADMINISTRACIÓN", description: "Exporta o restaura una copia externa validada." }
];

export const findModule = (id) => modules.find((item) => item.id === id);
