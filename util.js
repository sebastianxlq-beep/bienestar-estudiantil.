'use strict';
const crypto = require('crypto');
const cfg = require('./config');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Texto de una línea: quita caracteres de control, colapsa espacios, recorta. */
const clean = (s, max = 200) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** Texto de varias líneas (mensajes de correo). */
const cleanMulti = (s, max = 10000) =>
  String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max).trim();
const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;
const validEmail = (s) => typeof s === 'string' && s.length <= 200 && EMAIL_RE.test(s);
const validCedula = (s) => /^\d{9,12}$/.test(s);

function passwordError(p) {
  if (typeof p !== 'string' || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (Buffer.byteLength(p, 'utf8') > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  return null;
}

function validGradoSeccion(g, s) {
  g = Number(g); s = Number(s);
  return Number.isInteger(g) && g >= 7 && g <= 12 && Number.isInteger(s) && s >= 1 && s <= cfg.maxSecciones;
}

/** Interpreta montos escritos de varias formas: 45000, "45.000", "₡45,000.50", "1,5"… */
function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const raw = String(v ?? '');
  if (/^\s*-/.test(raw)) return NaN;
  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    const dec = lc > ld ? ',' : '.', th = dec === ',' ? '.' : ',';
    s = s.split(th).join('').replace(dec, '.');
  } else if (lc > -1 || ld > -1) {
    const sep = lc > -1 ? ',' : '.';
    const parts = s.split(sep);
    s = parts.length > 2 || (parts.length === 2 && parts[1].length === 3) ? parts.join('') : parts.join('.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
/** Devuelve el monto redondeado a 2 decimales, o null si no es válido (>0 y razonable). */
function moneyOrNull(v) {
  const n = parseMoney(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 100) / 100;
  return r > 0 && r <= 1e11 ? r : null;
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del colegio, no en UTC. */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const METODOS = ['Efectivo', 'Transferencia', 'SINPE Móvil', 'Tarjeta', 'Depósito'];
const GN = { 7: 'Sétimo', 8: 'Octavo', 9: 'Noveno', 10: 'Décimo', 11: 'Undécimo', 12: 'Duodécimo' };
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (k) => { const p = k.split('-'); return MES[+p[1] - 1] + ' ' + p[0]; };
const fmt = (n) => '₡' + Number(n).toLocaleString('es-CR', { maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

function estadoDe(cargos, pagos) {
  const saldo = r2(cargos - pagos);
  if (cargos === 0 && pagos === 0) return 'sc';
  if (saldo > 0) return 'pe';
  if (saldo < 0) return 'fa';
  return 'pa';
}
const LBL = { pe: 'Pendiente', pa: 'Al día', sc: 'Sin cargos', fa: 'Saldo a favor' };

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEqual = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

/** Cláusula SQL de permisos: el administrador ve todo; el profe solo su grado y sección. */
function scopeSql(user, params, alias = 'e') {
  if (user.rol === 'admin') return 'TRUE';
  params.push(user.grado, user.seccion);
  return `(${alias}.grado = $${params.length - 1} AND ${alias}.seccion = $${params.length})`;
}

const parseId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw new HttpError(404, 'No encontrado.');
  return n;
};

module.exports = {
  HttpError, ah, clean, cleanMulti, onlyDigits, validEmail, validCedula, passwordError, validGradoSeccion,
  parseMoney, moneyOrNull, validDate, today, METODOS, GN, MES, mesDe, fmt, r2, estadoDe, LBL, sha256, safeEqual,
  scopeSql, parseId,
};
