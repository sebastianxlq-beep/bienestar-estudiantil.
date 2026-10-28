'use strict';
require('dotenv').config();

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|si|sí|yes)$/i.test(String(v).trim()));

const cfg = {
  isProd,
  port: parseInt(env.PORT || '3000', 10),
  databaseUrl: env.DATABASE_URL || '',
  databaseSsl: env.DATABASE_SSL,
  sessionSecret: env.SESSION_SECRET || '',
  appUrl: (env.APP_URL || '').replace(/\/+$/, ''),
  adminCedula: (env.ADMIN_CEDULA || '').replace(/\D/g, ''),
  adminPassword: env.ADMIN_PASSWORD || '',
  selfRegistration: bool(env.ALLOW_SELF_REGISTRATION, true),
  registrationCode: env.REGISTRATION_CODE || '',
  maxSecciones: Math.min(20, Math.max(1, parseInt(env.MAX_SECCIONES || '4', 10) || 4)),
  timezone: env.APP_TIMEZONE || 'America/Costa_Rica',
  smtp: {
    host: env.SMTP_HOST || '',
    port: parseInt(env.SMTP_PORT || '587', 10),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || '',
    secure: bool(env.SMTP_SECURE, false),
  },
};

cfg.smtpConfigured = !!(cfg.smtp.host && cfg.smtp.port && cfg.smtp.user && cfg.smtp.pass && cfg.smtp.from);
// La recuperación de contraseña necesita correo y una dirección pública fija (evita enlaces falsos).
cfg.recoveryEnabled = cfg.smtpConfigured && !!cfg.appUrl;

cfg.validate = function validate() {
  const problems = [];
  if (!cfg.databaseUrl) problems.push('Falta DATABASE_URL (cadena de conexión de PostgreSQL).');
  if (!cfg.sessionSecret) problems.push('Falta SESSION_SECRET.');
  else if (isProd && cfg.sessionSecret.length < 32) problems.push('SESSION_SECRET debe tener al menos 32 caracteres.');
  if (problems.length) {
    console.error('\nConfiguración incompleta:\n - ' + problems.join('\n - ') + '\n');
    process.exit(1);
  }
};

module.exports = cfg;
