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
import { toast, setLoading, debounce, nextCode, confirmDialog, escapeHtml, money } from "./utils.js";
import { getConfig } from "./config-service.js";

const content = await mountShell(
  "productos.html",
  `
  <div class="panel">
    <div class="toolbar">
      <div class="grow"><input type="text" id="search" class="search-input" placeholder="Buscar por código, nombre o categoría..." /></div>
      <select id="filter-estado" style="width:170px">
        <option value="">Todos los estados</option>
        <option value="activo">Activos</option>
        <option value="inactivo">Inactivos</option>
      </select>
      <button class="btn btn-primary" id="btn-new">+ Nuevo producto</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Unidad</th><th>Rango cantidad</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tbody"><tr class="empty-row"><td colspan="8">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>
  `
);

let all = [];
let cfg;

async function load() {
  setLoading(true);
  try {
    cfg = await getConfig();
    const snap = await getDocs(collection(db, COL.PRODUCTOS));
    all = [];
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
    all.sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));
    render();
  } catch (e) {
    console.error(e);
    toast("Error cargando productos", "danger");
  } finally {
    setLoading(false);
  }
}

function render() {
  const term = document.getElementById("search").value.trim().toLowerCase();
  const estado = document.getElementById("filter-estado").value;
  const rows = all.filter((p) => {
    const okTerm =
      !term ||
      p.codigo?.toLowerCase().includes(term) ||
      p.nombre?.toLowerCase().includes(term) ||
      p.categoria?.toLowerCase().includes(term);
    const okEstado = !estado || p.estado === estado;
    return okTerm && okEstado;
  });

  const tbody = document.getElementById("tbody");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No se encontraron productos.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (p) => `<tr data-id="${p.id}">
        <td><strong>${escapeHtml(p.codigo)}</strong></td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.categoria || "-")}</td>
        <td>${money(p.precio, cfg.moneda, cfg.decimales)}</td>
        <td>${escapeHtml(p.unidadMedida || "-")}</td>
        <td>${p.cantidadMinima ?? "gen."} – ${p.cantidadMaxima ?? "gen."}</td>
        <td>${p.estado === "activo" ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-muted">Inactivo</span>'}</td>
        <td class="flex gap-8">
          <button class="icon-btn" data-act="edit" title="Editar">✏️</button>
          <button class="icon-btn" data-act="toggle" title="${p.estado === "activo" ? "Desactivar" : "Activar"}">${p.estado === "activo" ? "🚫" : "✅"}</button>
        </td>
      </tr>`
    )
    .join("");
}

document.getElementById("search").addEventListener("input", debounce(render, 200));
document.getElementById("filter-estado").addEventListener("change", render);
document.getElementById("btn-new").addEventListener("click", () => openForm());

document.getElementById("tbody").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const producto = all.find((p) => p.id === tr.dataset.id);
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "edit") openForm(producto);
  if (act === "toggle") await toggleEstado(producto);
});

async function toggleEstado(p) {
  const nuevoEstado = p.estado === "activo" ? "inactivo" : "activo";
  const ok = await confirmDialog(`¿Deseas ${nuevoEstado === "activo" ? "activar" : "desactivar"} "${p.nombre}"?`, {
    danger: nuevoEstado === "inactivo",
  });
  if (!ok) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, COL.PRODUCTOS, p.id), { estado: nuevoEstado });
    p.estado = nuevoEstado;
    toast("Producto actualizado", "success");
    render();
  } catch (e) {
    toast("No se pudo actualizar", "danger");
  } finally {
    setLoading(false);
  }
}

function openForm(producto = null) {
  const isEdit = !!producto;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal modal-lg">
      <h3>${isEdit ? "Editar producto" : "Nuevo producto"}</h3>
      <form id="f-producto">
        <div class="field-row">
          <div class="field"><label>Código</label><input type="text" id="f-codigo" value="${isEdit ? escapeHtml(producto.codigo) : ""}" required /></div>
          <div class="field"><label>Categoría</label><input type="text" id="f-categoria" value="${isEdit ? escapeHtml(producto.categoria || "") : ""}" /></div>
        </div>
        <div class="field"><label>Nombre</label><input type="text" id="f-nombre" value="${isEdit ? escapeHtml(producto.nombre) : ""}" required /></div>
        <div class="field-row">
          <div class="field"><label>Precio</label><input type="number" id="f-precio" min="0" step="0.01" value="${isEdit ? producto.precio : ""}" required /></div>
          <div class="field"><label>Unidad de medida</label><input type="text" id="f-unidad" value="${isEdit ? escapeHtml(producto.unidadMedida || "") : "unidad"}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Cantidad mínima (opcional)</label><input type="number" id="f-min" min="1" value="${isEdit && producto.cantidadMinima != null ? producto.cantidadMinima : ""}" placeholder="Usar rango general (${cfg.cantidadMinGeneral})" /></div>
          <div class="field"><label>Cantidad máxima (opcional)</label><input type="number" id="f-max" min="1" value="${isEdit && producto.cantidadMaxima != null ? producto.cantidadMaxima : ""}" placeholder="Usar rango general (${cfg.cantidadMaxGeneral})" /></div>
        </div>
        <div class="field">
          <label>Estado</label>
          <select id="f-estado">
            <option value="activo" ${producto?.estado === "activo" || !isEdit ? "selected" : ""}>Activo</option>
            <option value="inactivo" ${producto?.estado === "inactivo" ? "selected" : ""}>Inactivo</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? "Guardar cambios" : "Crear producto"}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  if (!isEdit) document.getElementById("f-codigo").value = nextCode("PROD", all.map((p) => p.codigo));

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.close !== undefined) overlay.remove();
  });

  document.getElementById("f-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = document.getElementById("f-codigo").value.trim().toUpperCase();
    const nombre = document.getElementById("f-nombre").value.trim();
    const categoria = document.getElementById("f-categoria").value.trim();
    const precio = parseFloat(document.getElementById("f-precio").value);
    const unidadMedida = document.getElementById("f-unidad").value.trim();
    const minRaw = document.getElementById("f-min").value;
    const maxRaw = document.getElementById("f-max").value;
    const cantidadMinima = minRaw === "" ? null : parseInt(minRaw, 10);
    const cantidadMaxima = maxRaw === "" ? null : parseInt(maxRaw, 10);
    const estado = document.getElementById("f-estado").value;

    if (all.some((p) => p.codigo?.toUpperCase() === codigo && p.id !== producto?.id)) {
      toast("Ya existe un producto con ese código.", "danger");
      return;
    }
    if (isNaN(precio) || precio < 0) {
      toast("El precio debe ser un número válido mayor o igual a 0.", "danger");
      return;
    }
    if (cantidadMinima != null && cantidadMinima <= 0) {
      toast("La cantidad mínima debe ser mayor a 0.", "danger");
      return;
    }
    if (cantidadMinima != null && cantidadMaxima != null && cantidadMaxima < cantidadMinima) {
      toast("La cantidad máxima debe ser mayor o igual a la mínima.", "danger");
      return;
    }

    const payload = { codigo, nombre, categoria, precio, unidadMedida, cantidadMinima, cantidadMaxima, estado };
    setLoading(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, COL.PRODUCTOS, producto.id), payload);
        toast("Producto actualizado", "success");
      } else {
        await addDoc(collection(db, COL.PRODUCTOS), { ...payload, fechaCreacion: serverTimestamp() });
        toast("Producto creado", "success");
      }
      overlay.remove();
      await load();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el producto", "danger");
    } finally {
      setLoading(false);
    }
  });
}

load();
