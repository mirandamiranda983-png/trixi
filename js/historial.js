import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, setLoading, escapeHtml, money, formatDate, formatDateTime, downloadCSV, confirmDialog } from "./utils.js";
import { getConfig } from "./config-service.js";
import { currentUser } from "./auth.js";

const content = await mountShell(
  "historial.html",
  `
  <div class="panel" id="panel-lista">
    <div class="toolbar">
      <div class="field" style="min-width:160px; margin:0;"><label>Fecha</label><input type="date" id="f-fecha" /></div>
      <div class="field" style="min-width:160px; margin:0;">
        <label>Estado</label>
        <select id="f-estado"><option value="">Todos</option><option value="registrado">Registrado</option><option value="anulado">Anulado</option></select>
      </div>
      <button class="btn btn-ghost" id="btn-limpiar" style="align-self:flex-end;">Limpiar filtros</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Creado</th><th>Usuario</th><th>Vendedores</th><th>Clientes</th><th>Total general</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tbody-lista"><tr class="empty-row"><td colspan="8">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="panel" id="panel-detalle" style="display:none;">
    <div class="panel-header">
      <div>
        <h2 id="detalle-titulo">Reporte</h2>
        <span class="text-muted small" id="detalle-sub"></span>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" id="btn-volver">← Volver al listado</button>
      </div>
    </div>

    <div class="cards-grid" id="detalle-cards"></div>

    <div class="toolbar">
      <div class="field grow" style="margin:0;"><label>Buscar (vendedor, cliente o producto)</label><input type="text" id="det-search" class="search-input" /></div>
      <div class="flex gap-8" style="align-self:flex-end;">
        <button class="btn btn-ghost btn-sm" id="btn-export-csv">Exportar CSV</button>
        <button class="btn btn-ghost btn-sm" id="btn-export-xlsx">Exportar Excel</button>
        <button class="btn btn-ghost btn-sm" id="btn-export-pdf">Exportar PDF</button>
        <button class="btn btn-ghost btn-sm" id="btn-print">Imprimir</button>
        <button class="btn btn-danger btn-sm" id="btn-anular">Anular reporte</button>
      </div>
    </div>

    <div class="table-wrap" style="max-height:520px; overflow-y:auto;" id="printable">
      <table>
        <thead><tr><th>Vendedor</th><th>Cliente</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody id="tbody-detalle"></tbody>
      </table>
    </div>
  </div>
  `
);

let cfg;
let reportes = [];
let detalleActual = null; // { reporte, detalles }

async function loadLista() {
  setLoading(true);
  try {
    cfg = await getConfig();
    const snap = await getDocs(query(collection(db, COL.REPORTES), orderBy("fechaReporte", "desc")));
    reportes = [];
    snap.forEach((d) => reportes.push({ id: d.id, ...d.data() }));
    renderLista();

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (id) abrirReporte(id);
  } catch (e) {
    console.error(e);
    toast("Error cargando el historial", "danger");
  } finally {
    setLoading(false);
  }
}

