import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  toast,
  setLoading,
  escapeHtml,
  money,
  todayISO,
  makeSeed,
  mulberry32,
  shuffle,
  randInt,
  pickVariedQuantity,
} from "./utils.js";
import { getConfig } from "./config-service.js";
import { currentUser } from "./auth.js";

const content = await mountShell(
  "generador.html",
  `
  <div class="panel">
    <div class="panel-header"><h2>Parámetros de generación</h2></div>
    <div class="field-row">
      <div class="field"><label>Fecha del reporte</label><input type="date" id="f-fecha" /></div>
      <div class="field"><label>Clientes mín. por vendedor (del día)</label><input type="number" id="f-cmin" min="1" /></div>
      <div class="field"><label>Clientes máx. por vendedor (del día)</label><input type="number" id="f-cmax" min="1" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Productos mín. por cliente</label><input type="number" id="f-pmin" min="1" /></div>
      <div class="field"><label>Productos máx. por cliente</label><input type="number" id="f-pmax" min="1" /></div>
      <div class="field"><label>Cantidad mín. general (fallback)</label><input type="number" id="f-qmin" min="1" /></div>
      <div class="field"><label>Cantidad máx. general (fallback)</label><input type="number" id="f-qmax" min="1" /></div>
    </div>
    <div class="field">
      <label>Vendedores a incluir</label>
      <div id="lista-vendedores" class="panel" style="max-height:180px; overflow-y:auto; padding:10px 14px;">Cargando...</div>
    </div>
    <div id="validaciones"></div>
    <div class="flex gap-8">
      <button class="btn btn-primary" id="btn-generar">🎲 Generar vista previa</button>
    </div>
  </div>

  <div class="panel" id="panel-preview" style="display:none;">
    <div class="panel-header">
      <h2>Vista previa (aún no guardada)</h2>
      <span class="text-muted small">Semilla: <code id="seed-label"></code></span>
    </div>
    <div class="cards-grid" id="preview-cards"></div>
    <div class="table-wrap" style="max-height:520px; overflow-y:auto;">
      <table>
        <thead><tr><th>Vendedor</th><th>Cliente</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody id="tbody-preview"></tbody>
      </table>
    </div>
    <div class="flex gap-8" style="margin-top:16px;">
      <button class="btn btn-success" id="btn-registrar">✅ Registrar reporte</button>
      <button class="btn btn-ghost" id="btn-regenerar">🔁 Regenerar</button>
      <button class="btn btn-ghost" id="btn-cancelar">✖ Cancelar</button>
    </div>
  </div>
  `
);

let cfg, vendedores, clientes, productos;
let ultimaGeneracion = null; // { detalles, seed, params, totales }

async function init() {
  setLoading(true);
  try {
    cfg = await getConfig();
    document.getElementById("f-fecha").value = todayISO();
    document.getElementById("f-cmin").value = cfg.clientesMinPorVendedor;
    document.getElementById("f-cmax").value = cfg.clientesMaxPorVendedor;
    document.getElementById("f-pmin").value = cfg.productosMinPorCliente;
    document.getElementById("f-pmax").value = cfg.productosMaxPorCliente;
    document.getElementById("f-qmin").value = cfg.cantidadMinGeneral;
    document.getElementById("f-qmax").value = cfg.cantidadMaxGeneral;

    const [vSnap, cSnap, pSnap] = await Promise.all([
      getDocs(collection(db, COL.VENDEDORES)),
      getDocs(collection(db, COL.CLIENTES)),
      getDocs(collection(db, COL.PRODUCTOS)),
    ]);
    vendedores = [];
    vSnap.forEach((d) => vendedores.push({ id: d.id, ...d.data() }));
    clientes = [];
    cSnap.forEach((d) => clientes.push({ id: d.id, ...d.data() }));
    productos = [];
    pSnap.forEach((d) => productos.push({ id: d.id, ...d.data() }));
    vendedores.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    const activos = vendedores.filter((v) => v.estado === "activo");
    document.getElementById("lista-vendedores").innerHTML =
      activos.length === 0
        ? `<p class="text-muted">No hay vendedores activos.</p>`
        : activos
            .map(
              (v) => `<label class="flex items-center gap-8" style="padding:5px 0; font-weight:400;">
                <input type="checkbox" class="chk-vendedor" value="${v.id}" checked /> ${escapeHtml(v.nombre)} (${escapeHtml(v.codigo)})
              </label>`
            )
            .join("");
  } catch (e) {
    console.error(e);
    toast("Error cargando datos para el generador", "danger");
  } finally {
    setLoading(false);
  }
}

