// ============================================================
// TRIXI — productos.js
// CRUD completo de productos con rangos de cantidad
// ============================================================

import {
  createDoc, updateDocById, deleteDocById,
  getAllDocs, getDocById, existsByField, clearCache,
} from './db.js';
import { toast, openModal, confirmDialog, escapeHtml, statusBadge, renderEmptyState, Paginator } from './ui.js';
import { formatDate, formatCurrency, debounce, sortBy as sortArr, filterTable, isValidPrice, isValidRange } from './utils.js';

const COL = 'productos';
let allProductos = [];
let filtered     = [];
let paginator    = new Paginator({ pageSize: 30 });
let sortField    = 'codigo';
let sortDir      = 'asc';
let searchQuery  = '';
let allCategorias = [];

// ── Inicializar módulo ────────────────────────────────────────
export async function initProductos() {
  renderSkeleton();
  await loadProductos();
  setupEvents();
}

async function loadProductos() {
  try {
    allProductos  = await getAllDocs(COL, { orderByField: 'codigo' });
    filtered      = [...allProductos];
    allCategorias = [...new Set(allProductos.map(p => p.categoria).filter(Boolean))].sort();
    paginator.total = filtered.length;
    renderTable();
    updateStats();
    poblarFiltroCategoria();
  } catch (e) {
    console.error(e);
    toast.error('Error al cargar productos.');
  }
}

