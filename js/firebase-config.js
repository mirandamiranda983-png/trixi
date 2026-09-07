// ============================================================
// CONFIGURACIÓN FIREBASE
// ============================================================
// Se usa el SDK modular de Firebase servido desde CDN (gstatic),
// por eso no se necesita build step: funciona directo en GitHub Pages.
//
// IMPORTANTE:
// - La apiKey de Firebase NO es un secreto: identifica el proyecto,
//   no autoriza nada por sí sola. La seguridad real vive en:
//     1) Firebase Authentication (quién eres)
//     2) Firestore Security Rules (qué puedes leer/escribir) -> ver firestore.rules
//   NUNCA agregues aquí claves privadas, API keys de servidor, etc.
// - En Firebase Console > Authentication > Settings > Authorized domains
//   agrega el dominio de GitHub Pages (ej: tuusuario.github.io) o la app
//   no podrá autenticar usuarios desde ahí.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---- Reemplaza este bloque solo si cambias de proyecto Firebase ----
const firebaseConfig = {
  apiKey: "AIzaSyDKGWv9-749sv2GkIMVIcuvpp1d1fq7Rec",
  authDomain: "trixi-2026.firebaseapp.com",
  projectId: "trixi-2026",
  storageBucket: "trixi-2026.firebasestorage.app",
  messagingSenderId: "674980010563",
  appId: "1:674980010563:web:ad4201a0b4c0b7ea5452f6",
  measurementId: "G-JS3HQ486RN",
};
// ----------------------------------------------------------------------

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("No se pudo fijar persistencia de sesión:", e)
);

// Nombres de colecciones centralizados (evita strings mágicos regados en el código)
export const COL = {
  VENDEDORES: "vendedores",
  CLIENTES: "clientes",
  PRODUCTOS: "productos",
  REPORTES: "reportes",
  HISTORIAL_ASIGNACIONES: "historialAsignaciones",
  CONFIGURACION: "configuracion",
  USUARIOS: "usuarios",
};

export const CONFIG_DOC_ID = "general";
