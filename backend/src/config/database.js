import { GridFSBucket, MongoClient } from 'mongodb';
import { env } from './env.js';

// Cliente unico de MongoDB Atlas. Con "mongodb+srv://" la conexion va cifrada con TLS por defecto.
// La cadena de conexion (con usuario y clave) vive solo en .env y nunca se registra en logs.
const client = new MongoClient(env.MONGODB_URI, {
  appName: 'lanutria-api',
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10_000,
  retryWrites: true,
});

let db = null;

export async function connectDb() {
  await client.connect();
  db = client.db(env.MONGODB_DB);
  await db.command({ ping: 1 });
  return db;
}

export async function closeDb() {
  await client.close();
}

export function getDb() {
  if (!db) throw new Error('La base de datos no esta conectada');
  return db;
}

// Almacen de archivos (GridFS) para documentos generados y adjuntos.
export function bucket(name) {
  if (!db) throw new Error('La base de datos no esta conectada');
  return new GridFSBucket(db, { bucketName: name });
}

export function collection(name) {
  if (!db) throw new Error('La base de datos no esta conectada');
  return db.collection(name);
}

// Ejecuta fn dentro de una transaccion: o se aplican todos los cambios o ninguno.
// fn recibe la sesion; los modelos la aceptan como ultimo parametro opcional.
export async function withTransaction(fn) {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

export const withSession = (session) => (session ? { session } : {});

// IDs numericos secuenciales (contrato de la API): un contador atomico por coleccion.
export async function nextId(name, session) {
  const counter = await collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', ...withSession(session) },
  );
  return counter.seq;
}

export function paging({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, limit: pageSize };
}

// Error de clave duplicada (indice unico), independiente del motor de base de datos.
export class DuplicateKeyError extends Error {
  constructor(message = 'Registro duplicado') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

export function isDuplicateKey(err) {
  return err?.code === 11000;
}
