// Importa un catalogo clinico autorizado (CSV con encabezado "code,name") a la coleccion "catalogos".
//
// La aplicacion no incluye catalogos: el archivo debe provenir de una fuente autorizada y vigente
// (por ejemplo, la publicacion oficial que use tu institucion). Cada termino guarda su fuente y
// version para trazabilidad. Los terminos que ya no vienen en la version nueva se desactivan, no se borran.
//
// Uso:
//   npm run catalog:import -- --type medicamento --source "Nombre de la fuente" --version "2026-01" --file ruta.csv
//   (agrega --apply para escribir; sin el solo valida y muestra un resumen)
import { readFile } from 'node:fs/promises';
import { bootstrapDatabase } from '../src/config/bootstrap.js';
import { closeDb, connectDb } from '../src/config/database.js';
import { AuditModel } from '../src/models/audit.model.js';
import { CATALOG_TYPES, CatalogModel } from '../src/models/catalog.model.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes('--apply');

// CSV simple con comillas dobles opcionales.
function parseCsv(text) {
  const rows = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

try {
  const type = arg('type');
  const source = arg('source')?.trim();
  const version = arg('version')?.trim();
  const file = arg('file');
  if (!CATALOG_TYPES[type]) throw new Error(`--type debe ser: ${Object.keys(CATALOG_TYPES).join(', ')}`);
  if (!source || source.length > 120) throw new Error('--source es obligatorio (max. 120 caracteres)');
  if (!version || version.length > 40) throw new Error('--version es obligatorio (max. 40 caracteres)');
  if (!file) throw new Error('--file es obligatorio');

  const [header, ...rows] = parseCsv(await readFile(file, 'utf8'));
  const iCode = header.findIndex((h) => h.toLowerCase() === 'code');
  const iName = header.findIndex((h) => h.toLowerCase() === 'name');
  if (iCode < 0 || iName < 0) throw new Error('El CSV debe tener las columnas "code" y "name"');

  const errors = [];
  const seen = new Set();
  const entries = [];
  rows.forEach((r, n) => {
    const code = r[iCode] ?? '';
    const name = r[iName] ?? '';
    if (!/^[A-Za-z0-9._-]{1,30}$/.test(code)) errors.push(`fila ${n + 2}: codigo invalido`);
    else if (name.length < 2 || name.length > 200) errors.push(`fila ${n + 2}: nombre invalido`);
    else if (seen.has(code)) errors.push(`fila ${n + 2}: codigo repetido ${code}`);
    else {
      seen.add(code);
      entries.push({ type, source, version, code, name });
    }
  });

  console.log(`${entries.length} terminos validos, ${errors.length} con error.`);
  errors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
  if (errors.length) throw new Error('Corrige el archivo antes de importar');

  if (APPLY) {
    await connectDb();
    await bootstrapDatabase();
    const r = await CatalogModel.upsertMany(entries);
    const off = await CatalogModel.deactivateMissing(type, source, version);
    await AuditModel.log({
      event: 'CATALOG_IMPORTED',
      details: `tipo=${type} version=${version} terminos=${entries.length} desactivados=${off}`,
    });
    console.log(`Importado: ${r.upserted} nuevos, ${r.modified} actualizados, ${off} desactivados.`);
  } else {
    console.log('Validacion correcta. Agrega --apply para importar.');
  }
} catch (err) {
  console.error(`Importacion detenida: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
