// ============================================================
// TRIXI — clientes.js
// CRUD completo de clientes
// ============================================================

import { where, orderBy } from 'firebase/firestore';
import {
  createDoc, updateDocById, deleteDocById,
  getAllDocs, getDocById, existsByField, queryDocs,
  addDoc as fsAddDoc, serverTimestamp, clearCache,
} from './db.js';
import { toast, openModal, closeModal, confirmDialog, escapeHtml, statusBadge, renderEmptyState, Paginator } from './ui.js';
import { formatDate, debounce, sortBy as sortArr, filterTable, getInitials } from './utils.js';
import { getAllVendedores } from './vendedores.js';

const COL = 'clientes';
let allClientes   = [];
let allVendedores = [];
let filtered      = [];
let paginator     = new Paginator({ pageSize: 30 });
let sortField     = 'codigo';
let sortDir       = 'asc';
let searchQuery   = '';

// ── Inicializar módulo ────────────────────────────────────────
export async function initClientes() {
  renderSkeleton();
  await Promise.all([loadClientes(), loadVendedores()]);
  setupEvents();
}

async function loadClientes() {
  try {
    allClientes = await getAllDocs(COL, { orderByField: 'codigo' });
    filtered    = [...allClientes];
    paginator.total = filtered.length;
    renderTable();
    updateStats();
  } catch (e) {
    console.error(e);
    toast.error('Error al cargar clientes.');
  }
}

async function loadVendedores() {
  allVendedores = await getAllVendedores();
}

// ── Render ────────────────────────────────────────────────────
function renderSkeleton() {
  const tbody = document.getElementById('clientes-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="section-loader"><div class="spinner"></div><span>Cargando clientes...</span></div></td></tr>`;
}

function renderTable() {
  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;

  const sorted = sortArr(filtered, sortField, sortDir);
  const page   = paginator.slice(sorted);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="7">${renderEmptyState('🏢', 'Sin clientes', searchQuery ? 'Ningún cliente coincide con la búsqueda.' : 'Registra o importa clientes para comenzar.')}</td></tr>`;
    document.getElementById('clientes-pagination')?.replaceChildren();
    return;
  }

  const vendMap = Object.fromEntries(allVendedores.map(v => [v.id, v]));

  tbody.innerHTML = page.map(c => {
    const v = vendMap[c.vendedorId];
    return `
      <tr>
        <td class="td-code"><span class="code-chip">${escapeHtml(c.codigo)}</span></td>
        <td>
          <div class="font-medium">${escapeHtml(c.nombre)}</div>
          ${c.contacto ? `<div class="text-xs text-muted">${escapeHtml(c.contacto)}</div>` : ''}
        </td>
        <td class="text-sm">${escapeHtml(c.direccion || '—')}</td>
        <td class="text-sm">${escapeHtml(c.telefono || '—')}</td>
        <td>
          ${v
            ? `<span class="badge badge-blue">${escapeHtml(v.nombre)}</span>`
            : `<span class="badge badge-red">Sin asignar</span>`
          }
        </td>
        <td>${statusBadge(c.estado)}</td>
        <td class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.editCliente('${c.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.toggleClienteEstado('${c.id}')" title="${c.estado === 'activo' ? 'Desactivar' : 'Activar'}">
            ${c.estado === 'activo' ? '🔴' : '🟢'}
          </button>
          <button class="btn btn-ghost-danger btn-sm" onclick="window.TRIXI.deleteCliente('${c.id}')" title="Eliminar">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  paginator.renderControls('clientes-pagination', () => renderTable());
}

function updateStats() {
  const total    = allClientes.length;
  const activos  = allClientes.filter(c => c.estado === 'activo').length;
  const sinVend  = allClientes.filter(c => !c.vendedorId).length;
  setEl('cli-total',      total);
  setEl('cli-activos',    activos);
  setEl('cli-sin-vendedor', sinVend);
}

// ── Búsqueda y filtros ────────────────────────────────────────
function applyFilters() {
  let data = [...allClientes];

  if (searchQuery) data = filterTable(data, searchQuery, ['codigo', 'nombre', 'contacto', 'telefono']);

  const estado = document.getElementById('filter-cli-estado')?.value;
  if (estado && estado !== 'todos') data = data.filter(c => c.estado === estado);

  const vendId = document.getElementById('filter-cli-vendedor')?.value;
  if (vendId && vendId !== 'todos') {
    if (vendId === 'sin-asignar') data = data.filter(c => !c.vendedorId);
    else data = data.filter(c => c.vendedorId === vendId);
  }

  filtered = data;
  paginator.total = filtered.length;
  paginator.page  = 1;
  renderTable();
}

// ── Eventos ───────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-nuevo-cliente')?.addEventListener('click', () => openFormModal());

  const searchEl = document.getElementById('search-clientes');
  searchEl?.addEventListener('input', debounce(e => { searchQuery = e.target.value; applyFilters(); }, 250));

  document.getElementById('filter-cli-estado')?.addEventListener('change', applyFilters);
  document.getElementById('filter-cli-vendedor')?.addEventListener('change', applyFilters);

  // Poblar select de vendedores en filtros
  const filterVend = document.getElementById('filter-cli-vendedor');
  if (filterVend && allVendedores.length) {
    filterVend.innerHTML = `<option value="todos">Todos los vendedores</option>
      <option value="sin-asignar">Sin asignar</option>
      ${allVendedores.map(v => `<option value="${v.id}">${escapeHtml(v.nombre)}</option>`).join('')}`;
  }

  // Sort headers
  document.querySelectorAll('#clientes-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = field; sortDir = 'asc'; }
      document.querySelectorAll('#clientes-table th[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(`sort-${sortDir}`);
      renderTable();
    });
  });
}

