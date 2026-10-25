// Conexión con Firebase: inicio de sesión con Google y datos en la nube (Firestore).
// Las escrituras se aplican al instante en este dispositivo y se envían cuando hay Internet.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  connectAuthEmulator, getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged,
  signInWithCredential, signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  arrayRemove, arrayUnion, collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc,
  initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, setDoc, updateDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

/** En el PC (localhost) la app usa los emuladores de Firebase, nunca los datos reales. */
export const usingEmulators = ['localhost', '127.0.0.1'].includes(location.hostname);

const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-mis-gastos', appId: 'demo' };

let auth;
let db;

export function startCloud() {
  const config = usingEmulators ? EMULATOR_CONFIG : firebaseConfig;
  if (!config.projectId || !config.apiKey) return false;
  const app = initializeApp(config);
  auth = getAuth(app);
  auth.languageCode = 'es';
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (usingEmulators) {
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8080);
  }
  return true;
}

// ---------- Sesión ----------

export const onUserChanged = (callback) => onAuthStateChanged(auth, callback);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

export const finishRedirect = () => getRedirectResult(auth);

export const signOutUser = () => signOut(auth);

/** Solo en el emulador: inicia sesión como una persona de prueba sin pasar por Google. */
export function signInForTesting(name) {
  if (!usingEmulators) return Promise.reject(new Error('Solo disponible con el emulador.'));
  const sub = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'prueba';
  const token = JSON.stringify({ sub, email: `${sub}@example.com`, name, email_verified: true });
  return signInWithCredential(auth, GoogleAuthProvider.credential(token));
}

// ---------- Escuchar datos ----------

const withIds = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const watchOptions = { includeMetadataChanges: true };

export function watchProfile(uid, onData, onError) {
  return onSnapshot(doc(db, 'users', uid), watchOptions,
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError);
}

export function watchCollection(path, onData, onError) {
  return onSnapshot(collection(db, ...path), watchOptions,
    (snapshot) => onData(withIds(snapshot), snapshot.metadata), onError);
}

export function watchHousehold(householdId, onData, onError) {
  return onSnapshot(doc(db, 'households', householdId), watchOptions,
    (snapshot) => onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null, snapshot.metadata), onError);
}

export const newId = (...path) => doc(collection(db, ...path)).id;

// ---------- Perfil y hogar ----------

export function createProfile(uid, profile) {
  return setDoc(doc(db, 'users', uid), { householdId: null, seeded: false, createdAt: Date.now(), ...profile }, { merge: true });
}

export const updateProfile = (uid, fields) => setDoc(doc(db, 'users', uid), fields, { merge: true });

export async function createHousehold(uid, name) {
  const ref = doc(collection(db, 'households'));
  const batch = writeBatch(db);
  batch.set(ref, { members: [uid], names: { [uid]: name }, createdBy: uid, createdAt: Date.now() });
  batch.set(doc(db, 'users', uid), { householdId: ref.id }, { merge: true });
  await batch.commit();
  return ref.id;
}

