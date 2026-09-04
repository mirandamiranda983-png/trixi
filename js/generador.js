// ============================================================
// TRIXI — generador.js
// Algoritmo de generación diaria de reportes con semilla
// ============================================================

import {
  getAllDocs, getDocById, createDoc, addSubDoc, queryDocs,
  batchWrite, docRef, colRef, serverTimestamp, clearCache,
} from './db.js';
import { where, orderBy, doc, collection, writeBatch } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { toast, openModal, closeModal, confirmDialog, escapeHtml, showLoading, hideLoading } from './ui.js';
import { getUser } from './auth.js';
import {
  createSeededRNG, randomInt, shuffleArray, generateSeed,
  formatCurrency, formatDate, formatDateISO, today,
  groupBy, sumBy, deepClone,
} from './utils.js';
import { getConfig } from './configuracion.js';

// ── Estado del generador ──────────────────────────────────────
let previewData = null; // { seed, fecha, detalles[], resumenVendedores[], totalGeneral, configuracion }
let isGenerating = false;

// ── Inicializar módulo ────────────────────────────────────────
export async function initGenerador() {
  const cfg = await getConfig();
  window.TRIXI_CONFIG = cfg;

  // Valores por defecto en el formulario
  const fechaEl = document.getElementById('gen-fecha');
  if (fechaEl) fechaEl.value = today();

  setFieldValue('gen-cli-min',   cfg.clientesMinPorVendedor || 15);
  setFieldValue('gen-cli-max',   cfg.clientesMaxPorVendedor || 20);
  setFieldValue('gen-prod-min',  cfg.productosMinPorCliente || 1);
  setFieldValue('gen-prod-max',  cfg.productosMaxPorCliente || 3);
  setFieldValue('gen-cant-min',  cfg.cantidadMinGeneral     || 1);
  setFieldValue('gen-cant-max',  cfg.cantidadMaxGeneral     || 20);

  renderPreviewEmpty();
  setupEvents();
}

// ── Setup eventos ─────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-generar')?.addEventListener('click', handleGenerar);
  document.getElementById('btn-regenerar')?.addEventListener('click', handleGenerar);
  document.getElementById('btn-registrar')?.addEventListener('click', handleRegistrar);
  document.getElementById('btn-cancelar-gen')?.addEventListener('click', handleCancelar);
}

