'use strict';
const { Pool, types } = require('pg');
const cfg = require('./config');

// DATE como texto "AAAA-MM-DD" (evita corrimientos de zona horaria) y NUMERIC como número.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

function useSsl() {
  if (cfg.databaseSsl !== undefined && cfg.databaseSsl !== '') return /^(1|true|yes)$/i.test(cfg.databaseSsl);
  try {
    const h = new URL(cfg.databaseUrl).hostname;
    return !(h === 'localhost' || h === '127.0.0.1' || h === '::1');
  } catch (e) {
    return false;
  }
}

const pool = new Pool({
  connectionString: cfg.databaseUrl,
  ssl: useSsl() ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (e) => console.error('Error inesperado en la conexión a la base de datos:', e.message));

const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción. Hace ROLLBACK si fn lanza error. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignorar */ }
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  cedula VARCHAR(12) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol VARCHAR(10) NOT NULL CHECK (rol IN ('admin','profe')),
  grado SMALLINT,
  seccion SMALLINT,
  correo VARCHAR(200),
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  reset_hash TEXT,
  reset_expira TIMESTAMPTZ,
  creado TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rol = 'admin' OR (grado IS NOT NULL AND seccion IS NOT NULL AND grado BETWEEN 7 AND 12 AND seccion BETWEEN 1 AND 20))
);

CREATE TABLE IF NOT EXISTS estudiantes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  cedula VARCHAR(12) NOT NULL UNIQUE,
  grado SMALLINT NOT NULL CHECK (grado BETWEEN 7 AND 12),
  seccion SMALLINT NOT NULL CHECK (seccion BETWEEN 1 AND 20),
  encargado VARCHAR(200) NOT NULL,
  correo VARCHAR(200) NOT NULL,
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  creado TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estudiantes_gs ON estudiantes (grado, seccion);

CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  estudiante_id INT NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
  tipo VARCHAR(5) NOT NULL CHECK (tipo IN ('cargo','pago')),
  concepto VARCHAR(200) NOT NULL,
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL,
  metodo VARCHAR(40) NOT NULL DEFAULT '',
  referencia VARCHAR(100) NOT NULL DEFAULT '',
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_est ON movimientos (estudiante_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT,
  usuario_cedula VARCHAR(12),
  accion VARCHAR(60) NOT NULL,
  detalle JSONB,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`;

async function initDb() {
  await pool.query(SCHEMA);
}

/** Registro de acciones sensibles. Nunca debe romper la operación principal. */
async function audit(clientOrPool, user, accion, detalle) {
  try {
    await (clientOrPool || pool).query(
      'INSERT INTO auditoria (usuario_id, usuario_cedula, accion, detalle) VALUES ($1,$2,$3,$4)',
      [user ? user.id : null, user ? user.cedula : null, accion, detalle ? JSON.stringify(detalle) : null]
    );
  } catch (e) {
    console.error('No se pudo registrar auditoría:', e.message);
  }
}

module.exports = { pool, query, tx, initDb, audit };
