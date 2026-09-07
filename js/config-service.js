// ============================================================
// SERVICIO DE CONFIGURACIÓN
// Documento único en /configuracion/general con los parámetros
// globales del sistema. Se cachea en memoria para no releerlo
// en cada módulo (rendimiento).
// ============================================================
import { db, COL, CONFIG_DOC_ID } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const DEFAULT_CONFIG = {
  clientesMinPorVendedor: 15,
  clientesMaxPorVendedor: 20,
  productosMinPorCliente: 1,
  productosMaxPorCliente: 3,
  cantidadMinGeneral: 1,
  cantidadMaxGeneral: 20,
  moneda: "$",
  decimales: 2,
  nombreEmpresa: "Mi Empresa",
  nombreReportes: "Reporte Diario de Ventas",
};

let cache = null;

export async function getConfig(force = false) {
  if (cache && !force) return cache;
  const ref = doc(db, COL.CONFIGURACION, CONFIG_DOC_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    cache = { ...DEFAULT_CONFIG, ...snap.data() };
  } else {
    cache = { ...DEFAULT_CONFIG };
    await setDoc(ref, cache);
  }
  return cache;
}

export async function saveConfig(partial) {
  const ref = doc(db, COL.CONFIGURACION, CONFIG_DOC_ID);
  const next = { ...(cache || DEFAULT_CONFIG), ...partial };
  await setDoc(ref, next, { merge: true });
  cache = next;
  return next;
}

export function invalidateConfigCache() {
  cache = null;
}
