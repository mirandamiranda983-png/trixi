// ============================================================
// TRIXI — utils.js
// Utilidades generales: RNG, fechas, formato, colores
// ============================================================

// ── Generador de números pseudoaleatorios con semilla ───────
// Algoritmo: mulberry32 — rápido, reproducible
export function createSeededRNG(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let state = h;

  return function () {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Entero en rango [min, max] inclusive
export function randomInt(rng, min, max) {
  if (min === max) return min;
  if (min > max) [min, max] = [max, min];
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Fisher-Yates shuffle con RNG
export function shuffleArray(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generar semilla legible
export function generateSeed() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${ts}-${rnd}`;
}

// ── Formato de números ──────────────────────────────────────
export function formatCurrency(value, currency = 'Q', decimals = 2) {
  if (isNaN(value) || value === null || value === undefined) return `${currency} 0.00`;
  return `${currency} ${Number(value).toLocaleString('es-GT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatNumber(value, decimals = 0) {
  if (isNaN(value) || value === null || value === undefined) return '0';
  return Number(value).toLocaleString('es-GT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value, decimals = 1) {
  return `${Number(value).toFixed(decimals)}%`;
}

// ── Fechas ──────────────────────────────────────────────────
export function formatDate(date, opts = {}) {
  if (!date) return '—';
  let d;
  if (date && typeof date.toDate === 'function') d = date.toDate();
  else if (date instanceof Date) d = date;
  else d = new Date(date);
  if (isNaN(d)) return '—';

  const defaultOpts = { year: 'numeric', month: '2-digit', day: '2-digit', ...opts };
  return d.toLocaleDateString('es-GT', defaultOpts);
}

export function formatDateTime(date) {
  if (!date) return '—';
  let d;
  if (date && typeof date.toDate === 'function') d = date.toDate();
  else if (date instanceof Date) d = date;
  else d = new Date(date);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-GT', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateISO(date) {
  if (!date) return '';
  let d;
  if (date && typeof date.toDate === 'function') d = date.toDate();
  else if (date instanceof Date) d = date;
  else d = new Date(date);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

export function parseDateISO(str) {
  // Parses YYYY-MM-DD without timezone shift
  if (!str) return null;
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function today() {
  return formatDateISO(new Date());
}

export function monthStart(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function monthEnd(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0);
}

// ── Strings ─────────────────────────────────────────────────
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getInitials(name, count = 2) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, count)
    .map(n => n[0]?.toUpperCase() || '')
    .join('');
}

export function truncateText(str, maxLen = 40) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// ── Arrays y objetos ────────────────────────────────────────
export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

export function sumBy(arr, key) {
  return arr.reduce((s, item) => {
    const v = typeof key === 'function' ? key(item) : item[key];
    return s + (Number(v) || 0);
  }, 0);
}

export function unique(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    const k = key ? item[key] : item;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function sortBy(arr, key, dir = 'asc') {
  return [...arr].sort((a, b) => {
    const av = typeof key === 'function' ? key(a) : a[key];
    const bv = typeof key === 'function' ? key(b) : b[key];
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

export function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Colores ─────────────────────────────────────────────────
const COLORS_CHART = [
  '#2563eb','#16a34a','#d97706','#dc2626','#7c3aed',
  '#0891b2','#db2777','#65a30d','#ea580c','#0369a1',
  '#9333ea','#059669','#ca8a04','#e11d48','#2dd4bf',
];

export function getChartColor(index) {
  return COLORS_CHART[index % COLORS_CHART.length];
}

export function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS_CHART[Math.abs(hash) % COLORS_CHART.length];
}

// ── Debounce ─────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Descarga de archivos ─────────────────────────────────────
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadText(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

// ── Validaciones básicas ─────────────────────────────────────
export function isValidPrice(val) {
  return !isNaN(val) && Number(val) >= 0;
}

export function isValidRange(min, max) {
  return (
    !isNaN(min) && !isNaN(max) &&
    Number(min) > 0 &&
    Number(max) >= Number(min)
  );
}

// ── CSV parser simple ─────────────────────────────────────────
export function parseCSV(text, delimiter = ',') {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line, delimiter);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
    return row;
  });
}

function splitCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Clonar objeto (deep, JSON-safe) ─────────────────────────
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Sleep ────────────────────────────────────────────────────
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Re-exports para compatibilidad cruzada ───────────────────
export { filterTable } from './ui.js';
