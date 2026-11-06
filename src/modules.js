const commonStatus = ["Pendiente", "Pagado", "Anulado"];

export const modules = [
  { id: "dashboard", label: "Panel principal", icon: "⌂", group: "INICIO", description: "Resumen de la actividad de tu negocio." },
  { id: "sales", label: "Ventas", icon: "↗", group: "OPERACIÓN", description: "Registra ventas con descuento de inventario, recaudo y cartera.", workflow: "sale", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "customer", label: "Cliente", type: "text" },
    { name: "detail", label: "Detalle de la venta", type: "text", required: true },
    { name: "quantity", label: "Cantidad", type: "number", min: 0.01, step: 0.01, required: true },
    { name: "amount", label: "Total", type: "number", min: 0, step: 0.01, required: true },
    { name: "paymentMethod", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Otro"] },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "expenses", label: "Gastos", icon: "↘", group: "OPERACIÓN", description: "Registra gastos y los refleja en caja cuando se pagan.", workflow: "expense", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "category", label: "Categoría", type: "text", required: true },
    { name: "detail", label: "Descripción", type: "text", required: true },
    { name: "amount", label: "Valor", type: "number", min: 0, step: 0.01, required: true },
    { name: "paymentMethod", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Otro"] },
    { name: "status", label: "Estado", type: "select", options: commonStatus }
  ] },
  { id: "purchases", label: "Compras", icon: "▣", group: "OPERACIÓN", description: "Registra compras, aumenta existencias y genera saldos por pagar.", workflow: "purchase", fields: [
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
  { id: "raw-materials", label: "Materias primas", icon: "◈", group: "OPERACIÓN", description: "Controla insumos disponibles para producción.", fields: [
    { name: "name", label: "Materia prima", type: "text", required: true },
    { name: "code", label: "Código / referencia", type: "text" },
    { name: "quantity", label: "Existencias", type: "number", min: 0, step: 0.01, required: true },
    { name: "unit", label: "Unidad", type: "text" },
    { name: "cost", label: "Costo unitario", type: "number", min: 0, step: 0.01 },
    { name: "minimum", label: "Existencia mínima", type: "number", min: 0, step: 0.01 }
  ] },
  { id: "production", label: "Producción", icon: "⚒", group: "OPERACIÓN", description: "Consume materias primas y agrega producto terminado.", workflow: "production", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "detail", label: "Detalle", type: "text", required: true },
    { name: "materialName", label: "Materia prima", type: "text", required: true },
    { name: "inputQuantity", label: "Cantidad consumida", type: "number", min: 0, step: 0.01, required: true },
    { name: "productName", label: "Producto terminado", type: "text", required: true },
    { name: "outputQuantity", label: "Cantidad producida", type: "number", min: 0, step: 0.01, required: true }
  ] },
  { id: "services", label: "Servicios", icon: "✂", group: "SERVICIOS", description: "Configura servicios, duración, precio y comisión del personal.", fields: [
    { name: "name", label: "Servicio", type: "text", required: true },
    { name: "durationMinutes", label: "Duración (minutos)", type: "number", min: 5, step: 5, required: true },
    { name: "price", label: "Precio al cliente (COP)", type: "number", min: 0, step: 1, required: true }
  ] },
  { id: "service-sales", label: "Cobrar un servicio", icon: "✓", group: "SERVICIOS", description: "Registra el servicio prestado, su recaudo o cartera y la comisión asociada.", workflow: "service-sale", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "service", label: "Servicio", type: "text", required: true },
    { name: "customer", label: "Cliente", type: "text", required: true },
    { name: "employee", label: "Profesional", type: "text" },
    { name: "amount", label: "Valor del servicio", type: "number", min: 0, step: 1, required: true },
    { name: "commission", label: "Comisión", type: "number", min: 0, step: 1 }
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
    { name: "salary", label: "Salario mensual pactado (COP)", type: "number", min: 0, step: 1, required: true },
    { name: "transportEligible", label: "¿Aplica auxilio de transporte?", type: "select", options: ["Sí", "No"], defaultValue: "Sí", required: true },
    { name: "arlRate", label: "Tarifa ARL asignada (%)", type: "select", options: ["0.522", "1.044", "2.436", "4.350", "6.960"], defaultValue: "0.522", required: true },
    { name: "employerExonerated", label: "¿Aplica exoneración de salud patronal, SENA e ICBF?", type: "select", options: ["Sí", "No"], defaultValue: "No", required: true },
    { name: "startDate", label: "Fecha de ingreso", type: "date" },
    { name: "status", label: "Estado", type: "select", options: ["Activo", "Inactivo"] }
  ] },
  { id: "payroll", label: "Nómina", icon: "▥", group: "PERSONAL", description: "Liquida nómina ordinaria colombiana con recargos, seguridad social, auxilio, provisiones y costo patronal.", workflow: "payroll", fields: [
    { name: "date", label: "Fecha de pago", type: "date", required: true },
    { name: "employee", label: "Empleado", type: "text", required: true },
    { name: "period", label: "Periodo", type: "text", required: true },
    { name: "grossPay", label: "Devengado bruto", type: "number" },
    { name: "netPay", label: "Neto al trabajador", type: "number" },
    { name: "daysWorked", label: "Días liquidados", type: "number" },
    { name: "base", label: "Salario básico liquidado", type: "number" },
    { name: "additions", label: "Recargos y otros salariales", type: "number" },
    { name: "transportAllowance", label: "Auxilio de transporte", type: "number" },
    { name: "deductions", label: "Deducciones del trabajador", type: "number" },
    { name: "ibc", label: "IBC de aportes", type: "number" },
    { name: "totalEmployerContributions", label: "Aportes patronales", type: "number" },
    { name: "totalProvisions", label: "Provisiones laborales", type: "number" },
    { name: "employerCost", label: "Costo laboral total", type: "number" },
    { name: "status", label: "Pago al trabajador", type: "select", options: ["Pagado", "Pendiente"] }
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
  { id: "receivables", label: "Cuentas por cobrar", icon: "◷", group: "FINANZAS", description: "Controla saldos pendientes generados por ventas a crédito.", fields: [
    { name: "customer", label: "Cliente", type: "text", required: true },
    { name: "detail", label: "Concepto", type: "text", required: true },
    { name: "date", label: "Fecha de origen", type: "date", required: true },
    { name: "dueDate", label: "Fecha de vencimiento", type: "date" },
    { name: "amount", label: "Valor pendiente", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagada", "Vencida"], required: true }
  ] },
  { id: "receivable-payments", label: "Abonos de clientes", icon: "↙", group: "FINANZAS", description: "Registra abonos, actualiza cartera y refleja el ingreso en caja.", workflow: "receivable-payment", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "customer", label: "Cliente", type: "text", required: true },
    { name: "amount", label: "Valor del abono", type: "number", min: 0.01, step: 0.01, required: true },
    { name: "method", label: "Medio de pago", type: "text" },
    { name: "balanceAfter", label: "Saldo restante", type: "number", min: 0, step: 0.01 }
  ] },
  { id: "payable-payments", label: "Abonos a proveedores", icon: "↗", group: "FINANZAS", description: "Registra pagos, actualiza cuentas por pagar y descuenta caja.", workflow: "payable-payment", fields: [
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "supplier", label: "Proveedor", type: "text", required: true },
    { name: "amount", label: "Valor del abono", type: "number", min: 0.01, step: 0.01, required: true },
    { name: "method", label: "Medio de pago", type: "text" },
    { name: "balanceAfter", label: "Saldo restante", type: "number", min: 0, step: 0.01 }
  ] },
  { id: "payables", label: "Cuentas por pagar", icon: "◴", group: "FINANZAS", description: "Controla saldos pendientes con proveedores.", fields: [
    { name: "supplier", label: "Proveedor", type: "text", required: true },
    { name: "detail", label: "Concepto", type: "text", required: true },
    { name: "date", label: "Fecha de origen", type: "date", required: true },
    { name: "dueDate", label: "Fecha de vencimiento", type: "date" },
    { name: "amount", label: "Valor pendiente", type: "number", min: 0, step: 0.01, required: true },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagada", "Vencida"], required: true }
  ] },
  { id: "stock-movements", label: "Movimientos de inventario", icon: "⇅", group: "FINANZAS", description: "Consulta entradas y salidas de productos y materias primas.", fields: [
    { name: "date", label: "Fecha", type: "date" },
    { name: "itemName", label: "Artículo", type: "text" },
    { name: "direction", label: "Dirección", type: "text" },
    { name: "quantity", label: "Cantidad", type: "number" },
    { name: "reason", label: "Motivo", type: "text" }
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
