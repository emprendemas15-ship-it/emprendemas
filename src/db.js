import { findModule } from "./modules.js";

const DATABASE_NAME = "emprende-plus";
const DATABASE_VERSION = 2;
const AUTO_BACKUP_LIMIT = 10;

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falló una operación de IndexedDB."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("La operación local fue cancelada."));
    transaction.onerror = () => reject(transaction.error || new Error("Falló una transacción de IndexedDB."));
  });
}

export function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Este navegador no permite IndexedDB; no es posible guardar los datos."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("records")) {
          const records = database.createObjectStore("records", { keyPath: "id" });
          records.createIndex("module", "module", { unique: false });
          records.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
        if (!database.objectStoreNames.contains("backups")) database.createObjectStore("backups", { keyPath: "id" });
        if (!database.objectStoreNames.contains("platformCompanies")) {
          database.createObjectStore("platformCompanies", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("platformUsers")) {
          database.createObjectStore("platformUsers", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("platformRequests")) {
          database.createObjectStore("platformRequests", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("platformSettings")) {
          database.createObjectStore("platformSettings", { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error || new Error("No fue posible abrir la base local."));
      };
      request.onblocked = () => reject(new Error("Cierra otras pestañas de Emprende + para actualizar su almacenamiento."));
    });
  }
  return databasePromise;
}

export async function getRecords(moduleId) {
  const database = await openDatabase();
  const transaction = database.transaction("records", "readonly");
  const done = transactionDone(transaction);
  const request = moduleId
    ? transaction.objectStore("records").index("module").getAll(moduleId)
    : transaction.objectStore("records").getAll();
  const records = await requestResult(request);
  await done;
  return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function saveRecord(moduleId, values, existingId) {
  if (!findModule(moduleId)?.fields) throw new Error("Módulo de registros no válido.");
  const database = await openDatabase();
  const timestamp = new Date().toISOString();
  const record = {
    id: existingId || crypto.randomUUID(),
    module: moduleId,
    ...values,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (existingId) {
    const old = await getRecord(existingId);
    if (!old || old.module !== moduleId) throw new Error("No se encontró el registro que intentas editar.");
    record.createdAt = old.createdAt;
  }
  const transaction = database.transaction("records", "readwrite");
  transaction.objectStore("records").put(record);
  await transactionDone(transaction);
  await createAutomaticBackup();
  return record;
}

export async function getRecord(id) {
  const database = await openDatabase();
  const transaction = database.transaction("records", "readonly");
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore("records").get(id));
  await done;
  return record;
}

export async function deleteRecord(id) {
  const database = await openDatabase();
  const transaction = database.transaction("records", "readwrite");
  transaction.objectStore("records").delete(id);
  await transactionDone(transaction);
  await createAutomaticBackup();
}

export async function getSetting(key) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readonly");
  const done = transactionDone(transaction);
  const item = await requestResult(transaction.objectStore("settings").get(key));
  await done;
  return item?.value;
}

export async function getSettings() {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readonly");
  const done = transactionDone(transaction);
  const items = await requestResult(transaction.objectStore("settings").getAll());
  await done;
  return items;
}

export async function saveSetting(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ key, value, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  await createAutomaticBackup();
}

const platformStores = new Set(["platformCompanies", "platformUsers", "platformRequests"]);

export async function getPlatformRecords(storeName) {
  if (!platformStores.has(storeName)) throw new Error("Colección administrativa no válida.");
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(storeName).getAll());
  await done;
  return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function savePlatformRecord(storeName, values, existingId) {
  if (!platformStores.has(storeName)) throw new Error("Colección administrativa no válida.");
  const database = await openDatabase();
  const timestamp = new Date().toISOString();
  const record = {
    id: existingId || crypto.randomUUID(),
    ...values,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (existingId) {
    const transaction = database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const old = await requestResult(transaction.objectStore(storeName).get(existingId));
    await done;
    if (!old) throw new Error("No se encontró el registro administrativo que intentas editar.");
    record.createdAt = old.createdAt;
  }
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionDone(transaction);
  return record;
}

export async function deletePlatformRecord(storeName, id) {
  if (!platformStores.has(storeName)) throw new Error("Colección administrativa no válida.");
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

export async function getPlatformSetting(key) {
  const database = await openDatabase();
  const transaction = database.transaction("platformSettings", "readonly");
  const done = transactionDone(transaction);
  const item = await requestResult(transaction.objectStore("platformSettings").get(key));
  await done;
  return item?.value;
}

export async function savePlatformSetting(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction("platformSettings", "readwrite");
  transaction.objectStore("platformSettings").put({ key, value, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
}

export async function createAutomaticBackup() {
  const database = await openDatabase();
  const readTransaction = database.transaction(["records", "settings"], "readonly");
  const readDone = transactionDone(readTransaction);
  const [records, settings] = await Promise.all([
    requestResult(readTransaction.objectStore("records").getAll()),
    requestResult(readTransaction.objectStore("settings").getAll())
  ]);
  await readDone;
  const backup = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "automatic",
    records,
    settings
  };
  const transaction = database.transaction("backups", "readwrite");
  const store = transaction.objectStore("backups");
  const done = transactionDone(transaction);
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const oldBackup of existing.slice(AUTO_BACKUP_LIMIT - 1)) store.delete(oldBackup.id);
    store.put(backup);
  };
  await done;
}

export async function createBackupSnapshot(records, settings, companyId) {
  if (typeof companyId !== "string" || !companyId) {
    throw new Error("No se puede asociar la copia automática a una empresa activa.");
  }
  const backup = {
    id: crypto.randomUUID(),
    companyId,
    createdAt: new Date().toISOString(),
    kind: "automatic",
    records: structuredClone(records),
    settings: structuredClone(settings)
  };
  const database = await openDatabase();
  const transaction = database.transaction("backups", "readwrite");
  const store = transaction.objectStore("backups");
  const done = transactionDone(transaction);
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const oldBackup of existing.slice(AUTO_BACKUP_LIMIT - 1)) store.delete(oldBackup.id);
    store.put(backup);
  };
  await done;
}

