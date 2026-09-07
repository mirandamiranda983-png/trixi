import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, setLoading, escapeHtml, parseCSV } from "./utils.js";

const content = await mountShell(
  "importar.html",
  `
  <div class="panel">
    <div class="tabs">
      <button class="tab-btn active" data-tab="vendedores">Vendedores</button>
      <button class="tab-btn" data-tab="clientes">Clientes</button>
      <button class="tab-btn" data-tab="productos">Productos</button>
    </div>

    <div id="ayuda-formato" class="alert alert-info"></div>

    <div class="field">
      <label>Selecciona un archivo CSV o XLSX</label>
      <input type="file" id="f-archivo" accept=".csv,.xlsx,.xls" />
    </div>
    <div id="resumen"></div>
    <div id="preview-wrap" style="display:none;">
      <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
        <table>
          <thead><tr id="thead-row"></tr></thead>
          <tbody id="tbody-preview"></tbody>
        </table>
      </div>
      <div class="flex gap-8" style="margin-top:16px;">
        <button class="btn btn-primary" id="btn-importar">Importar válidos</button>
        <button class="btn btn-ghost" id="btn-cancelar">Cancelar</button>
      </div>
    </div>
  </div>
  `
);

const FORMATOS = {
  vendedores: {
    campos: ["codigo", "nombre", "estado"],
    ejemplo: "VEN001,Juan Pérez,activo",
    ayuda: "Formato: codigo,nombre,estado (estado: activo/inactivo, opcional — por defecto activo).",
  },
  clientes: {
    campos: ["codigo", "nombre", "direccion", "telefono", "contacto", "vendedor"],
    ejemplo: "CLI001,Empresa ABC,Dirección 1,70000000,Pedro,VEN001",
    ayuda: "Formato: codigo,nombre,direccion,telefono,contacto,vendedor (código del vendedor). Si el vendedor no existe, la fila queda marcada con error y no se importa.",
  },
  productos: {
    campos: ["codigo", "nombre", "categoria", "precio", "unidadMedida", "cantidadMinima", "cantidadMaxima", "estado"],
    ejemplo: "PROD001,Producto A,Categoria 1,25.00,unidad,5,20,activo",
    ayuda: "Formato: codigo,nombre,categoria,precio,unidadMedida,cantidadMinima,cantidadMaxima,estado.",
  },
};

let tabActual = "vendedores";
let existentes = { vendedores: [], clientes: [], productos: [] };
let filasProcesadas = []; // { estado: 'valido'|'duplicado'|'error', motivo, data, raw }

function actualizarAyuda() {
  const f = FORMATOS[tabActual];
  document.getElementById("ayuda-formato").innerHTML = `${f.ayuda}<br/><code>${f.campos.join(",")}</code><br/><small>Ejemplo: ${escapeHtml(f.ejemplo)}</small>`;
  document.getElementById("resumen").innerHTML = "";
  document.getElementById("preview-wrap").style.display = "none";
  document.getElementById("f-archivo").value = "";
}

document.querySelectorAll(".tab-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tabActual = btn.dataset.tab;
    actualizarAyuda();
  })
);
actualizarAyuda();

async function cargarExistentes() {
  const [vSnap, cSnap, pSnap] = await Promise.all([
    getDocs(collection(db, COL.VENDEDORES)),
    getDocs(collection(db, COL.CLIENTES)),
    getDocs(collection(db, COL.PRODUCTOS)),
  ]);
  existentes.vendedores = [];
  vSnap.forEach((d) => existentes.vendedores.push({ id: d.id, ...d.data() }));
  existentes.clientes = [];
  cSnap.forEach((d) => existentes.clientes.push({ id: d.id, ...d.data() }));
  existentes.productos = [];
  pSnap.forEach((d) => existentes.productos.push({ id: d.id, ...d.data() }));
}

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

