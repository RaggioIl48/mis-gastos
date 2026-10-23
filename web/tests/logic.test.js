import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addMonths, BACKUP_FORMAT, canDeleteCategory, comparisonKey, createInitialData, csvEscape, dateKey,
  dayTitle, dayTotal, DUPLICATE_WINDOW_MS, firstDayOfMonth, formatCOP, groupByDay, isFilterActive,
  isLikelyDuplicate, isValidDayKey, makeBackup, matchesFilter, monthTitle, monthTotal, parseData,
  parseThousands, sortExpenses, thousandsInput, toCSV, total, usageText, validateCategoryName,
} from '../logic.js';

const ok = (pesos) => ({ ok: true, pesos });
const fail = (error) => ({ ok: false, error });

describe('valor en miles de pesos', () => {
  test('el valor se escribe en miles', () => {
    assert.deepEqual(parseThousands('25'), ok(25_000));
    assert.deepEqual(parseThousands('1250'), ok(1_250_000));
    assert.deepEqual(parseThousands('1'), ok(1_000));
  });

  test('acepta decimales con coma o punto', () => {
    assert.deepEqual(parseThousands('2,5'), ok(2_500));
    assert.deepEqual(parseThousands('2.5'), ok(2_500));
    assert.deepEqual(parseThousands('0,125'), ok(125));
    assert.deepEqual(parseThousands(',5'), ok(500));
    assert.deepEqual(parseThousands('12,'), ok(12_000));
  });

  test('ignora espacios y ceros a la izquierda', () => {
    assert.deepEqual(parseThousands('  25 '), ok(25_000));
    assert.deepEqual(parseThousands('0025'), ok(25_000));
  });

  test('rechaza valores no válidos', () => {
    assert.deepEqual(parseThousands(''), fail('empty'));
    assert.deepEqual(parseThousands('   '), fail('empty'));
    assert.deepEqual(parseThousands('0'), fail('zero'));
    assert.deepEqual(parseThousands('0,000'), fail('zero'));
    assert.deepEqual(parseThousands('abc'), fail('invalid'));
    assert.deepEqual(parseThousands('-5'), fail('invalid'));
    assert.deepEqual(parseThousands('1e3'), fail('invalid'));
    assert.deepEqual(parseThousands('1,2,3'), fail('invalid'));
    assert.deepEqual(parseThousands('1,2345'), fail('decimals'));
    assert.deepEqual(parseThousands('12345678'), fail('large'));
  });

  test('acepta el máximo permitido', () => {
    assert.deepEqual(parseThousands('9999999,999'), ok(9_999_999_999));
  });

  test('formato colombiano', () => {
    assert.equal(formatCOP(0), '$0');
    assert.equal(formatCOP(999), '$999');
    assert.equal(formatCOP(25_000), '$25.000');
    assert.equal(formatCOP(1_250_000), '$1.250.000');
    assert.equal(formatCOP(123_456_789), '$123.456.789');
    assert.equal(formatCOP(-25_000), '-$25.000');
  });

  test('texto del campo a partir de pesos, ida y vuelta', () => {
    assert.equal(thousandsInput(25_000), '25');
    assert.equal(thousandsInput(2_500), '2,5');
    assert.equal(thousandsInput(125), '0,125');
    for (const pesos of [1, 125, 2_500, 25_000, 1_250_000, 9_999_999_999]) {
      assert.deepEqual(parseThousands(thousandsInput(pesos)), ok(pesos), `falló con ${pesos}`);
    }
  });
});

