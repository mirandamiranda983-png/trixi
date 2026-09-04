// ============================================================
// TRIXI — reportes.js
// Historial de reportes y vista detallada por vendedor/general
// ============================================================

import { getAllDocs, getSubcollection, deleteDocById, queryDocs, clearCache } from './db.js';
import { where, orderBy, doc, collection, writeBatch, getDocs } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { toast, openModal, confirmDialog, escapeHtml, renderEmptyState, showLoading, hideLoading, Paginator } from './ui.js';
import { formatDate, formatDateTime, formatCurrency, groupBy, sumBy, sortBy, filterTable } from './utils.js';
import { exportReportePDF, exportReporteExcel } from './exportacion.js';

const COL = 'reportes';
let allReportes = [];
let filtered    = [];
let paginator   = new Paginator({ pageSize: 20 });
let searchQuery = '';

// ── Inicializar módulo ────────────────────────────────────────
export async function initReportes() {
  renderSkeleton();
  await loadReportes();
  setupEvents();
}

async function loadReportes() {
  try {
    allReportes = await getAllDocs(COL, { orderByField: 'fechaReporte' });
    // Ordenar descendente (más recientes primero)
    allReportes.sort((a, b) => b.fechaReporte.localeCompare(a.fechaReporte));
    filtered = [...allReportes];
    paginator.total = filtered.length;
    renderTable();
  } catch (e) {
    console.error(e);
    toast.error('Error al cargar el historial de reportes.');
  }
}

function renderSkeleton() {
  const container = document.getElementById('reportes-list');
  if (container) container.innerHTML = `<div class="section-loader"><div class="spinner"></div><span>Cargando historial...</span></div>`;
}

function renderTable() {
  const container = document.getElementById('reportes-list');
  if (!container) return;

  const cfg = window.TRIXI_CONFIG || { moneda: 'Q', decimales: 2 };
  const page = paginator.slice(filtered);

  if (!page.length) {
    container.innerHTML = renderEmptyState('📂', 'Sin reportes', searchQuery ? 'No hay reportes que coincidan con la búsqueda.' : 'Aún no se han generado reportes diarios.');
    document.getElementById('reportes-pagination')?.replaceChildren();
    return;
  }

  container.innerHTML = page.map(r => {
    const [y, m, d] = r.fechaReporte.split('-');
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDate().toString().padStart(2, '0');
    const mon = dateObj.toLocaleString('es-GT', { month: 'short' });

    const totalVend = r.resumenVendedores ? r.resumenVendedores.length : 0;
    
    return `
      <div class="reporte-card" onclick="window.TRIXI.verReporte('${r.id}')">
        <div class="reporte-date-badge">
          <div class="reporte-date-day">${day}</div>
          <div class="reporte-date-mon">${mon}</div>
        </div>
        <div class="reporte-info">
          <div class="font-semibold text-lg">Reporte del ${formatDate(dateObj)}</div>
          <div class="text-sm text-muted mt-1">
            Generado el ${formatDateTime(r.fechaCreacion)} · ${totalVend} vendedores
          </div>
        </div>
        <div class="reporte-total">
          ${formatCurrency(r.totalGeneral, cfg.moneda, cfg.decimales)}
        </div>
        <div class="ml-4 text-muted">›</div>
      </div>
    `;
  }).join('');

  paginator.renderControls('reportes-pagination', () => renderTable());
}

// ── Búsqueda ──────────────────────────────────────────────────
function applyFilters() {
  let data = [...allReportes];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    data = data.filter(r => r.fechaReporte.includes(q) || formatDate(r.fechaReporte).toLowerCase().includes(q));
  }
  filtered = data;
  paginator.total = filtered.length;
  paginator.page  = 1;
  renderTable();
}

function setupEvents() {
  const searchEl = document.getElementById('search-reportes');
  searchEl?.addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFilters();
  });
}