// ── Generar ───────────────────────────────────────────────────
async function handleGenerar() {
  if (isGenerating) return;
  isGenerating = true;

  const btn = document.getElementById('btn-generar');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  try {
    const params = getParams();
    if (!params) { isGenerating = false; if (btn) { btn.classList.remove('loading'); btn.disabled = false; } return; }

    const seed = generateSeed();
    const result = await generateReport(params, seed);
    if (!result) { isGenerating = false; if (btn) { btn.classList.remove('loading'); btn.disabled = false; } return; }

    previewData = result;
    renderPreview(result);

    // Mostrar botones de acción
    document.getElementById('gen-actions')?.classList.remove('hidden');
    document.getElementById('btn-generar')?.classList.add('hidden');
    document.getElementById('btn-regenerar')?.classList.remove('hidden');

  } catch (e) {
    console.error(e);
    toast.error('Error al generar: ' + e.message);
  } finally {
    isGenerating = false;
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
}

// ── Obtener parámetros del formulario ─────────────────────────
function getParams() {
  const fecha   = document.getElementById('gen-fecha')?.value;
  const cliMin  = parseInt(document.getElementById('gen-cli-min')?.value);
  const cliMax  = parseInt(document.getElementById('gen-cli-max')?.value);
  const prodMin = parseInt(document.getElementById('gen-prod-min')?.value);
  const prodMax = parseInt(document.getElementById('gen-prod-max')?.value);
  const cantMin = parseInt(document.getElementById('gen-cant-min')?.value);
  const cantMax = parseInt(document.getElementById('gen-cant-max')?.value);

  const errors = [];
  if (!fecha)                errors.push('Debes seleccionar una fecha.');
  if (isNaN(cliMin) || isNaN(cliMax) || cliMin < 1 || cliMax < cliMin) errors.push('Rango de clientes inválido.');
  if (isNaN(prodMin)|| isNaN(prodMax)|| prodMin < 1 || prodMax < prodMin) errors.push('Rango de productos inválido.');
  if (isNaN(cantMin)|| isNaN(cantMax)|| cantMin < 1 || cantMax < cantMin) errors.push('Rango de cantidades inválido.');

  if (errors.length) {
    toast.warning(errors.join(' '));
    return null;
  }

  return { fecha, cliMin, cliMax, prodMin, prodMax, cantMin, cantMax };
}

// ── Algoritmo principal de generación ────────────────────────
async function generateReport(params, seed) {
  showLoading('Preparando datos...');
  let vendedores, clientes, productos;

  try {
    [vendedores, clientes, productos] = await Promise.all([
      getAllDocs('vendedores', { orderByField: 'codigo' }),
      getAllDocs('clientes',   { orderByField: 'codigo' }),
      getAllDocs('productos',  { orderByField: 'codigo' }),
    ]);
  } catch (e) {
    hideLoading();
    toast.error('Error al cargar datos de Firebase.');
    return null;
  } finally {
    hideLoading();
  }

  // Filtrar activos
  vendedores = vendedores.filter(v => v.estado === 'activo');
  clientes   = clientes.filter(c => c.estado === 'activo' && c.vendedorId);
  productos  = productos.filter(p => p.estado === 'activo' && p.precio != null && !isNaN(p.precio) && Number(p.precio) >= 0);

  // ── Validaciones ─────────────────────────────────────────
  const errores = [];

  if (!vendedores.length) errores.push('No hay vendedores activos.');
  if (!clientes.length)   errores.push('No hay clientes activos con vendedor asignado.');
  if (!productos.length)  errores.push('No hay productos activos con precio válido.');

  if (errores.length) {
    renderPreviewErrors(errores);
    return null;
  }

  // Verificar códigos duplicados
  const codVend = vendedores.map(v => v.codigo);
  const codCli  = clientes.map(c => c.codigo);
  const codProd = productos.map(p => p.codigo);
  if (new Set(codVend).size !== codVend.length) errores.push('Existen códigos duplicados en vendedores.');
  if (new Set(codCli).size  !== codCli.length)  errores.push('Existen códigos duplicados en clientes.');
  if (new Set(codProd).size !== codProd.length)  errores.push('Existen códigos duplicados en productos.');

  if (errores.length) { renderPreviewErrors(errores); return null; }

  const clientesByVend = groupBy(clientes, 'vendedorId');

  // ── RNG con semilla ──────────────────────────────────────
  const rng = createSeededRNG(seed);

  // Mapa de uso de cantidades por producto
  // productoId → { available: number[], used: number[] }
  const productUsage = {};

  const detalles     = [];
  const resumenVend  = [];

  showLoading('Generando distribución...');

  for (const vendedor of vendedores) {
    const disponibles = clientesByVend[vendedor.id] || [];

    if (!disponibles.length) continue; // vendedor sin clientes

    // Cuántos clientes seleccionar
    const numClientes = randomInt(rng, params.cliMin, Math.min(params.cliMax, disponibles.length));
    const clientesSel = shuffleArray(rng, disponibles).slice(0, numClientes);

    let subtotalVendedor = 0;

    for (const cliente of clientesSel) {
      // Cuántos productos seleccionar
      const numProductos = randomInt(rng, params.prodMin, Math.min(params.prodMax, productos.length));
      const productosSel = shuffleArray(rng, productos).slice(0, numProductos);

      let subtotalCliente = 0;

      for (const producto of productosSel) {
        const pMin = (producto.cantidadMinima > 0 && producto.cantidadMinima != null)
          ? producto.cantidadMinima
          : params.cantMin;
        const pMax = (producto.cantidadMaxima >= pMin && producto.cantidadMaxima != null)
          ? producto.cantidadMaxima
          : params.cantMax;

        const cantidad = generarCantidadVariada(rng, producto.id, productUsage, pMin, pMax);
        const precio   = Number(producto.precio);
        const subtotal = cantidad * precio;

        subtotalCliente  += subtotal;
        subtotalVendedor += subtotal;

        detalles.push({
          vendedorId:    vendedor.id,
          vendedorNombre: vendedor.nombre,
          vendedorCodigo: vendedor.codigo,
          clienteId:     cliente.id,
          clienteNombre: cliente.nombre,
          clienteCodigo: cliente.codigo,
          productoId:    producto.id,
          codigoProducto: producto.codigo,
          productoNombre: producto.nombre,
          cantidad,
          precioUnitario: precio,
          subtotal,
          subtotalCliente,  // temporal, se reemplaza abajo
        });
      }

      // Actualizar subtotalCliente en todos los detalles de este cliente
      const clienteDetalles = detalles.filter(d => d.clienteId === cliente.id && d.vendedorId === vendedor.id);
      const sc = sumBy(clienteDetalles, 'subtotal');
      clienteDetalles.forEach(d => d.subtotalCliente = sc);
    }

    resumenVend.push({
      vendedorId:     vendedor.id,
      vendedorNombre: vendedor.nombre,
      vendedorCodigo: vendedor.codigo,
      numClientes:    clientesSel.length,
      subtotalVendedor,
    });
  }

  hideLoading();

  if (!detalles.length) {
    renderPreviewErrors(['No se pudo generar ningún detalle. Verifica que los vendedores tengan clientes asignados y que haya productos activos.']);
    return null;
  }

  const totalGeneral = sumBy(resumenVend, 'subtotalVendedor');

  return {
    seed,
    fecha: params.fecha,
    detalles,
    resumenVend,
    totalGeneral,
    configuracion: { ...params },
  };
}

// ── Generación de cantidad variada ────────────────────────────
function generarCantidadVariada(rng, productoId, productUsage, min, max) {
  if (!productUsage[productoId]) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    productUsage[productoId] = {
      available: shuffleArray(rng, pool),
      used: [],
    };
  }

  const usage = productUsage[productoId];

  // Tomar del pool disponible
  if (usage.available.length > 0) {
    const qty = usage.available.shift();
    usage.used.push(qty);
    return qty;
  }

  // Pool agotado → regenerar evitando el último valor usado si es posible
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  const newPool = shuffleArray(rng, pool);

  // Evitar repetición consecutiva del último valor
  if (usage.used.length > 0 && newPool.length > 1) {
    const lastUsed = usage.used[usage.used.length - 1];
    const idx = newPool.indexOf(lastUsed);
    if (idx === 0) {
      [newPool[0], newPool[1]] = [newPool[1], newPool[0]];
    }
  }

  usage.available = newPool;
  const qty = usage.available.shift();
  usage.used.push(qty);
  return qty;
}

