import test from "node:test";
import assert from "node:assert/strict";
import { businessCategories, getBusinessCategory, getBusinessModules } from "./business-categories.js";
import { modules } from "./modules.js";

test("solo están activas tienda para el hogar, papelería y restaurante", () => {
  assert.deepEqual(businessCategories.map((category) => category.id), ["home-store", "stationery", "restaurant"]);
});

test("las actividades antiguas se asignan a su categoría sin perder acceso", () => {
  assert.equal(getBusinessCategory("Accesorios para el hogar").id, "home-store");
  assert.equal(getBusinessCategory("Papelería").id, "stationery");
  assert.equal(getBusinessCategory("Restaurante de comidas rápidas").id, "restaurant");
  assert.equal(getBusinessCategory("Otro").id, "home-store");
  assert.equal(getBusinessCategory("Actividad desconocida").id, "home-store");
});

test("solo restaurante ve materias primas y producción", () => {
  const home = getBusinessModules("Tienda para el hogar", modules).map((module) => module.id);
  const stationery = getBusinessModules("Papelería", modules).map((module) => module.id);
  const restaurant = getBusinessModules("Restaurante", modules).map((module) => module.id);
  for (const id of ["raw-materials", "production"]) {
    assert.equal(home.includes(id), false);
    assert.equal(stationery.includes(id), false);
    assert.equal(restaurant.includes(id), true);
  }
  assert.equal(stationery.includes("service-sales"), true);
  assert.equal(home.includes("service-sales"), false);
});
