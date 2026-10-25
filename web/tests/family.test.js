import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  cleanShoppingText, doneItems, householdIdFromSearch, householdMonth, initials, inviteLink,
  isValidHouseholdId, pendingItems, pendingText, scopeLabel, shoppingPreview,
} from '../logic.js';

describe('consolidado del hogar (solo gastos familiares)', () => {
  const family = [
    { id: 'a1', createdBy: 'ana', createdByName: 'Ana', amount: 30_000, date: '2026-10-22', categoryName: 'Alimentación', categoryIcon: '🍽️', createdAt: 3 },
    { id: 'a2', createdBy: 'ana', createdByName: 'Ana', amount: 80_000, date: '2026-10-10', categoryName: 'Salud', createdAt: 1 },
    { id: 'b1', createdBy: 'bea', createdByName: 'Bea', amount: 20_000, date: '2026-10-22', categoryName: 'alimentacion', createdAt: 4 },
    { id: 'b2', createdBy: 'bea', createdByName: 'Bea', amount: 30_000, date: '2026-10-05', categoryName: 'Transporte', createdAt: 2 },
    { id: 'b3', createdBy: 'bea', createdByName: 'Bea', amount: 999, date: '2026-09-30', categoryName: 'Otros', createdAt: 0 },
  ];

  test('suma el mes y junta las categorías equivalentes de cada persona', () => {
    const month = householdMonth(family, '2026-10');
    assert.equal(month.total, 160_000);
    assert.equal(month.count, 4);
    assert.deepEqual(month.byCategory.map(({ name, total }) => [name, total]), [
      ['Salud', 80_000], ['Alimentación', 50_000], ['Transporte', 30_000],
    ]);
    assert.equal(month.byCategory[0].share, 0.5);
    assert.equal(month.byCategory[1].icon, '🍽️');
  });

  test('lista el detalle de los gastos familiares del mes, del más reciente al más antiguo', () => {
    assert.deepEqual(householdMonth(family, '2026-10').items.map((e) => e.id), ['b1', 'a1', 'a2', 'b2']);
  });

  test('total de cada persona, en el orden del hogar y con el nombre actual', () => {
    const members = [{ uid: 'bea', name: 'Bea' }, { uid: 'ana', name: 'Ana María' }, { uid: 'cata', name: 'Cata' }];
    assert.deepEqual(householdMonth(family, '2026-10', members).byMember, [
      { uid: 'bea', name: 'Bea', total: 50_000 },
      { uid: 'ana', name: 'Ana María', total: 110_000 },
      { uid: 'cata', name: 'Cata', total: 0 },
    ]);
  });

  test('un mes sin gastos familiares da cero', () => {
    assert.deepEqual(householdMonth(family, '2026-01'), { total: 0, count: 0, byMember: [], byCategory: [], items: [] });
  });

  test('tipo de gasto', () => {
    assert.equal(scopeLabel('family'), 'Familia');
    assert.equal(scopeLabel('personal'), 'Personal');
    assert.equal(scopeLabel(undefined), 'Personal');
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