export async function readHousehold(householdId) {
  const snapshot = await getDoc(doc(db, 'households', householdId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/**
 * Sale del hogar. Antes pasa sus gastos familiares a personales, para que el
 * hogar deje de verlos y ella no los pierda.
 */
export async function leaveHousehold(owner, myFamilyExpenses) {
  await commitInChunks(myFamilyExpenses.flatMap((expense) => [
    (batch) => batch.set(expenseRef(owner, 'personal', expense.id), expenseData(owner, { ...expense, scope: 'personal' })),
    (batch) => batch.delete(expenseRef(owner, 'family', expense.id)),
  ]));
  await updateDoc(doc(db, 'households', owner.householdId), { members: arrayRemove(owner.uid), [`names.${owner.uid}`]: deleteField() });
  await setDoc(doc(db, 'users', owner.uid), { householdId: null }, { merge: true });
}

export async function joinHousehold(uid, name, householdId) {
  const household = await readHousehold(householdId);
  if (!household) throw Object.assign(new Error('La invitación no es válida o el hogar ya no existe.'), { code: 'not-found' });
  if (!household.members.includes(uid)) {
    await updateDoc(doc(db, 'households', householdId), { members: arrayUnion(uid), [`names.${uid}`]: name });
  }
  await setDoc(doc(db, 'users', uid), { householdId }, { merge: true });
}

export const renameInHousehold = (uid, householdId, name) =>
  updateDoc(doc(db, 'households', householdId), { [`names.${uid}`]: name });

// ---------- Gastos y categorías ----------
// owner = { uid, name, householdId }. Los gastos personales viven en la cuenta de
// su dueña; los familiares, en el hogar, con el nombre e icono de su categoría
// para que el resto del hogar los pueda mostrar.

function stripId({ id, ...data }) {
  return [id, data];
}

function expenseRef(owner, scope, id) {
  return scope === 'family'
    ? doc(db, 'households', owner.householdId, 'expenses', id)
    : doc(db, 'users', owner.uid, 'expenses', id);
}

function expenseData(owner, expense, category = null) {
  const data = {
    amount: expense.amount,
    note: expense.note ?? '',
    date: expense.date,
    categoryId: expense.categoryId ?? null,
    createdAt: expense.createdAt,
  };
  if (expense.scope !== 'family') return data;
  return {
    ...data,
    createdBy: owner.uid,
    createdByName: owner.name,
    categoryName: category?.name ?? expense.categoryName ?? 'Sin categoría',
    categoryIcon: category?.icon ?? expense.categoryIcon ?? '🏷️',
  };
}

export const newExpenseId = (uid) => doc(collection(db, 'users', uid, 'expenses')).id;

/** Guarda un gasto; si cambió de Personal a Familia (o al revés), lo mueve. */
export function saveExpense(owner, expense, category, previousScope = expense.scope) {
  const batch = writeBatch(db);
  if (previousScope !== expense.scope) batch.delete(expenseRef(owner, previousScope, expense.id));
  batch.set(expenseRef(owner, expense.scope, expense.id), expenseData(owner, expense, category));
  return batch.commit();
}

export const deleteExpense = (owner, expense) => deleteDoc(expenseRef(owner, expense.scope, expense.id));

/** Actualiza nombre e icono de una categoría en los gastos familiares que la usan. */
export function refreshFamilyCategory(owner, familyExpenses, category) {
  return commitInChunks(familyExpenses.map((expense) => (batch) =>
    batch.update(expenseRef(owner, 'family', expense.id), { categoryName: category.name, categoryIcon: category.icon })));
}

export function saveCategory(uid, category) {
  const [id, data] = stripId(category);
  return setDoc(doc(db, 'users', uid, 'categories', id), data);
}

export const deleteCategory = (uid, id) => deleteDoc(doc(db, 'users', uid, 'categories', id));

async function commitInChunks(operations) {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = writeBatch(db);
    operations.slice(start, start + 400).forEach((apply) => apply(batch));
    await batch.commit();
  }
}

export function seedCategories(uid, categories) {
  return commitInChunks([
    ...categories.map((category) => (batch) => {
      const [id, data] = stripId(category);
      batch.set(doc(db, 'users', uid, 'categories', id), data);
    }),
    (batch) => batch.set(doc(db, 'users', uid), { seeded: true }, { merge: true }),
  ]);
}

/** Reemplaza todos los gastos y categorías por los de una copia de seguridad. */
export function replaceAllData(owner, current, next) {
  const categories = new Map(next.categories.map((category) => [category.id, category]));
  return commitInChunks([
    ...current.expenses.map((item) => (batch) => batch.delete(expenseRef(owner, item.scope, item.id))),
    ...current.categories.map((item) => (batch) => batch.delete(doc(db, 'users', owner.uid, 'categories', item.id))),
    ...next.categories.map((item) => (batch) => { const [id, data] = stripId(item); batch.set(doc(db, 'users', owner.uid, 'categories', id), data); }),
    ...next.expenses.map((item) => (batch) =>
      batch.set(expenseRef(owner, item.scope, item.id), expenseData(owner, item, categories.get(item.categoryId)))),
    (batch) => batch.set(doc(db, 'users', owner.uid), { seeded: true }, { merge: true }),
  ]);
}

// ---------- Lista de compras ----------

export function addShoppingItem(householdId, uid, name, text) {
  return setDoc(doc(collection(db, 'households', householdId, 'shopping')), {
    text, done: false, createdBy: uid, createdByName: name, createdAt: Date.now(),
  });
}

export function setShoppingDone(householdId, itemId, done, uid) {
  return updateDoc(doc(db, 'households', householdId, 'shopping', itemId), {
    done, doneBy: done ? uid : null, doneAt: done ? Date.now() : null,
  });
}

export const deleteShoppingItem = (householdId, itemId) =>
  deleteDoc(doc(db, 'households', householdId, 'shopping', itemId));

export function deleteShoppingItems(householdId, itemIds) {
  return commitInChunks(itemIds.map((id) => (batch) => batch.delete(doc(db, 'households', householdId, 'shopping', id))));
}