async function leerArchivo(file) {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv")) {
    const text = await file.text();
    return parseCSV(text);
  }
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }).filter((r) => r.some((c) => String(c).trim() !== ""));
}

document.getElementById("f-archivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setLoading(true);
  try {
    await cargarExistentes();
    let rows = await leerArchivo(file);
    // Si la primera fila parece encabezado (contiene "codigo"), la removemos.
    if (rows.length && String(rows[0][0]).trim().toLowerCase() === "codigo") rows = rows.slice(1);

    if (tabActual === "vendedores") filasProcesadas = procesarVendedores(rows);
    if (tabActual === "clientes") filasProcesadas = procesarClientes(rows);
    if (tabActual === "productos") filasProcesadas = procesarProductos(rows);

    renderPreview();
  } catch (err) {
    console.error(err);
    toast("No se pudo leer el archivo.", "danger");
  } finally {
    setLoading(false);
  }
});

function procesarVendedores(rows) {
  const codigosArchivo = new Set();
  const codigosExistentes = new Set(existentes.vendedores.map((v) => (v.codigo || "").toUpperCase()));
  return rows.map((r) => {
    const codigo = (r[0] || "").trim().toUpperCase();
    const nombre = (r[1] || "").trim();
    const estado = (r[2] || "activo").trim().toLowerCase() || "activo";
    if (!codigo || !nombre) return { estado: "error", motivo: "Código y nombre son obligatorios.", data: { codigo, nombre, estado }, raw: r };
    if (codigosExistentes.has(codigo) || codigosArchivo.has(codigo)) return { estado: "duplicado", motivo: "Código duplicado.", data: { codigo, nombre, estado }, raw: r };
    if (!["activo", "inactivo"].includes(estado)) return { estado: "error", motivo: "Estado debe ser 'activo' o 'inactivo'.", data: { codigo, nombre, estado }, raw: r };
    codigosArchivo.add(codigo);
    return { estado: "valido", motivo: "", data: { codigo, nombre, estado }, raw: r };
  });
}

function procesarClientes(rows) {
  const codigosArchivo = new Set();
  const codigosExistentes = new Set(existentes.clientes.map((c) => (c.codigo || "").toUpperCase()));
  const vendedoresPorCodigo = new Map(existentes.vendedores.map((v) => [(v.codigo || "").toUpperCase(), v]));
  return rows.map((r) => {
    const codigo = (r[0] || "").trim().toUpperCase();
    const nombre = (r[1] || "").trim();
    const direccion = (r[2] || "").trim();
    const telefono = (r[3] || "").trim();
    const contacto = (r[4] || "").trim();
    const vendedorCodigo = (r[5] || "").trim().toUpperCase();
    if (!codigo || !nombre) return { estado: "error", motivo: "Código y nombre son obligatorios.", data: {}, raw: r };
    if (codigosExistentes.has(codigo) || codigosArchivo.has(codigo)) return { estado: "duplicado", motivo: "Código duplicado.", data: {}, raw: r };
    let vendedorId = null;
    if (vendedorCodigo) {
      const v = vendedoresPorCodigo.get(vendedorCodigo);
      if (!v) return { estado: "error", motivo: `Vendedor ${vendedorCodigo} no existe.`, data: {}, raw: r };
      vendedorId = v.id;
    }
    codigosArchivo.add(codigo);
    return {
      estado: "valido",
      motivo: "",
      data: { codigo, nombre, direccion, telefono, contacto, vendedorId, vendedorCodigo, estado: "activo" },
      raw: r,
    };
  });
}

