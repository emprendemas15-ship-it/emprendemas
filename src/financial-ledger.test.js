import test from "node:test";
import assert from "node:assert/strict";
import { calculateColombianPayroll } from "./colombian-payroll.js";
import {
  buildExpenseTransaction, buildPayrollTransaction, buildPayablePaymentTransaction,
  buildProductionTransaction, buildPurchaseTransaction, buildReceivablePaymentTransaction,
  buildSaleTransaction, buildServiceSaleTransaction, calculateFinancialSummary
} from "./financial-ledger.js";

const product = { id: "coffee", module: "inventory", name: "Café", quantity: 8, cost: 3000, price: 6000 };
const customerDebt = { id: "receivable-1", module: "receivables", customer: "Cliente demo", amount: 10000, outstandingAmount: 10000 };
const supplierDebt = { id: "payable-1", module: "payables", supplier: "Proveedor demo", amount: 10000, outstandingAmount: 10000 };

test("venta enlaza el recaudo, la cartera y la salida de inventario", () => {
  const transaction = buildSaleTransaction({ product, customer: "Cliente demo", quantity: 2, unitPrice: 6000, paidAmount: 4000 });
  assert.equal(transaction.records.find((record) => record.module === "sales").amount, 12000);
  assert.equal(transaction.records.find((record) => record.module === "receivables").amount, 8000);
  assert.equal(transaction.records.find((record) => record.module === "money-movements").amount, 4000);
  assert.deepEqual(transaction.stockAdjustments, [{ id: "coffee", delta: -2 }]);
});

test("venta rechaza cantidad mayor que existencias", () => {
  assert.throws(() => buildSaleTransaction({ product, quantity: 9, unitPrice: 6000, paidAmount: 0 }), /insuficientes/);
});

test("servicio de papelería registra venta, recaudo y cartera sin afectar inventario", () => {
  const transaction = buildServiceSaleTransaction({
    service: { id: "print", name: "Fotocopias", price: 10000 },
    customer: { id: "customer-1", name: "Cliente demo" },
    employee: { id: "employee-1", name: "Operador demo" },
    paidAmount: 6000
  });
  const sale = transaction.records.find((record) => record.module === "sales");
  assert.equal(sale.amount, 10000);
  assert.equal(sale.serviceName, "Fotocopias");
  assert.equal(transaction.records.find((record) => record.module === "receivables").amount, 4000);
  assert.equal(transaction.records.find((record) => record.module === "money-movements").amount, 6000);
  assert.deepEqual(transaction.stockAdjustments, []);
});

test("compra a crédito repone inventario y crea cuenta por pagar", () => {
  const transaction = buildPurchaseTransaction({
    item: product, supplier: "Proveedor demo", quantity: 4, unitCost: 2500, paidAmount: 0
  });
  assert.equal(transaction.records.find((record) => record.module === "purchases").amount, 10000);
  assert.equal(transaction.records.find((record) => record.module === "payables").amount, 10000);
  assert.equal(transaction.stockAdjustments[0].delta, 4);
});

test("abono de cliente actualiza cartera y agrega entrada a caja", () => {
  const transaction = buildReceivablePaymentTransaction({ receivable: customerDebt, amount: 3500 });
  assert.equal(transaction.records.find((record) => record.module === "receivables").outstandingAmount, 6500);
  assert.equal(transaction.records.find((record) => record.module === "money-movements").type, "Entrada");
});

test("abono no puede exceder el saldo de la cuenta", () => {
  assert.throws(() => buildReceivablePaymentTransaction({ receivable: customerDebt, amount: 10001 }), /supera el saldo/);
});

test("abono a proveedor reduce la obligación y sale de caja", () => {
  const transaction = buildPayablePaymentTransaction({ payable: supplierDebt, amount: 2500 });
  assert.equal(transaction.records.find((record) => record.module === "payables").outstandingAmount, 7500);
  assert.equal(transaction.records.find((record) => record.module === "money-movements").type, "Salida");
});

test("gasto pendiente genera obligación sin duplicar movimiento de caja", () => {
  const transaction = buildExpenseTransaction({ detail: "Servicio demo", category: "Servicios", amount: 3000, status: "Pendiente" });
  assert.ok(transaction.records.some((record) => record.module === "payables" && record.amount === 3000));
  assert.equal(transaction.records.filter((record) => record.module === "money-movements").length, 0);
});

