// Pruebas de las reglas de privacidad con el emulador de Firestore: `npm run test:rules`.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';

const HID = 'hogarAbc123hogarAbc1';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mis-gastos',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'households', HID), { members: ['ana', 'bea'], names: { ana: 'Ana', bea: 'Bea' }, createdBy: 'ana', createdAt: 1 });
    await setDoc(doc(db, 'users/ana/expenses/e1'), { amount: 25000, note: 'Almuerzo', date: '2026-10-22', categoryId: 'c1', createdAt: 1 });
    await setDoc(doc(db, `households/${HID}/expenses/f1`), { createdBy: 'ana', createdByName: 'Ana', amount: 50000, note: 'Mercado', date: '2026-10-22', categoryName: 'Alimentación', createdAt: 1 });
    await setDoc(doc(db, `households/${HID}/shopping/s1`), { text: 'Leche', done: false, createdBy: 'ana', createdAt: 1 });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

describe('gastos personales', () => {
  test('cada persona lee y escribe sus propios gastos', async () => {
    await assertSucceeds(getDoc(doc(as('ana'), 'users/ana/expenses/e1')));
    await assertSucceeds(setDoc(doc(as('ana'), 'users/ana/expenses/e2'), { amount: 1000 }));
  });

  test('la compañera NO puede leer, listar ni modificar los gastos de la otra', async () => {
    await assertFails(getDoc(doc(as('bea'), 'users/ana/expenses/e1')));
    await assertFails(getDocs(collection(as('bea'), 'users/ana/expenses')));
    await assertFails(setDoc(doc(as('bea'), 'users/ana/expenses/e1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(as('bea'), 'users/ana/expenses/e1')));
    await assertFails(getDoc(doc(as('bea'), 'users/ana')));
  });

  test('sin iniciar sesión no se puede leer nada', async () => {
    await assertFails(getDoc(doc(anonymous(), 'users/ana/expenses/e1')));
    await assertFails(getDoc(doc(anonymous(), 'households', HID)));
  });
});

describe('gastos familiares', () => {
  const family = (createdBy, extra = {}) => ({
    createdBy, createdByName: createdBy, amount: 20000, note: '', date: '2026-10-23', categoryName: 'Hogar', createdAt: 2, ...extra,
  });
  const path = (id) => `households/${HID}/expenses/${id}`;

  test('los miembros ven el detalle de los gastos familiares de todas', async () => {
    await assertSucceeds(getDocs(collection(as('bea'), `households/${HID}/expenses`)));
    await assertSucceeds(getDoc(doc(as('bea'), path('f1'))));
  });

  test('alguien de fuera no los ve ni los crea', async () => {
    await assertFails(getDocs(collection(as('intrusa'), `households/${HID}/expenses`)));
    await assertFails(setDoc(doc(as('intrusa'), path('x')), family('intrusa')));
  });

  test('cada una registra los suyos y solo puede cambiar o borrar los suyos', async () => {
    await assertSucceeds(setDoc(doc(as('bea'), path('b1')), family('bea')));
    await assertFails(setDoc(doc(as('bea'), path('b2')), family('ana')));
    await assertFails(updateDoc(doc(as('bea'), path('f1')), { amount: 1 }));
    await assertFails(deleteDoc(doc(as('bea'), path('f1'))));
    await assertSucceeds(updateDoc(doc(as('ana'), path('f1')), { amount: 60000 }));
    await assertSucceeds(deleteDoc(doc(as('ana'), path('f1'))));
  });

  test('valida los datos del gasto', async () => {
    await assertFails(setDoc(doc(as('bea'), path('b3')), family('bea', { amount: 2.5 })));
    await assertFails(setDoc(doc(as('bea'), path('b4')), family('bea', { amount: -1 })));
    await assertFails(setDoc(doc(as('bea'), path('b5')), family('bea', { date: '23/10/2026' })));
  });

  test('los resúmenes de la versión anterior ya no son accesibles', async () => {
    await assertFails(getDocs(collection(as('bea'), `households/${HID}/summaries`)));
  });
});

describe('hogar e invitaciones', () => {
  test('crear un hogar propio', async () => {
    await assertSucceeds(setDoc(doc(as('carla'), 'households/nuevoHogar1234567890'), {
      members: ['carla'], names: { carla: 'Carla' }, createdBy: 'carla', createdAt: 1,
    }));
    await assertFails(setDoc(doc(as('carla'), 'households/otroHogar12345678901'), {
      members: ['carla', 'ana'], names: {}, createdBy: 'carla', createdAt: 1,
    }));
  });

  test('con el enlace, una persona se une a sí misma', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'households', HID), {
      members: ['ana'], names: { ana: 'Ana' }, createdBy: 'ana', createdAt: 1,
    }));
    await assertSucceeds(updateDoc(doc(as('bea'), 'households', HID), { members: arrayUnion('bea'), 'names.bea': 'Bea' }));
  });

  test('no se puede añadir a otra persona ni cambiar el nombre de otra', async () => {
    await assertFails(updateDoc(doc(as('carla'), 'households', HID), { members: ['ana', 'bea', 'carla', 'dora'] }));
    await assertFails(updateDoc(doc(as('ana'), 'households', HID), { 'names.bea': 'Otra' }));
    await assertFails(updateDoc(doc(as('ana'), 'households', HID), { members: ['ana'] }));
    await assertSucceeds(updateDoc(doc(as('ana'), 'households', HID), { 'names.ana': 'Ana María' }));
  });
});

describe('lista de compras', () => {
  test('los miembros leen, añaden, marcan y borran', async () => {
    await assertSucceeds(getDocs(collection(as('bea'), `households/${HID}/shopping`)));
    await assertSucceeds(setDoc(doc(as('bea'), `households/${HID}/shopping/s2`), { text: 'Pan', done: false, createdBy: 'bea', createdAt: 1 }));
    await assertSucceeds(updateDoc(doc(as('bea'), `households/${HID}/shopping/s1`), { done: true, doneBy: 'bea', doneAt: 2 }));
    await assertSucceeds(deleteDoc(doc(as('bea'), `households/${HID}/shopping/s1`)));
  });

  test('alguien de fuera no accede a la lista', async () => {
    await assertFails(getDocs(collection(as('intrusa'), `households/${HID}/shopping`)));
    await assertFails(setDoc(doc(as('intrusa'), `households/${HID}/shopping/s3`), { text: 'X', done: false, createdBy: 'intrusa', createdAt: 1 }));
  });

  test('valida el texto y el autor', async () => {
    await assertFails(setDoc(doc(as('bea'), `households/${HID}/shopping/s4`), { text: '', done: false, createdBy: 'bea', createdAt: 1 }));
    await assertFails(setDoc(doc(as('bea'), `households/${HID}/shopping/s5`), { text: 'Pan', done: false, createdBy: 'ana', createdAt: 1 }));
  });
});