// ── Render vista previa ───────────────────────────────────────
function renderPreview(data) {
  const container = document.getElementById('gen-preview-content');
  if (!container) return;

  const cfg = window.TRIXI_CONFIG || { moneda: 'Q', decimales: 2 };
  const { moneda = 'Q', decimales = 2 } = cfg;

  const byVendedor = groupBy(data.detalles, 'vendedorId');
  const byCliente  = (detalles) => groupBy(detalles, 'clienteId');

  // Estadísticas de resumen
  const totalProductos = new Set(data.detalles.map(d => d.productoId)).size;
  const totalClientes  = new Set(data.detalles.map(d => d.clienteId)).size;
  const totalUnidades  = sumBy(data.detalles, 'cantidad');

  container.innerHTML = `
    <div class="preview-summary">
      <div class="summary-item">
        <div class="summary-val">${data.resumenVend.length}</div>
        <div class="summary-lbl">Vendedores</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">${totalClientes}</div>
        <div class="summary-lbl">Clientes</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">${totalProductos}</div>
        <div class="summary-lbl">Productos únicos</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">${totalUnidades.toLocaleString()}</div>
        <div class="summary-lbl">Unidades totales</div>
      </div>
      <div class="summary-item">
        <div class="summary-val text-primary-c">${formatCurrency(data.totalGeneral, moneda, decimales)}</div>
        <div class="summary-lbl">Total general</div>
      </div>
    </div>
    <div style="padding:8px 16px;background:var(--color-gray-50);border-bottom:1px solid var(--border-color);font-size:12px;color:var(--text-muted);">
      🌱 Semilla: <strong>${data.seed}</strong> &nbsp;|&nbsp;
      📅 Fecha: <strong>${data.fecha}</strong>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Vendedor</th>
            <th>Cliente</th>
            <th>Producto</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Precio</th>
            <th class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(byVendedor).map(([vendId, vDetalles]) => {
            const vendNombre = vDetalles[0].vendedorNombre;
            const vendCodigo = vDetalles[0].vendedorCodigo;
            const vendTotal  = sumBy(vDetalles, 'subtotal');
            const clGrp      = byCliente(vDetalles);

            let rows = `
              <tr class="vendor-group-header">
                <td colspan="5"><strong>${escapeHtml(vendCodigo)} — ${escapeHtml(vendNombre)}</strong></td>
                <td class="text-right"><strong>${formatCurrency(vendTotal, moneda, decimales)}</strong></td>
              </tr>
            `;

            Object.entries(clGrp).forEach(([cliId, cDetalles]) => {
              const cliNombre = cDetalles[0].clienteNombre;
              const cliCodigo = cDetalles[0].clienteCodigo;
              const cliTotal  = sumBy(cDetalles, 'subtotal');

              rows += `
                <tr class="client-group-header">
                  <td></td>
                  <td colspan="4">${escapeHtml(cliCodigo)} — ${escapeHtml(cliNombre)}</td>
                  <td class="text-right">${formatCurrency(cliTotal, moneda, decimales)}</td>
                </tr>
              `;

              cDetalles.forEach(d => {
                rows += `
                  <tr>
                    <td></td>
                    <td></td>
                    <td>
                      <span class="code-chip">${escapeHtml(d.codigoProducto)}</span>
                      ${escapeHtml(d.productoNombre)}
                    </td>
                    <td class="text-right">${d.cantidad.toLocaleString()}</td>
                    <td class="text-right">${formatCurrency(d.precioUnitario, moneda, decimales)}</td>
                    <td class="text-right">${formatCurrency(d.subtotal, moneda, decimales)}</td>
                  </tr>
                `;
              });
            });

            return rows;
          }).join('')}
          <tr class="grand-total-row">
            <td colspan="5"><strong>TOTAL GENERAL</strong></td>
            <td class="text-right"><strong>${formatCurrency(data.totalGeneral, moneda, decimales)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPreviewEmpty() {
  const container = document.getElementById('gen-preview-content');
  if (container) {
    container.innerHTML = `
      <div class="preview-empty">
        <div class="empty-icon">📊</div>
        <div class="empty-title">Vista previa del reporte</div>
        <div class="empty-desc">Configura los parámetros y haz clic en <strong>"Generar reporte"</strong> para ver la distribución antes de guardar.</div>
      </div>
    `;
  }
  document.getElementById('gen-actions')?.classList.add('hidden');
  document.getElementById('btn-generar')?.classList.remove('hidden');
  document.getElementById('btn-regenerar')?.classList.add('hidden');
}

function renderPreviewErrors(errores) {
  const container = document.getElementById('gen-preview-content');
  if (container) {
    container.innerHTML = `
      <div style="padding:2rem;">
        <div class="alert alert-danger">
          <span class="alert-icon">❌</span>
          <div class="alert-body">
            <div class="alert-title">No se puede generar el reporte</div>
            <ul style="margin-top:.5rem;padding-left:1.2rem;">
              ${errores.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }
}

