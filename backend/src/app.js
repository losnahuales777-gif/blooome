import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { CSRF_HEADER, csrfProtection } from './middlewares/csrf.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import routes from './services/index.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);

app.use(pinoHttp({ logger }));
// Cabeceras de seguridad: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', CSRF_HEADER, 'X-Document-Description'],
  }),
);
// 100 KB: una nota SOAP completa (4 secciones de hasta 10 000 caracteres) cabe con margen.
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api', apiLimiter, csrfProtection, routes);

app.use(notFound);
app.use(errorHandler);
