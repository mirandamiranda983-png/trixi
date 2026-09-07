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
import { toast, setLoading, debounce, nextCode, confirmDialog, escapeHtml } from "./utils.js";
import { currentUser } from "./auth.js";

const content = await mountShell(
  "clientes.html",
  `
  <div class="panel">
    <div class="toolbar">
      <div class="grow"><input type="text" id="search" class="search-input" placeholder="Buscar por código, nombre o vendedor..." /></div>
      <select id="filter-vendedor" style="width:220px"><option value="">Todos los vendedores</option></select>
      <select id="filter-estado" style="width:170px">
        <option value="">Todos los estados</option>
        <option value="activo">Activos</option>
        <option value="inactivo">Inactivos</option>
      </select>
      <button class="btn btn-primary" id="btn-new">+ Nuevo cliente</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Contacto</th><th>Vendedor</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tbody"><tr class="empty-row"><td colspan="8">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>
  `
);

let clientes = [];
let vendedores = [];

async function load() {
  setLoading(true);
  try {
    const [cSnap, vSnap] = await Promise.all([getDocs(collection(db, COL.CLIENTES)), getDocs(collection(db, COL.VENDEDORES))]);
    clientes = [];
    cSnap.forEach((d) => clientes.push({ id: d.id, ...d.data() }));
    vendedores = [];
    vSnap.forEach((d) => vendedores.push({ id: d.id, ...d.data() }));
    vendedores.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    clientes.sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));

    const filterSel = document.getElementById("filter-vendedor");
    filterSel.innerHTML =
      `<option value="">Todos los vendedores</option><option value="__none__">Sin vendedor</option>` +
      vendedores.map((v) => `<option value="${v.id}">${escapeHtml(v.nombre)} (${escapeHtml(v.codigo)})</option>`).join("");

    render();
  } catch (e) {
    console.error(e);
    toast("Error cargando clientes", "danger");
  } finally {
    setLoading(false);
  }
}

function vendedorNombre(id) {
  const v = vendedores.find((v) => v.id === id);
  return v ? `${v.nombre} (${v.codigo})` : null;
}

function render() {
  const term = document.getElementById("search").value.trim().toLowerCase();
  const vendedorFiltro = document.getElementById("filter-vendedor").value;
  const estado = document.getElementById("filter-estado").value;

  const rows = clientes.filter((c) => {
    const vn = vendedorNombre(c.vendedorId) || "";
    const okTerm = !term || c.codigo?.toLowerCase().includes(term) || c.nombre?.toLowerCase().includes(term) || vn.toLowerCase().includes(term);
    const okEstado = !estado || c.estado === estado;
    let okVendedor = true;
    if (vendedorFiltro === "__none__") okVendedor = !c.vendedorId;
    else if (vendedorFiltro) okVendedor = c.vendedorId === vendedorFiltro;
    return okTerm && okEstado && okVendedor;
  });

  const tbody = document.getElementById("tbody");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No se encontraron clientes.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((c) => {
      const vn = vendedorNombre(c.vendedorId);
      return `<tr data-id="${c.id}">
        <td><strong>${escapeHtml(c.codigo)}</strong></td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${escapeHtml(c.direccion || "-")}</td>
        <td>${escapeHtml(c.telefono || "-")}</td>
        <td>${escapeHtml(c.contacto || "-")}</td>
        <td>${vn ? escapeHtml(vn) : '<span class="badge badge-warning">Sin asignar</span>'}</td>
        <td>${c.estado === "activo" ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-muted">Inactivo</span>'}</td>
        <td class="flex gap-8">
          <button class="icon-btn" data-act="edit" title="Editar">✏️</button>
          <button class="icon-btn" data-act="toggle" title="${c.estado === "activo" ? "Desactivar" : "Activar"}">${c.estado === "activo" ? "🚫" : "✅"}</button>
        </td>
      </tr>`;
    })
    .join("");
}

document.getElementById("search").addEventListener("input", debounce(render, 200));
document.getElementById("filter-vendedor").addEventListener("change", render);
document.getElementById("filter-estado").addEventListener("change", render);
document.getElementById("btn-new").addEventListener("click", () => openForm());

document.getElementById("tbody").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const cliente = clientes.find((c) => c.id === tr.dataset.id);
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "edit") openForm(cliente);
  if (act === "toggle") await toggleEstado(cliente);
});

