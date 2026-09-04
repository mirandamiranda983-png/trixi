// ============================================================
// TRIXI — asignaciones.js
// Gestión de asignaciones Clientes → Vendedores
// ============================================================

import { where } from 'firebase/firestore';
import {
  getAllDocs, updateDocById, createDoc, queryDocs,
  serverTimestamp, clearCache,
} from './db.js';
import { toast, openModal, confirmDialog, escapeHtml, renderEmptyState } from './ui.js';
import { getUser } from './auth.js';
import { debounce, groupBy, sortBy, filterTable, getInitials } from './utils.js';

let allVendedores = [];
let allClientes   = [];
let config        = { clientesMin: 15, clientesMax: 20 };
let selectedVendedorId = null;

// ── Inicializar módulo ────────────────────────────────────────
export async function initAsignaciones() {
  document.getElementById('asig-container').innerHTML = `<div class="section-loader"><div class="spinner"></div><span>Cargando asignaciones...</span></div>`;
  await loadData();
  renderModule();
  setupEvents();
}

async function loadData() {
  [allVendedores, allClientes] = await Promise.all([
    getAllDocs('vendedores', { orderByField: 'codigo' }),
    getAllDocs('clientes',   { orderByField: 'codigo' }),
  ]);
  // Cargar config
  try {
    const cfgDoc = await import('./configuracion.js').then(m => m.getConfig());
    config = {
      clientesMin: cfgDoc.clientesMinPorVendedor || 15,
      clientesMax: cfgDoc.clientesMaxPorVendedor || 20,
    };
  } catch {}
}

// ── Render principal ─────────────────────────────────────────
function renderModule() {
  const container = document.getElementById('asig-container');
  if (!container) return;

  const clientesByVend = groupBy(allClientes, 'vendedorId');
  const activos        = allVendedores.filter(v => v.estado === 'activo');
  const sinAsignar     = allClientes.filter(c => !c.vendedorId || c.vendedorId === '');

  // Advertencias
  const totalMin = activos.length * config.clientesMin;
  let alertHtml = '';
  if (allClientes.length < totalMin) {
    alertHtml = `
      <div class="alert alert-warning">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <div class="alert-title">Clientes insuficientes</div>
          No existen suficientes clientes para cumplir la configuración mínima de
          <strong>${config.clientesMin}</strong> clientes por vendedor.<br>
          Necesarios: <strong>${totalMin}</strong> | Existentes: <strong>${allClientes.length}</strong>
        </div>
      </div>`;
  }
  if (sinAsignar.length > 0) {
    alertHtml += `
      <div class="alert alert-warning">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <div class="alert-title">${sinAsignar.length} cliente(s) sin vendedor asignado</div>
          Estos clientes no participarán en la generación de reportes hasta ser asignados.
        </div>
      </div>`;
  }

  container.innerHTML = `
    ${alertHtml}
    <div class="d-flex items-center justify-between mb-4 gap-4" style="flex-wrap:wrap;">
      <div class="d-flex gap-3 items-center">
        <span class="badge badge-blue">Rango configurado: ${config.clientesMin}–${config.clientesMax} clientes/vendedor</span>
        <span class="badge badge-gray">Sin asignar: ${sinAsignar.length}</span>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline btn-sm" id="btn-asig-sin-vendedor">Ver sin asignar (${sinAsignar.length})</button>
        <button class="btn btn-primary btn-sm" id="btn-asig-auto">Asignación automática</button>
      </div>
    </div>
    <div class="assignment-grid">
      <div>
        <div class="search-wrapper mb-3">
          <span class="search-icon">🔍</span>
          <input class="form-control" id="search-asig-vend" placeholder="Buscar vendedor...">
        </div>
        <div class="assignment-list" id="asig-vend-list">
          ${renderVendedorList(activos, clientesByVend)}
        </div>
      </div>
      <div id="asig-detail-panel">
        ${renderDetailPlaceholder()}
      </div>
    </div>
  `;
}

