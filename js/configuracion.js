// ============================================================
// TRIXI — configuracion.js
// Configuración global del sistema
// ============================================================

import { getDocById, setDocById } from './db.js';
import { toast, showLoading, hideLoading } from './ui.js';

const DOC_ID = 'global';
const COL = 'configuracion';

let cacheConfig = null;

export async function initConfiguracion() {
  await loadConfig();
  setupEvents();
}

export async function getConfig() {
  if (cacheConfig) return cacheConfig;
  try {
    const data = await getDocById(COL, DOC_ID);
    if (data) {
      cacheConfig = data;
      return data;
    }
  } catch (e) {
    console.error("No config found, using defaults", e);
  }
  // Default config
  const defaultCfg = {
    clientesMinPorVendedor: 15,
    clientesMaxPorVendedor: 20,
    productosMinPorCliente: 1,
    productosMaxPorCliente: 3,
    cantidadMinGeneral: 1,
    cantidadMaxGeneral: 20,
    moneda: 'Q',
    decimales: 2,
    nombreEmpresa: 'TRIXI Corp',
  };
  cacheConfig = defaultCfg;
  return defaultCfg;
}

async function loadConfig() {
  const cfg = await getConfig();
  
  setVal('cfg-cli-min', cfg.clientesMinPorVendedor);
  setVal('cfg-cli-max', cfg.clientesMaxPorVendedor);
  setVal('cfg-prod-min', cfg.productosMinPorCliente);
  setVal('cfg-prod-max', cfg.productosMaxPorCliente);
  setVal('cfg-cant-min', cfg.cantidadMinGeneral);
  setVal('cfg-cant-max', cfg.cantidadMaxGeneral);
  
  setVal('cfg-moneda', cfg.moneda);
  setVal('cfg-decimales', cfg.decimales);
  setVal('cfg-empresa', cfg.nombreEmpresa);
}

function setupEvents() {
  document.getElementById('btn-save-config')?.addEventListener('click', async () => {
    
    const clientesMinPorVendedor = parseInt(getVal('cfg-cli-min') || 15);
    const clientesMaxPorVendedor = parseInt(getVal('cfg-cli-max') || 20);
    const productosMinPorCliente = parseInt(getVal('cfg-prod-min') || 1);
    const productosMaxPorCliente = parseInt(getVal('cfg-prod-max') || 3);
    const cantidadMinGeneral     = parseInt(getVal('cfg-cant-min') || 1);
    const cantidadMaxGeneral     = parseInt(getVal('cfg-cant-max') || 20);
    const moneda                 = getVal('cfg-moneda') || 'Q';
    const decimales              = parseInt(getVal('cfg-decimales') || 2);
    const nombreEmpresa          = getVal('cfg-empresa') || 'TRIXI';

    // Validate
    if (clientesMinPorVendedor > clientesMaxPorVendedor) return toast.warning("Mínimo de clientes no puede ser mayor al máximo.");
    if (productosMinPorCliente > productosMaxPorCliente) return toast.warning("Mínimo de productos no puede ser mayor al máximo.");
    if (cantidadMinGeneral > cantidadMaxGeneral) return toast.warning("Cantidad mínima general no puede ser mayor a la máxima.");

    showLoading('Guardando configuración...');
    try {
      const data = {
        clientesMinPorVendedor,
        clientesMaxPorVendedor,
        productosMinPorCliente,
        productosMaxPorCliente,
        cantidadMinGeneral,
        cantidadMaxGeneral,
        moneda,
        decimales,
        nombreEmpresa
      };
      
      await setDocById(COL, DOC_ID, data, true);
      cacheConfig = data;
      window.TRIXI_CONFIG = data;
      
      toast.success('Configuración guardada correctamente.');
    } catch (e) {
      toast.error('Error al guardar configuración.');
    } finally {
      hideLoading();
    }
  });
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : null;
}
