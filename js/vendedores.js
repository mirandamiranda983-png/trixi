// ============================================================
// TRIXI — vendedores.js
// CRUD completo de vendedores + estadísticas
// ============================================================

import { where, orderBy } from 'firebase/firestore';
import {
  createDoc, updateDocById, deleteDocById,
  getAllDocs, getDocById, existsByField, queryDocs,
  clearCache,
} from './db.js';
import { toast, openModal, closeModal, confirmDialog, escapeHtml, statusBadge, renderEmptyState, Paginator } from './ui.js';
import { formatDate, formatCurrency, debounce, sortBy, filterTable, getInitials } from './utils.js';

const COL = 'vendedores';
let allVendedores = [];
let filtered      = [];
let paginator     = new Paginator({ pageSize: 25 });
let sortField     = 'codigo';
let sortDir       = 'asc';
let searchQuery   = '';

// ── Inicializar módulo ────────────────────────────────────────
export async function initVendedores() {
  renderSkeleton();
  await loadVendedores();
  setupEvents();
}

async function loadVendedores() {
  try {
    allVendedores = await getAllDocs(COL, { orderByField: 'codigo' });
    filtered      = [...allVendedores];
    paginator.total = filtered.length;
    renderTable();
    updateStats();
  } catch (e) {
    console.error(e);
    toast.error('Error al cargar vendedores.');
  }
}

