// ============================================================
// UTILIDADES COMUNES
// ============================================================

// ---------- Formato ----------
export function money(n, currency = "$", decimals = 2) {
  const v = Number(n) || 0;
  return `${currency}${v.toLocaleString("es-SV", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatDate(d) {
  if (!d) return "-";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString("es-SV", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(d) {
  if (!d) return "-";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleString("es-SV");
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// ---------- Toasts ----------
let toastRoot;
export function toast(msg, type = "info", ms = 3500) {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-root";
    document.body.appendChild(toastRoot);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Confirmación ----------
export function confirmDialog(message, { title = "Confirmar", danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal modal-sm">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.act === "cancel") {
        overlay.remove();
        resolve(false);
      } else if (e.target.dataset.act === "ok") {
        overlay.remove();
        resolve(true);
      }
    });
  });
}

// ---------- Loading overlay ----------
let loadingCount = 0;
let loadingEl;
export function setLoading(on) {
  loadingCount += on ? 1 : -1;
  if (loadingCount < 0) loadingCount = 0;
  if (!loadingEl) {
    loadingEl = document.createElement("div");
    loadingEl.className = "loading-overlay";
    loadingEl.innerHTML = `<div class="spinner"></div>`;
    document.body.appendChild(loadingEl);
  }
  loadingEl.classList.toggle("show", loadingCount > 0);
}

// ---------- Debounce ----------
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Generador de código simple ----------
export function nextCode(prefix, existingCodes, pad = 3) {
  let n = 1;
  const set = new Set(existingCodes.map((c) => (c || "").toUpperCase()));
  while (set.has(`${prefix}${String(n).padStart(pad, "0")}`)) n++;
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

// ============================================================
// ALEATORIEDAD CON SEMILLA (mulberry32) — reproducible
// ============================================================
export function makeSeed() {
  return Math.random().toString(36).slice(2, 10).toUpperCase() + Date.now().toString(36).toUpperCase();
}

export function mulberry32(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randInt(rnd, min, max) {
  if (max < min) [min, max] = [max, min];
  return Math.floor(rnd() * (max - min + 1)) + min;
}

// Elige una cantidad dentro de [min,max] intentando no repetir valores
// ya usados para ese producto, y si el rango se agota, evita repetir
// el último valor usado consecutivamente.
export function pickVariedQuantity(rnd, min, max, usedValues, lastValue) {
  min = Math.max(1, Math.floor(min));
  max = Math.max(min, Math.floor(max));
  const rangeSize = max - min + 1;
  const available = [];
  for (let v = min; v <= max; v++) {
    if (!usedValues.has(v)) available.push(v);
  }
  let pool = available.length > 0 ? available : Array.from({ length: rangeSize }, (_, i) => min + i);
  if (pool.length > 1 && lastValue !== undefined) {
    const filtered = pool.filter((v) => v !== lastValue);
    if (filtered.length > 0) pool = filtered;
  }
  const chosen = pool[randInt(rnd, 0, pool.length - 1)];
  usedValues.add(chosen);
  return chosen;
}

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

export function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")].concat(
    rows.map((r) => r.map(escape).join(","))
  );
  downloadBlob(filename, new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