// ── Registrar reporte ─────────────────────────────────────────
async function handleRegistrar() {
  if (!previewData) { toast.warning('Primero genera un reporte.'); return; }

  // Verificar si ya existe reporte para esa fecha
  const existentes = await queryDocs('reportes', [where('fechaReporte', '==', previewData.fecha)]);

  if (existentes.length > 0) {
    const opcion = await confirmarReemplazo(previewData.fecha, existentes[0]);
    if (opcion === 'cancelar') return;
    if (opcion === 'reemplazar') {
      await eliminarReporteExistente(existentes[0].id);
    }
    // Si es 'nueva-version' continúa normalmente
  }

  showLoading('Guardando reporte...');

  try {
    const uid = getUser()?.uid || 'desconocido';

    // Crear documento principal del reporte
    const reporteData = {
      fechaReporte:  previewData.fecha,
      fechaCreacion: serverTimestamp(),
      creadoPor:     uid,
      seed:          previewData.seed,
      estado:        'registrado',
      configuracion: previewData.configuracion,
      totalGeneral:  previewData.totalGeneral,
      resumenVendedores: previewData.resumenVend.map(r => ({
        vendedorId:      r.vendedorId,
        vendedorNombre:  r.vendedorNombre,
        vendedorCodigo:  r.vendedorCodigo,
        numClientes:     r.numClientes,
        subtotalVendedor: r.subtotalVendedor,
      })),
    };

    const reporteId = await createDoc('reportes', reporteData);

    // Guardar detalles en subcollection por lotes (máx 500 por batch)
    const CHUNK = 400;
    for (let i = 0; i < previewData.detalles.length; i += CHUNK) {
      const batch = writeBatch(db);
      previewData.detalles.slice(i, i + CHUNK).forEach(d => {
        const ref = doc(collection(db, `reportes/${reporteId}/detalles`));
        batch.set(ref, {
          vendedorId:    d.vendedorId,
          vendedorNombre: d.vendedorNombre,
          vendedorCodigo: d.vendedorCodigo,
          clienteId:     d.clienteId,
          clienteNombre: d.clienteNombre,
          clienteCodigo: d.clienteCodigo,
          productoId:    d.productoId,
          codigoProducto: d.codigoProducto,
          productoNombre: d.productoNombre,
          cantidad:      d.cantidad,
          precioUnitario: d.precioUnitario,
          subtotal:      d.subtotal,
        });
      });
      await batch.commit();
    }

    hideLoading();
    toast.success('¡Reporte registrado exitosamente en Firebase!');

    // Limpiar estado
    previewData = null;
    renderPreviewEmpty();
    clearCache('reportes');

  } catch (e) {
    hideLoading();
    console.error(e);
    toast.error('Error al guardar el reporte: ' + e.message);
  }
}