function renderVendedorList(vendedores, clientesByVend) {
  if (!vendedores.length) return `<div class="text-center text-muted p-4">No hay vendedores activos.</div>`;
  return vendedores.map(v => {
    const count = (clientesByVend[v.id] || []).length;
    let countClass = 'badge-gray';
    if (count >= config.clientesMin && count <= config.clientesMax) countClass = 'badge-green';
    else if (count < config.clientesMin) countClass = 'badge-yellow';
    else if (count > config.clientesMax) countClass = 'badge-red';

    return `
      <div class="vendedor-card-sel ${selectedVendedorId === v.id ? 'selected' : ''}"
           data-id="${v.id}" onclick="window.TRIXI.selectVendedorAsig('${v.id}')">
        <div class="vc-avatar">${escapeHtml(getInitials(v.nombre))}</div>
        <div class="vc-info">
          <div class="vc-name">${escapeHtml(v.nombre)}</div>
          <div class="vc-sub">${escapeHtml(v.codigo)}</div>
        </div>
        <span class="badge ${countClass}">${count}</span>
      </div>
    `;
  }).join('');
}

function renderDetailPlaceholder() {
  return `
    <div class="card" style="height:100%;min-height:400px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:3rem;text-align:center;color:var(--text-muted);">
        <div style="font-size:3rem;margin-bottom:1rem;opacity:.3;">👈</div>
        <div style="font-size:1rem;font-weight:600;color:var(--text-secondary);">Selecciona un vendedor</div>
        <div style="font-size:.875rem;margin-top:.5rem;">Haz clic en un vendedor para ver y gestionar sus clientes asignados.</div>
      </div>
    </div>
  `;
}

