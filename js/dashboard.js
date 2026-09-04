// ============================================================
// TRIXI — dashboard.js
// Tarjetas de resumen y gráficos del panel principal
// ============================================================

import { getAllDocs } from './db.js';
import { formatCurrency, formatNumber, groupBy, sumBy, getChartColor } from './utils.js';

let chartInstance = null;

export async function initDashboard() {
  await loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [vendedores, clientes, productos, reportes] = await Promise.all([
      getAllDocs('vendedores', { useCache: true }),
      getAllDocs('clientes',   { useCache: true }),
      getAllDocs('productos',  { useCache: true }),
      getAllDocs('reportes',   { useCache: true })
    ]);

    // Totales
    const vendActivos = vendedores.filter(v => v.estado === 'activo').length;
    const clieActivos = clientes.filter(c => c.estado === 'activo').length;
    const prodActivos = productos.filter(p => p.estado === 'activo').length;
    
    setEl('dash-vend', vendActivos);
    setEl('dash-cli',  clieActivos);
    setEl('dash-prod', prodActivos);
    setEl('dash-rep',  reportes.length);

    // Calcular mes actual y día actual
    const cfg = window.TRIXI_CONFIG || { moneda: 'Q', decimales: 2 };
    const dateStr = new Date().toISOString().split('T')[0];
    const currentMonthPrefix = dateStr.substring(0, 7); // "YYYY-MM"

    const todayReport = reportes.find(r => r.fechaReporte === dateStr);
    const totalHoy = todayReport ? todayReport.totalGeneral : 0;
    
    const monthReports = reportes.filter(r => r.fechaReporte.startsWith(currentMonthPrefix));
    const totalMes = sumBy(monthReports, 'totalGeneral');

    setEl('dash-hoy', formatCurrency(totalHoy, cfg.moneda, cfg.decimales));
    setEl('dash-mes', formatCurrency(totalMes, cfg.moneda, cfg.decimales));

    // Graficar últimos 7 días
    renderChart(reportes, cfg);
    
    // Actividad reciente
    renderRecentActivity(reportes, cfg);

  } catch (e) {
    console.error('Error cargando dashboard', e);
  }
}

function renderChart(reportes, cfg) {
  const canvas = document.getElementById('dash-chart');
  if (!canvas || !window.Chart) return;

  // Obtener ultimos 7 reportes (ordenados por fecha asc)
  const sorted = [...reportes].sort((a,b) => a.fechaReporte.localeCompare(b.fechaReporte));
  const ultimos7 = sorted.slice(-7);

  const labels = ultimos7.map(r => r.fechaReporte.substring(5)); // MM-DD
  const data = ultimos7.map(r => r.totalGeneral);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Sin datos'],
      datasets: [{
        label: 'Ventas Totales',
        data: data.length ? data : [0],
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw, cfg.moneda, cfg.decimales)
          }
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderRecentActivity(reportes, cfg) {
  const container = document.getElementById('dash-activity');
  if (!container) return;

  const sorted = [...reportes].sort((a,b) => b.fechaCreacion - a.fechaCreacion);
  const ultimos5 = sorted.slice(0, 5);

  if (!ultimos5.length) {
    container.innerHTML = `<div class="text-muted text-sm mt-2">No hay actividad reciente.</div>`;
    return;
  }

  container.innerHTML = ultimos5.map(r => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div class="activity-info">
        <div class="activity-text">Se generó el reporte del <strong>${r.fechaReporte}</strong> por ${formatCurrency(r.totalGeneral, cfg.moneda, cfg.decimales)}</div>
        <div class="activity-time">${new Date(r.fechaCreacion?.toDate() || Date.now()).toLocaleString('es-GT')}</div>
      </div>
    </div>
  `).join('');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
