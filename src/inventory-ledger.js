function quantity(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} debe ser un número igual o mayor que cero.`);
  return number;
}

export function stockAfterSale(currentStock, previousSaleQuantity, nextSaleQuantity) {
  const available = quantity(currentStock, "La existencia actual") + quantity(previousSaleQuantity, "La cantidad anterior");
  const next = quantity(nextSaleQuantity, "La cantidad vendida");
  if (next > available) throw new Error(`Existencias insuficientes. Disponibles: ${available}.`);
  return available - next;
}

export function stockAfterPurchase(currentStock, previousPurchaseQuantity, nextPurchaseQuantity) {
  const current = quantity(currentStock, "La existencia actual");
  const previous = quantity(previousPurchaseQuantity, "La cantidad anterior");
  const next = quantity(nextPurchaseQuantity, "La cantidad comprada");
  const adjusted = current - previous;
  if (adjusted < 0) throw new Error("No se puede revertir la compra: esas unidades ya fueron vendidas o ajustadas.");
  return adjusted + next;
}
