import test from "node:test";
import assert from "node:assert/strict";
import { stockAfterPurchase, stockAfterSale } from "./inventory-ledger.js";

test("purchase adds stock, and editing or cancelling it applies only the difference", () => {
  const afterPurchase = stockAfterPurchase(10, 0, 5);
  assert.equal(afterPurchase, 15);
  const afterEdit = stockAfterPurchase(afterPurchase, 5, 8);
  assert.equal(afterEdit, 18);
  assert.equal(stockAfterPurchase(afterEdit, 8, 0), 10);
});

test("sale removes stock, and editing or cancelling it applies only the difference", () => {
  const afterSale = stockAfterSale(10, 0, 4);
  assert.equal(afterSale, 6);
  const afterEdit = stockAfterSale(afterSale, 4, 2);
  assert.equal(afterEdit, 8);
  assert.equal(stockAfterSale(afterEdit, 2, 0), 10);
});

test("sale cannot reduce inventory below zero", () => {
  assert.throws(() => stockAfterSale(3, 0, 4), /Existencias insuficientes/);
});

test("purchase reversal cannot remove units already consumed from stock", () => {
  assert.throws(() => stockAfterPurchase(2, 3, 0), /No se puede revertir la compra/);
});