function renderLista() {
  const fecha = document.getElementById("f-fecha").value;
  const estado = document.getElementById("f-estado").value;
  const rows = reportes.filter((r) => (!fecha || r.fechaReporte === fecha) && (!estado || r.estado === estado));
  const tbody = document.getElementById("tbody-lista");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No se encontraron reportes.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr data-id="${r.id}">
        <td>${formatDate(r.fechaReporte)}</td>
        <td>${formatDateTime(r.fechaCreacion)}</td>
        <td>${escapeHtml(r.creadoPor || "-")}</td>
        <td>${r.configuracion?.totalVendedores ?? "-"}</td>
        <td>${r.configuracion?.totalClientes ?? "-"}</td>
        <td>${money(r.totalGeneral, cfg.moneda, cfg.decimales)}</td>
        <td>${r.estado === "registrado" ? '<span class="badge badge-success">Registrado</span>' : '<span class="badge badge-danger">Anulado</span>'}</td>
        <td><button class="btn btn-ghost btn-sm" data-abrir="${r.id}">Ver detalle</button></td>
      </tr>`
    )
    .join("");
}

document.getElementById("f-fecha").addEventListener("change", renderLista);
document.getElementById("f-estado").addEventListener("change", renderLista);
document.getElementById("btn-limpiar").addEventListener("click", () => {
  document.getElementById("f-fecha").value = "";
  document.getElementById("f-estado").value = "";
  renderLista();
});
document.getElementById("tbody-lista").addEventListener("click", (e) => {
  const id = e.target.closest("[data-abrir]")?.dataset.abrir;
  if (id) abrirReporte(id);
});
document.getElementById("btn-volver").addEventListener("click", () => {
  document.getElementById("panel-detalle").style.display = "none";
  document.getElementById("panel-lista").style.display = "";
  history.replaceState(null, "", "historial.html");
});

async function abrirReporte(id) {
  setLoading(true);
  try {
    const refSnap = await getDoc(doc(db, COL.REPORTES, id));
    if (!refSnap.exists()) {
      toast("El reporte no existe.", "danger");
      return;
    }
    const reporte = { id, ...refSnap.data() };
    const detSnap = await getDocs(collection(db, COL.REPORTES, id, "detalles"));
    const detalles = [];
    detSnap.forEach((d) => detalles.push({ id: d.id, ...d.data() }));
    detalleActual = { reporte, detalles };

    document.getElementById("panel-lista").style.display = "none";
    document.getElementById("panel-detalle").style.display = "";
    document.getElementById("detalle-titulo").textContent = `Reporte del ${formatDate(reporte.fechaReporte)}`;
    document.getElementById("detalle-sub").textContent = `Semilla: ${reporte.seed || "-"} · Creado por ${reporte.creadoPor || "-"} · ${formatDateTime(reporte.fechaCreacion)}`;

    const vendedores = new Set(detalles.map((d) => d.vendedorId)).size;
    const clientes = new Set(detalles.map((d) => d.clienteId)).size;
    const unidades = detalles.reduce((a, d) => a + (d.cantidad || 0), 0);
    document.getElementById("detalle-cards").innerHTML = [
      cardHtml("Vendedores", vendedores),
      cardHtml("Clientes", clientes),
      cardHtml("Unidades", unidades),
      cardHtml("Total general", money(reporte.totalGeneral, cfg.moneda, cfg.decimales)),
      cardHtml("Estado", reporte.estado === "registrado" ? "Registrado" : "Anulado"),
    ].join("");

    renderDetalle();
    history.replaceState(null, "", `historial.html?id=${id}`);
  } catch (e) {
    console.error(e);
    toast("Error abriendo el reporte", "danger");
  } finally {
    setLoading(false);
  }
}

function cardHtml(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function detallesFiltrados() {
  const term = document.getElementById("det-search").value.trim().toLowerCase();
  if (!term) return detalleActual.detalles;
  return detalleActual.detalles.filter(
    (d) =>
      d.vendedorNombre?.toLowerCase().includes(term) ||
      d.clienteNombre?.toLowerCase().includes(term) ||
      d.productoNombre?.toLowerCase().includes(term) ||
      d.codigoProducto?.toLowerCase().includes(term)
  );
}

function renderDetalle() {
  const rows = detallesFiltrados();
  const tbody = document.getElementById("tbody-detalle");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Sin resultados.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.vendedorNombre)}</td>
        <td>${escapeHtml(d.clienteNombre)}</td>
        <td>${escapeHtml(d.productoNombre)} <span class="text-muted small">(${escapeHtml(d.codigoProducto)})</span></td>
        <td>${d.cantidad}</td>
        <td>${money(d.precioUnitario, cfg.moneda, cfg.decimales)}</td>
        <td>${money(d.subtotal, cfg.moneda, cfg.decimales)}</td>
      </tr>`
    )
    .join("");
}
document.getElementById("det-search").addEventListener("input", renderDetalle);

