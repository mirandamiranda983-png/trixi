// ============================================================
// TRIXI — ui.js
// Helpers de UI: Toasts, Modales, Confirm, Loader global
// ============================================================

// ── Toast ────────────────────────────────────────────────────
const toastContainer = () => document.getElementById('toast-container');

let toastCounter = 0;

const TOAST_ICONS = {
  success: '✓',
  danger:  '✕',
  warning: '⚠',
  info:    'ℹ',
};

/**
 * Muestra un toast.
 * @param {string} message
 * @param {'success'|'danger'|'warning'|'info'} type
 * @param {string} [title]
 * @param {number} [duration] ms (0 = permanente)
 */
export function showToast(message, type = 'info', title = '', duration = 4000) {
  const id = `toast-${++toastCounter}`;
  const icon = TOAST_ICONS[type] || 'ℹ';

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.id = id;
  el.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" onclick="document.getElementById('${id}')?.remove()">✕</button>
  `;

  toastContainer()?.appendChild(el);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }

  return id;
}

function removeToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 200);
}

export const toast = {
  success: (msg, title = 'Éxito')      => showToast(msg, 'success', title),
  error:   (msg, title = 'Error')      => showToast(msg, 'danger', title),
  warning: (msg, title = 'Advertencia') => showToast(msg, 'warning', title),
  info:    (msg, title = 'Información') => showToast(msg, 'info', title),
};

// ── Modal ────────────────────────────────────────────────────
let activeModal = null;
let activeBackdrop = null;

/**
 * Abre un modal con HTML personalizado en el body.
 * @param {{ title, body, footer?, size?, onClose? }} opts
 * @returns {{ el, close }}
 */
export function openModal({ title, body, footer = '', size = 'modal-md', id = '', onClose }) {
  closeModal(); // cerrar cualquier modal anterior

  const modalId = id || `modal-${Date.now()}`;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = `modal ${size}`;
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal-header">
      <h5 class="modal-title">${escapeHtml(title)}</h5>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  activeBackdrop = backdrop;
  activeModal = modal;

  // Cerrar al hacer click en backdrop
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal();
  });

  // Cerrar con botón X
  modal.querySelector('#modal-close-btn')?.addEventListener('click', closeModal);

  // Cerrar con Escape
  const escHandler = e => { if (e.key === 'Escape') { closeModal(); onClose?.(); } };
  document.addEventListener('keydown', escHandler);
  modal._escHandler = escHandler;

  // Animar entrada
  requestAnimationFrame(() => backdrop.style.opacity = '1');

  return {
    el: modal,
    close: closeModal,
    getBody: () => modal.querySelector('.modal-body'),
  };
}

export function closeModal() {
  if (activeBackdrop) {
    if (activeModal?._escHandler) {
      document.removeEventListener('keydown', activeModal._escHandler);
    }
    activeBackdrop.remove();
    activeBackdrop = null;
    activeModal = null;
  }
}

export function updateModalBody(html) {
  if (activeModal) {
    const body = activeModal.querySelector('.modal-body');
    if (body) body.innerHTML = html;
  }
}

// ── Confirm Dialog ───────────────────────────────────────────
/**
 * Muestra un diálogo de confirmación.
 * @param {{ title, message, confirmText?, cancelText?, type? }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'danger' }) {
  return new Promise(resolve => {
    const iconMap = { danger: '🗑️', warning: '⚠️', info: 'ℹ️' };
    const icon = iconMap[type] || '⚠️';
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary';

    const body = `
      <div class="confirm-dialog">
        <div class="confirm-icon confirm-icon-${type}">${icon}</div>
        <div class="confirm-title">${escapeHtml(title)}</div>
        <p class="confirm-msg">${escapeHtml(message)}</p>
      </div>
    `;

    const footer = `
      <button class="btn btn-outline" id="confirm-cancel">${escapeHtml(cancelText)}</button>
      <button class="btn ${btnClass}" id="confirm-ok">${escapeHtml(confirmText)}</button>
    `;

    const { el, close } = openModal({ title: '', body, footer, size: 'modal-sm' });
    el.querySelector('.modal-header').style.display = 'none';

    el.querySelector('#confirm-ok')?.addEventListener('click', () => { close(); resolve(true); });
    el.querySelector('#confirm-cancel')?.addEventListener('click', () => { close(); resolve(false); });
  });
}

// ── Loading global ───────────────────────────────────────────
let loadingEl = null;
let loadingCount = 0;

export function showLoading(text = 'Cargando...') {
  loadingCount++;
  if (loadingEl) {
    const msg = loadingEl.querySelector('.loading-text');
    if (msg) msg.textContent = text;
    return;
  }

  loadingEl = document.createElement('div');
  loadingEl.id = 'global-loading';
  loadingEl.style.cssText = `
    position:fixed; inset:0; background:rgba(15,23,42,.7); backdrop-filter:blur(2px);
    z-index:9000; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:16px;
  `;
  loadingEl.innerHTML = `
    <div class="spinner spinner-lg" style="border-top-color:#fff;border-color:rgba(255,255,255,.3);border-top-color:#2563eb;"></div>
    <div class="loading-text" style="color:#fff;font-size:14px;font-weight:500;">${escapeHtml(text)}</div>
  `;
  document.body.appendChild(loadingEl);
}

export function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0 && loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

// ── Inline loader en contenedor ──────────────────────────────
export function setLoading(container, show = true, text = 'Cargando...') {
  if (!container) return;
  if (show) {
    container.innerHTML = `
      <div class="section-loader">
        <div class="spinner"></div>
        <span>${escapeHtml(text)}</span>
      </div>
    `;
  }
}

// ── Table empty state ────────────────────────────────────────
export function renderEmptyState(icon = '📭', title = 'Sin resultados', desc = 'No se encontraron registros.') {
  return `
    <div class="table-empty">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-desc">${escapeHtml(desc)}</div>
    </div>
  `;
}

// ── Badge helpers ────────────────────────────────────────────
export function statusBadge(estado) {
  const map = {
    activo:     '<span class="badge badge-activo badge-dot">Activo</span>',
    inactivo:   '<span class="badge badge-inactivo badge-dot">Inactivo</span>',
    registrado: '<span class="badge badge-green badge-dot">Registrado</span>',
    borrador:   '<span class="badge badge-gray badge-dot">Borrador</span>',
  };
  return map[estado] || `<span class="badge badge-gray">${escapeHtml(estado || '—')}</span>`;
}

// ── Escape HTML ──────────────────────────────────────────────
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Navegación de módulos ────────────────────────────────────
let currentModule = null;

export function navigateTo(module) {
  if (!module) return;

  // Ocultar todos los módulos
  document.querySelectorAll('.module-section').forEach(s => s.classList.add('hidden'));

  // Mostrar el módulo seleccionado
  const section = document.getElementById(`mod-${module}`);
  if (section) section.classList.remove('hidden');

  // Actualizar nav activo
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navLink = document.querySelector(`.nav-link[data-module="${module}"]`);
  if (navLink) navLink.classList.add('active');

  // Actualizar breadcrumb
  const breadcrumb = document.getElementById('breadcrumb-module');
  if (breadcrumb) breadcrumb.textContent = navLink?.querySelector('.nav-label')?.textContent || module;

  // Cerrar sidebar en mobile
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.querySelector('.sidebar-overlay')?.classList.remove('visible');

  currentModule = module;

  // Disparar evento para que el módulo inicialice
  window.dispatchEvent(new CustomEvent('trixi:navigate', { detail: { module } }));
}

export function getCurrentModule() { return currentModule; }

// ── Filtro de tabla en cliente ────────────────────────────────
export function filterTable(rows, query, keys) {
  if (!query) return rows;
  const q = query.toLowerCase().trim();
  return rows.filter(row =>
    keys.some(k => String(row[k] || '').toLowerCase().includes(q))
  );
}

// ── Paginación ────────────────────────────────────────────────
export class Paginator {
  constructor({ total = 0, page = 1, pageSize = 20 } = {}) {
    this.total    = total;
    this.page     = page;
    this.pageSize = pageSize;
  }

  get totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get offset()     { return (this.page - 1) * this.pageSize; }
  get hasPrev()    { return this.page > 1; }
  get hasNext()    { return this.page < this.totalPages; }

  slice(arr) {
    return arr.slice(this.offset, this.offset + this.pageSize);
  }

  renderControls(containerId, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const from = Math.min(this.offset + 1, this.total);
    const to   = Math.min(this.offset + this.pageSize, this.total);

    container.innerHTML = `
      <div class="pagination">
        <div class="pagination-info">
          Mostrando ${from}–${to} de ${this.total} registros
        </div>
        <div class="pagination-controls">
          <button class="page-btn" ${!this.hasPrev ? 'disabled' : ''} data-page="${this.page - 1}">‹</button>
          ${this._pageButtons()}
          <button class="page-btn" ${!this.hasNext ? 'disabled' : ''} data-page="${this.page + 1}">›</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= this.totalPages) {
          this.page = p;
          onPageChange(p);
        }
      });
    });
  }

  _pageButtons() {
    const pages = [];
    let start = Math.max(1, this.page - 2);
    let end   = Math.min(this.totalPages, this.page + 2);

    if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < this.totalPages) { if (end < this.totalPages - 1) pages.push('...'); pages.push(this.totalPages); }

    return pages.map(p =>
      p === '...'
        ? `<span class="page-btn" style="border:none;cursor:default;">…</span>`
        : `<button class="page-btn ${p === this.page ? 'active' : ''}" data-page="${p}">${p}</button>`
    ).join('');
  }
}
