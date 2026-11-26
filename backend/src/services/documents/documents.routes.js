import express, { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { AuditBusiness } from '../../business/audit.business.js';
import { getAccessible } from '../../business/patients.business.js';
import { DocumentModel } from '../../models/document.model.js';
import { documentDto, REPORT_TYPES, ReportsBusiness } from '../../reports/reports.business.js';
import { AppError } from '../../utils/AppError.js';
import { requestContext as ctx } from '../../utils/requestContext.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { requireModule } from '../../middlewares/requireModule.js';
import { validate } from '../../middlewares/validate.js';
import { id } from '../common.validator.js';

// Documentos del expediente (montado en /api/patients): reportes PDF y archivos adjuntos.
const router = Router();
const view = requirePermission(P.PATIENTS_VIEW);
const manage = requirePermission(P.PATIENTS_MANAGE);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador invalido');
const params = z.strictObject({ id });
const docParams = z.strictObject({ id, docId: objectId });

const MAX_BYTES = 5 * 1024 * 1024;
// Tipo real del archivo segun sus primeros bytes ("magic numbers"); la extension no cuenta.
const SIGNATURES = [
  { type: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

router.get('/:id/documents', view, validate({ params }), async (req, res) => {
  await getAccessible(req.user, req.valid.params.id);
  const items = await DocumentModel.listByPatient(req.valid.params.id);
  res.json({ items: items.map(documentDto), reportTypes: REPORT_TYPES });
});

router.post(
  '/:id/reports',
  requireModule('reportes_pdf'),
  view,
  validate({
    params,
    body: z.strictObject({
      type: z.enum(Object.keys(REPORT_TYPES)),
      audience: z.enum(['clinico', 'terceros']).default('clinico'),
      noteId: objectId.optional(),
    }),
  }),
  async (req, res) => {
    res.status(201).json(await ReportsBusiness.generate(req.user, req.valid.params.id, req.valid.body, ctx(req)));
  },
);

// Adjuntos: el cuerpo es el archivo en bruto (PDF, PNG o JPG de hasta 5 MB). La descripcion viaja en
// la cabecera X-Document-Description (codificada como URI).
router.post(
  '/:id/documents',
  manage,
  express.raw({ type: ['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream'], limit: MAX_BYTES }),
  validate({ params }),
  async (req, res) => {
    const patient = await getAccessible(req.user, req.valid.params.id);
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw new AppError(400, 'Adjunta un archivo PDF, PNG o JPG');
    const sig = SIGNATURES.find((s) => s.test(buf));
    if (!sig) throw new AppError(415, 'Solo se aceptan archivos PDF, PNG o JPG');
    let description = '';
    try {
      description = decodeURIComponent(req.get('x-document-description') ?? '').trim();
    } catch {
      throw new AppError(400, 'Descripcion invalida');
    }
    if (description.length < 3 || description.length > 200) throw new AppError(400, 'Describe el documento (3 a 200 caracteres)');
    const stored = await DocumentModel.store(
      {
        patientId: patient.id,
        kind: 'adjunto',
        title: description,
        description,
        // Nombre generado por el sistema: nunca se usa el nombre de archivo enviado por el cliente.
        filename: `BL-${String(patient.id).padStart(6, '0')}_adjunto_${Date.now()}.${sig.ext}`,
        contentType: sig.type,
        createdBy: req.user.id,
      },
      buf,
    );
    await AuditBusiness.record({
      ...ctx(req),
      userId: req.user.id,
      event: 'DOCUMENT_UPLOADED',
      details: `paciente=${patient.id} tipo=${sig.ext} bytes=${buf.length}`,
    });
    res.status(201).json(documentDto(stored));
  },
);

router.get('/:id/documents/:docId/file', view, validate({ params: docParams }), async (req, res) => {
  const { id: pid, docId } = req.valid.params;
  await getAccessible(req.user, pid);
  const d = await DocumentModel.findById(docId);
  if (!d || d.patientId !== pid) throw new AppError(404, 'Documento no encontrado');
  await AuditBusiness.record({
    ...ctx(req),
    userId: req.user.id,
    event: 'DOCUMENT_DOWNLOADED',
    details: `paciente=${pid} documento=${docId}`,
  });
  // Siempre como descarga, con el tipo verificado al guardar y sin que el navegador lo reinterprete.
  res.set({
    'Content-Type': d.contentType,
    'Content-Disposition': `attachment; filename="${d.filename}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.send(await DocumentModel.readFile(d.fileId));
});

export default router;
