// Preferencias de este dispositivo (última categoría usada, invitación pendiente).
// Los gastos se guardan en la nube; ver cloud.js.

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPreference(key) {
  try {
    return storage()?.getItem(`misgastos.${key}`) || null;
  } catch {
    return null;
  }
}

export function writePreference(key, value) {
  try {
    storage()?.setItem(`misgastos.${key}`, value);
  } catch {
    // Las preferencias son opcionales.
  }
}

let persistenceRequested = false;

/** Pide al navegador que no borre los datos guardados sin conexión. */
export function requestPersistence() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}
