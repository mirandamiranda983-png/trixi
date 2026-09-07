import { mountShell } from "./nav.js";
import { db, COL } from "./firebase-config.js";
import {
  collection,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { money, formatDate, todayISO, setLoading } from "./utils.js";
import { getConfig } from "./config-service.js";

const content = await mountShell(
  "dashboard.html",
  `
  <div class="cards-grid" id="cards"></div>
  <div class="panel">
    <div class="panel-header">
      <h2>Reportes recientes</h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Vendedores</th><th>Clientes</th><th>Total general</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tbody-reportes"><tr class="empty-row"><td colspan="6">Cargando...</td></tr></tbody>
      </table>
    </div>
  </div>
  `
);

async function load() {
  setLoading(true);
  try {
    const cfg = await getConfig();
    const [vActivos, cTotal, pTotal, rTotal] = await Promise.all([
      getCountFromServer(query(collection(db, COL.VENDEDORES), where("estado", "==", "activo"))),
      getCountFromServer(collection(db, COL.CLIENTES)),
      getCountFromServer(collection(db, COL.PRODUCTOS)),
      getCountFromServer(collection(db, COL.REPORTES)),
    ]);

    // Total del día y del mes (se calcula sobre reportes registrados)
    const todos = await getDocs(query(collection(db, COL.REPORTES), orderBy("fechaReporte", "desc"), limit(60)));
    let totalHoy = 0;
    let totalMes = 0;
    const hoy = todayISO();
    const mesActual = hoy.slice(0, 7);
    todos.forEach((d) => {
      const r = d.data();
      if (r.estado !== "registrado") return;
      if (r.fechaReporte === hoy) totalHoy += r.totalGeneral || 0;
      if ((r.fechaReporte || "").slice(0, 7) === mesActual) totalMes += r.totalGeneral || 0;
    });

    document.getElementById("cards").innerHTML = [
      card("Vendedores activos", vActivos.data().count),
      card("Clientes registrados", cTotal.data().count),
      card("Productos registrados", pTotal.data().count),
      card("Reportes generados", rTotal.data().count),
      card("Total del día", money(totalHoy, cfg.moneda, cfg.decimales)),
      card("Total del mes", money(totalMes, cfg.moneda, cfg.decimales)),
    ].join("");

    const tbody = document.getElementById("tbody-reportes");
    if (todos.empty) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Aún no hay reportes generados.</td></tr>`;
    } else {
      const rows = [];
      let count = 0;
      todos.forEach((d) => {
        if (count >= 8) return;
        count++;
        const r = d.data();
        rows.push(`<tr>
          <td>${formatDate(r.fechaReporte)}</td>
          <td>${r.configuracion?.totalVendedores ?? "-"}</td>
          <td>${r.configuracion?.totalClientes ?? "-"}</td>
          <td>${money(r.totalGeneral, cfg.moneda, cfg.decimales)}</td>
          <td>${estadoBadge(r.estado)}</td>
          <td><a class="btn btn-ghost btn-sm" href="historial.html?id=${d.id}">Ver</a></td>
        </tr>`);
      });
      tbody.innerHTML = rows.join("");
    }
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function estadoBadge(estado) {
  if (estado === "registrado") return `<span class="badge badge-success">Registrado</span>`;
  if (estado === "anulado") return `<span class="badge badge-danger">Anulado</span>`;
  return `<span class="badge badge-muted">${estado || "-"}</span>`;
}

function card(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

load();
