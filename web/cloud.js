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

/** Sale del hogar y borra antes sus propios totales, para que el hogar deje de verlos. */
export async function leaveHousehold(uid, householdId, months) {
  const batch = writeBatch(db);
  for (const month of months) batch.delete(doc(db, 'households', householdId, 'summaries', `${uid}_${month}`));
  await batch.commit();
  await updateDoc(doc(db, 'households', householdId), { members: arrayRemove(uid), [`names.${uid}`]: deleteField() });
  await setDoc(doc(db, 'users', uid), { householdId: null }, { merge: true });
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

// ---------- Gastos y categorías (privados) ----------

function stripId({ id, ...data }) {
  return [id, data];
}

export function saveExpense(uid, expense) {
  const [id, data] = stripId(expense);
  return setDoc(doc(db, 'users', uid, 'expenses', id), data);
}

export const deleteExpense = (uid, id) => deleteDoc(doc(db, 'users', uid, 'expenses', id));

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
export function replaceAllData(uid, current, next) {
  return commitInChunks([
    ...current.expenses.map((item) => (batch) => batch.delete(doc(db, 'users', uid, 'expenses', item.id))),
    ...current.categories.map((item) => (batch) => batch.delete(doc(db, 'users', uid, 'categories', item.id))),
    ...next.categories.map((item) => (batch) => { const [id, data] = stripId(item); batch.set(doc(db, 'users', uid, 'categories', id), data); }),
    ...next.expenses.map((item) => (batch) => { const [id, data] = stripId(item); batch.set(doc(db, 'users', uid, 'expenses', id), data); }),
    (batch) => batch.set(doc(db, 'users', uid), { seeded: true }, { merge: true }),
  ]);
}

// ---------- Hogar: totales y lista de compras ----------

export function saveSummary(householdId, uid, name, month, summary) {
  return setDoc(doc(db, 'households', householdId, 'summaries', `${uid}_${month}`), {
    uid, name, month, total: summary.total, count: summary.count, byCategory: summary.byCategory, updatedAt: Date.now(),
  });
}

export const deleteSummary = (householdId, uid, month) =>
  deleteDoc(doc(db, 'households', householdId, 'summaries', `${uid}_${month}`));

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
