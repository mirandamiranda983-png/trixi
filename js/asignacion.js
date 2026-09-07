import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, setLoading, escapeHtml } from "./utils.js";
import { getConfig } from "./config-service.js";
import { currentUser } from "./auth.js";

const content = await mountShell(
  "asignacion.html",
  `
  <div id="alertas"></div>

  <div class="panel">
    <div class="panel-header">
      <h2>Resumen por vendedor</h2>
      <span class="text-muted small">Objetivo configurado: <b id="rango-objetivo"></b> clientes por vendedor</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Vendedor</th><th>Clientes activos</th><th>Estado carga</th><th></th></tr></thead>
        <tbody id="tbody-vendedores"><tr class="empty-row"><td colspan="4">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="panel" id="panel-detalle" style="display:none;">
    <div class="panel-header">
      <h2 id="detalle-titulo">Clientes de...</h2>
      <button class="btn btn-ghost btn-sm" id="btn-cerrar-detalle">Cerrar</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Cliente</th><th>Reasignar a</th><th></th></tr></thead>
        <tbody id="tbody-detalle"></tbody>
      </table>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header"><h2>Clientes sin vendedor</h2></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Cliente</th><th>Asignar a</th><th></th></tr></thead>
        <tbody id="tbody-sinvendedor"><tr class="empty-row"><td colspan="4">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>
  `
);

let vendedores = [];
let clientes = [];
let cfg;

async function load() {
  setLoading(true);
  try {
    cfg = await getConfig();
    document.getElementById("rango-objetivo").textContent = `${cfg.clientesMinPorVendedor}–${cfg.clientesMaxPorVendedor}`;
    const [vSnap, cSnap] = await Promise.all([getDocs(collection(db, COL.VENDEDORES)), getDocs(collection(db, COL.CLIENTES))]);
    vendedores = [];
    vSnap.forEach((d) => vendedores.push({ id: d.id, ...d.data() }));
    clientes = [];
    cSnap.forEach((d) => clientes.push({ id: d.id, ...d.data() }));
    vendedores.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    render();
  } catch (e) {
    console.error(e);
    toast("Error cargando datos de asignación", "danger");
  } finally {
    setLoading(false);
  }
}

function clientesActivosDe(vendedorId) {
  return clientes.filter((c) => c.vendedorId === vendedorId && c.estado === "activo");
}