// ── Modal Formulario ─────────────────────────────────────────
export async function openFormModal(id = null) {
  const isEdit = !!id;
  let data = { codigo: '', nombre: '', direccion: '', telefono: '', contacto: '', vendedorId: '', estado: 'activo' };

  if (isEdit) {
    data = await getDocById(COL, id);
    if (!data) { toast.error('Cliente no encontrado.'); return; }
  }

  const vendOptions = allVendedores
    .filter(v => v.estado === 'activo')
    .map(v => `<option value="${v.id}" ${data.vendedorId === v.id ? 'selected' : ''}>${escapeHtml(v.codigo)} — ${escapeHtml(v.nombre)}</option>`)
    .join('');

  const body = `
    <form id="cliente-form" novalidate>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Código <span class="required">*</span></label>
          <input class="form-control" id="cf-codigo" value="${escapeHtml(data.codigo)}" placeholder="CLI001" maxlength="20">
          <div class="form-error" id="cf-codigo-err"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="cf-estado">
            <option value="activo"   ${data.estado === 'activo'   ? 'selected' : ''}>Activo</option>
            <option value="inactivo" ${data.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Nombre / Empresa <span class="required">*</span></label>
        <input class="form-control" id="cf-nombre" value="${escapeHtml(data.nombre)}" placeholder="Empresa ABC" maxlength="150">
        <div class="form-error" id="cf-nombre-err"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Vendedor asignado <span class="required">*</span></label>
        <select class="form-control" id="cf-vendedor">
          <option value="">— Seleccionar vendedor —</option>
          ${vendOptions}
        </select>
        <div class="form-error" id="cf-vendedor-err"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Dirección</label>
        <input class="form-control" id="cf-direccion" value="${escapeHtml(data.direccion || '')}" placeholder="Ciudad, Zona, Dirección" maxlength="200">
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-control" id="cf-telefono" value="${escapeHtml(data.telefono || '')}" placeholder="70000000" maxlength="20">
        </div>
        <div class="form-group">
          <label class="form-label">Contacto</label>
          <input class="form-control" id="cf-contacto" value="${escapeHtml(data.contacto || '')}" placeholder="Pedro García" maxlength="100">
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-outline" onclick="window.TRIXI_MODAL.close()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-cli">
      <span class="btn-spinner"></span>
      ${isEdit ? 'Guardar cambios' : 'Crear cliente'}
    </button>
  `;

  const { el, close } = openModal({ title: isEdit ? 'Editar Cliente' : 'Nuevo Cliente', body, footer, size: 'modal-lg' });
  window.TRIXI_MODAL = { close };

  el.querySelector('#btn-save-cli')?.addEventListener('click', async () => {
    const codigo    = el.querySelector('#cf-codigo')?.value?.trim().toUpperCase();
    const nombre    = el.querySelector('#cf-nombre')?.value?.trim();
    const vendedorId = el.querySelector('#cf-vendedor')?.value;
    const direccion = el.querySelector('#cf-direccion')?.value?.trim();
    const telefono  = el.querySelector('#cf-telefono')?.value?.trim();
    const contacto  = el.querySelector('#cf-contacto')?.value?.trim();
    const estado    = el.querySelector('#cf-estado')?.value;

    ['codigo','nombre','vendedor'].forEach(f => el.querySelector(`#cf-${f}-err`).textContent = '');

    let valid = true;
    if (!codigo)    { el.querySelector('#cf-codigo-err').textContent = 'El código es requerido.'; valid = false; }
    if (!nombre)    { el.querySelector('#cf-nombre-err').textContent = 'El nombre es requerido.'; valid = false; }
    if (!vendedorId){ el.querySelector('#cf-vendedor-err').textContent = 'Debe asignar un vendedor.'; valid = false; }
    if (!valid) return;

    const dup = await existsByField(COL, 'codigo', codigo, id);
    if (dup) { el.querySelector('#cf-codigo-err').textContent = 'Este código ya existe.'; return; }

    const btn = el.querySelector('#btn-save-cli');
    btn.classList.add('loading'); btn.disabled = true;

    try {
      const prevVendedorId = isEdit ? data.vendedorId : null;
      const docData = { codigo, nombre, direccion, telefono, contacto, vendedorId, estado };

      if (isEdit) {
        await updateDocById(COL, id, docData);
        // Registrar cambio de vendedor si aplica
        if (prevVendedorId && prevVendedorId !== vendedorId) {
          await registrarCambioVendedor(id, prevVendedorId, vendedorId);
        }
        toast.success(`Cliente "${nombre}" actualizado.`);
      } else {
        await createDoc(COL, docData);
        toast.success(`Cliente "${nombre}" creado.`);
      }
      clearCache(COL);
      close();
      await loadClientes();
    } catch (e) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  });

  el.querySelector('#cf-codigo')?.focus();
}