test("nómina colombiana 2026 liquida salario mínimo, transporte, aportes y provisiones", () => {
  const calculation = calculateColombianPayroll({
    employee: { id: "employee-1", name: "Persona demo", salary: 1750905, transportEligible: "Sí", arlRate: 0.522 },
    period: "2026-11"
  });
  assert.equal(calculation.grossPay, 2000000);
  assert.equal(calculation.ibc, 1750905);
  assert.equal(calculation.deductions.health, 70036.2);
  assert.equal(calculation.deductions.pension, 70036.2);
  assert.equal(calculation.netPay, 1859927.6);
  assert.equal(calculation.provisions.prima, 166666.67);
  assert.equal(calculation.provisions.cesantias, 166666.67);
  assert.ok(calculation.totalEmployerCost > calculation.grossPay);
});

test("nómina calcula recargos nocturnos y horas extra con la jornada vigente", () => {
  const calculation = calculateColombianPayroll({
    employee: { id: "employee-1", name: "Persona demo", salary: 2100000, transportEligible: "No", arlRate: 0.522 },
    period: "2026-11", nightHours: 2, overtimeDayHours: 1, overtimeNightHours: 1,
    restDayDayHours: 1, restDayNightHours: 1
  });
  assert.equal(calculation.weeklyHours, 42);
  assert.equal(calculation.restDayPremiumRate, 0.9);
  assert.equal(calculation.additionalSalary, 58500);
  assert.throws(() => calculateColombianPayroll({
    employee: { id: "employee-1", salary: 2100000 }, period: "2026-11", overtimeDayHours: 61
  }), /límite agregado/);
});

test("exoneración patronal elimina solo salud, SENA e ICBF y requiere salario bajo 10 mínimos", () => {
  const calculation = calculateColombianPayroll({
    employee: { id: "employee-1", salary: 2000000, employerExonerated: "Sí", transportEligible: "No" },
    period: "2026-11"
  });
  assert.equal(calculation.employerExonerated, true);
  assert.equal(calculation.employerContributions.health, 0);
  assert.equal(calculation.employerContributions.sena, 0);
  assert.equal(calculation.employerContributions.icbf, 0);
  assert.ok(calculation.employerContributions.pension > 0);
  assert.ok(calculation.employerContributions.familyCompensation > 0);
});

test("nómina enlaza neto pagado, costo completo y obligación por aportes/provisiones", () => {
  const employee = { id: "employee-1", name: "Persona demo", salary: 2000000, transportEligible: "Sí", arlRate: 0.522 };
  const transaction = buildPayrollTransaction({ employee, period: "2026-11", status: "Pagado" });
  const payroll = transaction.records.find((record) => record.module === "payroll");
  const expense = transaction.records.find((record) => record.module === "expenses");
  const cashMovement = transaction.records.find((record) => record.module === "money-movements");
  const payable = transaction.records.find((record) => record.module === "payables");
  assert.equal(payroll.amount, payroll.netPay);
  assert.equal(expense.amount, payroll.employerCost);
  assert.equal(cashMovement.amount, payroll.netPay);
  assert.equal(payable.amount, payroll.deductions + payroll.totalEmployerContributions + payroll.totalProvisions);
  assert.equal(expense.payrollId, payroll.id);
  assert.throws(() => buildPayrollTransaction({ employee, period: "2026-11", daysWorked: 30, otherDeductions: 10000000 }), /superan el total devengado/);
});

test("producción consume materia prima y aumenta producto terminado", () => {
  const transaction = buildProductionTransaction({
    material: { id: "flour", module: "raw-materials", name: "Harina", quantity: 10, cost: 1000 },
    product: { id: "bread", module: "inventory", name: "Pan", quantity: 2, cost: 2000 },
    inputQuantity: 3, outputQuantity: 4
  });
  assert.deepEqual(transaction.stockAdjustments.map(({ id, delta }) => ({ id, delta })), [
    { id: "flour", delta: -3 }, { id: "bread", delta: 4 }
  ]);
});

test("resumen permite caja negativa y totaliza cartera", () => {
  const summary = calculateFinancialSummary([
    { module: "money-movements", type: "Entrada", amount: 1000 },
    { module: "money-movements", type: "Salida", amount: 2500 },
    { module: "receivables", amount: 800 },
    { module: "payables", amount: 300 }
  ]);
  assert.equal(summary.cashBalance, -1500);
  assert.equal(summary.receivables, 800);
  assert.equal(summary.payables, 300);
});
