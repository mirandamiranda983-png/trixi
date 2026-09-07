// ============================================================
// NAVEGACIÓN COMPARTIDA
// Se inyecta en cada página dentro de <div id="app-shell"></div>
// para mantener la misma barra lateral y encabezado en todo el sitio.
// ============================================================
import { logout, currentUserLabel, guardPage } from "./auth.js";

const LINKS = [
  { href: "dashboard.html", label: "Dashboard", icon: "📊" },
  { href: "vendedores.html", label: "Vendedores", icon: "🧑‍💼" },
  { href: "clientes.html", label: "Clientes", icon: "🏢" },
  { href: "productos.html", label: "Productos", icon: "📦" },
  { href: "asignacion.html", label: "Asignación de clientes", icon: "🔗" },
  { href: "generador.html", label: "Generador diario", icon: "🎲" },
  { href: "historial.html", label: "Historial de reportes", icon: "🗂️" },
  { href: "importar.html", label: "Importación de datos", icon: "⬆️" },
  { href: "configuracion.html", label: "Configuración", icon: "⚙️" },
];

export async function mountShell(activeHref, contentHtml) {
  await guardPage();
  const current = location.pathname.split("/").pop();
  const root = document.getElementById("app-shell");
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <span class="brand-mark">TX</span>
          <span class="brand-name" id="brand-name">Trixi</span>
        </div>
        <nav class="nav-links">
          ${LINKS.map(
            (l) => `<a href="${l.href}" class="nav-link ${current === l.href ? "active" : ""}">
              <span class="nav-icon">${l.icon}</span><span>${l.label}</span>
            </a>`
          ).join("")}
        </nav>
        <div class="sidebar-footer">
          <div class="user-chip">
            <span class="user-avatar">👤</span>
            <span id="user-name">Cargando...</span>
          </div>
          <button class="btn btn-ghost btn-block" id="btn-logout">Cerrar sesión</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="hamburger" id="btn-hamburger" aria-label="Menú">☰</button>
          <h1 class="page-title">${LINKS.find((l) => l.href === current)?.label || ""}</h1>
        </header>
        <main class="content" id="page-content">${contentHtml || ""}</main>
      </div>
    </div>
  `;
  document.getElementById("user-name").textContent = currentUserLabel();
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-hamburger").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  return document.getElementById("page-content");
}
