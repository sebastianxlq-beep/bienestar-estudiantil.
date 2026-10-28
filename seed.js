'use strict';
const bcrypt = require('bcryptjs');
const db = require('./db');
const { passwordError, validCedula } = require('./util');

/** Crea (o actualiza la contraseña de) un administrador. */
async function upsertAdmin(cedula, password) {
  if (!validCedula(cedula)) throw new Error('La cédula debe tener entre 9 y 12 dígitos.');
  const err = passwordError(password);
  if (err) throw new Error(err);
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO usuarios (cedula, password_hash, rol) VALUES ($1,$2,'admin')
     ON CONFLICT (cedula) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'admin', grado = NULL, seccion = NULL,
       intentos_fallidos = 0, bloqueado_hasta = NULL`,
    [cedula, hash]
  );
}

/** Al arrancar: si no existe ningún administrador y hay ADMIN_CEDULA/ADMIN_PASSWORD, lo crea. */
async function seedAdmin(cfg) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin'`);
  if (rows[0].n > 0) return;
  if (!cfg.adminCedula || !cfg.adminPassword) {
    console.warn('⚠ No existe ningún administrador. Defina ADMIN_CEDULA y ADMIN_PASSWORD, o ejecute: npm run create-admin -- <cédula> <contraseña>');
    return;
  }
  await upsertAdmin(cfg.adminCedula, cfg.adminPassword);
  console.log('✔ Administrador inicial creado (cédula ' + cfg.adminCedula + ').');
}

module.exports = { upsertAdmin, seedAdmin };