describe('fechas', () => {
  test('claves de día y mes', () => {
    assert.equal(dateKey(new Date(2026, 9, 2)), '2026-10-02');
    assert.equal(addMonths('2026-10', -1), '2026-09');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-12', 1), '2027-01');
    assert.equal(addMonths('2026-10', -22), '2024-12');
    assert.equal(firstDayOfMonth('2026-10-22'), '2026-10-01');
  });

  test('valida fechas reales', () => {
    assert.ok(isValidDayKey('2026-02-28'));
    assert.ok(!isValidDayKey('2026-02-30'));
    assert.ok(!isValidDayKey('2026-2-3'));
    assert.ok(!isValidDayKey(''));
  });

  test('títulos en español', () => {
    const now = new Date(2026, 9, 22, 10);
    assert.equal(dayTitle('2026-10-22', now), 'Hoy');
    assert.equal(dayTitle('2026-10-21', now), 'Ayer');
    assert.match(dayTitle('2026-10-19', now), /^Lunes, 19 de octubre$/);
    assert.match(monthTitle('2026-10'), /^Octubre de 2026$/);
  });
});

describe('totales', () => {
  const items = [
    { id: 'a', amount: 25_000, date: '2026-10-22', createdAt: 1 },
    { id: 'b', amount: 10_000, date: '2026-10-22', createdAt: 2 },
    { id: 'c', amount: 5_000, date: '2026-10-01', createdAt: 3 },
    { id: 'd', amount: 100_000, date: '2026-09-30', createdAt: 4 },
  ];

  test('suma por mes y por día', () => {
    assert.equal(total(items), 140_000);
    assert.equal(total([]), 0);
    assert.equal(monthTotal(items, '2026-10'), 40_000);
    assert.equal(monthTotal(items, '2026-09'), 100_000);
    assert.equal(monthTotal(items, '2026-08'), 0);
    assert.equal(dayTotal(items, '2026-10-22'), 35_000);
  });

  test('orden: fecha más reciente primero y, el mismo día, el último registrado primero', () => {
    assert.deepEqual(sortExpenses(items).map((e) => e.id), ['b', 'a', 'c', 'd']);
  });

  test('agrupa por día', () => {
    const groups = groupByDay(sortExpenses(items));
    assert.deepEqual(groups.map((g) => g.day), ['2026-10-22', '2026-10-01', '2026-09-30']);
    assert.deepEqual(groups[0].items.map((e) => e.id), ['b', 'a']);
  });
});

describe('filtros', () => {
  const expense = { categoryId: 'salud', date: '2026-10-10' };

  test('sin filtros coincide todo', () => {
    const filter = { categoryId: null, byDate: false };
    assert.ok(!isFilterActive(filter));
    assert.ok(matchesFilter(expense, filter));
  });

  test('por categoría', () => {
    assert.ok(matchesFilter(expense, { categoryId: 'salud' }));
    assert.ok(!matchesFilter(expense, { categoryId: 'transporte' }));
  });

  test('por fechas, ambos días incluidos y en cualquier orden', () => {
    const range = { byDate: true, from: '2026-10-05', to: '2026-10-10' };
    assert.ok(isFilterActive(range));
    assert.ok(matchesFilter({ date: '2026-10-05' }, range));
    assert.ok(matchesFilter({ date: '2026-10-10' }, range));
    assert.ok(!matchesFilter({ date: '2026-10-04' }, range));
    assert.ok(!matchesFilter({ date: '2026-10-11' }, range));
    assert.ok(matchesFilter({ date: '2026-10-07' }, { byDate: true, from: '2026-10-10', to: '2026-10-05' }));
    assert.ok(matchesFilter({ date: '2020-01-01' }, { byDate: true, from: '', to: '2026-10-05' }));
  });
});

