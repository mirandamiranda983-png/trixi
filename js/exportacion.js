// ============================================================
// TRIXI — exportacion.js
// Exportación a PDF y Excel
// ============================================================

import { formatDate, formatCurrency, groupBy, sumBy, sortBy } from './utils.js';

// ── Exportar a PDF ──────────────────────────────────────────
export function exportReportePDF(reporte, detalles, config) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librería jsPDF no está cargada.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'letter'); // Carta (Letter) portrait
  
  const { moneda = 'Q', decimales = 2, nombreEmpresa = 'TRIXI' } = config;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // -- Encabezado --
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(nombreEmpresa, 40, 40);
  
  doc.setFontSize(14);
  doc.text('Reporte Diario de Ventas', 40, 65);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${formatDate(reporte.fechaReporte)}`, 40, 85);
  doc.text(`Total General: ${formatCurrency(reporte.totalGeneral, moneda, decimales)}`, 40, 100);
  doc.text(`Semilla de generación: ${reporte.seed}`, 40, 115);

  let startY = 140;

  // -- Datos agrupados por Vendedor y luego por Cliente --
  const byVendedor = groupBy(detalles, 'vendedorId');
  const vendedoresData = reporte.resumenVendedores || [];
  vendedoresData.sort((a,b) => (a.vendedorNombre||'').localeCompare(b.vendedorNombre||''));

  vendedoresData.forEach(v => {
    const vDetalles = byVendedor[v.vendedorId] || [];
    if (!vDetalles.length) return;

    const byCliente = groupBy(vDetalles, 'clienteId');
    
    // Título del vendedor
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(37, 99, 235); // primary blue
    doc.rect(40, startY, pageWidth - 80, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`Vendedor: ${v.vendedorCodigo} - ${v.vendedorNombre} | Total: ${formatCurrency(v.subtotalVendedor, moneda, decimales)}`, 45, startY + 14);
    
    doc.setTextColor(0, 0, 0);
    startY += 25;

    // Tabla combinada para este vendedor
    const tableBody = [];

    Object.entries(byCliente).forEach(([cliId, cDetalles]) => {
      const cliNombre = cDetalles[0].clienteNombre;
      const cliCodigo = cDetalles[0].clienteCodigo;
      const cliTotal  = sumBy(cDetalles, 'subtotal');
      
      // Fila header cliente
      tableBody.push([
        { content: `${cliCodigo} - ${cliNombre}`, colSpan: 3, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } },
        { content: 'Total:', styles: { fillColor: [241, 245, 249], fontStyle: 'bold', halign: 'right' } },
        { content: formatCurrency(cliTotal, moneda, decimales), styles: { fillColor: [241, 245, 249], fontStyle: 'bold', halign: 'right' } }
      ]);

      cDetalles.forEach(d => {
        tableBody.push([
          d.codigoProducto,
          d.productoNombre,
          { content: d.cantidad.toString(), styles: { halign: 'right' } },
          { content: formatCurrency(d.precioUnitario, moneda, decimales), styles: { halign: 'right' } },
          { content: formatCurrency(d.subtotal, moneda, decimales), styles: { halign: 'right' } }
        ]);
      });
    });

    doc.autoTable({
      startY: startY,
      head: [['Código Prod', 'Producto', 'Cantidad', 'Precio', 'Subtotal']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 40, right: 40 },
      didDrawPage: function(data) {
        startY = data.cursor.y;
      }
    });

    startY = doc.lastAutoTable.finalY + 20;

    // Control de salto de página manual si está muy cerca del final
    if (startY > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      startY = 40;
    }
  });

  doc.save(`Reporte_Diario_${reporte.fechaReporte}.pdf`);
}

// ── Exportar a Excel ────────────────────────────────────────
export function exportReporteExcel(reporte, detalles, config) {
  if (!window.XLSX) {
    alert("La librería SheetJS no está cargada.");
    return;
  }

  const { moneda = 'Q', decimales = 2 } = config;

  // Formatear datos planos
  const rows = detalles.map(d => ({
    'Fecha Reporte': reporte.fechaReporte,
    'Código Vendedor': d.vendedorCodigo,
    'Vendedor': d.vendedorNombre,
    'Código Cliente': d.clienteCodigo,
    'Cliente': d.clienteNombre,
    'Código Producto': d.codigoProducto,
    'Producto': d.productoNombre,
    'Cantidad': d.cantidad,
    'Precio Unitario': d.precioUnitario,
    'Subtotal': d.subtotal
  }));

  // Crear WorkBook
  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.json_to_sheet(rows);

  // Auto-ajustar ancho de columnas
  const wscols = [
    { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 40 },
    { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
  ];
  ws['!cols'] = wscols;

  window.XLSX.utils.book_append_sheet(wb, ws, "Reporte Diario");
  window.XLSX.writeFile(wb, `Reporte_Diario_${reporte.fechaReporte}.xlsx`);
}
