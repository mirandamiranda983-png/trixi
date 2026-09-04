// ============================================================
// TRIXI — auth.js
// Firebase Authentication: login, logout, estado de sesión
// ============================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase-config.js';
import { toast } from './ui.js';

// ── Estado global ────────────────────────────────────────────
let currentUser  = null;
let currentProfile = null;

// ── Login ────────────────────────────────────────────────────
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ── Logout ───────────────────────────────────────────────────
export async function logout() {
  await signOut(auth);
  currentUser    = null;
  currentProfile = null;
}

// ── Reset de contraseña ──────────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Perfil del usuario en Firestore ─────────────────────────
export async function getUserProfile(uid) {
  const ref  = doc(db, 'usuarios', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function ensureUserProfile(user) {
  const ref  = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Crear perfil básico si no existe
    await setDoc(ref, {
      email:        user.email,
      nombre:       user.displayName || user.email.split('@')[0],
      rol:          'admin', // primer usuario es admin
      fechaCreacion: serverTimestamp(),
      activo:       true,
    });
    return getUserProfile(user.uid);
  }
  return { id: snap.id, ...snap.data() };
}

// ── Observer de autenticación ────────────────────────────────
/**
 * Inicializa el observer de auth.
 * @param {{ onLogin, onLogout }} callbacks
 */
export function initAuth({ onLogin, onLogout }) {
  return onAuthStateChanged(auth, async user => {
    if (user) {
      currentUser = user;
      try {
        currentProfile = await ensureUserProfile(user);
      } catch (e) {
        console.error('Error loading user profile:', e);
        currentProfile = { rol: 'viewer', nombre: user.email };
      }
      onLogin(user, currentProfile);
    } else {
      currentUser    = null;
      currentProfile = null;
      onLogout();
    }
  });
}

// ── Getters ──────────────────────────────────────────────────
export function getUser()    { return currentUser; }
export function getProfile() { return currentProfile; }
export function getUserId()  { return currentUser?.uid || null; }
export function isAdmin()    { return currentProfile?.rol === 'admin'; }
export function isLoggedIn() { return !!currentUser; }

// ── Login page logic ─────────────────────────────────────────
export function initLoginPage() {
  const form     = document.getElementById('login-form');
  const emailEl  = document.getElementById('login-email');
  const passEl   = document.getElementById('login-password');
  const errorEl  = document.getElementById('login-error');
  const submitEl = document.getElementById('login-submit');
  const resetLink = document.getElementById('login-reset');

  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = emailEl?.value?.trim();
    const pass  = passEl?.value;
    if (!email || !pass) return;

    errorEl.textContent = '';
    submitEl.classList.add('loading');
    submitEl.disabled = true;

    try {
      await login(email, pass);
      // Auth observer redirigirá
    } catch (err) {
      const msgs = {
        'auth/invalid-email':        'Correo electrónico inválido.',
        'auth/user-disabled':        'Usuario desactivado.',
        'auth/user-not-found':       'Usuario no encontrado.',
        'auth/wrong-password':       'Contraseña incorrecta.',
        'auth/invalid-credential':   'Credenciales inválidas. Verifica tu correo y contraseña.',
        'auth/too-many-requests':    'Demasiados intentos fallidos. Intenta más tarde.',
        'auth/network-request-failed': 'Error de red. Verifica tu conexión.',
      };
      errorEl.textContent = msgs[err.code] || `Error: ${err.message}`;
    } finally {
      submitEl.classList.remove('loading');
      submitEl.disabled = false;
    }
  });

  resetLink?.addEventListener('click', async e => {
    e.preventDefault();
    const email = emailEl?.value?.trim();
    if (!email) {
      errorEl.textContent = 'Ingresa tu correo para restablecer la contraseña.';
      return;
    }
    try {
      await resetPassword(email);
      toast.success('Correo de restablecimiento enviado.');
    } catch (err) {
      errorEl.textContent = 'Error al enviar el correo de restablecimiento.';
    }
  });
}
