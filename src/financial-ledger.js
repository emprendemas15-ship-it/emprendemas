import { calculateColombianPayroll } from "./colombian-payroll.js";

const money = (value, label) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} debe ser un valor igual o mayor que cero.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

const positive = (value, label) => {
  const amount = money(value, label);
  if (amount <= 0) throw new Error(`${label} debe ser mayor que cero.`);
  return amount;
};

const createId = () => globalThis.crypto?.randomUUID?.()
  || `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function makeRecord(module, values, id = createId()) {
  const timestamp = new Date().toISOString();
  return { id, module, ...values, createdAt: timestamp, updatedAt: timestamp };
}

function assertStockItem(item, allowedModules, label = "Producto") {
  if (!item || !allowedModules.includes(item.module)) throw new Error(`Selecciona un ${label.toLowerCase()} válido.`);
}

function stockChange(item, delta, reason, referenceId, date) {
  return {
    id: item.id,
    delta,
    movement: makeRecord("stock-movements", {
      date,
      itemId: item.id,
      itemName: item.name,
      itemModule: item.module,
      quantity: Math.abs(delta),
      direction: delta > 0 ? "Entrada" : "Salida",
      reason,
      referenceId,
      unitCost: Number(item.cost) || 0
    })
  };
}

function cashMovement({ date, type, amount, detail, reference, relatedModule, relatedId, method }) {
  return makeRecord("money-movements", {
    date,
    type,
    amount,
    detail,
    reference,
    relatedModule,
    relatedId,
    method,
    source: "automatico"
  });
}

export function buildSaleTransaction({
  product, customer = "Venta de mostrador", customerId = "", quantity, unitPrice,
  paidAmount, dueDate = "", paymentMethod = "Efectivo", date = new Date().toISOString().slice(0, 10),
  id = createId()
}) {
  assertStockItem(product, ["inventory"]);
  const qty = positive(quantity, "La cantidad");
  const price = money(unitPrice, "El precio unitario");
  const total = money(qty * price, "El total de la venta");
  const paid = money(paidAmount, "El valor recibido");
  const available = money(product.quantity, "Las existencias");
  if (qty > available) throw new Error(`Existencias insuficientes de ${product.name}: hay ${available} y solicitas ${qty}.`);
  if (paid > total) throw new Error("El valor recibido no puede superar el total de la venta.");
  const balance = money(total - paid, "El saldo a crédito");
  const sale = makeRecord("sales", {
    date, customer, customerId, detail: `${product.name} × ${qty}`, productId: product.id,
    productName: product.name, quantity: qty, unitPrice: price, amount: total,
    paidAmount: paid, creditAmount: balance, paymentMethod,
    status: balance === 0 ? "Pagado" : "Pendiente"
  }, id);
  const records = [sale];
  if (paid > 0) records.push(cashMovement({
    date, type: "Entrada", amount: paid, detail: `Pago de venta: ${product.name}`,
    reference: sale.id, relatedModule: "sales", relatedId: sale.id, method: paymentMethod
  }));
  if (balance > 0) records.push(makeRecord("receivables", {
    date, dueDate, customer, customerId, detail: `Saldo de venta: ${product.name}`,
    saleId: sale.id, originalAmount: balance, paidAmount: 0, outstandingAmount: balance,
    amount: balance, status: "Pendiente"
  }));
  const stock = stockChange(product, -qty, "Venta", sale.id, date);
  records.push(stock.movement);
  return { records, stockAdjustments: [{ id: stock.id, delta: stock.delta }] };
}

export function buildServiceSaleTransaction({
  service, customer, employee, paidAmount, dueDate = "",
  paymentMethod = "Efectivo", date = new Date().toISOString().slice(0, 10), id = createId()
}) {
  if (!service?.id) throw new Error("Selecciona un servicio válido.");
  const price = positive(service.price, "El precio del servicio");
  const paid = money(paidAmount, "El valor recibido");
  if (paid > price) throw new Error("El valor recibido no puede superar el valor del servicio.");
  const balance = money(price - paid, "El saldo a crédito");
  const sale = makeRecord("sales", {
    date, customer: customer?.name || "Venta de mostrador", customerId: customer?.id || "",
    detail: `Servicio: ${service.name}`, serviceId: service.id, serviceName: service.name,
    employee: employee?.name || "", employeeId: employee?.id || "", quantity: 1,
    unitPrice: price, amount: price, paidAmount: paid, creditAmount: balance,
    paymentMethod, status: balance === 0 ? "Pagado" : "Pendiente"
  }, id);
  const records = [sale];
  if (paid > 0) records.push(cashMovement({
    date, type: "Entrada", amount: paid, detail: `Pago de servicio: ${service.name}`,
    reference: sale.id, relatedModule: "sales", relatedId: sale.id, method: paymentMethod
  }));
  if (balance > 0) records.push(makeRecord("receivables", {
    date, dueDate, customer: customer?.name || "Cliente de mostrador", customerId: customer?.id || "",
    detail: `Saldo de servicio: ${service.name}`, saleId: sale.id,
    originalAmount: balance, paidAmount: 0, outstandingAmount: balance, amount: balance, status: "Pendiente"
  }));

  return { records, stockAdjustments: [] };
}

export function buildPurchaseTransaction({
  item, supplier, supplierId = "", quantity, unitCost, paidAmount, dueDate = "",
  paymentMethod = "Transferencia", date = new Date().toISOString().slice(0, 10), id = createId()
}) {
  assertStockItem(item, ["inventory", "raw-materials"], "artículo");
  const qty = positive(quantity, "La cantidad comprada");
  const cost = money(unitCost, "El costo unitario");
  const total = money(qty * cost, "El total de la compra");
  const paid = money(paidAmount, "El valor pagado");
  if (!String(supplier || "").trim()) throw new Error("Indica el proveedor de la compra.");
  if (paid > total) throw new Error("El valor pagado no puede superar el total de la compra.");
  const balance = money(total - paid, "El saldo por pagar");
  const purchase = makeRecord("purchases", {
    date, supplier: String(supplier).trim(), supplierId, detail: `${item.name} × ${qty}`,
    itemId: item.id, itemName: item.name, itemModule: item.module, quantity: qty,
    unitCost: cost, amount: total, paidAmount: paid, payableAmount: balance,
    paymentMethod, status: balance === 0 ? "Pagado" : "Pendiente"
  }, id);
  const records = [purchase];
  if (paid > 0) records.push(cashMovement({
    date, type: "Salida", amount: paid, detail: `Pago de compra: ${item.name}`,
    reference: purchase.id, relatedModule: "purchases", relatedId: purchase.id, method: paymentMethod
  }));
  if (balance > 0) records.push(makeRecord("payables", {
    date, dueDate, supplier: String(supplier).trim(), supplierId,
    detail: `Saldo de compra: ${item.name}`, purchaseId: purchase.id,
    originalAmount: balance, paidAmount: 0, outstandingAmount: balance,
    amount: balance, status: "Pendiente"
  }));
  const stock = stockChange(item, qty, "Compra", purchase.id, date);
  records.push(stock.movement);
  return { records, stockAdjustments: [{ id: stock.id, delta: stock.delta, cost }] };
}

export function buildReceivablePaymentTransaction({ receivable, amount, date = new Date().toISOString().slice(0, 10), method = "Efectivo", id = createId() }) {
  if (!receivable || receivable.module !== "receivables") throw new Error("Selecciona una cuenta por cobrar válida.");
  const payment = positive(amount, "El abono");
  const currentBalance = money(receivable.outstandingAmount ?? receivable.amount, "El saldo pendiente");
  if (payment > currentBalance) throw new Error(`El abono supera el saldo pendiente de ${currentBalance}.`);
  const remaining = money(currentBalance - payment, "El saldo restante");
  const paymentRecord = makeRecord("receivable-payments", {
    date, receivableId: receivable.id, saleId: receivable.saleId || "",
    customer: receivable.customer, amount: payment, method,
    balanceBefore: currentBalance, balanceAfter: remaining
  }, id);
  const updatedReceivable = {
    ...receivable,
    amount: remaining,
    outstandingAmount: remaining,
    paidAmount: money(Number(receivable.paidAmount || 0) + payment, "Abonos acumulados"),
    status: remaining === 0 ? "Pagada" : "Pendiente",
    updatedAt: new Date().toISOString()
  };
  return {
    records: [paymentRecord, updatedReceivable, cashMovement({
      date, type: "Entrada", amount: payment, detail: `Abono de ${receivable.customer}`,
      reference: paymentRecord.id, relatedModule: "receivables", relatedId: receivable.id, method
    })],
    stockAdjustments: []
  };
}

export function buildPayablePaymentTransaction({ payable, amount, date = new Date().toISOString().slice(0, 10), method = "Transferencia", id = createId() }) {
  if (!payable || payable.module !== "payables") throw new Error("Selecciona una cuenta por pagar válida.");
  const payment = positive(amount, "El abono");
  const currentBalance = money(payable.outstandingAmount ?? payable.amount, "El saldo pendiente");
  if (payment > currentBalance) throw new Error(`El abono supera el saldo pendiente de ${currentBalance}.`);
  const remaining = money(currentBalance - payment, "El saldo restante");
  const paymentRecord = makeRecord("payable-payments", {
    date, payableId: payable.id, purchaseId: payable.purchaseId || "",
    supplier: payable.supplier, amount: payment, method,
    balanceBefore: currentBalance, balanceAfter: remaining
  }, id);
  const updatedPayable = {
    ...payable,
    amount: remaining,
    outstandingAmount: remaining,
    paidAmount: money(Number(payable.paidAmount || 0) + payment, "Abonos acumulados"),
    status: remaining === 0 ? "Pagada" : "Pendiente",
    updatedAt: new Date().toISOString()
  };
  return {
    records: [paymentRecord, updatedPayable, cashMovement({
      date, type: "Salida", amount: payment, detail: `Abono a ${payable.supplier}`,
      reference: paymentRecord.id, relatedModule: "payables", relatedId: payable.id, method
    })],
    stockAdjustments: []
  };
}

export function buildExpenseTransaction({ detail, category, amount, date = new Date().toISOString().slice(0, 10), paymentMethod = "Efectivo", status = "Pagado", id = createId() }) {
  const total = positive(amount, "El valor del gasto");
  if (!String(detail || "").trim()) throw new Error("Escribe la descripción del gasto.");
  const expense = makeRecord("expenses", {
    date, category: category || "General", detail: String(detail).trim(), amount: total,
    paymentMethod, status
  }, id);
  const records = [expense];
  if (status === "Pagado") records.push(cashMovement({
    date, type: "Salida", amount: total, detail: `Gasto: ${expense.detail}`,
    reference: expense.id, relatedModule: "expenses", relatedId: expense.id, method: paymentMethod
  }));
  if (status === "Pendiente") records.push(makeRecord("payables", {
    date, supplier: "Gasto general", detail: expense.detail,
    originalAmount: total, paidAmount: 0, outstandingAmount: total,
    amount: total, status: "Pendiente", expenseId: expense.id
  }));
  return { records, stockAdjustments: [] };
}

export function buildPayrollTransaction({
  employee, period, daysWorked = 30, nightHours = 0, overtimeDayHours = 0,
  overtimeNightHours = 0, restDayDayHours = 0, restDayNightHours = 0,
  overtimeRestDayDayHours = 0, overtimeRestDayNightHours = 0,
  additionalSalary = 0, otherDeductions = 0, incomeTaxWithholding = 0,
  status = "Pagado", date = new Date().toISOString().slice(0, 10),
  paymentMethod = "Transferencia", id = createId()
}) {
  const calculation = calculateColombianPayroll({
    employee, period, daysWorked, nightHours, overtimeDayHours, overtimeNightHours,
    restDayDayHours, restDayNightHours, overtimeRestDayDayHours, overtimeRestDayNightHours,
    additionalSalary, otherDeductions, incomeTaxWithholding
  });
  if (!["Pagado", "Pendiente"].includes(status)) throw new Error("El estado de nómina no es válido.");
  const payroll = makeRecord("payroll", {
    date, employee: employee.name, employeeId: employee.id, period,
    daysWorked: calculation.daysWorked, base: calculation.baseSalary,
    additions: calculation.additionalSalary, salaryEarnings: calculation.salaryEarnings,
    transportAllowance: calculation.transportAllowance, grossPay: calculation.grossPay,
    deductions: calculation.totalDeductions, deductionDetails: calculation.deductions,
    netPay: calculation.netPay, ibc: calculation.ibc,
    minimumWageWarning: calculation.minimumWageWarning,
    employerExonerated: calculation.employerExonerated,
    employerContributions: calculation.employerContributions,
    totalEmployerContributions: calculation.totalEmployerContributions,
    provisions: calculation.provisions, totalProvisions: calculation.totalProvisions,
    employerCost: calculation.totalEmployerCost, hours: {
      night: Number(nightHours) || 0, overtimeDay: Number(overtimeDayHours) || 0,
      overtimeNight: Number(overtimeNightHours) || 0, restDayDay: Number(restDayDayHours) || 0,
      restDayNight: Number(restDayNightHours) || 0,
      overtimeRestDayDay: Number(overtimeRestDayDayHours) || 0,
      overtimeRestDayNight: Number(overtimeRestDayNightHours) || 0
    },
    paymentMethod, status, amount: calculation.netPay
  }, id);
  const expense = makeRecord("expenses", {
    date, category: "Nómina y cargas laborales", detail: `Costo laboral ${period}: ${employee.name}`,
    amount: calculation.totalEmployerCost, paymentMethod, status,
    payrollId: payroll.id
  });
  const records = [payroll, expense];
  if (status === "Pagado" && calculation.netPay > 0) records.push(cashMovement({
    date, type: "Salida", amount: calculation.netPay, detail: `Pago neto de nómina: ${employee.name}`,
    reference: payroll.id, relatedModule: "payroll", relatedId: payroll.id, method: paymentMethod
  }));
  const outstandingLiabilities = money(
    calculation.totalDeductions + calculation.totalEmployerContributions + calculation.totalProvisions
      + (status === "Pendiente" ? calculation.netPay : 0),
    "Las obligaciones pendientes de nómina"
  );
  if (outstandingLiabilities > 0) records.push(makeRecord("payables", {
    date, supplier: "Obligaciones de nómina y seguridad social",
    detail: `Aportes, retenciones y provisiones de nómina ${period}: ${employee.name}`,
    employeeId: employee.id, payrollId: payroll.id,
    originalAmount: outstandingLiabilities, paidAmount: 0,
    outstandingAmount: outstandingLiabilities, amount: outstandingLiabilities, status: "Pendiente"
  }));
  return { records, stockAdjustments: [], calculation };
}

export function buildProductionTransaction({ material, product, inputQuantity, outputQuantity, date = new Date().toISOString().slice(0, 10), detail = "Producción", id = createId() }) {
  assertStockItem(material, ["raw-materials"], "materia prima");
  assertStockItem(product, ["inventory"], "producto terminado");
  const input = positive(inputQuantity, "La cantidad de materia prima");
  const output = positive(outputQuantity, "La cantidad producida");
  if (input > money(material.quantity, "Las existencias de materia prima")) {
    throw new Error(`No hay suficiente ${material.name} para producir: disponible ${material.quantity}.`);
  }
  const production = makeRecord("production", {
    date, detail, materialId: material.id, materialName: material.name,
    inputQuantity: input, productId: product.id, productName: product.name,
    outputQuantity: output
  }, id);
  const materialChange = stockChange(material, -input, "Consumo en producción", production.id, date);
  const productChange = stockChange(product, output, "Producción terminada", production.id, date);
  return {
    records: [production, materialChange.movement, productChange.movement],
    stockAdjustments: [
      { id: material.id, delta: -input },
      { id: product.id, delta: output, cost: Number(material.cost) * input / output }
    ]
  };
}

export function calculateFinancialSummary(records) {
  const sum = (predicate, value = (record) => record.amount) => records
    .filter(predicate)
    .reduce((total, record) => total + (Number(value(record)) || 0), 0);
  const cashIn = sum((record) => record.module === "money-movements" && record.type === "Entrada");
  const cashOut = sum((record) => record.module === "money-movements" && record.type === "Salida");
  return {
    sales: sum((record) => record.module === "sales" && record.status !== "Anulado"),
    expenses: sum((record) => record.module === "expenses" && record.status !== "Anulado"),
    cashIn,
    cashOut,
    cashBalance: Math.round((cashIn - cashOut + Number.EPSILON) * 100) / 100,
    receivables: sum((record) => record.module === "receivables"),
    payables: sum((record) => record.module === "payables"),
    inventoryValue: sum((record) => ["inventory", "raw-materials"].includes(record.module), (record) => Number(record.quantity) * Number(record.cost))
  };
}
