import {
  getBackups, makeBackupFile, validateBackup
} from "./db.js";
import { getRecords, getSettings, replaceCompanyData } from "./cloud-data.js";

export async function downloadBackup() {
  const [records, settings] = await Promise.all([getRecords(), getSettings()]);
  const backup = makeBackupFile(records, settings);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `emprende-plus-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function restoreBackupFile(file) {
  if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) {
    throw new Error("Selecciona un archivo JSON válido de hasta 25 MB.");
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("No se pudo leer el archivo. Verifica que sea un JSON válido.");
  }
  const { records, settings } = validateBackup(parsed);
  const confirmed = window.confirm(
    `Se reemplazarán ${records.length} registros y la configuración de esta empresa en Supabase. Antes se guardará una copia interna local. ¿Continuar?`
  );
  if (!confirmed) return false;
  await replaceCompanyData(records, settings);
  return true;
}

export { getBackups };
