import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  cleanShoppingText, doneItems, householdIdFromSearch, householdMonth, initials, inviteLink,
  isValidHouseholdId, pendingItems, pendingText, sameSummary, shoppingPreview, summarizeByMonth,
} from '../logic.js';

describe('resúmenes que se comparten con el hogar', () => {
  const categories = [{ id: 'c1', name: 'Alimentación' }, { id: 'c2', name: 'Salud' }];
  const expenses = [
    { amount: 25_000, date: '2026-10-22', categoryId: 'c1' },
    { amount: 5_000, date: '2026-10-02', categoryId: 'c1' },
    { amount: 80_000, date: '2026-10-10', categoryId: 'c2' },
    { amount: 12_000, date: '2026-09-30', categoryId: 'borrada' },
  ];

  test('suma por mes y por nombre de categoría, sin incluir el detalle de los gastos', () => {
    assert.deepEqual(summarizeByMonth(expenses, categories), {
      '2026-10': { total: 110_000, count: 3, byCategory: { Alimentación: 30_000, Salud: 80_000 } },
      '2026-09': { total: 12_000, count: 1, byCategory: { 'Sin categoría': 12_000 } },
    });
  });

  test('detecta si un resumen cambió', () => {
    const a = { total: 10, count: 1, byCategory: { A: 5, B: 5 } };
    assert.ok(sameSummary(a, { total: 10, count: 1, byCategory: { B: 5, A: 5 } }));
    assert.ok(!sameSummary(a, { total: 10, count: 1, byCategory: { A: 10 } }));
    assert.ok(!sameSummary(a, { ...a, count: 2 }));
    assert.ok(!sameSummary(a, undefined));
  });
});

describe('totales del hogar', () => {
  const summaries = [
    { uid: 'ana', month: '2026-10', total: 110_000, count: 3, byCategory: { Alimentación: 30_000, Salud: 80_000 } },
    { uid: 'bea', month: '2026-10', total: 50_000, count: 2, byCategory: { alimentacion: 20_000, Transporte: 30_000 } },
    { uid: 'bea', month: '2026-09', total: 999, count: 1, byCategory: { Otros: 999 } },
  ];

  test('junta los totales de todas y las categorías equivalentes', () => {
    const month = householdMonth(summaries, '2026-10');
    assert.equal(month.total, 160_000);
    assert.equal(month.count, 5);
    assert.deepEqual(month.byCategory.map(({ name, total }) => [name, total]), [
      ['Salud', 80_000], ['Alimentación', 50_000], ['Transporte', 30_000],
    ]);
    assert.equal(month.byCategory[0].share, 0.5);
  });

  test('un mes sin datos da cero', () => {
    assert.deepEqual(householdMonth(summaries, '2026-01'), { total: 0, count: 0, byCategory: [] });
  });

  test('iniciales', () => {
    assert.equal(initials('Ana María'), 'AM');
    assert.equal(initials('bea'), 'B');
    assert.equal(initials(''), '?');
  });
});

describe('invitaciones', () => {
  test('el enlace lleva el identificador del hogar y se puede leer de vuelta', () => {
    const id = 'AbCdEfGhIj0123456789';
    const link = inviteLink('https://mis-gastos.web.app', '/', id);
    assert.equal(link, 'https://mis-gastos.web.app/?hogar=AbCdEfGhIj0123456789');
    assert.equal(householdIdFromSearch(new URL(link).search), id);
    assert.ok(isValidHouseholdId(id));
  });

  test('rechaza identificadores inválidos', () => {
    assert.equal(householdIdFromSearch('?hogar=corto'), null);
    assert.equal(householdIdFromSearch('?hogar=../../users/abc12345678'), null);
    assert.equal(householdIdFromSearch(''), null);
  });
});

describe('lista de compras', () => {
  const items = [
    { text: 'Pan', done: false, createdAt: 2 },
    { text: 'Leche', done: false, createdAt: 1 },
    { text: 'Arroz', done: true, createdAt: 0, doneAt: 5 },
    { text: 'Huevos', done: false, createdAt: 3 },
    { text: 'Café', done: true, createdAt: 0, doneAt: 9 },
  ];

  test('pendientes en el orden en que se añadieron y comprados del más reciente', () => {
    assert.deepEqual(pendingItems(items).map((i) => i.text), ['Leche', 'Pan', 'Huevos']);
    assert.deepEqual(doneItems(items).map((i) => i.text), ['Café', 'Arroz']);
  });

  test('resumen para la pantalla de inicio', () => {
    assert.equal(shoppingPreview(items), 'Leche, Pan y 1 más');
    assert.equal(shoppingPreview(items, 3), 'Leche, Pan y Huevos');
    assert.equal(shoppingPreview([{ text: 'Sal', done: false }]), 'Sal');
    assert.equal(shoppingPreview([]), '');
    assert.equal(pendingText(1), 'Falta 1 cosa por comprar');
    assert.equal(pendingText(3), 'Faltan 3 cosas por comprar');
  });

  test('limpia el texto', () => {
    assert.equal(cleanShoppingText('  leche   deslactosada '), 'leche deslactosada');
    assert.equal(cleanShoppingText('x'.repeat(100)).length, 80);
  });
});