// ── Panel de detalle de un vendedor ──────────────────────────
export function selectVendedorAsig(vendedorId) {
  selectedVendedorId = vendedorId;

  // Actualizar selección visual
  document.querySelectorAll('.vendedor-card-sel').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === vendedorId);
  });

  const v = allVendedores.find(x => x.id === vendedorId);
  if (!v) return;

  const clientesAsignados = allClientes.filter(c => c.vendedorId === vendedorId);
  const clientesLibres    = allClientes.filter(c => !c.vendedorId || c.vendedorId === '');

  const panel = document.getElementById('asig-detail-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(v.nombre)}</div>
          <div class="text-xs text-muted">${escapeHtml(v.codigo)} · ${clientesAsignados.length} clientes asignados</div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-primary btn-sm" id="btn-asig-cliente">+ Asignar cliente</button>
        </div>
      </div>
      <div class="card-body-sm">
        ${clientesAsignados.length === 0
          ? `<div class="text-center text-muted p-6">Sin clientes asignados. Usa el botón de arriba para asignar.</div>`
          : `<div class="table-wrapper">
              <table class="data-table">
                <thead><tr>
                  <th>Código</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  ${clientesAsignados.map(c => `
                    <tr>
                      <td class="td-code"><span class="code-chip">${escapeHtml(c.codigo)}</span></td>
                      <td>
                        <div class="font-medium">${escapeHtml(c.nombre)}</div>
                        ${c.contacto ? `<div class="text-xs text-muted">${escapeHtml(c.contacto)}</div>` : ''}
                      </td>
                      <td class="text-sm">${escapeHtml(c.direccion || '—')}</td>
                      <td><span class="badge badge-${c.estado === 'activo' ? 'activo' : 'inactivo'} badge-dot">${escapeHtml(c.estado)}</span></td>
                      <td class="td-actions">
                        <button class="btn btn-ghost btn-sm" onclick="window.TRIXI.cambiarVendedor('${c.id}')" title="Cambiar vendedor">🔄</button>
                        <button class="btn btn-ghost-danger btn-sm" onclick="window.TRIXI.desasignarCliente('${c.id}')" title="Desasignar">❌</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>
    </div>
  `;

  // Botón asignar
  document.getElementById('btn-asig-cliente')?.addEventListener('click', () => openAsignarModal(vendedorId, clientesLibres));
}

// ── Modal: Asignar cliente a vendedor ────────────────────────
function openAsignarModal(vendedorId, clientesLibres) {
  if (!clientesLibres.length) {
    toast.info('No hay clientes sin asignar disponibles.');
    return;
  }

  const body = `
    <div class="form-group">
      <label class="form-label">Seleccionar cliente</label>
      <select class="form-control" id="asig-cli-select" size="8" style="height:auto;">
        ${clientesLibres.map(c => `<option value="${c.id}">${escapeHtml(c.codigo)} — ${escapeHtml(c.nombre)}</option>`).join('')}
      </select>
      <div class="form-text">${clientesLibres.length} cliente(s) sin asignar disponibles.</div>
    </div>
  `;

  const footer = `
    <button class="btn btn-outline" onclick="window.TRIXI_MODAL.close()">Cancelar</button>
    <button class="btn btn-primary" id="btn-confirm-asig">Asignar</button>
  `;

  const { el, close } = openModal({ title: 'Asignar cliente', body, footer, size: 'modal-md' });
  window.TRIXI_MODAL = { close };

  el.querySelector('#btn-confirm-asig')?.addEventListener('click', async () => {
    const clienteId = el.querySelector('#asig-cli-select')?.value;
    if (!clienteId) { toast.warning('Selecciona un cliente.'); return; }
    try {
      await updateDocById('clientes', clienteId, { vendedorId });
      clearCache('clientes');
      toast.success('Cliente asignado.');
      close();
      await loadData();
      renderModule();
      selectVendedorAsig(vendedorId);
    } catch (e) { toast.error('Error al asignar: ' + e.message); }
  });
}

// ── Cambiar vendedor de un cliente ────────────────────────────
export async function cambiarVendedor(clienteId) {
  const c = allClientes.find(x => x.id === clienteId);
  if (!c) return;

  const activos = allVendedores.filter(v => v.estado === 'activo' && v.id !== c.vendedorId);

  const body = `
    <div class="form-group">
      <label class="form-label">Nuevo vendedor para <strong>${escapeHtml(c.nombre)}</strong></label>
      <select class="form-control" id="cambio-vend-select">
        <option value="">— Seleccionar vendedor —</option>
        ${activos.map(v => `<option value="${v.id}">${escapeHtml(v.codigo)} — ${escapeHtml(v.nombre)}</option>`).join('')}
      </select>
    </div>
    <div class="alert alert-info">
      <span class="alert-icon">ℹ️</span>
      <div class="alert-body">El cambio se registrará en el historial de asignaciones.</div>
    </div>
  `;

  const footer = `
    <button class="btn btn-outline" onclick="window.TRIXI_MODAL.close()">Cancelar</button>
    <button class="btn btn-primary" id="btn-confirm-cambio">Cambiar vendedor</button>
  `;

  const { el, close } = openModal({ title: 'Cambiar vendedor', body, footer, size: 'modal-md' });
  window.TRIXI_MODAL = { close };

  el.querySelector('#btn-confirm-cambio')?.addEventListener('click', async () => {
    const nuevoVendedorId = el.querySelector('#cambio-vend-select')?.value;
    if (!nuevoVendedorId) { toast.warning('Selecciona un vendedor.'); return; }

    try {
      const prevVendedorId = c.vendedorId;
      await updateDocById('clientes', clienteId, { vendedorId: nuevoVendedorId });

      // Registrar historial
      const uid = getUser()?.uid || 'desconocido';
      await createDoc('historialAsignaciones', {
        clienteId,
        clienteNombre: c.nombre,
        vendedorAnteriorId: prevVendedorId,
        vendedorNuevoId:    nuevoVendedorId,
        usuario: uid,
        fecha:   serverTimestamp(),
      });

      clearCache('clientes');
      toast.success('Vendedor actualizado.');
      close();
      await loadData();
      renderModule();
      if (selectedVendedorId) selectVendedorAsig(selectedVendedorId);
    } catch (e) { toast.error('Error: ' + e.message); }
  });
}

// ── Desasignar cliente ────────────────────────────────────────
export async function desasignarCliente(clienteId) {
  const c = allClientes.find(x => x.id === clienteId);
  if (!c) return;

  const ok = await confirmDialog({
    title:       'Desasignar cliente',
    message:     `¿Quitar a "${c.nombre}" de su vendedor actual? El cliente quedará sin asignar.`,
    confirmText: 'Desasignar',
    type:        'warning',
  });

  if (!ok) return;

  try {
    await updateDocById('clientes', clienteId, { vendedorId: '' });
    clearCache('clientes');
    toast.success('Cliente desasignado.');
    await loadData();
    renderModule();
    if (selectedVendedorId) selectVendedorAsig(selectedVendedorId);
  } catch (e) { toast.error('Error al desasignar.'); }
}

// ── Clientes sin vendedor ─────────────────────────────────────
export function mostrarSinVendedor() {
  const sinAsignar = allClientes.filter(c => !c.vendedorId || c.vendedorId === '');

  const body = sinAsignar.length === 0
    ? `<div class="text-center text-muted p-6">✅ Todos los clientes tienen vendedor asignado.</div>`
    : `<div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Código</th><th>Cliente</th><th>Dirección</th><th></th></tr></thead>
          <tbody>
            ${sinAsignar.map(c => `
              <tr>
                <td class="td-code"><span class="code-chip">${escapeHtml(c.codigo)}</span></td>
                <td>${escapeHtml(c.nombre)}</td>
                <td>${escapeHtml(c.direccion || '—')}</td>
                <td><button class="btn btn-primary btn-sm" onclick="window.TRIXI.cambiarVendedor('${c.id}')">Asignar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

  openModal({ title: `Clientes sin vendedor (${sinAsignar.length})`, body, size: 'modal-lg' });
}

// ── Asignación automática (distribución equitativa) ──────────
export async function asignacionAutomatica() {
  const sinAsignar = allClientes.filter(c => !c.vendedorId || c.vendedorId === '');
  const activos    = allVendedores.filter(v => v.estado === 'activo');

  if (!sinAsignar.length) {
    toast.info('No hay clientes sin asignar para distribuir.');
    return;
  }

  if (!activos.length) {
    toast.warning('No hay vendedores activos.');
    return;
  }

  const ok = await confirmDialog({
    title:       'Asignación automática',
    message:     `Se distribuirán ${sinAsignar.length} cliente(s) sin asignar entre ${activos.length} vendedor(es) activo(s) de forma equitativa. ¿Continuar?`,
    confirmText: 'Distribuir',
    type:        'info',
  });

  if (!ok) return;

  // Calcular cuántos clientes tiene cada vendedor
  const counts = Object.fromEntries(activos.map(v => [v.id, allClientes.filter(c => c.vendedorId === v.id).length]));

  // Asignar de forma round-robin empezando por el que tiene menos
  const sorted = [...activos].sort((a, b) => counts[a.id] - counts[b.id]);
  const ops    = [];

  for (let i = 0; i < sinAsignar.length; i++) {
    const v = sorted[i % sorted.length];
    const c = sinAsignar[i];
    ops.push({ clienteId: c.id, vendedorId: v.id });
    counts[v.id]++;
  }

  // Guardar
  try {
    for (const op of ops) {
      await updateDocById('clientes', op.clienteId, { vendedorId: op.vendedorId });
    }
    clearCache('clientes');
    toast.success(`${ops.length} cliente(s) asignados automáticamente.`);
    await loadData();
    renderModule();
  } catch (e) {
    toast.error('Error en la asignación automática: ' + e.message);
  }
}

// ── Setup eventos ─────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-asig-sin-vendedor')?.addEventListener('click', mostrarSinVendedor);
  document.getElementById('btn-asig-auto')?.addEventListener('click', asignacionAutomatica);

  const searchEl = document.getElementById('search-asig-vend');
  searchEl?.addEventListener('input', debounce(e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.vendedor-card-sel').forEach(el => {
      const txt = el.textContent.toLowerCase();
      el.style.display = txt.includes(q) ? '' : 'none';
    });
  }, 200));
}

// ── Exportar globales ─────────────────────────────────────────
export function exposeGlobals() {
  window.TRIXI = window.TRIXI || {};
  window.TRIXI.selectVendedorAsig = selectVendedorAsig;
  window.TRIXI.cambiarVendedor    = cambiarVendedor;
  window.TRIXI.desasignarCliente  = desasignarCliente;
}