// ── Render ────────────────────────────────────────────────────
function renderSkeleton() {
  const tbody = document.getElementById('productos-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8"><div class="section-loader"><div class="spinner"></div><span>Cargando productos...</span></div></td></tr>`;
}

function renderTable() {
  const tbody = document.getElementById('productos-tbody');
  if (!tbody) return;

  // Leer config de moneda
  const config = window.TRIXI_CONFIG || { moneda: 'Q', decimales: 2 };

  const sorted = sortArr(filtered, sortField, sortDir);
  const page   = paginator.slice(sorted);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="8">${renderEmptyState('📦', 'Sin productos', searchQuery ? 'Ningún producto coincide.' : 'Registra o importa productos para comenzar.')}</td></tr>`;
    document.getElementById('productos-pagination')?.replaceChildren();
    return;
  }

  tbody.innerHTML = page.map(p => `
    <tr>
      <td class="td-code"><span class="code-chip">${escapeHtml(p.codigo)}</span></td>
      <td>
        <div class="font-medium">${escapeHtml(p.nombre)}</div>
        <div class="text-xs text-muted">${escapeHtml(p.unidadMedida || '—')}</div>
      </td>
      <td><span class="badge badge-gray">${escapeHtml(p.categoria || '—')}</span></td>
      <td class="td-number font-semibold">${formatCurrency(p.precio, config.moneda, config.decimales)}</td>
      <td class="text-center">
        <span class="text-sm">${p.cantidadMinima ?? '—'} – ${p.cantidadMaxima ?? '—'}</span>
      </td>
      <td>${statusBadge(p.estado)}</td>
      <td class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.editProducto('${p.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.toggleProductoEstado('${p.id}')" title="${p.estado === 'activo' ? 'Desactivar' : 'Activar'}">
          ${p.estado === 'activo' ? '🔴' : '🟢'}
        </button>
        <button class="btn btn-ghost-danger btn-sm" onclick="window.TRIXI.deleteProducto('${p.id}')" title="Eliminar">🗑️</button>
      </td>
    </tr>
  `).join('');

  paginator.renderControls('productos-pagination', () => renderTable());
}

function updateStats() {
  const total   = allProductos.length;
  const activos = allProductos.filter(p => p.estado === 'activo').length;
  const cats    = new Set(allProductos.map(p => p.categoria).filter(Boolean)).size;
  setEl('prod-total',   total);
  setEl('prod-activos', activos);
  setEl('prod-cats',    cats);
}

function poblarFiltroCategoria() {
  const sel = document.getElementById('filter-prod-categoria');
  if (!sel) return;
  sel.innerHTML = `<option value="todos">Todas las categorías</option>
    ${allCategorias.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}`;
}

// ── Búsqueda y filtros ────────────────────────────────────────
function applyFilters() {
  let data = [...allProductos];
  if (searchQuery) data = filterTable(data, searchQuery, ['codigo', 'nombre', 'categoria']);

  const estado = document.getElementById('filter-prod-estado')?.value;
  if (estado && estado !== 'todos') data = data.filter(p => p.estado === estado);

  const cat = document.getElementById('filter-prod-categoria')?.value;
  if (cat && cat !== 'todos') data = data.filter(p => p.categoria === cat);

  filtered = data;
  paginator.total = filtered.length;
  paginator.page  = 1;
  renderTable();
}

// ── Eventos ───────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-nuevo-producto')?.addEventListener('click', () => openFormModal());

  const searchEl = document.getElementById('search-productos');
  searchEl?.addEventListener('input', debounce(e => { searchQuery = e.target.value; applyFilters(); }, 250));

  document.getElementById('filter-prod-estado')?.addEventListener('change', applyFilters);
  document.getElementById('filter-prod-categoria')?.addEventListener('change', applyFilters);

  document.querySelectorAll('#productos-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = field; sortDir = 'asc'; }
      document.querySelectorAll('#productos-table th[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(`sort-${sortDir}`);
      renderTable();
    });
  });
}

// ── Modal Formulario ─────────────────────────────────────────
export async function openFormModal(id = null) {
  const isEdit = !!id;
  let data = { codigo: '', nombre: '', categoria: '', precio: '', unidadMedida: 'unidad', cantidadMinima: 1, cantidadMaxima: 20, estado: 'activo' };

  if (isEdit) {
    data = await getDocById(COL, id);
    if (!data) { toast.error('Producto no encontrado.'); return; }
  }

  const catOptions = allCategorias
    .map(c => `<option value="${escapeHtml(c)}" ${data.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');

  const body = `
    <form id="producto-form" novalidate>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Código <span class="required">*</span></label>
          <input class="form-control" id="pf-codigo" value="${escapeHtml(data.codigo)}" placeholder="PROD001" maxlength="30">
          <div class="form-error" id="pf-codigo-err"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="pf-estado">
            <option value="activo"   ${data.estado === 'activo'   ? 'selected' : ''}>Activo</option>
            <option value="inactivo" ${data.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Nombre del producto <span class="required">*</span></label>
        <input class="form-control" id="pf-nombre" value="${escapeHtml(data.nombre)}" placeholder="Producto A" maxlength="150">
        <div class="form-error" id="pf-nombre-err"></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <input class="form-control" id="pf-categoria" list="cat-list" value="${escapeHtml(data.categoria || '')}" placeholder="Categoría 1" maxlength="80">
          <datalist id="cat-list">${catOptions}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Unidad de medida</label>
          <input class="form-control" id="pf-unidad" list="unit-list" value="${escapeHtml(data.unidadMedida || 'unidad')}" placeholder="unidad" maxlength="30">
          <datalist id="unit-list">
            <option>unidad</option><option>caja</option><option>bolsa</option>
            <option>kg</option><option>litro</option><option>docena</option><option>paquete</option>
          </datalist>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Precio unitario <span class="required">*</span></label>
        <input class="form-control" id="pf-precio" type="number" min="0" step="0.01" value="${data.precio ?? ''}" placeholder="25.00">
        <div class="form-error" id="pf-precio-err"></div>
        <div class="form-text">Este precio se usará automáticamente al generar reportes.</div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Cantidad mínima <span class="required">*</span></label>
          <input class="form-control" id="pf-cantmin" type="number" min="1" value="${data.cantidadMinima ?? 1}" placeholder="1">
          <div class="form-error" id="pf-cant-err"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Cantidad máxima <span class="required">*</span></label>
          <input class="form-control" id="pf-cantmax" type="number" min="1" value="${data.cantidadMaxima ?? 20}" placeholder="20">
        </div>
      </div>
      <div class="alert alert-info" style="margin-top:4px;">
        <span class="alert-icon">ℹ️</span>
        <div class="alert-body">Si no configuras un rango específico, se usará el rango general del sistema.</div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-outline" onclick="window.TRIXI_MODAL.close()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-prod">
      <span class="btn-spinner"></span>
      ${isEdit ? 'Guardar cambios' : 'Crear producto'}
    </button>
  `;

  const { el, close } = openModal({ title: isEdit ? 'Editar Producto' : 'Nuevo Producto', body, footer, size: 'modal-lg' });
  window.TRIXI_MODAL = { close };

  el.querySelector('#btn-save-prod')?.addEventListener('click', async () => {
    const codigo    = el.querySelector('#pf-codigo')?.value?.trim().toUpperCase();
    const nombre    = el.querySelector('#pf-nombre')?.value?.trim();
    const categoria = el.querySelector('#pf-categoria')?.value?.trim();
    const unidad    = el.querySelector('#pf-unidad')?.value?.trim() || 'unidad';
    const precio    = parseFloat(el.querySelector('#pf-precio')?.value);
    const cantMin   = parseInt(el.querySelector('#pf-cantmin')?.value);
    const cantMax   = parseInt(el.querySelector('#pf-cantmax')?.value);
    const estado    = el.querySelector('#pf-estado')?.value;

    ['codigo','nombre','precio','cant'].forEach(f => el.querySelector(`#pf-${f}-err`).textContent = '');

    let valid = true;
    if (!codigo)              { el.querySelector('#pf-codigo-err').textContent = 'El código es requerido.'; valid = false; }
    if (!nombre)              { el.querySelector('#pf-nombre-err').textContent = 'El nombre es requerido.'; valid = false; }
    if (!isValidPrice(precio)){ el.querySelector('#pf-precio-err').textContent = 'El precio debe ser un número >= 0.'; valid = false; }
    if (!isValidRange(cantMin, cantMax)) { el.querySelector('#pf-cant-err').textContent = 'Rango de cantidades inválido (mín > 0, máx >= mín).'; valid = false; }
    if (!valid) return;

    const dup = await existsByField(COL, 'codigo', codigo, id);
    if (dup) { el.querySelector('#pf-codigo-err').textContent = 'Este código ya existe.'; return; }

    const btn = el.querySelector('#btn-save-prod');
    btn.classList.add('loading'); btn.disabled = true;

    try {
      const docData = { codigo, nombre, categoria, precio, unidadMedida: unidad, cantidadMinima: cantMin, cantidadMaxima: cantMax, estado };
      if (isEdit) {
        await updateDocById(COL, id, docData);
        toast.success(`Producto "${nombre}" actualizado.`);
      } else {
        await createDoc(COL, docData);
        toast.success(`Producto "${nombre}" creado.`);
      }
      clearCache(COL);
      close();
      await loadProductos();
    } catch (e) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  });

  el.querySelector('#pf-codigo')?.focus();
}

// ── Toggle estado ─────────────────────────────────────────────
export async function toggleProductoEstado(id) {
  const p = allProductos.find(x => x.id === id);
  if (!p) return;
  const nuevoEstado = p.estado === 'activo' ? 'inactivo' : 'activo';
  const ok = await confirmDialog({
    title:       `${nuevoEstado === 'activo' ? 'Activar' : 'Desactivar'} producto`,
    message:     `¿${nuevoEstado === 'activo' ? 'Activar' : 'Desactivar'} "${p.nombre}"?`,
    confirmText: nuevoEstado === 'activo' ? 'Activar' : 'Desactivar',
    type:        'warning',
  });
  if (!ok) return;
  try {
    await updateDocById(COL, id, { estado: nuevoEstado });
    clearCache(COL);
    toast.success(`Producto ${nuevoEstado}.`);
    await loadProductos();
  } catch (e) { toast.error('Error al actualizar estado.'); }
}

// ── Eliminar ─────────────────────────────────────────────────
export async function deleteProducto(id) {
  const p = allProductos.find(x => x.id === id);
  if (!p) return;
  const ok = await confirmDialog({
    title:       'Eliminar producto',
    message:     `¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    type:        'danger',
  });
  if (!ok) return;
  try {
    await deleteDocById(COL, id);
    clearCache(COL);
    toast.success(`Producto "${p.nombre}" eliminado.`);
    await loadProductos();
  } catch (e) { toast.error('Error al eliminar producto.'); }
}

// ── Helpers ──────────────────────────────────────────────────
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── Exportar globales ─────────────────────────────────────────
export function exposeGlobals() {
  window.TRIXI = window.TRIXI || {};
  window.TRIXI.editProducto         = openFormModal;
  window.TRIXI.toggleProductoEstado = toggleProductoEstado;
  window.TRIXI.deleteProducto       = deleteProducto;
}

// ── Para uso externo ──────────────────────────────────────────
export async function getProductosActivos() {
  const all = await getAllDocs(COL, { orderByField: 'codigo' });
  return all.filter(p => p.estado === 'activo' && p.precio != null && !isNaN(p.precio));
}

export async function getAllProductos() {
  return getAllDocs(COL, { orderByField: 'codigo' });
}
