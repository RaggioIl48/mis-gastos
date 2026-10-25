// Lógica pura de Mis Gastos, sin DOM ni almacenamiento.
// Todos los importes son enteros en pesos colombianos completos (25000, no 25).
// Las fechas de los gastos son textos "AAAA-MM-DD" en hora local.

export const MAX_THOUSANDS_DIGITS = 7; // hasta $9.999.999.999
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
export const MAX_CATEGORY_NAME_LENGTH = 30;
export const LOCALE = 'es-CO';

export const DEFAULT_CATEGORIES = [
  { name: 'Alimentación', icon: '🍽️' },
  { name: 'Transporte', icon: '🚗' },
  { name: 'Vivienda', icon: '🏠' },
  { name: 'Servicios', icon: '💡' },
  { name: 'Salud', icon: '🩺' },
  { name: 'Educación', icon: '📚' },
  { name: 'Entretenimiento', icon: '🎬' },
  { name: 'Otros', icon: '📦' },
];

export const CATEGORY_ICONS = [
  '🍽️', '☕', '🛒', '🚗', '🚌', '⛽', '✈️', '🏠', '💡', '💧',
  '📶', '📱', '🩺', '💊', '📚', '🎓', '🎬', '🎮', '👕', '🎁',
  '🐾', '❤️', '🔧', '🏷️', '📦',
];

// ---------- Dinero ----------

const PARSE_MESSAGES = {
  empty: 'Escribe un valor.',
  invalid: 'Usa solo números y, si quieres, una coma decimal.',
  decimals: 'Usa como máximo tres decimales.',
  zero: 'El valor debe ser mayor que cero.',
  large: 'El valor es demasiado alto.',
};

export function parseErrorMessage(code) {
  return PARSE_MESSAGES[code] ?? PARSE_MESSAGES.invalid;
}

/**
 * Convierte lo que escribe el usuario (en miles) a pesos completos.
 * "25" → 25000, "1250" → 1250000, "2,5" → 2500. Acepta coma o punto decimal
 * y usa solo aritmética entera.
 */
export function parseThousands(input) {
  const text = String(input ?? '').trim().replaceAll(',', '.');
  if (text === '') return { ok: false, error: 'empty' };

  const parts = text.split('.');
  if (parts.length > 2 || !parts.every((part) => /^[0-9]*$/.test(part))) {
    return { ok: false, error: 'invalid' };
  }

  const integerDigits = parts[0].replace(/^0+/, '');
  const fractionDigits = parts.length === 2 ? parts[1] : '';
  if (fractionDigits.length > 3) return { ok: false, error: 'decimals' };
  if (integerDigits.length > MAX_THOUSANDS_DIGITS) return { ok: false, error: 'large' };

  const thousands = integerDigits === '' ? 0 : Number(integerDigits);
  const fraction = Number(fractionDigits.padEnd(3, '0'));
  const pesos = thousands * 1000 + fraction;
  if (pesos <= 0) return { ok: false, error: 'zero' };
  return { ok: true, pesos };
}

/** Texto para el campo de valor a partir de pesos (inverso de parseThousands). */
export function thousandsInput(pesos) {
  const thousands = Math.floor(pesos / 1000);
  const remainder = pesos % 1000;
  if (remainder === 0) return String(thousands);
  return `${thousands},${String(remainder).padStart(3, '0').replace(/0+$/, '')}`;
}

/** Formato colombiano: $25.000, $1.250.000. No depende de la región del navegador. */
export function formatCOP(pesos) {
  const digits = String(Math.abs(Math.trunc(pesos)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (pesos < 0 ? '-$' : '$') + grouped;
}

// ---------- Fechas ----------

const pad2 = (n) => String(n).padStart(2, '0');

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isValidDayKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}

export function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

export function firstDayOfMonth(dayKey) {
  return `${monthKeyOf(dayKey)}-01`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

const capitalize = (text) => text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);

/** "Octubre de 2026" */
export function monthTitle(monthKey) {
  const text = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(dateFromKey(monthKey));
  return capitalize(text);
}

/** "Hoy", "Ayer" o "Lunes, 20 de octubre" */
export function dayTitle(dayKey, now = new Date()) {
  if (dayKey === dateKey(now)) return 'Hoy';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey === dateKey(yesterday)) return 'Ayer';
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (dayKey.slice(0, 4) !== String(now.getFullYear())) options.year = 'numeric';
  return capitalize(new Intl.DateTimeFormat(LOCALE, options).format(dateFromKey(dayKey)));
}

