import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, setLoading, debounce, nextCode, confirmDialog, escapeHtml, formatDate } from "./utils.js";

const content = await mountShell(
  "vendedores.html",
  `
  <div class="panel">
    <div class="toolbar">
      <div class="grow">
        <input type="text" id="search" class="search-input" placeholder="Buscar por código o nombre..." />
      </div>
      <select id="filter-estado" style="width:170px">
        <option value="">Todos los estados</option>
        <option value="activo">Activos</option>
        <option value="inactivo">Inactivos</option>
      </select>
      <button class="btn btn-primary" id="btn-new">+ Nuevo vendedor</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th>Clientes asignados</th><th>Creado</th><th></th></tr></thead>
        <tbody id="tbody"><tr class="empty-row"><td colspan="6">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>
  `
);

let all = [];

async function load() {
  setLoading(true);
  try {
    const snap = await getDocs(collection(db, COL.VENDEDORES));
    all = [];
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
    all.sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));
    await render();
  } catch (e) {
    console.error(e);
    toast("Error cargando vendedores", "danger");
  } finally {
    setLoading(false);
  }
}

async function render() {
  const term = document.getElementById("search").value.trim().toLowerCase();
  const estado = document.getElementById("filter-estado").value;
  let rows = all.filter((v) => {
    const okTerm = !term || v.codigo?.toLowerCase().includes(term) || v.nombre?.toLowerCase().includes(term);
    const okEstado = !estado || v.estado === estado;
    return okTerm && okEstado;
  });

  const tbody = document.getElementById("tbody");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No se encontraron vendedores.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (v) => `<tr data-id="${v.id}">
        <td><strong>${escapeHtml(v.codigo)}</strong></td>
        <td>${escapeHtml(v.nombre)}</td>
        <td>${v.estado === "activo" ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-muted">Inactivo</span>'}</td>
        <td><span class="pill" data-clientes="${v.id}">…</span></td>
        <td>${formatDate(v.fechaCreacion)}</td>
        <td class="flex gap-8">
          <button class="icon-btn" data-act="edit" title="Editar">✏️</button>
          <button class="icon-btn" data-act="toggle" title="${v.estado === "activo" ? "Desactivar" : "Activar"}">${v.estado === "activo" ? "🚫" : "✅"}</button>
          <a class="icon-btn" href="historial.html?vendedorId=${v.id}" title="Ver reportes">📄</a>
        </td>
      </tr>`
    )
    .join("");

  // cargar conteo de clientes por vendedor (en paralelo, no bloquea la tabla)
  rows.forEach(async (v) => {
    try {
      const c = await getCountFromServer(query(collection(db, COL.CLIENTES), where("vendedorId", "==", v.id)));
      const el = tbody.querySelector(`[data-clientes="${v.id}"]`);
      if (el) el.textContent = c.data().count;
    } catch {
      /* silencioso */
    }
  });
}

document.getElementById("search").addEventListener("input", debounce(render, 200));
document.getElementById("filter-estado").addEventListener("change", render);
document.getElementById("btn-new").addEventListener("click", () => openForm());

document.getElementById("tbody").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const id = tr.dataset.id;
  const vendedor = all.find((v) => v.id === id);
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "edit") openForm(vendedor);
  if (act === "toggle") await toggleEstado(vendedor);
});

async function toggleEstado(v) {
  const nuevoEstado = v.estado === "activo" ? "inactivo" : "activo";
  const ok = await confirmDialog(
    `¿Deseas ${nuevoEstado === "activo" ? "activar" : "desactivar"} al vendedor "${v.nombre}"?`,
    { danger: nuevoEstado === "inactivo" }
  );
  if (!ok) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, COL.VENDEDORES, v.id), { estado: nuevoEstado });
    v.estado = nuevoEstado;
    toast("Vendedor actualizado", "success");
    render();
  } catch (e) {
    console.error(e);
    toast("No se pudo actualizar el vendedor", "danger");
  } finally {
    setLoading(false);
  }
}

function openForm(vendedor = null) {
  const isEdit = !!vendedor;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? "Editar vendedor" : "Nuevo vendedor"}</h3>
      <form id="f-vendedor">
        <div class="field">
          <label>Código</label>
          <input type="text" id="f-codigo" value="${isEdit ? escapeHtml(vendedor.codigo) : ""}" required />
        </div>
        <div class="field">
          <label>Nombre completo</label>
          <input type="text" id="f-nombre" value="${isEdit ? escapeHtml(vendedor.nombre) : ""}" required />
        </div>
        <div class="field">
          <label>Estado</label>
          <select id="f-estado">
            <option value="activo" ${vendedor?.estado === "activo" || !isEdit ? "selected" : ""}>Activo</option>
            <option value="inactivo" ${vendedor?.estado === "inactivo" ? "selected" : ""}>Inactivo</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? "Guardar cambios" : "Crear vendedor"}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  if (!isEdit) {
    document.getElementById("f-codigo").value = nextCode("VEN", all.map((v) => v.codigo));
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.close !== undefined) overlay.remove();
  });

  document.getElementById("f-vendedor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = document.getElementById("f-codigo").value.trim().toUpperCase();
    const nombre = document.getElementById("f-nombre").value.trim();
    const estado = document.getElementById("f-estado").value;

    const duplicado = all.some((v) => v.codigo?.toUpperCase() === codigo && v.id !== vendedor?.id);
    if (duplicado) {
      toast("Ya existe un vendedor con ese código.", "danger");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, COL.VENDEDORES, vendedor.id), { codigo, nombre, estado });
        toast("Vendedor actualizado", "success");
      } else {
        await addDoc(collection(db, COL.VENDEDORES), {
          codigo,
          nombre,
          estado,
          fechaCreacion: serverTimestamp(),
        });
        toast("Vendedor creado", "success");
      }
      overlay.remove();
      await load();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el vendedor", "danger");
    } finally {
      setLoading(false);
    }
  });
}

load();
