// Guarda los datos solo en este dispositivo (localStorage del navegador).
import { DATA_VERSION, parseData } from './logic.js';

const DATA_KEY = 'misgastos.datos';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Devuelve { status: 'ok' | 'empty' | 'corrupt' | 'unavailable', data }.
 * Si los datos guardados están dañados, se apartan en otra clave en lugar de perderlos.
 */
export function loadData() {
  const store = storage();
  if (!store) return { status: 'unavailable', data: null };
  let raw;
  try {
    raw = store.getItem(DATA_KEY);
  } catch {
    return { status: 'unavailable', data: null };
  }
  if (raw === null) return { status: 'empty', data: null };
  try {
    return { status: 'ok', data: parseData(JSON.parse(raw)) };
  } catch {
    try {
      store.setItem(`${DATA_KEY}.danado.${Date.now()}`, raw);
    } catch {
      // Sin espacio para apartar la copia dañada.
    }
    return { status: 'corrupt', data: null };
  }
}

/** Devuelve true si se guardó. */
export function saveData(data) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(DATA_KEY, JSON.stringify({
      version: DATA_VERSION,
      categories: data.categories,
      expenses: data.expenses,
    }));
    return true;
  } catch {
    return false;
  }
}

export function readPreference(key) {
  try {
    return storage()?.getItem(`misgastos.${key}`) ?? null;
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

/** Pide al navegador que no borre los datos automáticamente. */
export function requestPersistence() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}