/** "22 oct" */
export function shortDate(dayKey) {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
    .format(dateFromKey(dayKey))
    .replace('.', '');
}

// ---------- Totales y orden ----------

export function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function total(expenses) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function monthTotal(expenses, monthKey) {
  return total(expenses.filter((expense) => monthKeyOf(expense.date) === monthKey));
}

export function dayTotal(expenses, dayKey) {
  return total(expenses.filter((expense) => expense.date === dayKey));
}

/** Agrupa por día, del más reciente al más antiguo, conservando el orden de cada día. */
export function groupByDay(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    if (!groups.has(expense.date)) groups.set(expense.date, []);
    groups.get(expense.date).push(expense);
  }
  return [...groups.entries()]
    .map(([day, items]) => ({ day, items }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

// ---------- Filtros ----------

export function isFilterActive(filter) {
  return Boolean(filter.categoryId) || Boolean(filter.byDate);
}

/** Filtra por categoría y por rango de fechas (ambos días incluidos). */
export function matchesFilter(expense, filter) {
  if (filter.categoryId && expense.categoryId !== filter.categoryId) return false;
  if (!filter.byDate) return true;
  let lower = filter.from || '0000-01-01';
  let upper = filter.to || '9999-12-31';
  if (lower > upper) [lower, upper] = [upper, lower];
  return expense.date >= lower && expense.date <= upper;
}

// ---------- Texto, duplicados y categorías ----------

/** Clave para comparar sin importar mayúsculas, tildes ni espacios sobrantes. */
export function comparisonKey(text) {
  return String(text ?? '')
    .trim()
    .toLocaleLowerCase(LOCALE)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function isLikelyDuplicate(candidate, existing, windowMs = DUPLICATE_WINDOW_MS) {
  return existing.some((other) =>
    other.amount === candidate.amount
    && other.categoryId === candidate.categoryId
    && other.date === candidate.date
    && comparisonKey(other.note) === comparisonKey(candidate.note)
    && Math.abs(candidate.createdAt - other.createdAt) <= windowMs);
}

/** Devuelve el motivo por el que el nombre no es válido, o null. */
export function validateCategoryName(name, existingNames) {
  const clean = String(name ?? '').trim();
  if (clean === '') return 'Escribe un nombre.';
  if ([...clean].length > MAX_CATEGORY_NAME_LENGTH) {
    return `Usa como máximo ${MAX_CATEGORY_NAME_LENGTH} caracteres.`;
  }
  const key = comparisonKey(clean);
  if (existingNames.some((other) => comparisonKey(other) === key)) {
    return 'Ya existe una categoría con ese nombre.';
  }
  return null;
}

/** Las categorías con gastos se conservan para no alterar el historial. */
export function canDeleteCategory(expenseCount) {
  return expenseCount === 0;
}

export function usageText(count) {
  return count === 1 ? '1 gasto' : `${count} gastos`;
}

// ---------- CSV ----------

export const CSV_HEADER = ['Fecha', 'Categoría', 'Descripción', 'Tipo', 'Valor (COP)', 'Valor'];

export function csvEscape(field) {
  const text = String(field);
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV con ";" (lo que espera Excel en español). Valor en pesos completos y con formato. */
export function toCSV(rows) {
  const lines = [CSV_HEADER.join(';')];
  for (const row of rows) {
    lines.push([row.date, row.category, row.note, scopeLabel(row.scope), String(row.amount), formatCOP(row.amount)]
      .map(csvEscape)
      .join(';'));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// ---------- Gastos familiares ----------

export const SCOPES = { personal: 'personal', family: 'family' };

export function scopeLabel(scope) {
  return scope === SCOPES.family ? 'Familia' : 'Personal';
}

/**
 * Consolidado del hogar para un mes. Solo recibe gastos familiares: los personales
 * nunca salen del dispositivo de su dueña. Las categorías se juntan sin importar
 * mayúsculas ni tildes, porque cada persona tiene las suyas.
 */
export function householdMonth(familyExpenses, monthKey, members = []) {
  const items = familyExpenses.filter((expense) => monthKeyOf(expense.date) === monthKey);
  const memberTotals = new Map(members.map((member) => [member.uid, { ...member, total: 0 }]));
  const categories = new Map();
  for (const expense of items) {
    const member = memberTotals.get(expense.createdBy)
      ?? { uid: expense.createdBy, name: expense.createdByName ?? 'Miembro', total: 0 };
    member.total += expense.amount;
    memberTotals.set(expense.createdBy, member);

    const name = expense.categoryName || 'Sin categoría';
    const key = comparisonKey(name);
    const category = categories.get(key) ?? { name, icon: expense.categoryIcon ?? null, total: 0 };
    category.total += expense.amount;
    categories.set(key, category);
  }
  const sum = total(items);
  return {
    total: sum,
    count: items.length,
    byMember: [...memberTotals.values()],
    byCategory: [...categories.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, LOCALE))
      .map((entry) => ({ ...entry, share: sum ? entry.total / sum : 0 })),
    items: sortExpenses(items),
  };
}

/** "Ana" → "A"; para las iniciales del hogar. */
export function initials(name) {
  return String(name ?? '?').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase(LOCALE) || '?';
}

// ---------- Hogar e invitaciones ----------

const HOUSEHOLD_ID = /^[A-Za-z0-9]{20}$/;

export function isValidHouseholdId(id) {
  return HOUSEHOLD_ID.test(String(id ?? ''));
}

export function inviteLink(origin, pathname, householdId) {
  return `${origin}${pathname}?hogar=${householdId}`;
}

export function householdIdFromSearch(search) {
  const id = new URLSearchParams(search).get('hogar');
  return isValidHouseholdId(id) ? id : null;
}

// ---------- Lista de compras ----------

export const MAX_SHOPPING_TEXT = 80;

export function cleanShoppingText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SHOPPING_TEXT);
}

const byCreated = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);

export function pendingItems(items) {
  return items.filter((item) => !item.done).sort(byCreated);
}

export function doneItems(items) {
  return items.filter((item) => item.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
}

/** "Leche, pan y 2 más" */
export function shoppingPreview(items, max = 2) {
  const names = pendingItems(items).map((item) => item.text);
  if (!names.length) return '';
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} y ${rest} más`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} y ${shown.at(-1)}`;
}

export function pendingText(count) {
  return count === 1 ? 'Falta 1 cosa por comprar' : `Faltan ${count} cosas por comprar`;
}

// ---------- Datos y copias de seguridad ----------

export const BACKUP_FORMAT = 'mis-gastos-backup';
export const DATA_VERSION = 1;

export function createInitialData(makeId) {
  return {
    categories: DEFAULT_CATEGORIES.map((category, index) => ({ id: makeId(), ...category, order: index })),
    expenses: [],
  };
}

export function makeBackup(data, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: DATA_VERSION,
    exportedAt: now.toISOString(),
    categories: data.categories,
    expenses: data.expenses,
  };
}

/**
 * Valida datos guardados o importados y devuelve una copia limpia.
 * Lanza un Error con un mensaje en español si no son válidos.
 */
export function parseData(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo no es una copia de Mis Gastos.');
  if (raw.format !== undefined && raw.format !== BACKUP_FORMAT) {
    throw new Error('El archivo no es una copia de Mis Gastos.');
  }
  if (raw.version !== undefined && raw.version > DATA_VERSION) {
    throw new Error('La copia es de una versión más reciente de la app.');
  }
  if (!Array.isArray(raw.categories) || !Array.isArray(raw.expenses)) {
    throw new Error('A la copia le faltan categorías o gastos.');
  }

  const categories = raw.categories.map((item, index) => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`La categoría ${index + 1} no es válida.`);
    }
    return {
      id: item.id,
      name: item.name.trim(),
      icon: typeof item.icon === 'string' && item.icon ? item.icon : '🏷️',
      order: Number.isFinite(item.order) ? item.order : index,
    };
  });
  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length) throw new Error('Hay categorías repetidas en la copia.');

  const expenses = raw.expenses.map((item, index) => {
    const valid = item
      && typeof item.id === 'string'
      && Number.isSafeInteger(item.amount) && item.amount > 0
      && isValidDayKey(item.date)
      && Number.isFinite(item.createdAt);
    if (!valid) throw new Error(`El gasto ${index + 1} no es válido.`);
    return {
      id: item.id,
      amount: item.amount,
      note: typeof item.note === 'string' ? item.note : '',
      date: item.date,
      categoryId: categoryIds.has(item.categoryId) ? item.categoryId : null,
      createdAt: item.createdAt,
      // Las copias de antes de existir esta opción no lo indican: cuentan como gastos familiares.
      scope: item.scope === SCOPES.personal ? SCOPES.personal : SCOPES.family,
    };
  });

  return { categories, expenses };
}