document.getElementById("btn-anular").addEventListener("click", async () => {
  if (!detalleActual) return;
  if (detalleActual.reporte.estado === "anulado") {
    toast("Este reporte ya está anulado.", "info");
    return;
  }
  const ok = await confirmDialog(
    `¿Deseas anular el reporte del ${formatDate(detalleActual.reporte.fechaReporte)}? No se elimina, pero quedará marcado como anulado y no se contará en los totales.`,
    { title: "Anular reporte" }
  );
  if (!ok) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, COL.REPORTES, detalleActual.reporte.id), {
      estado: "anulado",
      modificadoPor: currentUser?.email || "sistema",
      modificadoEn: serverTimestamp(),
    });
    detalleActual.reporte.estado = "anulado";
    toast("Reporte anulado", "success");
    await loadLista();
    abrirReporte(detalleActual.reporte.id);
  } catch (e) {
    console.error(e);
    toast("No se pudo anular el reporte", "danger");
  } finally {
    setLoading(false);
  }
});

// ---------- Exportación ----------
document.getElementById("btn-export-csv").addEventListener("click", () => {
  const rows = detallesFiltrados().map((d) => [
    d.vendedorNombre,
    d.clienteNombre,
    d.codigoProducto,
    d.productoNombre,
    d.cantidad,
    d.precioUnitario,
    d.subtotal,
  ]);
  downloadCSV(
    `reporte_${detalleActual.reporte.fechaReporte}.csv`,
    ["Vendedor", "Cliente", "Código producto", "Producto", "Cantidad", "Precio", "Subtotal"],
    rows
  );
});

document.getElementById("btn-print").addEventListener("click", () => window.print());

const scriptCache = {};
function loadScript(src) {
  if (scriptCache[src]) return scriptCache[src];
  scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptCache[src];
}

document.getElementById("btn-export-xlsx").addEventListener("click", async () => {
  setLoading(true);
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const rows = detallesFiltrados().map((d) => ({
      Vendedor: d.vendedorNombre,
      Cliente: d.clienteNombre,
      "Código producto": d.codigoProducto,
      Producto: d.productoNombre,
      Cantidad: d.cantidad,
      Precio: d.precioUnitario,
      Subtotal: d.subtotal,
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    window.XLSX.writeFile(wb, `reporte_${detalleActual.reporte.fechaReporte}.xlsx`);
  } catch (e) {
    console.error(e);
    toast("No se pudo generar el Excel", "danger");
  } finally {
    setLoading(false);
  }
});

document.getElementById("btn-export-pdf").addEventListener("click", async () => {
  setLoading(true);
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF({ orientation: "landscape" });
    const r = detalleActual.reporte;
    docPdf.setFontSize(14);
    docPdf.text(`${cfg.nombreReportes} — ${cfg.nombreEmpresa}`, 14, 16);
    docPdf.setFontSize(10);
    docPdf.text(`Fecha: ${formatDate(r.fechaReporte)}   Semilla: ${r.seed || "-"}   Estado: ${r.estado}`, 14, 23);

    const rows = detallesFiltrados().map((d) => [
      d.vendedorNombre,
      d.clienteNombre,
      `${d.productoNombre} (${d.codigoProducto})`,
      d.cantidad,
      money(d.precioUnitario, cfg.moneda, cfg.decimales),
      money(d.subtotal, cfg.moneda, cfg.decimales),
    ]);
    docPdf.autoTable({
      head: [["Vendedor", "Cliente", "Producto", "Cantidad", "Precio", "Subtotal"]],
      body: rows,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    const finalY = docPdf.lastAutoTable.finalY || 28;
    docPdf.setFontSize(11);
    docPdf.text(`Total general: ${money(r.totalGeneral, cfg.moneda, cfg.decimales)}`, 14, finalY + 10);
    docPdf.save(`reporte_${r.fechaReporte}.pdf`);
  } catch (e) {
    console.error(e);
    toast("No se pudo generar el PDF", "danger");
  } finally {
    setLoading(false);
  }
});

loadLista();
