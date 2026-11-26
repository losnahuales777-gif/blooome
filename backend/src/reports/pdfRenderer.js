import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

// Renderizador PDF de Bloome: tamano carta, tipografia Poppins, encabezado con identificacion del
// paciente y del documento en cada pagina y pie con paginacion y aviso de confidencialidad.
const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const COLORS = { ink: '#183a2e', muted: '#5b6f66', line: '#cfdcd5', accent: '#2f7d5b', tint: '#eef5f1', warn: '#8a5a00' };
const MARGIN = 50;

const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });
const dateTimeFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
export const fmtDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const fmtDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');
export const fmtNum = (v, decimals = 1) =>
  Number.isFinite(v) ? v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—';

// header = { title, subtitle, audienceLabel, patientLines: [[k, v]], docLines: [[k, v]] }
export function createReport(header) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 150, bottom: 60, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: header.title, Author: 'Bloome' },
  });
  doc.registerFont('regular', `${FONT_DIR}Poppins-Regular.ttf`);
  doc.registerFont('bold', `${FONT_DIR}Poppins-SemiBold.ttf`);
  doc.font('regular').fontSize(9).fillColor(COLORS.ink);
  // El PDF empieza a emitirse desde la creacion: se capturan todos los fragmentos.
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const width = doc.page.width - MARGIN * 2;

  const drawHeader = () => {
    const y0 = 36;
    doc.save();
    doc.font('bold').fontSize(13).fillColor(COLORS.accent).text('Bloome', MARGIN, y0, { lineBreak: false });
    doc
      .font('regular')
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text('Nutre tu cuerpo, florece tu vida', MARGIN, y0 + 18, { lineBreak: false });
    doc.font('bold').fontSize(13).fillColor(COLORS.ink).text(header.title, MARGIN, y0, { width, align: 'right' });
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(header.audience === 'terceros' ? COLORS.warn : COLORS.muted)
      .text(header.audienceLabel, MARGIN, y0 + 18, { width, align: 'right' });
    const col = (lines, x, w) => {
      let y = y0 + 34;
      for (const [k, v] of lines) {
        doc.font('regular').fontSize(7.5).fillColor(COLORS.muted).text(`${k}: `, x, y, { continued: true, width: w });
        doc
          .font('bold')
          .fillColor(COLORS.ink)
          .text(String(v ?? '—'), { width: w });
        y = doc.y + 1;
      }
    };
    col(header.patientLines, MARGIN, width / 2 - 10);
    col(header.docLines, MARGIN + width / 2 + 10, width / 2 - 10);
    doc
      .moveTo(MARGIN, 138)
      .lineTo(MARGIN + width, 138)
      .lineWidth(0.6)
      .strokeColor(COLORS.line)
      .stroke();
    doc.restore();
  };

  const onPage = () => {
    drawHeader();
    doc.x = MARGIN;
    doc.y = 150;
  };
  onPage();
  doc.on('pageAdded', onPage);

  const ensure = (h) => {
    if (doc.y + h > doc.page.height - 70) doc.addPage();
  };

  const api = {
    doc,
    section(title) {
      ensure(40);
      doc.moveDown(0.6);
      doc.font('bold').fontSize(11).fillColor(COLORS.accent).text(title, MARGIN, doc.y, { width });
      doc.moveDown(0.25);
      doc.font('regular').fontSize(9).fillColor(COLORS.ink);
    },
    paragraph(text, opts = {}) {
      ensure(20);
      doc
        .font(opts.bold ? 'bold' : 'regular')
        .fontSize(opts.size ?? 9)
        .fillColor(opts.muted ? COLORS.muted : COLORS.ink)
        .text(text || '—', MARGIN, doc.y, { width });
      doc.moveDown(0.3);
    },
    keyValues(pairs) {
      for (const [k, v] of pairs) {
        ensure(14);
        doc.font('regular').fontSize(9).fillColor(COLORS.muted).text(`${k}: `, MARGIN, doc.y, { continued: true, width });
        doc
          .font('bold')
          .fillColor(COLORS.ink)
          .text(String(v ?? '—'), { width });
      }
      doc.moveDown(0.3);
    },
    // columns = [{ label, width (fraccion), align }], rows = [[...celdas]]
    table(columns, rows, { empty = 'Sin registros.' } = {}) {
      if (!rows.length) return api.paragraph(empty, { muted: true });
      const widths = columns.map((c) => c.width * width);
      const pad = 4;
      const rowHeight = (cells, font) => {
        doc.font(font).fontSize(8);
        return Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? '—'), { width: widths[i] - pad * 2 }))) + pad * 2;
      };
      const drawRow = (cells, { head = false, shade = false } = {}) => {
        const font = head ? 'bold' : 'regular';
        const h = rowHeight(cells, font);
        if (doc.y + h > doc.page.height - 70) {
          doc.addPage();
          if (!head)
            drawRow(
              columns.map((c) => c.label),
              { head: true },
            );
        }
        const y = doc.y;
        if (head || shade) doc.rect(MARGIN, y, width, h).fill(head ? COLORS.tint : '#f8fbf9');
        let x = MARGIN;
        cells.forEach((c, i) => {
          doc
            .font(font)
            .fontSize(8)
            .fillColor(head ? COLORS.muted : COLORS.ink)
            .text(String(c ?? '—'), x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].align ?? 'left' });
          x += widths[i];
        });
        doc
          .moveTo(MARGIN, y + h)
          .lineTo(MARGIN + width, y + h)
          .lineWidth(0.4)
          .strokeColor(COLORS.line)
          .stroke();
        doc.y = y + h;
      };
      ensure(40);
      drawRow(
        columns.map((c) => c.label),
        { head: true },
      );
      rows.forEach((r, i) => drawRow(r, { shade: i % 2 === 1 }));
      doc.moveDown(0.5);
    },
    // Grafico de linea con puntos reales unicamente (sin interpolar huecos ni suavizar).
    lineChart(points, { label, unit, height = 120 } = {}) {
      if (points.length < 2) return api.paragraph('Se necesitan al menos dos mediciones para graficar.', { muted: true });
      ensure(height + 30);
      const top = doc.y + 4;
      const left = MARGIN + 34;
      const w = width - 40;
      const values = points.map((p) => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const t0 = points[0].date.getTime();
      const t1 = points.at(-1).date.getTime() || t0 + 1;
      const px = (p) => left + ((p.date.getTime() - t0) / (t1 - t0 || 1)) * w;
      const py = (v) => top + height - ((v - min) / span) * height;
      doc.font('regular').fontSize(7).fillColor(COLORS.muted);
      doc.text(`${fmtNum(max)} ${unit}`, MARGIN - 6, top - 4, { width: 38, align: 'right' });
      doc.text(`${fmtNum(min)} ${unit}`, MARGIN - 6, top + height - 4, { width: 38, align: 'right' });
      doc
        .moveTo(left, top)
        .lineTo(left, top + height)
        .lineTo(left + w, top + height)
        .lineWidth(0.5)
        .strokeColor(COLORS.line)
        .stroke();
      points.forEach((p, i) => (i === 0 ? doc.moveTo(px(p), py(p.value)) : doc.lineTo(px(p), py(p.value))));
      doc.lineWidth(1.4).strokeColor(COLORS.accent).stroke();
      points.forEach((p) => doc.circle(px(p), py(p.value), 2).fill(COLORS.accent));
      doc.fillColor(COLORS.muted).text(fmtDate(points[0].date), left, top + height + 4, { lineBreak: false });
      doc.text(fmtDate(points.at(-1).date), left, top + height + 4, { width: w, align: 'right' });
      doc.y = top + height + 18;
      doc
        .font('regular')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(`${label}: solo mediciones registradas; los periodos sin medicion no se rellenan.`, MARGIN, doc.y, { width });
      doc.moveDown(0.5);
    },
    // Cierra el documento: pie en cada pagina y devuelve el PDF como Buffer.
    async finish(footer) {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // El pie va dentro del margen inferior: se libera el margen para que no cree paginas nuevas.
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = doc.page.height - 45;
        doc.font('regular').fontSize(7).fillColor(COLORS.muted);
        doc.text(footer, MARGIN, y, { width: width - 60, lineBreak: false, height: 10 });
        doc.text(`Pagina ${i + 1} de ${range.count}`, MARGIN, y, { width, align: 'right', lineBreak: false });
        doc.page.margins.bottom = bottom;
      }
      const done = new Promise((resolve) => doc.on('end', resolve));
      doc.end();
      await done;
      return Buffer.concat(chunks);
    },
  };
  return api;
}