// ── Ver Reporte ───────────────────────────────────────────────
export async function verReporte(id) {
  const reporte = allReportes.find(r => r.id === id);
  if (!reporte) return;

  showLoading('Cargando detalles...');
  try {
    const detalles = await getSubcollection(COL, id, 'detalles');
    hideLoading();
    openReporteModal(reporte, detalles);
  } catch (e) {
    hideLoading();
    toast.error('Error al cargar detalles del reporte.');
  }
}

function openReporteModal(reporte, detalles) {
  const cfg = window.TRIXI_CONFIG || { moneda: 'Q', decimales: 2 };
  const { moneda = 'Q', decimales = 2 } = cfg;

  const byVendedor = groupBy(detalles, 'vendedorId');
  const vendedores = reporte.resumenVendedores || [];

  // Ordenar vendedores por nombre
  vendedores.sort((a, b) => (a.vendedorNombre || '').localeCompare(b.vendedorNombre || ''));

  const headerHtml = `
    <div class="d-flex justify-between items-center w-full">
      <div>
        <div class="modal-title">Reporte Diario — ${formatDate(reporte.fechaReporte)}</div>
        <div class="text-xs text-muted mt-1">Total: ${formatCurrency(reporte.totalGeneral, moneda, decimales)} | Semilla: ${escapeHtml(reporte.seed)}</div>
      </div>
      <div class="d-flex gap-2 mr-6">
        <button class="btn btn-outline btn-sm" id="btn-export-pdf" title="Exportar a PDF">📄 PDF</button>
        <button class="btn btn-outline btn-sm" id="btn-export-excel" title="Exportar a Excel">📊 Excel</button>
      </div>
    </div>
  `;

  // Selector de vista (General o por Vendedor)
  let body = `
    <div class="tabs" id="reporte-tabs">
      <button class="tab-btn active" data-tab="general">Resumen General</button>
      ${vendedores.map(v => `<button class="tab-btn" data-tab="vendedor-${v.vendedorId}">${escapeHtml(v.vendedorNombre)}</button>`).join('')}
    </div>
    
    <div id="reporte-tab-content">
      ${renderTabGeneral(reporte, vendedores, detalles, cfg)}
    </div>
  `;

  const footer = `
    <button class="btn btn-ghost-danger" id="btn-delete-reporte" style="margin-right:auto;">Eliminar reporte</button>
    <button class="btn btn-primary" onclick="window.TRIXI_MODAL.close()">Cerrar</button>
  `;

  const { el, close, getBody } = openModal({ title: '', body, footer, size: 'modal-xl' });
  // Inyectar header custom
  el.querySelector('.modal-header').innerHTML = headerHtml + `<button class="modal-close" onclick="window.TRIXI_MODAL.close()">✕</button>`;
  
  window.TRIXI_MODAL = { close };

  // Lógica de Tabs
  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const content = el.querySelector('#reporte-tab-content');
      
      if (tab === 'general') {
        content.innerHTML = renderTabGeneral(reporte, vendedores, detalles, cfg);
      } else {
        const vendId = tab.replace('vendedor-', '');
        content.innerHTML = renderTabVendedor(vendId, byVendedor[vendId] || [], cfg);
      }
    });
  });

  // Exportar PDF
  el.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
    exportReportePDF(reporte, detalles, cfg);
  });

  // Exportar Excel
  el.querySelector('#btn-export-excel')?.addEventListener('click', () => {
    exportReporteExcel(reporte, detalles, cfg);
  });

  // Eliminar reporte
  el.querySelector('#btn-delete-reporte')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Eliminar reporte',
      message: '¿Estás seguro de eliminar este reporte histórico? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      type: 'danger'
    });
    if (ok) {
      showLoading('Eliminando...');
      try {
        const detColl = collection(db, `reportes/${reporte.id}/detalles`);
        const snap = await getDocs(detColl);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'reportes', reporte.id));
        await batch.commit();
        
        clearCache(COL);
        toast.success('Reporte eliminado.');
        close();
        await loadReportes();
      } catch(e) {
        toast.error('Error al eliminar.');
      } finally {
        hideLoading();
      }
    }
  });
}

