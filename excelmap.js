'use strict';
// Lógica pura (sin dependencias) para reconocer las columnas de un Excel y la sección de cada fila.

const nn = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const ENC = (h) => /encargad|responsabl|padre|madre|tutor/.test(h);
const CAMPOS = [
  { k: 'cedula', t: (h) => /cedula|identific/.test(h) && !ENC(h), obl: 'Cédula del estudiante' },
  { k: 'correo', t: (h) => /correo|email|e-mail|mail/.test(h), obl: 'Correo del encargado' },
  { k: 'telefono', t: (h) => /telef|celular|movil/.test(h) },
  { k: 'encargado', t: (h) => ENC(h) && !/correo|email|mail|tel|cel|cedula/.test(h), obl: 'Nombre del encargado' },
  { k: 'nombre', t: (h) => /nombre|alumno|estudiante/.test(h) && !ENC(h) && !/cedula|identific|correo|mail/.test(h), obl: 'Nombre del estudiante' },
  { k: 'grado', t: (h) => /^grado|^nivel/.test(h) },
  { k: 'seccion', t: (h) => /seccion/.test(h) },
  { k: 'monto', t: (h) => /monto|saldo|deuda|adeud|cuota/.test(h) },
  { k: 'concepto', t: (h) => /concepto/.test(h) },
];
const GW = { setimo: 7, septimo: 7, octavo: 8, noveno: 9, decimo: 10, undecimo: 11, duodecimo: 12 };

function gradoSeccion(g, s, maxSec) {
  g = nn(g); s = nn(s);
  const re = /(\d{1,2})\s*[-–\/.°º]\s*(\d{1,2})/;
  const m = s.match(re) || g.match(re);
  let a, b;
  if (m) { a = +m[1]; b = +m[2]; } else { a = GW[g] || parseInt(g, 10) || 0; b = parseInt(s, 10) || 0; }
  return a >= 7 && a <= 12 && b >= 1 && b <= maxSec ? [a, b] : null;
}

function detectColumns(headerRow) {
  const used = new Set(), map = {};
  const hs = headerRow.map((h) => nn(h));
  for (const c of CAMPOS) {
    const i = hs.findIndex((h, ix) => h && !used.has(ix) && c.t(h));
    if (i >= 0) { map[c.k] = i; used.add(i); }
  }
  return map;
}


module.exports = { nn, CAMPOS, gradoSeccion, detectColumns };