async function toggleEstado(c) {
  const nuevoEstado = c.estado === "activo" ? "inactivo" : "activo";
  const ok = await confirmDialog(`¿Deseas ${nuevoEstado === "activo" ? "activar" : "desactivar"} a "${c.nombre}"?`, {
    danger: nuevoEstado === "inactivo",
  });
  if (!ok) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, COL.CLIENTES, c.id), { estado: nuevoEstado });
    c.estado = nuevoEstado;
    toast("Cliente actualizado", "success");
    render();
  } catch (e) {
    toast("No se pudo actualizar", "danger");
  } finally {
    setLoading(false);
  }
}

function openForm(cliente = null) {
  const isEdit = !!cliente;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal modal-lg">
      <h3>${isEdit ? "Editar cliente" : "Nuevo cliente"}</h3>
      <form id="f-cliente">
        <div class="field-row">
          <div class="field"><label>Código</label><input type="text" id="f-codigo" value="${isEdit ? escapeHtml(cliente.codigo) : ""}" required /></div>
          <div class="field"><label>Nombre</label><input type="text" id="f-nombre" value="${isEdit ? escapeHtml(cliente.nombre) : ""}" required /></div>
        </div>
        <div class="field"><label>Dirección</label><input type="text" id="f-direccion" value="${isEdit ? escapeHtml(cliente.direccion || "") : ""}" /></div>
        <div class="field-row">
          <div class="field"><label>Teléfono</label><input type="text" id="f-telefono" value="${isEdit ? escapeHtml(cliente.telefono || "") : ""}" /></div>
          <div class="field"><label>Persona de contacto</label><input type="text" id="f-contacto" value="${isEdit ? escapeHtml(cliente.contacto || "") : ""}" /></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Vendedor asignado</label>
            <select id="f-vendedor">
              <option value="">Sin asignar</option>
              ${vendedores.map((v) => `<option value="${v.id}" ${cliente?.vendedorId === v.id ? "selected" : ""}>${escapeHtml(v.nombre)} (${escapeHtml(v.codigo)})</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Estado</label>
            <select id="f-estado">
              <option value="activo" ${cliente?.estado === "activo" || !isEdit ? "selected" : ""}>Activo</option>
              <option value="inactivo" ${cliente?.estado === "inactivo" ? "selected" : ""}>Inactivo</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? "Guardar cambios" : "Crear cliente"}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  if (!isEdit) document.getElementById("f-codigo").value = nextCode("CLI", clientes.map((c) => c.codigo));

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.close !== undefined) overlay.remove();
  });

  document.getElementById("f-cliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = document.getElementById("f-codigo").value.trim().toUpperCase();
    const nombre = document.getElementById("f-nombre").value.trim();
    const direccion = document.getElementById("f-direccion").value.trim();
    const telefono = document.getElementById("f-telefono").value.trim();
    const contacto = document.getElementById("f-contacto").value.trim();
    const vendedorId = document.getElementById("f-vendedor").value || null;
    const estado = document.getElementById("f-estado").value;

    if (clientes.some((c) => c.codigo?.toUpperCase() === codigo && c.id !== cliente?.id)) {
      toast("Ya existe un cliente con ese código.", "danger");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        const vendedorAnteriorId = cliente.vendedorId || null;
        await updateDoc(doc(db, COL.CLIENTES, cliente.id), { codigo, nombre, direccion, telefono, contacto, vendedorId, estado });
        // Si cambió de vendedor, registrar en historialAsignaciones (no se duplica el cliente).
        if (vendedorAnteriorId !== vendedorId) {
          await addDoc(collection(db, COL.HISTORIAL_ASIGNACIONES), {
            clienteId: cliente.id,
            vendedorAnteriorId,
            vendedorNuevoId: vendedorId,
            fecha: serverTimestamp(),
            usuario: currentUser?.email || "sistema",
          });
        }
        toast("Cliente actualizado", "success");
      } else {
        const ref = await addDoc(collection(db, COL.CLIENTES), {
          codigo,
          nombre,
          direccion,
          telefono,
          contacto,
          vendedorId,
          estado,
          fechaCreacion: serverTimestamp(),
        });
        if (vendedorId) {
          await addDoc(collection(db, COL.HISTORIAL_ASIGNACIONES), {
            clienteId: ref.id,
            vendedorAnteriorId: null,
            vendedorNuevoId: vendedorId,
            fecha: serverTimestamp(),
            usuario: currentUser?.email || "sistema",
          });
        }
        toast("Cliente creado", "success");
      }
      overlay.remove();
      await load();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el cliente", "danger");
    } finally {
      setLoading(false);
    }
  });
}

load();