// ── Registrar historial de cambio de vendedor ─────────────────
async function registrarCambioVendedor(clienteId, vendedorAnteriorId, vendedorNuevoId) {
  const { getUser } = await import('./auth.js');
  const uid = getUser()?.uid || 'desconocido';
  await createDoc('historialAsignaciones', {
    clienteId,
    vendedorAnteriorId,
    vendedorNuevoId,
    usuario: uid,
    fecha:   serverTimestamp(),
  });
}

// ── Toggle estado ─────────────────────────────────────────────
export async function toggleClienteEstado(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) return;
  const nuevoEstado = c.estado === 'activo' ? 'inactivo' : 'activo';
  const ok = await confirmDialog({
    title:       `${nuevoEstado === 'activo' ? 'Activar' : 'Desactivar'} cliente`,
    message:     `¿${nuevoEstado === 'activo' ? 'Activar' : 'Desactivar'} a "${c.nombre}"?`,
    confirmText: nuevoEstado === 'activo' ? 'Activar' : 'Desactivar',
    type:        nuevoEstado === 'inactivo' ? 'warning' : 'info',
  });
  if (!ok) return;
  try {
    await updateDocById(COL, id, { estado: nuevoEstado });
    clearCache(COL);
    toast.success(`Cliente ${nuevoEstado}.`);
    await loadClientes();
  } catch (e) { toast.error('Error al actualizar estado.'); }
}

// ── Eliminar ─────────────────────────────────────────────────
export async function deleteCliente(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) return;
  const ok = await confirmDialog({
    title:       'Eliminar cliente',
    message:     `¿Eliminar a "${c.nombre}"? Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    type:        'danger',
  });
  if (!ok) return;
  try {
    await deleteDocById(COL, id);
    clearCache(COL);
    toast.success(`Cliente "${c.nombre}" eliminado.`);
    await loadClientes();
  } catch (e) { toast.error('Error al eliminar cliente.'); }
}

// ── Helpers ──────────────────────────────────────────────────
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── Exportar globales ─────────────────────────────────────────
export function exposeGlobals() {
  window.TRIXI = window.TRIXI || {};
  window.TRIXI.editCliente         = openFormModal;
  window.TRIXI.toggleClienteEstado = toggleClienteEstado;
  window.TRIXI.deleteCliente       = deleteCliente;
}

// ── Para uso externo ──────────────────────────────────────────
export async function getClientesActivos() {
  const all = await getAllDocs(COL, { orderByField: 'codigo' });
  return all.filter(c => c.estado === 'activo');
}

export async function getAllClientes() {
  return getAllDocs(COL, { orderByField: 'codigo' });
}
