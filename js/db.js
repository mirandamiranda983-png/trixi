// ============================================================
// TRIXI — db.js
// Servicios genéricos de Firestore: CRUD, queries, batches
// ============================================================

import {
  collection, doc, getDocs, getDoc, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  startAfter, onSnapshot, serverTimestamp, writeBatch,
  getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase-config.js';

// ── Helpers ─────────────────────────────────────────────────
export function colRef(path)       { return collection(db, path); }
export function docRef(path, id)   { return doc(db, path, id); }
export function newDocRef(path)    { return doc(collection(db, path)); }
export { serverTimestamp, Timestamp };

// ── Crear (con ID autogenerado) ──────────────────────────────
export async function createDoc(colPath, data) {
  const ref  = await addDoc(colRef(colPath), {
    ...data,
    fechaCreacion: serverTimestamp(),
  });
  return ref.id;
}

// ── Crear (con ID específico) ────────────────────────────────
export async function setDocById(colPath, id, data, merge = false) {
  await setDoc(doc(db, colPath, id), {
    ...data,
    fechaCreacion: data.fechaCreacion ?? serverTimestamp(),
  }, { merge });
  return id;
}

// ── Leer uno ─────────────────────────────────────────────────
export async function getDocById(colPath, id) {
  const snap = await getDoc(doc(db, colPath, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ── Leer todos (sin filtros, con caché opcional) ─────────────
const _cache = {};

export async function getAllDocs(colPath, { orderByField = null, useCache = false } = {}) {
  if (useCache && _cache[colPath]) return _cache[colPath];

  let q = colRef(colPath);
  if (orderByField) q = query(q, orderBy(orderByField));

  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (useCache) _cache[colPath] = docs;
  return docs;
}

export function clearCache(colPath) {
  if (colPath) delete _cache[colPath];
  else Object.keys(_cache).forEach(k => delete _cache[k]);
}

// ── Query con filtros ────────────────────────────────────────
export async function queryDocs(colPath, constraints = []) {
  const q    = query(colRef(colPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Actualizar ───────────────────────────────────────────────
export async function updateDocById(colPath, id, data) {
  await updateDoc(doc(db, colPath, id), {
    ...data,
    fechaActualizacion: serverTimestamp(),
  });
}

// ── Eliminar ─────────────────────────────────────────────────
export async function deleteDocById(colPath, id) {
  await deleteDoc(doc(db, colPath, id));
}

// ── Verificar existencia por campo ───────────────────────────
export async function existsByField(colPath, field, value, excludeId = null) {
  const q    = query(colRef(colPath), where(field, '==', value), limit(5));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (!excludeId) return true;
  return snap.docs.some(d => d.id !== excludeId);
}

// ── Contar documentos ────────────────────────────────────────
export async function countDocs(colPath, constraints = []) {
  const q    = query(colRef(colPath), ...constraints);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// ── Batch write (hasta 500 ops) ──────────────────────────────
export async function batchWrite(operations) {
  // operations: [{ type: 'set'|'update'|'delete', ref, data? }]
  const CHUNK = 400;
  for (let i = 0; i < operations.length; i += CHUNK) {
    const batch = writeBatch(db);
    operations.slice(i, i + CHUNK).forEach(op => {
      if (op.type === 'set')    batch.set(op.ref, op.data, { merge: op.merge ?? false });
      if (op.type === 'update') batch.update(op.ref, op.data);
      if (op.type === 'delete') batch.delete(op.ref);
    });
    await batch.commit();
  }
}

// ── Real-time listener ────────────────────────────────────────
export function listenCollection(colPath, constraints = [], callback) {
  const q = query(colRef(colPath), ...constraints);
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(docs);
  });
}

// ── Sub-colección ─────────────────────────────────────────────
export async function getSubcollection(parentPath, parentId, subCol) {
  const path = `${parentPath}/${parentId}/${subCol}`;
  const snap = await getDocs(colRef(path));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSubDoc(parentPath, parentId, subCol, data) {
  const ref = await addDoc(colRef(`${parentPath}/${parentId}/${subCol}`), {
    ...data,
    fechaCreacion: serverTimestamp(),
  });
  return ref.id;
}

// ── Importación masiva con batch ──────────────────────────────
export async function importBatch(colPath, records, { onProgress } = {}) {
  const ops = records.map(rec => ({
    type: 'set',
    ref:  doc(db, colPath, rec.id || doc(collection(db, colPath)).id),
    data: { ...rec, fechaCreacion: serverTimestamp() },
  }));

  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    await batchWrite(ops.slice(i, i + CHUNK));
    onProgress?.({ done: Math.min(i + CHUNK, ops.length), total: ops.length });
  }
}

// Re-exportar operadores de Firestore para uso externo
export { query, where, orderBy, limit, startAfter };
export { addDoc };