function render() {
  const vendedoresActivos = vendedores.filter((v) => v.estado === "activo");
  const clientesActivos = clientes.filter((c) => c.estado === "activo");
  const sinVendedor = clientesActivos.filter((c) => !c.vendedorId);

  // Alerta de mínimos globales, como pide la especificación (ej: 20x15=300)
  const alertas = [];
  const minimoGlobal = vendedoresActivos.length * cfg.clientesMinPorVendedor;
  if (clientesActivos.length < minimoGlobal) {
    alertas.push(
      `<div class="alert alert-warning">No existen suficientes clientes para cumplir la configuración mínima de ${cfg.clientesMinPorVendedor} clientes por vendedor. Se necesitan al menos ${minimoGlobal} clientes activos (${vendedoresActivos.length} vendedores × ${cfg.clientesMinPorVendedor}) y actualmente hay ${clientesActivos.length}.</div>`
    );
  }
  if (sinVendedor.length > 0) {
    alertas.push(`<div class="alert alert-info">${sinVendedor.length} cliente(s) activo(s) no tienen vendedor asignado.</div>`);
  }
  document.getElementById("alertas").innerHTML = alertas.join("");

  // Tabla resumen por vendedor
  const tbody = document.getElementById("tbody-vendedores");
  if (vendedoresActivos.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No hay vendedores activos.</td></tr>`;
  } else {
    tbody.innerHTML = vendedoresActivos
      .map((v) => {
        const n = clientesActivosDe(v.id).length;
        let estadoCarga;
        if (n < cfg.clientesMinPorVendedor) estadoCarga = `<span class="badge badge-warning">Por debajo del mínimo</span>`;
        else if (n > cfg.clientesMaxPorVendedor) estadoCarga = `<span class="badge badge-danger">Por encima del máximo</span>`;
        else estadoCarga = `<span class="badge badge-success">Dentro del rango</span>`;
        return `<tr>
          <td>${escapeHtml(v.nombre)} <span class="text-muted small">(${escapeHtml(v.codigo)})</span></td>
          <td><span class="pill">${n}</span></td>
          <td>${estadoCarga}</td>
          <td><button class="btn btn-ghost btn-sm" data-ver="${v.id}">Ver clientes</button></td>
        </tr>`;
      })
      .join("");
  }

  // Clientes sin vendedor
  const tbodySin = document.getElementById("tbody-sinvendedor");
  if (sinVendedor.length === 0) {
    tbodySin.innerHTML = `<tr class="empty-row"><td colspan="4">Todos los clientes activos tienen vendedor asignado.</td></tr>`;
  } else {
    tbodySin.innerHTML = sinVendedor
      .map(
        (c) => `<tr data-id="${c.id}">
        <td>${escapeHtml(c.codigo)}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>
          <select class="sel-vendedor" style="min-width:200px">
            <option value="">-- Selecciona --</option>
            ${vendedoresActivos.map((v) => `<option value="${v.id}">${escapeHtml(v.nombre)} (${escapeHtml(v.codigo)})</option>`).join("")}
          </select>
        </td>
        <td><button class="btn btn-primary btn-sm" data-asignar="${c.id}">Asignar</button></td>
      </tr>`
      )
      .join("");
  }
}

document.getElementById("tbody-vendedores").addEventListener("click", (e) => {
  const id = e.target.closest("[data-ver]")?.dataset.ver;
  if (id) mostrarDetalle(id);
});

document.getElementById("btn-cerrar-detalle").addEventListener("click", () => {
  document.getElementById("panel-detalle").style.display = "none";
});

function mostrarDetalle(vendedorId) {
  const vendedor = vendedores.find((v) => v.id === vendedorId);
  const lista = clientesActivosDe(vendedorId);
  document.getElementById("detalle-titulo").textContent = `Clientes de ${vendedor.nombre} (${lista.length})`;
  const tbody = document.getElementById("tbody-detalle");
  const otros = vendedores.filter((v) => v.estado === "activo" && v.id !== vendedorId);
  if (lista.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Este vendedor no tiene clientes asignados.</td></tr>`;
  } else {
    tbody.innerHTML = lista
      .map(
        (c) => `<tr data-id="${c.id}">
        <td>${escapeHtml(c.codigo)}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>
          <select class="sel-vendedor" style="min-width:200px">
            <option value="">-- Mantener --</option>
            ${otros.map((v) => `<option value="${v.id}">${escapeHtml(v.nombre)} (${escapeHtml(v.codigo)})</option>`).join("")}
          </select>
        </td>
        <td><button class="btn btn-ghost btn-sm" data-reasignar="${c.id}">Cambiar</button></td>
      </tr>`
      )
      .join("");
  }
  document.getElementById("panel-detalle").style.display = "";
}

document.getElementById("tbody-detalle").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-reasignar]")?.dataset.reasignar;
  if (!id) return;
  const tr = e.target.closest("tr");
  const nuevoVendedorId = tr.querySelector(".sel-vendedor").value;
  if (!nuevoVendedorId) {
    toast("Selecciona un vendedor destino.", "info");
    return;
  }
  await reasignarCliente(id, nuevoVendedorId);
  const vendedorId = clientes.find((c) => c.id === id)?.vendedorId;
  if (vendedorId) mostrarDetalle(vendedorId);
});

document.getElementById("tbody-sinvendedor").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-asignar]")?.dataset.asignar;
  if (!id) return;
  const tr = e.target.closest("tr");
  const vendedorId = tr.querySelector(".sel-vendedor").value;
  if (!vendedorId) {
    toast("Selecciona un vendedor.", "info");
    return;
  }
  await reasignarCliente(id, vendedorId);
});

async function reasignarCliente(clienteId, nuevoVendedorId) {
  const cliente = clientes.find((c) => c.id === clienteId);
  const vendedorAnteriorId = cliente.vendedorId || null;
  if (vendedorAnteriorId === nuevoVendedorId) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, COL.CLIENTES, clienteId), { vendedorId: nuevoVendedorId });
    await addDoc(collection(db, COL.HISTORIAL_ASIGNACIONES), {
      clienteId,
      vendedorAnteriorId,
      vendedorNuevoId: nuevoVendedorId,
      fecha: serverTimestamp(),
      usuario: currentUser?.email || "sistema",
    });
    cliente.vendedorId = nuevoVendedorId;
    toast("Cliente reasignado", "success");
    render();
  } catch (e) {
    console.error(e);
    toast("No se pudo reasignar el cliente", "danger");
  } finally {
    setLoading(false);
  }
}

load();