async function confirmarReemplazo(fecha, reporteExistente) {
  return new Promise(resolve => {
    const body = `
      <div class="alert alert-warning">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <div class="alert-title">Ya existe un reporte para el ${fecha}</div>
          Total registrado: <strong>${formatCurrency(reporteExistente.totalGeneral || 0, 'Q')}</strong>
        </div>
      </div>
      <p class="text-sm text-secondary mt-4">¿Qué deseas hacer?</p>
    `;

    const footer = `
      <button class="btn btn-outline" id="conf-cancelar">Cancelar</button>
      <button class="btn btn-warning" id="conf-version">Crear nueva versión</button>
      <button class="btn btn-danger"  id="conf-reemplazar">Reemplazar</button>
    `;

    const { el, close } = openModal({ title: 'Reporte existente', body, footer, size: 'modal-md' });

    el.querySelector('#conf-cancelar')?.addEventListener('click',   () => { close(); resolve('cancelar'); });
    el.querySelector('#conf-version')?.addEventListener('click',    () => { close(); resolve('nueva-version'); });
    el.querySelector('#conf-reemplazar')?.addEventListener('click', () => { close(); resolve('reemplazar'); });
  });
}

async function eliminarReporteExistente(reporteId) {
  // Eliminar detalles primero
  const detColl = collection(db, `reportes/${reporteId}/detalles`);
  const { getDocs, deleteDoc } = await import('firebase/firestore');
  const snap = await getDocs(detColl);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, 'reportes', reporteId));
  await batch.commit();
}

// ── Cancelar ─────────────────────────────────────────────────
function handleCancelar() {
  previewData = null;
  renderPreviewEmpty();
}

// ── Helpers ──────────────────────────────────────────────────
function setFieldValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
