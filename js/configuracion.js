import { mountShell } from "./nav.js";
import { toast, setLoading } from "./utils.js";
import { getConfig, saveConfig } from "./config-service.js";

const content = await mountShell(
  "configuracion.html",
  `
  <form id="f-config" class="panel" style="max-width:640px;">
    <div class="panel-header"><h2>Parámetros de asignación y generación</h2></div>
    <div class="field-row">
      <div class="field"><label>Clientes mínimos por vendedor</label><input type="number" id="c-cmin" min="1" required /></div>
      <div class="field"><label>Clientes máximos por vendedor</label><input type="number" id="c-cmax" min="1" required /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Productos mínimos por cliente</label><input type="number" id="c-pmin" min="1" required /></div>
      <div class="field"><label>Productos máximos por cliente</label><input type="number" id="c-pmax" min="1" required /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Cantidad mínima general</label><input type="number" id="c-qmin" min="1" required /></div>
      <div class="field"><label>Cantidad máxima general</label><input type="number" id="c-qmax" min="1" required /></div>
    </div>

    <div class="panel-header" style="margin-top:10px;"><h2>Empresa y formato</h2></div>
    <div class="field-row">
      <div class="field"><label>Nombre de la empresa</label><input type="text" id="c-empresa" required /></div>
      <div class="field"><label>Nombre de los reportes</label><input type="text" id="c-nombrereportes" required /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Símbolo de moneda</label><input type="text" id="c-moneda" maxlength="3" required /></div>
      <div class="field"><label>Decimales</label><input type="number" id="c-decimales" min="0" max="4" required /></div>
    </div>

    <button type="submit" class="btn btn-primary">Guardar configuración</button>
  </form>
  `
);

async function load() {
  setLoading(true);
  try {
    const cfg = await getConfig();
    document.getElementById("c-cmin").value = cfg.clientesMinPorVendedor;
    document.getElementById("c-cmax").value = cfg.clientesMaxPorVendedor;
    document.getElementById("c-pmin").value = cfg.productosMinPorCliente;
    document.getElementById("c-pmax").value = cfg.productosMaxPorCliente;
    document.getElementById("c-qmin").value = cfg.cantidadMinGeneral;
    document.getElementById("c-qmax").value = cfg.cantidadMaxGeneral;
    document.getElementById("c-empresa").value = cfg.nombreEmpresa;
    document.getElementById("c-nombrereportes").value = cfg.nombreReportes;
    document.getElementById("c-moneda").value = cfg.moneda;
    document.getElementById("c-decimales").value = cfg.decimales;
  } finally {
    setLoading(false);
  }
}

document.getElementById("f-config").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientesMinPorVendedor = parseInt(document.getElementById("c-cmin").value, 10);
  const clientesMaxPorVendedor = parseInt(document.getElementById("c-cmax").value, 10);
  const productosMinPorCliente = parseInt(document.getElementById("c-pmin").value, 10);
  const productosMaxPorCliente = parseInt(document.getElementById("c-pmax").value, 10);
  const cantidadMinGeneral = parseInt(document.getElementById("c-qmin").value, 10);
  const cantidadMaxGeneral = parseInt(document.getElementById("c-qmax").value, 10);

  if (clientesMaxPorVendedor < clientesMinPorVendedor) return toast("El máximo de clientes debe ser ≥ al mínimo.", "danger");
  if (productosMaxPorCliente < productosMinPorCliente) return toast("El máximo de productos debe ser ≥ al mínimo.", "danger");
  if (cantidadMaxGeneral < cantidadMinGeneral) return toast("La cantidad máxima debe ser ≥ a la mínima.", "danger");

  setLoading(true);
  try {
    await saveConfig({
      clientesMinPorVendedor,
      clientesMaxPorVendedor,
      productosMinPorCliente,
      productosMaxPorCliente,
      cantidadMinGeneral,
      cantidadMaxGeneral,
      nombreEmpresa: document.getElementById("c-empresa").value.trim(),
      nombreReportes: document.getElementById("c-nombrereportes").value.trim(),
      moneda: document.getElementById("c-moneda").value.trim() || "$",
      decimales: parseInt(document.getElementById("c-decimales").value, 10),
    });
    toast("Configuración guardada", "success");
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar la configuración", "danger");
  } finally {
    setLoading(false);
  }
});

load();