function leerParams() {
  return {
    fecha: document.getElementById("f-fecha").value,
    clientesMinPorVendedor: parseInt(document.getElementById("f-cmin").value, 10),
    clientesMaxPorVendedor: parseInt(document.getElementById("f-cmax").value, 10),
    productosMinPorCliente: parseInt(document.getElementById("f-pmin").value, 10),
    productosMaxPorCliente: parseInt(document.getElementById("f-pmax").value, 10),
    cantidadMinGeneral: parseInt(document.getElementById("f-qmin").value, 10),
    cantidadMaxGeneral: parseInt(document.getElementById("f-qmax").value, 10),
    vendedorIds: Array.from(document.querySelectorAll(".chk-vendedor:checked")).map((el) => el.value),
  };
}

function validar(params) {
  const errores = [];
  if (!params.fecha) errores.push("Debes seleccionar una fecha para el reporte.");
  if (params.vendedorIds.length === 0) errores.push("Debes incluir al menos un vendedor activo.");
  if (!(params.clientesMinPorVendedor > 0)) errores.push("El mínimo de clientes por vendedor debe ser mayor a 0.");
  if (params.clientesMaxPorVendedor < params.clientesMinPorVendedor) errores.push("El máximo de clientes por vendedor debe ser mayor o igual al mínimo.");
  if (!(params.productosMinPorCliente > 0)) errores.push("El mínimo de productos por cliente debe ser mayor a 0.");
  if (params.productosMaxPorCliente < params.productosMinPorCliente) errores.push("El máximo de productos por cliente debe ser mayor o igual al mínimo.");
  if (!(params.cantidadMinGeneral > 0)) errores.push("La cantidad mínima general debe ser mayor a 0.");
  if (params.cantidadMaxGeneral < params.cantidadMinGeneral) errores.push("La cantidad máxima general debe ser mayor o igual a la mínima.");

  const productosActivos = productos.filter((p) => p.estado === "activo");
  if (productosActivos.length === 0) errores.push("No existen productos activos.");
  const productosInvalidos = productosActivos.filter((p) => typeof p.precio !== "number" || p.precio < 0);
  if (productosInvalidos.length > 0) errores.push(`${productosInvalidos.length} producto(s) activo(s) no tienen un precio válido.`);

  const codigosVend = vendedores.map((v) => (v.codigo || "").toUpperCase());
  if (new Set(codigosVend).size !== codigosVend.length) errores.push("Existen códigos de vendedor duplicados.");
  const codigosCli = clientes.map((c) => (c.codigo || "").toUpperCase());
  if (new Set(codigosCli).size !== codigosCli.length) errores.push("Existen códigos de cliente duplicados.");
  const codigosProd = productos.map((p) => (p.codigo || "").toUpperCase());
  if (new Set(codigosProd).size !== codigosProd.length) errores.push("Existen códigos de producto duplicados.");

  const vendedoresSeleccionados = vendedores.filter((v) => params.vendedorIds.includes(v.id));
  const clientesConVendedor = clientes.filter(
    (c) => c.estado === "activo" && params.vendedorIds.includes(c.vendedorId)
  );
  if (vendedoresSeleccionados.length > 0 && clientesConVendedor.length === 0) {
    errores.push("Los vendedores seleccionados no tienen clientes activos asignados.");
  }

  return errores;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function generar(params, seed) {
  const rnd = mulberry32(seed);
  const productosActivos = productos.filter((p) => p.estado === "activo");
  const vendedoresSel = vendedores.filter((v) => params.vendedorIds.includes(v.id) && v.estado === "activo");

  const usedQtyByProduct = new Map();
  const lastQtyByProduct = new Map();
  const detalles = [];

  for (const vendedor of vendedoresSel) {
    const clientesDeVendedor = shuffle(
      clientes.filter((c) => c.estado === "activo" && c.vendedorId === vendedor.id),
      rnd
    );
    if (clientesDeVendedor.length === 0) continue;

    const nClientes = Math.min(
      clientesDeVendedor.length,
      randInt(rnd, Math.min(params.clientesMinPorVendedor, clientesDeVendedor.length), Math.min(params.clientesMaxPorVendedor, clientesDeVendedor.length))
    );
    const clientesElegidos = clientesDeVendedor.slice(0, nClientes);

    for (const cliente of clientesElegidos) {
      if (productosActivos.length === 0) continue;
      const nProductos = Math.min(
        productosActivos.length,
        randInt(rnd, params.productosMinPorCliente, params.productosMaxPorCliente)
      );
      const productosElegidos = shuffle(productosActivos, rnd).slice(0, nProductos);

      for (const producto of productosElegidos) {
        const min = producto.cantidadMinima ?? params.cantidadMinGeneral;
        const max = producto.cantidadMaxima ?? params.cantidadMaxGeneral;
        let used = usedQtyByProduct.get(producto.id);
        if (!used) {
          used = new Set();
          usedQtyByProduct.set(producto.id, used);
        }
        const last = lastQtyByProduct.get(producto.id);
        const cantidad = pickVariedQuantity(rnd, min, max, used, last);
        lastQtyByProduct.set(producto.id, cantidad);

        const precioUnitario = producto.precio;
        const subtotal = round2(cantidad * precioUnitario);

        detalles.push({
          vendedorId: vendedor.id,
          vendedorNombre: vendedor.nombre,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          productoId: producto.id,
          codigoProducto: producto.codigo,
          productoNombre: producto.nombre,
          cantidad,
          precioUnitario,
          subtotal,
        });
      }
    }
  }
  return detalles;
}

function calcularTotales(detalles) {
  const porCliente = new Map();
  const porVendedor = new Map();
  let totalGeneral = 0;
  for (const d of detalles) {
    porCliente.set(d.clienteId, round2((porCliente.get(d.clienteId) || 0) + d.subtotal));
    porVendedor.set(d.vendedorId, round2((porVendedor.get(d.vendedorId) || 0) + d.subtotal));
    totalGeneral = round2(totalGeneral + d.subtotal);
  }
  return { porCliente, porVendedor, totalGeneral };
}

function renderPreview(detalles, seed, params) {
  const totales = calcularTotales(detalles);
  ultimaGeneracion = { detalles, seed, params, totales };

  document.getElementById("panel-preview").style.display = "";
  document.getElementById("seed-label").textContent = seed;

  const vendedoresInvolucrados = new Set(detalles.map((d) => d.vendedorId)).size;
  const clientesInvolucrados = new Set(detalles.map((d) => d.clienteId)).size;
  const unidades = detalles.reduce((a, d) => a + d.cantidad, 0);

  document.getElementById("preview-cards").innerHTML = [
    cardHtml("Vendedores incluidos", vendedoresInvolucrados),
    cardHtml("Clientes con venta", clientesInvolucrados),
    cardHtml("Unidades totales", unidades),
    cardHtml("Total general", money(totales.totalGeneral, cfg.moneda, cfg.decimales)),
  ].join("");

  const tbody = document.getElementById("tbody-preview");
  if (detalles.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">La generación no produjo detalles con los parámetros actuales.</td></tr>`;
    return;
  }
  const filas = [];
  let vendedorActual = null;
  let clienteActual = null;
  for (const d of detalles) {
    filas.push(`<tr>
      <td>${d.vendedorId !== vendedorActual ? escapeHtml(d.vendedorNombre) : ""}</td>
      <td>${d.clienteId !== clienteActual ? escapeHtml(d.clienteNombre) : ""}</td>
      <td>${escapeHtml(d.productoNombre)} <span class="text-muted small">(${escapeHtml(d.codigoProducto)})</span></td>
      <td>${d.cantidad}</td>
      <td>${money(d.precioUnitario, cfg.moneda, cfg.decimales)}</td>
      <td><strong>${money(d.subtotal, cfg.moneda, cfg.decimales)}</strong></td>
    </tr>`);
    if (d.clienteId !== clienteActual && clienteActual !== null) {
      // total del cliente anterior ya mostrado arriba visualmente vía agrupación simple
    }
    vendedorActual = d.vendedorId;
    clienteActual = d.clienteId;
  }
  tbody.innerHTML = filas.join("");
}

function cardHtml(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

document.getElementById("btn-generar").addEventListener("click", () => {
  const params = leerParams();
  const errores = validar(params);
  const box = document.getElementById("validaciones");
  if (errores.length > 0) {
    box.innerHTML = `<div class="alert alert-danger"><strong>No se puede generar:</strong><ul style="margin:6px 0 0 18px;">${errores
      .map((e) => `<li>${escapeHtml(e)}</li>`)
      .join("")}</ul></div>`;
    document.getElementById("panel-preview").style.display = "none";
    return;
  }
  box.innerHTML = "";
  const seed = makeSeed();
  const detalles = generar(params, seed);
  renderPreview(detalles, seed, params);
  toast("Vista previa generada. Nada se ha guardado todavía.", "info");
});

document.getElementById("btn-regenerar").addEventListener("click", () => {
  if (!ultimaGeneracion) return;
  const seed = makeSeed();
  const detalles = generar(ultimaGeneracion.params, seed);
  renderPreview(detalles, seed, ultimaGeneracion.params);
  toast("Nueva distribución generada.", "info");
});

document.getElementById("btn-cancelar").addEventListener("click", () => {
  ultimaGeneracion = null;
  document.getElementById("panel-preview").style.display = "none";
});

document.getElementById("btn-registrar").addEventListener("click", registrarReporte);

async function registrarReporte() {
  if (!ultimaGeneracion) return;
  const { detalles, seed, params, totales } = ultimaGeneracion;
  if (detalles.length === 0) {
    toast("No hay detalles para registrar.", "danger");
    return;
  }

  setLoading(true);
  try {
    // Idempotencia: verificar si ya existe un reporte registrado para esa fecha.
    const existentes = await getDocs(query(collection(db, COL.REPORTES), where("fechaReporte", "==", params.fecha)));
    let permitir = true;
    if (!existentes.empty) {
      permitir = await confirmarConflictoFecha(params.fecha, existentes.size);
      if (!permitir) {
        setLoading(false);
        return;
      }
    }

    const vendedoresInvolucrados = new Set(detalles.map((d) => d.vendedorId)).size;
    const clientesInvolucrados = new Set(detalles.map((d) => d.clienteId)).size;
    const productosInvolucrados = new Set(detalles.map((d) => d.productoId)).size;

    const reporteRef = doc(collection(db, COL.REPORTES));
    let batch = writeBatch(db);
    batch.set(reporteRef, {
      fechaReporte: params.fecha,
      fechaCreacion: serverTimestamp(),
      creadoPor: currentUser?.email || "sistema",
      seed,
      estado: "registrado",
      configuracion: {
        clientesMinPorVendedor: params.clientesMinPorVendedor,
        clientesMaxPorVendedor: params.clientesMaxPorVendedor,
        productosMinPorCliente: params.productosMinPorCliente,
        productosMaxPorCliente: params.productosMaxPorCliente,
        cantidadMinGeneral: params.cantidadMinGeneral,
        cantidadMaxGeneral: params.cantidadMaxGeneral,
        totalVendedores: vendedoresInvolucrados,
        totalClientes: clientesInvolucrados,
        totalProductos: productosInvolucrados,
      },
      totalGeneral: totales.totalGeneral,
    });

    // Firestore permite hasta 500 operaciones por batch; se agrupa en lotes de 400 por seguridad.
    const CHUNK = 400;
    let ops = 1;
    for (let i = 0; i < detalles.length; i++) {
      const d = detalles[i];
      const detalleRef = doc(collection(reporteRef, "detalles"));
      batch.set(detalleRef, d);
      ops++;
      if (ops >= CHUNK) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    toast("Reporte registrado correctamente.", "success");
    ultimaGeneracion = null;
    document.getElementById("panel-preview").style.display = "none";
    setTimeout(() => (location.href = `historial.html?id=${reporteRef.id}`), 600);
  } catch (e) {
    console.error(e);
    toast("No se pudo registrar el reporte.", "danger");
  } finally {
    setLoading(false);
  }
}

function confirmarConflictoFecha(fecha, cantidad) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>Ya existe un reporte para esta fecha</h3>
        <p>Ya hay ${cantidad} reporte(s) registrados para el ${escapeHtml(fecha)}. ¿Qué deseas hacer?</p>
        <div class="modal-actions" style="justify-content:flex-start; flex-wrap:wrap;">
          <button class="btn btn-primary" data-op="nueva">Crear como nueva versión</button>
          <button class="btn btn-ghost" data-op="cancelar">Cancelar</button>
        </div>
        <p class="small text-muted" style="margin-top:10px;">
          Para reemplazar un reporte histórico existente, hazlo desde el módulo Historial anulando
          primero el reporte anterior con confirmación administrativa.
        </p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      const op = e.target.dataset.op;
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      } else if (op === "nueva") {
        overlay.remove();
        resolve(true);
      } else if (op === "cancelar") {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

init();
