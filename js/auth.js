// ============================================================
// AUTENTICACIÓN (Firebase Authentication)
// ============================================================
// La AUTORIZACIÓN real (qué puede leer/escribir cada usuario) se
// aplica en Firestore Security Rules (ver firestore.rules), nunca
// solo aquí. Este archivo controla la SESIÓN y la navegación.
// ============================================================
import { auth, db, COL } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { setLoading, toast } from "./utils.js";

export let currentUser = null;
export let currentUserProfile = null; // documento en /usuarios/{uid}

function isLoginPage() {
  return location.pathname.endsWith("index.html") || location.pathname === "/" || location.pathname.endsWith("/trixi-app/");
}

// Resuelve cuando ya sabemos el estado de auth. Redirige según corresponda.
export function guardPage() {
  return new Promise((resolve) => {
    setLoading(true);
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (user) {
        try {
          const snap = await getDoc(doc(db, COL.USUARIOS, user.uid));
          currentUserProfile = snap.exists() ? snap.data() : { nombre: user.email, rol: "admin" };
        } catch (e) {
          currentUserProfile = { nombre: user.email, rol: "admin" };
        }
      } else {
        currentUserProfile = null;
      }

      if (!user && !isLoginPage()) {
        location.href = "index.html";
        return;
      }
      if (user && isLoginPage()) {
        location.href = "dashboard.html";
        return;
      }
      setLoading(false);
      resolve(user);
    });
  });
}

export async function login(email, password) {
  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } finally {
    setLoading(false);
  }
}

export async function logout() {
  await signOut(auth);
  location.href = "index.html";
}

export function currentUserLabel() {
  return currentUserProfile?.nombre || currentUser?.email || "Usuario";
}