function renderTabGeneral(reporte, vendedores, detalles, cfg) {
  const totalUnidades = sumBy(detalles, 'cantidad');
  const totalProductos = new Set(detalles.map(d => d.productoId)).size;
  const totalClientes = new Set(detalles.map(d => d.clienteId)).size;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">👥</div>
        <div class="stat-info">
          <div class="stat-label">Vendedores</div>
          <div class="stat-value">${vendedores.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">🏢</div>
        <div class="stat-info">
          <div class="stat-label">Clientes impactados</div>
          <div class="stat-value">${totalClientes}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-purple">📦</div>
        <div class="stat-info">
          <div class="stat-label">Unidades Vendidas</div>
          <div class="stat-value">${totalUnidades.toLocaleString()}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-yellow">💰</div>
        <div class="stat-info">
          <div class="stat-label">Total Ingresos</div>
          <div class="stat-value" style="font-size:1.5rem">${formatCurrency(reporte.totalGeneral, cfg.moneda, cfg.decimales)}</div>
        </div>
      </div>
    </div>
    
    <h4 class="mb-3 mt-6">Resumen por Vendedor</h4>
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Vendedor</th>
            <th class="text-center">Clientes</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${vendedores.map(v => `
            <tr>
              <td class="td-code"><span class="code-chip">${escapeHtml(v.vendedorCodigo)}</span></td>
              <td class="font-medium">${escapeHtml(v.vendedorNombre)}</td>
              <td class="text-center">${v.numClientes}</td>
              <td class="text-right font-semibold">${formatCurrency(v.subtotalVendedor, cfg.moneda, cfg.decimales)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTabVendedor(vendedorId, detalles, cfg) {
  if (!detalles || !detalles.length) return `<div class="p-6 text-center text-muted">Sin detalles para este vendedor.</div>`;

  const totalVendedor = sumBy(detalles, 'subtotal');
  const byCliente = groupBy(detalles, 'clienteId');

  let html = `
    <div class="d-flex justify-between items-center mb-4 p-4 rounded" style="background:var(--color-primary-bg); border:1px solid var(--color-primary-border);">
      <div class="font-semibold text-primary-c">Total Vendedor:</div>
      <div class="font-bold text-xl text-primary-c">${formatCurrency(totalVendedor, cfg.moneda, cfg.decimales)}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Precio</th>
            <th class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
  `;

  Object.entries(byCliente).forEach(([cliId, cDetalles]) => {
    const cliNombre = cDetalles[0].clienteNombre;
    const cliCodigo = cDetalles[0].clienteCodigo;
    const cliTotal  = sumBy(cDetalles, 'subtotal');

    html += `
      <tr class="client-group-header">
        <td colspan="4"><strong>${escapeHtml(cliCodigo)} — ${escapeHtml(cliNombre)}</strong></td>
        <td class="text-right"><strong>${formatCurrency(cliTotal, cfg.moneda, cfg.decimales)}</strong></td>
      </tr>
    `;

    cDetalles.forEach(d => {
      html += `
        <tr>
          <td class="td-code pl-6"><span class="code-chip">${escapeHtml(d.codigoProducto)}</span></td>
          <td>${escapeHtml(d.productoNombre)}</td>
          <td class="text-right">${d.cantidad.toLocaleString()}</td>
          <td class="text-right">${formatCurrency(d.precioUnitario, cfg.moneda, cfg.decimales)}</td>
          <td class="text-right">${formatCurrency(d.subtotal, cfg.moneda, cfg.decimales)}</td>
        </tr>
      `;
    });
  });

  html += `</tbody></table></div>`;
  return html;
}

// ── Exportar globales ─────────────────────────────────────────
export function exposeGlobals() {
  window.TRIXI = window.TRIXI || {};
  window.TRIXI.verReporte = verReporte;
}
