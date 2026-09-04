// ============================================================
// TRIXI — importacion.js
// Importación masiva de Vendedores, Clientes y Productos desde CSV/XLSX
// ============================================================

import { importBatch, getAllDocs, clearCache } from './db.js';
import { toast, confirmDialog, escapeHtml, showLoading, hideLoading } from './ui.js';
import { parseCSV, isValidPrice, isValidRange } from './utils.js';

// Estado
let pendingData = [];
let pendingType = ''; // 'vendedores' | 'clientes' | 'productos'
let validationResults = { valid: 0, errors: 0, dupes: 0, rows: [] };

export function initImportacion() {
  setupEvents();
}

function setupEvents() {
  const fileInput = document.getElementById('import-file');
  const uploadArea = document.getElementById('import-upload-area');
  
  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  document.getElementById('btn-import-confirm')?.addEventListener('click', confirmImport);
  document.getElementById('btn-import-cancel')?.addEventListener('click', cancelImport);
}

async function handleFileSelect(file) {
  const type = document.getElementById('import-type')?.value;
  if (!type) {
    toast.warning('Selecciona el tipo de dato a importar.');
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'csv' && ext !== 'xlsx') {
    toast.error('Solo se admiten archivos CSV o XLSX.');
    return;
  }

  pendingType = type;
  showLoading('Leyendo archivo...');

  try {
    let rawData = [];
    if (ext === 'csv') {
      const text = await readFileAsText(file);
      rawData = parseCSV(text);
    } else {
      rawData = await parseXLSX(file);
    }

    if (!rawData || !rawData.length) {
      toast.error('El archivo está vacío o no tiene un formato válido.');
      hideLoading();
      return;
    }

    await validateData(rawData, type);
    showPreview();
    
    // Switch view
    document.getElementById('import-step-1').classList.add('hidden');
    document.getElementById('import-step-2').classList.remove('hidden');

  } catch (e) {
    console.error(e);
    toast.error('Error al procesar el archivo: ' + e.message);
  } finally {
    hideLoading();
    document.getElementById('import-file').value = ''; // Reset
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsText(file);
  });
}

async function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = e => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

// ── Validación ────────────────────────────────────────────────
async function validateData(data, type) {
  showLoading('Validando datos contra la base de datos...');
  
  validationResults = { valid: 0, errors: 0, dupes: 0, rows: [] };
  
  // Obtener datos existentes para checar duplicados (memoria, asumimos < 10k registros)
  const existingDocs = await getAllDocs(type, { useCache: false });
  const existingCodes = new Set(existingDocs.map(d => d.codigo?.toUpperCase()).filter(Boolean));
  
  let mapVendedores = {};
  if (type === 'clientes') {
    const vends = await getAllDocs('vendedores', { useCache: false });
    vends.forEach(v => mapVendedores[v.codigo.toUpperCase()] = v.id);
  }

  const cleanHeader = (key) => key.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  data.forEach((row, index) => {
    // Normalizar llaves
    const normRow = {};
    Object.keys(row).forEach(k => normRow[cleanHeader(k)] = row[k]);

    let item = { ...normRow, _status: 'valid', _errors: [] };
    const codigo = (normRow.codigo || '').toString().trim().toUpperCase();

    if (!codigo) {
      item._status = 'error';
      item._errors.push('Código vacío');
    } else if (existingCodes.has(codigo)) {
      item._status = 'dupe';
      item._errors.push('El código ya existe en el sistema');
    }
    existingCodes.add(codigo); // Para detectar duplicados dentro del mismo archivo

    if (type === 'vendedores') {
      item.codigo = codigo;
      item.nombre = (normRow.nombre || '').toString().trim();
      item.estado = (normRow.estado || 'activo').toString().trim().toLowerCase();
      
      if (!item.nombre) { item._status = 'error'; item._errors.push('Nombre requerido'); }
      if (!['activo', 'inactivo'].includes(item.estado)) item.estado = 'activo';

    } else if (type === 'clientes') {
      item.codigo = codigo;
      item.nombre = (normRow.nombre || '').toString().trim();
      item.direccion = (normRow.direccion || '').toString().trim();
      item.telefono = (normRow.telefono || '').toString().trim();
      item.contacto = (normRow.contacto || '').toString().trim();
      const vendCod = (normRow.vendedor || '').toString().trim().toUpperCase();
      item.estado = (normRow.estado || 'activo').toString().trim().toLowerCase();

      if (!item.nombre) { item._status = 'error'; item._errors.push('Nombre requerido'); }
      if (!vendCod) { 
        item._status = 'error'; item._errors.push('Código de vendedor requerido'); 
      } else if (!mapVendedores[vendCod]) {
        item._status = 'error'; item._errors.push(`Vendedor ${vendCod} no existe`);
      } else {
        item.vendedorId = mapVendedores[vendCod];
      }
      if (!['activo', 'inactivo'].includes(item.estado)) item.estado = 'activo';

    } else if (type === 'productos') {
      item.codigo = codigo;
      item.nombre = (normRow.nombre || '').toString().trim();
      item.categoria = (normRow.categoria || '').toString().trim();
      item.precio = parseFloat(normRow.precio);
      item.unidadMedida = (normRow.unidadmedida || normRow.unidad || 'unidad').toString().trim();
      item.cantidadMinima = parseInt(normRow.cantidadminima || normRow.minima || 1);
      item.cantidadMaxima = parseInt(normRow.cantidadmaxima || normRow.maxima || 20);
      item.estado = (normRow.estado || 'activo').toString().trim().toLowerCase();

      if (!item.nombre) { item._status = 'error'; item._errors.push('Nombre requerido'); }
      if (!isValidPrice(item.precio)) { item._status = 'error'; item._errors.push('Precio inválido'); }
      if (!isValidRange(item.cantidadMinima, item.cantidadMaxima)) { item._status = 'error'; item._errors.push('Rango de cantidades inválido'); }
      if (!['activo', 'inactivo'].includes(item.estado)) item.estado = 'activo';
    }

    if (item._status === 'valid') validationResults.valid++;
    else if (item._status === 'error') validationResults.errors++;
    else if (item._status === 'dupe') validationResults.dupes++;

    validationResults.rows.push(item);
  });
}