export async function getBackups(companyId) {
  const database = await openDatabase();
  const transaction = database.transaction("backups", "readonly");
  const done = transactionDone(transaction);
  const backups = await requestResult(transaction.objectStore("backups").getAll());
  await done;
  return backups
    .filter((backup) => backup.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackups(companyId) {
  if (typeof companyId !== "string" || !companyId) {
    throw new Error("No se pueden eliminar copias sin una empresa activa.");
  }
  const database = await openDatabase();
  const transaction = database.transaction("backups", "readwrite");
  const store = transaction.objectStore("backups");
  const done = transactionDone(transaction);
  const backups = await requestResult(store.getAll());
  for (const backup of backups) {
    if (backup.companyId === companyId) store.delete(backup.id);
  }
  await done;
}

export async function replaceLocalData(records, settings) {
  await createAutomaticBackup();
  const database = await openDatabase();
  const transaction = database.transaction(["records", "settings"], "readwrite");
  const recordsStore = transaction.objectStore("records");
  const settingsStore = transaction.objectStore("settings");
  recordsStore.clear();
  settingsStore.clear();
  for (const record of records) recordsStore.put(record);
  for (const setting of settings) settingsStore.put(setting);
  await transactionDone(transaction);
  await createAutomaticBackup();
}

export function validateBackup(data) {
  if (!data || data.format !== "emprende-plus-backup" || data.version !== 1) {
    throw new Error("El archivo no es una copia de seguridad compatible de Emprende +.");
  }
  if (!Array.isArray(data.records) || !Array.isArray(data.settings)) {
    throw new Error("La copia no contiene las colecciones de datos requeridas.");
  }
  const ids = new Set();
  for (const record of data.records) {
    if (!record || typeof record.id !== "string" || ids.has(record.id) ||
        typeof record.module !== "string" || !findModule(record.module)?.fields ||
        typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") {
      throw new Error("La copia contiene un registro inválido o duplicado.");
    }
    const definition = findModule(record.module);
    for (const field of definition.fields) {
      const value = record[field.name];
      if (value !== undefined && value !== "" &&
          (field.type === "number"
            ? typeof value !== "number" || !Number.isFinite(value)
            : typeof value !== "string")) {
        throw new Error(`La copia contiene un valor inválido en el campo «${field.label}».`);
      }
      if (value && field.type === "select" && !field.options.includes(value)) {
        throw new Error(`La copia contiene una opción no válida en el campo «${field.label}».`);
      }
      if (value && field.type === "date" && Number.isNaN(Date.parse(value))) {
        throw new Error(`La copia contiene una fecha no válida en el campo «${field.label}».`);
      }
    }
    ids.add(record.id);
  }
  const settingKeys = new Set();
  for (const setting of data.settings) {
    if (!setting || typeof setting.key !== "string" || settingKeys.has(setting.key) ||
        !("value" in setting) || typeof setting.updatedAt !== "string") {
      throw new Error("La copia contiene una configuración inválida o duplicada.");
    }
    if (setting.key === "businessProfile") {
      const profileFields = ["businessName", "contactName", "phone", "email", "address"];
      if (!setting.value || typeof setting.value !== "object" || Array.isArray(setting.value) ||
          Object.keys(setting.value).some((key) => !profileFields.includes(key)) ||
          Object.values(setting.value).some((value) => typeof value !== "string")) {
        throw new Error("La copia contiene una configuración de negocio no válida.");
      }
    } else {
      throw new Error("La copia contiene una clave de configuración desconocida.");
    }
    settingKeys.add(setting.key);
  }
  return { records: data.records, settings: data.settings };
}

export function makeBackupFile(records, settings) {
  return {
    format: "emprende-plus-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    settings
  };
}