// ── Render ────────────────────────────────────────────────────
function renderSkeleton() {
  const tbody = document.getElementById('vendedores-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="section-loader"><div class="spinner"></div><span>Cargando vendedores...</span></div></td></tr>`;
}

function renderTable() {
  const tbody = document.getElementById('vendedores-tbody');
  if (!tbody) return;

  const sorted = sortBy(filtered, sortField, sortDir);
  const page   = paginator.slice(sorted);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="6">${renderEmptyState('👥', 'Sin vendedores', searchQuery ? 'Ningún vendedor coincide con la búsqueda.' : 'Registra o importa vendedores para comenzar.')}</td></tr>`;
    document.getElementById('vendedores-pagination')?.replaceChildren();
    return;
  }

  tbody.innerHTML = page.map(v => `
    <tr>
      <td class="td-code"><span class="code-chip">${escapeHtml(v.codigo)}</span></td>
      <td>
        <div class="d-flex items-center gap-3">
          <div class="vc-avatar" style="background:${avatarColor(v.nombre)}">${escapeHtml(getInitials(v.nombre))}</div>
          <div>
            <div class="font-medium">${escapeHtml(v.nombre)}</div>
            <div class="text-xs text-muted">${formatDate(v.fechaCreacion)}</div>
          </div>
        </div>
      </td>
      <td><span id="cli-count-${v.id}" class="badge badge-gray">—</span></td>
      <td>${statusBadge(v.estado)}</td>
      <td class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.editVendedor('${v.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.toggleVendedorEstado('${v.id}')" title="${v.estado === 'activo' ? 'Desactivar' : 'Activar'}">
          ${v.estado === 'activo' ? '🔴' : '🟢'}
        </button>
        <button class="btn btn-ghost-danger btn-sm" onclick="window.TRIXI.deleteVendedor('${v.id}')" title="Eliminar">🗑️</button>
      </td>
    </tr>
  `).join('');

  paginator.renderControls('vendedores-pagination', () => renderTable());

  // Cargar conteo de clientes en background
  loadClientCounts(page);
}

async function loadClientCounts(vendedores) {
  for (const v of vendedores) {
    queryDocs('clientes', [where('vendedorId', '==', v.id)]).then(clients => {
      const el = document.getElementById(`cli-count-${v.id}`);
      if (el) {
        el.textContent = `${clients.length} clientes`;
        el.className   = 'badge badge-blue';
      }
    }).catch(() => {});
  }
}

function updateStats() {
  const total   = allVendedores.length;
  const activos = allVendedores.filter(v => v.estado === 'activo').length;
  setEl('vend-total',   total);
  setEl('vend-activos', activos);
  setEl('vend-inac',    total - activos);
}

// ── Búsqueda y filtros ────────────────────────────────────────
function applyFilters() {
  let data = [...allVendedores];

  if (searchQuery) {
    data = filterTable(data, searchQuery, ['codigo', 'nombre']);
  }

  const estado = document.getElementById('filter-vend-estado')?.value;
  if (estado && estado !== 'todos') data = data.filter(v => v.estado === estado);

  filtered = data;
  paginator.total = filtered.length;
  paginator.page  = 1;
  renderTable();
}

// ── Eventos ───────────────────────────────────────────────────
function setupEvents() {
  // Botón nuevo
  document.getElementById('btn-nuevo-vendedor')?.addEventListener('click', () => openFormModal());

  // Búsqueda
  const searchEl = document.getElementById('search-vendedores');
  searchEl?.addEventListener('input', debounce(e => {
    searchQuery = e.target.value;
    applyFilters();
  }, 250));

  // Filtro estado
  document.getElementById('filter-vend-estado')?.addEventListener('change', applyFilters);

  // Cabeceras sortables
  document.querySelectorAll('#vendedores-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = field; sortDir = 'asc'; }
      document.querySelectorAll('#vendedores-table th[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(`sort-${sortDir}`);
      renderTable();
    });
  });
}

// ── Modal Formulario ─────────────────────────────────────────
export async function openFormModal(id = null) {
  const isEdit = !!id;
  let data = { codigo: '', nombre: '', estado: 'activo' };

  if (isEdit) {
    data = await getDocById(COL, id);
    if (!data) { toast.error('Vendedor no encontrado.'); return; }
  }

  const body = `
    <form id="vendedor-form" novalidate>
      <div class="form-group">
        <label class="form-label">Código <span class="required">*</span></label>
        <input class="form-control" id="vf-codigo" value="${escapeHtml(data.codigo)}" placeholder="VEN001" maxlength="20">
        <div class="form-error" id="vf-codigo-err"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Nombre completo <span class="required">*</span></label>
        <input class="form-control" id="vf-nombre" value="${escapeHtml(data.nombre)}" placeholder="Juan Pérez" maxlength="100">
        <div class="form-error" id="vf-nombre-err"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-control" id="vf-estado">
          <option value="activo"   ${data.estado === 'activo'   ? 'selected' : ''}>Activo</option>
          <option value="inactivo" ${data.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-outline" onclick="window.TRIXI_MODAL.close()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-vend">
      <span class="btn-spinner"></span>
      ${isEdit ? 'Guardar cambios' : 'Crear vendedor'}
    </button>
  `;

  const { el, close } = openModal({ title: isEdit ? 'Editar Vendedor' : 'Nuevo Vendedor', body, footer, size: 'modal-md' });
  window.TRIXI_MODAL = { close };

  el.querySelector('#btn-save-vend')?.addEventListener('click', async () => {
    const codigo = el.querySelector('#vf-codigo')?.value?.trim().toUpperCase();
    const nombre = el.querySelector('#vf-nombre')?.value?.trim();
    const estado = el.querySelector('#vf-estado')?.value;

    // Limpiar errores
    el.querySelector('#vf-codigo-err').textContent = '';
    el.querySelector('#vf-nombre-err').textContent = '';

    let valid = true;
    if (!codigo) { el.querySelector('#vf-codigo-err').textContent = 'El código es requerido.'; valid = false; }
    if (!nombre) { el.querySelector('#vf-nombre-err').textContent = 'El nombre es requerido.'; valid = false; }
    if (!valid) return;

    // Verificar duplicado
    const dup = await existsByField(COL, 'codigo', codigo, id);
    if (dup) { el.querySelector('#vf-codigo-err').textContent = 'Este código ya existe.'; return; }

    const btn = el.querySelector('#btn-save-vend');
    btn.classList.add('loading'); btn.disabled = true;

    try {
      if (isEdit) {
        await updateDocById(COL, id, { codigo, nombre, estado });
        toast.success(`Vendedor "${nombre}" actualizado.`);
      } else {
        await createDoc(COL, { codigo, nombre, estado });
        toast.success(`Vendedor "${nombre}" creado.`);
      }
      clearCache(COL);
      close();
      await loadVendedores();
    } catch (e) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  });

  el.querySelector('#vf-codigo')?.focus();
}

// ── Toggle estado ─────────────────────────────────────────────
export async function toggleVendedorEstado(id) {
  const v = allVendedores.find(x => x.id === id);
  if (!v) return;

  const nuevoEstado = v.estado === 'activo' ? 'inactivo' : 'activo';
  const accion      = nuevoEstado === 'activo' ? 'activar' : 'desactivar';

  const ok = await confirmDialog({
    title:       `${accion.charAt(0).toUpperCase() + accion.slice(1)} vendedor`,
    message:     `¿Deseas ${accion} a "${v.nombre}"?`,
    confirmText: accion.charAt(0).toUpperCase() + accion.slice(1),
    type:        nuevoEstado === 'inactivo' ? 'warning' : 'info',
  });

  if (!ok) return;

  try {
    await updateDocById(COL, id, { estado: nuevoEstado });
    clearCache(COL);
    toast.success(`Vendedor ${nuevoEstado}.`);
    await loadVendedores();
  } catch (e) {
    toast.error('Error al actualizar estado.');
  }
}

// ── Eliminar ─────────────────────────────────────────────────
export async function deleteVendedor(id) {
  const v = allVendedores.find(x => x.id === id);
  if (!v) return;

  // Verificar si tiene clientes asignados
  const clientes = await queryDocs('clientes', [where('vendedorId', '==', id)]);
  if (clientes.length > 0) {
    toast.warning(`No puedes eliminar a "${v.nombre}" porque tiene ${clientes.length} cliente(s) asignado(s). Reasigna los clientes primero.`);
    return;
  }

  const ok = await confirmDialog({
    title:       'Eliminar vendedor',
    message:     `¿Eliminar a "${v.nombre}"? Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    type:        'danger',
  });

  if (!ok) return;

  try {
    await deleteDocById(COL, id);
    clearCache(COL);
    toast.success(`Vendedor "${v.nombre}" eliminado.`);
    await loadVendedores();
  } catch (e) {
    toast.error('Error al eliminar vendedor.');
  }
}

// ── Helpers ──────────────────────────────────────────────────
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function avatarColor(name) {
  const colors = ['#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#db2777'];
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// ── Exportar funciones globales ──────────────────────────────
export function exposeGlobals() {
  window.TRIXI = window.TRIXI || {};
  window.TRIXI.editVendedor          = openFormModal;
  window.TRIXI.toggleVendedorEstado  = toggleVendedorEstado;
  window.TRIXI.deleteVendedor        = deleteVendedor;
}

// ── Obtener todos (para uso externo) ─────────────────────────
export async function getVendedoresActivos() {
  const all = await getAllDocs(COL, { orderByField: 'codigo' });
  return all.filter(v => v.estado === 'activo');
}

export async function getAllVendedores() {
  return getAllDocs(COL, { orderByField: 'codigo' });
}