// ── Preview ───────────────────────────────────────────────────
function showPreview() {
  setEl('import-stat-valid', validationResults.valid);
  setEl('import-stat-errors', validationResults.errors);
  setEl('import-stat-dupes', validationResults.dupes);

  const tbody = document.getElementById('import-preview-tbody');
  if (!tbody) return;

  const limitedRows = validationResults.rows.slice(0, 100); // Mostrar max 100

  tbody.innerHTML = limitedRows.map(row => {
    let rowClass = '';
    let statusIcon = '✅';
    if (row._status === 'error') { rowClass = 'import-error-row'; statusIcon = '❌'; }
    if (row._status === 'dupe') { rowClass = 'import-warn-row'; statusIcon = '⚠️'; }

    return `
      <tr class="${rowClass}">
        <td class="text-center">${statusIcon}</td>
        <td class="td-code">${escapeHtml(row.codigo)}</td>
        <td class="font-medium">${escapeHtml(row.nombre)}</td>
        <td class="text-xs text-danger">${escapeHtml(row._errors.join(', '))}</td>
      </tr>
    `;
  }).join('');

  if (validationResults.rows.length > 100) {
    tbody.innerHTML += `<tr><td colspan="4" class="text-center text-muted p-4">Mostrando los primeros 100 registros de ${validationResults.rows.length}</td></tr>`;
  }

  const btnConfirm = document.getElementById('btn-import-confirm');
  if (btnConfirm) {
    btnConfirm.disabled = validationResults.valid === 0;
    btnConfirm.textContent = `Importar ${validationResults.valid} registros válidos`;
  }
}

// ── Confirmar y Guardar ───────────────────────────────────────
async function confirmImport() {
  const validRows = validationResults.rows.filter(r => r._status === 'valid');
  if (!validRows.length) return;

  const ok = await confirmDialog({
    title: 'Confirmar importación',
    message: `Se importarán ${validRows.length} registros en la colección "${pendingType}". Los registros con errores o duplicados serán ignorados.`,
    confirmText: 'Importar'
  });

  if (!ok) return;

  showLoading('Importando datos...');
  
  try {
    // Limpiar props internas antes de guardar
    const docsToSave = validRows.map(r => {
      const copy = { ...r };
      delete copy._status;
      delete copy._errors;
      return copy;
    });

    await importBatch(pendingType, docsToSave);
    
    clearCache(pendingType);
    toast.success(`Se importaron ${docsToSave.length} registros exitosamente.`);
    
    cancelImport(); // Volver al inicio

  } catch(e) {
    console.error(e);
    toast.error('Error durante la importación: ' + e.message);
  } finally {
    hideLoading();
  }
}

function cancelImport() {
  pendingType = '';
  validationResults = { valid: 0, errors: 0, dupes: 0, rows: [] };
  document.getElementById('import-file').value = '';
  document.getElementById('import-step-2').classList.add('hidden');
  document.getElementById('import-step-1').classList.remove('hidden');
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