describe('duplicados', () => {
  const now = Date.UTC(2026, 9, 22, 15);
  const key = (overrides = {}) => ({
    amount: 25_000, categoryId: 'ali', date: '2026-10-22', note: 'Almuerzo', createdAt: now, ...overrides,
  });

  test('detecta un gasto igual recién guardado', () => {
    assert.ok(isLikelyDuplicate(key(), [key({ createdAt: now - 30_000 })]));
    assert.ok(isLikelyDuplicate(key(), [key({ note: ' ALMUERZO ', createdAt: now - 10_000 })]));
  });

  test('no marca gastos distintos o antiguos', () => {
    assert.ok(!isLikelyDuplicate(key(), []));
    assert.ok(!isLikelyDuplicate(key(), [key({ amount: 26_000 })]));
    assert.ok(!isLikelyDuplicate(key(), [key({ categoryId: 'trans' })]));
    assert.ok(!isLikelyDuplicate(key(), [key({ date: '2026-10-21' })]));
    assert.ok(!isLikelyDuplicate(key(), [key({ note: 'Cena' })]));
    assert.ok(!isLikelyDuplicate(key(), [key({ createdAt: now - DUPLICATE_WINDOW_MS - 1 })]));
  });

  test('compara sin tildes ni mayúsculas', () => {
    assert.equal(comparisonKey('  Educación '), 'educacion');
  });
});

describe('categorías', () => {
  test('valida nombres', () => {
    assert.equal(validateCategoryName('Mascotas', ['Salud']), null);
    assert.ok(validateCategoryName('   ', []));
    assert.ok(validateCategoryName('a'.repeat(31), []));
    assert.ok(validateCategoryName('educacion', ['Educación']));
    assert.ok(validateCategoryName(' SALUD ', ['Salud']));
  });

  test('solo se eliminan categorías sin gastos', () => {
    assert.ok(canDeleteCategory(0));
    assert.ok(!canDeleteCategory(1));
    assert.equal(usageText(1), '1 gasto');
    assert.equal(usageText(3), '3 gastos');
  });

  test('categorías iniciales', () => {
    let next = 0;
    const data = createInitialData(() => `id${next++}`);
    assert.deepEqual(data.categories.map((c) => c.name), [
      'Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Educación', 'Entretenimiento', 'Otros',
    ]);
    assert.deepEqual(data.expenses, []);
  });
});

describe('CSV', () => {
  test('exporta pesos completos y con formato', () => {
    const csv = toCSV([{ date: '2026-10-22', category: 'Alimentación', note: 'Almuerzo', amount: 25_000 }]);
    assert.equal(csv, 'Fecha;Categoría;Descripción;Valor (COP);Valor\r\n2026-10-22;Alimentación;Almuerzo;25000;$25.000\r\n');
  });

  test('escapa caracteres especiales', () => {
    assert.equal(csvEscape('simple'), 'simple');
    assert.equal(csvEscape('a;b'), '"a;b"');
    assert.equal(csvEscape('dijo "hola"'), '"dijo ""hola"""');
    assert.equal(csvEscape('línea\r\nnueva'), '"línea\r\nnueva"');
  });
});

describe('copias de seguridad', () => {
  const data = {
    categories: [{ id: 'c1', name: 'Salud', icon: '🩺', order: 0 }],
    expenses: [{ id: 'e1', amount: 25_000, note: 'Cita', date: '2026-10-22', categoryId: 'c1', createdAt: 1 }],
  };

  test('una copia exportada se puede volver a importar igual', () => {
    const backup = JSON.parse(JSON.stringify(makeBackup(data, new Date(0))));
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.deepEqual(parseData(backup), data);
  });

  test('rechaza archivos que no son copias o tienen datos inválidos', () => {
    assert.throws(() => parseData(null));
    assert.throws(() => parseData({ format: 'otra-app', categories: [], expenses: [] }));
    assert.throws(() => parseData({ categories: [] }));
    assert.throws(() => parseData({ version: 99, categories: [], expenses: [] }));
    assert.throws(() => parseData({ ...data, expenses: [{ ...data.expenses[0], amount: 2.5 }] }));
    assert.throws(() => parseData({ ...data, expenses: [{ ...data.expenses[0], date: '22/10/2026' }] }));
    assert.throws(() => parseData({ ...data, categories: [...data.categories, data.categories[0]] }));
  });

  test('un gasto con categoría inexistente queda sin categoría', () => {
    const parsed = parseData({ ...data, expenses: [{ ...data.expenses[0], categoryId: 'no-existe' }] });
    assert.equal(parsed.expenses[0].categoryId, null);
  });
});
