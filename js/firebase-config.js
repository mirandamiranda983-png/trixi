// ============================================================
// TRIXI — firebase-config.js
// Inicialización de Firebase y exportación de servicios
// ============================================================

import { initializeApp }    from 'firebase/app';
import { getFirestore }     from 'firebase/firestore';
import { getAuth }          from 'firebase/auth';

// ── Configuración Firebase ──────────────────────────────────
// Sustituye estos valores con los de tu proyecto Firebase
// Console → Project settings → Your apps → Firebase SDK snippet
const firebaseConfig = {
  apiKey:            'AIzaSyDKGWv9-749sv2GkIMVIcuvpp1d1fq7Rec',
  authDomain:        'trixi-2026.firebaseapp.com',
  projectId:         'trixi-2026',
  storageBucket:     'trixi-2026.firebasestorage.app',
  messagingSenderId: '674980010563',
  appId:             '1:674980010563:web:ad4201a0b4c0b7ea5452f6',
  measurementId:     'G-JS3HQ486RN',
};

// ── Inicializar ─────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
