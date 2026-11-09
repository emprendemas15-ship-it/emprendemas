const commonModules = [
  "dashboard", "expenses", "employees", "payroll", "cash", "money-movements",
  "customers", "suppliers", "receivables", "receivable-payments", "payables",
  "payable-payments", "reports", "settings", "users", "backups"
];

export const businessCategories = [
  {
    id: "home-store",
    label: "Tienda para el hogar",
    aliases: ["tienda para el hogar", "tienda de hogar", "accesorios para el hogar", "tienda comercial", "tienda", "comercio"],
    modules: [...commonModules, "sales", "purchases", "inventory", "stock-movements"],
    labels: {
      sales: { label: "Ventas del hogar", description: "Vende artículos disponibles, descuenta existencias y registra recaudos o cartera." },
      inventory: { label: "Inventario del hogar", description: "Controla decoración, cocina, lencería y demás productos del hogar." },
      purchases: { label: "Compras para el hogar", description: "Registra mercancía comprada, aumenta inventario y genera cuentas por pagar." }
    }
  },
  {
    id: "stationery",
    label: "Papelería",
    aliases: ["papelería", "papeleria", "útiles escolares", "utiles escolares"],
    modules: [...commonModules, "sales", "purchases", "inventory", "stock-movements", "services", "service-sales"],
    labels: {
      sales: { label: "Ventas de papelería", description: "Vende útiles y mercancía, descuenta inventario y registra recaudos o cartera." },
      inventory: { label: "Inventario de papelería", description: "Controla útiles, papelería, costos, precios y alertas de existencias." },
      purchases: { label: "Compras de papelería", description: "Repone útiles y mercancía; actualiza inventario y cuentas por pagar." },
      services: { label: "Servicios de impresión", description: "Configura fotocopias, impresiones, anillados y otros servicios con sus precios." },
      "service-sales": { label: "Cobrar impresión o servicio", description: "Registra servicios prestados, recaudos o saldos por cobrar." }
    }
  },
  {
    id: "restaurant",
    label: "Restaurante",
    aliases: ["restaurante", "restaurante de comidas rápidas", "restaurante de comidas rapidas", "comidas rápidas", "comidas rapidas"],
    modules: [...commonModules, "sales", "purchases", "inventory", "raw-materials", "production", "stock-movements"],
    labels: {
      sales: { label: "Ventas y pedidos", description: "Registra la venta de productos disponibles, recaudos y cartera." },
      inventory: { label: "Productos preparados", description: "Controla productos terminados disponibles para la venta." },
      purchases: { label: "Compras de ingredientes", description: "Registra compras, repone inventario y genera cuentas por pagar." }
    }
  }
];

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("es-CO");

export function getBusinessCategory(activity) {
  const value = normalize(activity);
  return businessCategories.find((category) =>
    category.aliases.some((alias) => normalize(alias) === value)
  ) || businessCategories.find((category) => category.id === "home-store");
}

export function getBusinessModules(activity, allModules) {
  const category = getBusinessCategory(activity);
  const allowed = new Set(category.modules);
  return allModules
    .filter((module) => allowed.has(module.id))
    .map((module) => ({ ...module, ...(category.labels[module.id] || {}) }));
}
