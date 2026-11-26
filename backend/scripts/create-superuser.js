// Crea el primer super usuario de forma interactiva (el resto se crean desde la plataforma).
// Uso: npm run create-superuser
import { createInterface } from 'node:readline/promises';
import { bootstrapDatabase } from '../src/config/bootstrap.js';
import { closeDb, connectDb, DuplicateKeyError } from '../src/config/database.js';
import { RoleModel } from '../src/models/role.model.js';
import { UserModel } from '../src/models/user.model.js';
import { hashPassword, passwordPolicyGaps } from '../src/utils/password.js';

const MAX_TRIES = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rl = createInterface({ input: process.stdin, output: process.stdout });

// Lee la contrasena tecla por tecla en modo "raw": la terminal no la muestra, solo se ven asteriscos.
// Se usa despues de cerrar el readline de las preguntas visibles para que no compitan por la entrada.
function askHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error('Ejecuta este script en una terminal interactiva para ocultar la contrasena');

  return new Promise((resolve) => {
    let value = '';
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    const finish = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };

    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\nCancelado.\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          process.stdout.write('*');
        }
      }
    }

    stdin.on('data', onData);
  });
}

async function askUntilValid(question, validate) {
  for (let i = 1; i <= MAX_TRIES; i++) {
    const value = await validate.ask(question);
    const problem = validate.check(value);
    if (!problem) return value;
    console.log(`  ${problem}\n`);
  }
  throw new Error('Demasiados intentos. Ejecuta de nuevo: npm run create-superuser');
}

try {
  await connectDb();
  await bootstrapDatabase();
  const role = await RoleModel.findByCode('superuser');

  console.log('\nAlta del primer super usuario de La Nutria.');
  console.log('La contrasena debe tener al menos 12 caracteres, con MAYUSCULA, minuscula, numero y simbolo.\n');

  const email = (
    await askUntilValid('Correo: ', {
      ask: (q) => rl.question(q),
      check: (v) => (EMAIL_PATTERN.test(v.trim()) ? null : 'Correo invalido, por ejemplo: nombre@dominio.com'),
    })
  )
    .trim()
    .toLowerCase();

  const fullName = (
    await askUntilValid('Nombre completo: ', {
      ask: (q) => rl.question(q),
      check: (v) => (v.trim().length >= 2 ? null : 'Escribe tu nombre'),
    })
  ).trim();
  rl.close();

  let password;
  for (let i = 1; i <= MAX_TRIES && !password; i++) {
    const candidate = await askHidden('Contrasena: ');
    const gaps = passwordPolicyGaps(candidate);
    if (gaps.length > 0) {
      console.log(`  A la contrasena le falta: ${gaps.join(', ')}.\n`);
      continue;
    }
    const confirm = await askHidden('Repite la contrasena: ');
    if (confirm !== candidate) {
      console.log('  Las contrasenas no coinciden. Intenta de nuevo.\n');
      continue;
    }
    password = candidate;
  }
  if (!password) throw new Error('Demasiados intentos. Ejecuta de nuevo: npm run create-superuser');

  const id = await UserModel.create({
    email,
    fullName,
    passwordHash: await hashPassword(password),
    roleId: role.id,
    createdBy: null,
  });
  console.log(`\nSuper usuario creado (id ${id}). Ya puedes entrar a la aplicacion con ${email}.`);
} catch (err) {
  console.error(`\n${err instanceof DuplicateKeyError ? 'Ese correo ya esta registrado' : err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await closeDb();
}
