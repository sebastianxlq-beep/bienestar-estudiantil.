'use strict';
// Uso:  npm run create-admin -- 123456789 "MiContraseñaSegura"
const cfg = require('../src/config');
cfg.validate();
const db = require('../src/db');
const { upsertAdmin } = require('../src/seed');

(async () => {
  const [ced, pw] = process.argv.slice(2);
  if (!ced || !pw) {
    console.error('Uso: npm run create-admin -- <cédula> <contraseña>');
    process.exit(1);
  }
  try {
    await db.initDb();
    await upsertAdmin(String(ced).replace(/\D/g, ''), pw);
    console.log('✔ Administrador listo. Ya puede iniciar sesión con esa cédula.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