function procesarProductos(rows) {
  const codigosArchivo = new Set();
  const codigosExistentes = new Set(existentes.productos.map((p) => (p.codigo || "").toUpperCase()));
  return rows.map((r) => {
    const codigo = (r[0] || "").trim().toUpperCase();
    const nombre = (r[1] || "").trim();
    const categoria = (r[2] || "").trim();
    const precio = parseFloat(r[3]);
    const unidadMedida = (r[4] || "unidad").trim();
    const cantidadMinima = r[5] !== undefined && r[5] !== "" ? parseInt(r[5], 10) : null;
    const cantidadMaxima = r[6] !== undefined && r[6] !== "" ? parseInt(r[6], 10) : null;
    const estado = (r[7] || "activo").trim().toLowerCase() || "activo";

    if (!codigo || !nombre) return { estado: "error", motivo: "Código y nombre son obligatorios.", data: {}, raw: r };
    if (codigosExistentes.has(codigo) || codigosArchivo.has(codigo)) return { estado: "duplicado", motivo: "Código duplicado.", data: {}, raw: r };
    if (isNaN(precio) || precio < 0) return { estado: "error", motivo: "Precio inválido.", data: {}, raw: r };
    if (cantidadMinima != null && cantidadMinima <= 0) return { estado: "error", motivo: "Cantidad mínima inválida.", data: {}, raw: r };
    if (cantidadMinima != null && cantidadMaxima != null && cantidadMaxima < cantidadMinima)
      return { estado: "error", motivo: "Cantidad máxima menor que la mínima.", data: {}, raw: r };

    codigosArchivo.add(codigo);
    return {
      estado: "valido",
      motivo: "",
      data: { codigo, nombre, categoria, precio, unidadMedida, cantidadMinima, cantidadMaxima, estado },
      raw: r,
    };
  });
}

function renderPreview() {
  const validos = filasProcesadas.filter((f) => f.estado === "valido").length;
  const duplicados = filasProcesadas.filter((f) => f.estado === "duplicado").length;
  const errores = filasProcesadas.filter((f) => f.estado === "error").length;

  document.getElementById("resumen").innerHTML = `
    <div class="alert alert-info">
      <strong>${filasProcesadas.length} registros encontrados.</strong><br/>
      ${validos} válidos · ${duplicados} duplicados · ${errores} con error.
    </div>`;

  const campos = FORMATOS[tabActual].campos;
  document.getElementById("thead-row").innerHTML =
    campos.map((c) => `<th>${c}</th>`).join("") + `<th>Estado</th><th>Motivo</th>`;

  document.getElementById("tbody-preview").innerHTML = filasProcesadas
    .map((f) => {
      const celdas = f.raw.map((c) => `<td>${escapeHtml(c)}</td>`).join("");
      const badge =
        f.estado === "valido"
          ? '<span class="badge badge-success">Válido</span>'
          : f.estado === "duplicado"
          ? '<span class="badge badge-warning">Duplicado</span>'
          : '<span class="badge badge-danger">Error</span>';
      return `<tr>${celdas}<td>${badge}</td><td class="text-muted small">${escapeHtml(f.motivo)}</td></tr>`;
    })
    .join("");

  document.getElementById("preview-wrap").style.display = "";
}

document.getElementById("btn-cancelar").addEventListener("click", () => {
  filasProcesadas = [];
  actualizarAyuda();
});

document.getElementById("btn-importar").addEventListener("click", async () => {
  const validos = filasProcesadas.filter((f) => f.estado === "valido");
  if (validos.length === 0) {
    toast("No hay registros válidos para importar.", "info");
    return;
  }
  setLoading(true);
  try {
    const colName = COL[tabActual.toUpperCase()];
    const CHUNK = 400;
    let batch = writeBatch(db);
    let ops = 0;
    for (const f of validos) {
      const ref = doc(collection(db, colName));
      const { vendedorCodigo, ...data } = f.data;
      batch.set(ref, { ...data, fechaCreacion: serverTimestamp() });
      ops++;
      if (ops >= CHUNK) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    toast(`${validos.length} registro(s) importado(s) correctamente.`, "success");
    filasProcesadas = [];
    actualizarAyuda();
  } catch (e) {
    console.error(e);
    toast("Ocurrió un error durante la importación.", "danger");
  } finally {
    setLoading(false);
  }
});
