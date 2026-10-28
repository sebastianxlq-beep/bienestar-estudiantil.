'use strict';
const { fmt, GN, mesDe, LBL, estadoDe, r2 } = require('./util');

function totales(movs) {
  let c = 0, p = 0;
  movs.forEach((m) => (m.tipo === 'cargo' ? (c += m.monto) : (p += m.monto)));
  c = r2(c); p = r2(p);
  return { cargos: c, pagos: p, saldo: r2(c - p) };
}

const ordenar = (movs) => movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

/** Texto del estado de cuenta completo. */
function estadoDeCuenta(e, movs, hoy) {
  const t = totales(movs), s = estadoDe(t.cargos, t.pagos);
  const ms = ordenar(movs);
  let run = 0;
  const filas = ms.map((m) => { run = r2(run + (m.tipo === 'cargo' ? m.monto : -m.monto)); return { ...m, run }; });
  const pm = {};
  ms.filter((m) => m.tipo === 'pago').forEach((m) => { const k = m.fecha.slice(0, 7); pm[k] = (pm[k] || 0) + m.monto; });
  const ks = Object.keys(pm).sort();
  const cuerpo = `Estimado(a) ${e.encargado || 'encargado'}:\n\nLe compartimos el estado de cuenta de ${e.nombre} (${e.grado}-${e.seccion}) al ${hoy}:\n\n  Total a pagar: ${fmt(t.cargos)}\n  Total abonado: ${fmt(t.pagos)}\n  Saldo pendiente: ${fmt(Math.max(t.saldo, 0))}\n  Estado: ${LBL[s]}\n\nAbonos por mes:\n${ks.length ? ks.map((k) => `  ${mesDe(k)}: ${fmt(r2(pm[k]))}`).join('\n') : '  Sin abonos registrados'}\n\nMovimientos:\n${filas.map((m) => `  ${m.fecha}  ${m.concepto}: ${m.tipo === 'cargo' ? '+' : '-'}${fmt(m.monto)}  (saldo ${fmt(m.run)})`).join('\n') || '  Sin movimientos'}\n\nDepartamento de Bienestar Estudiantil`;
  return { asunto: `Estado de cuenta – ${e.nombre}`, cuerpo };
}

/** Texto del aviso/confirmación de un pago. */
function avisoPago(e, movs, m) {
  const t = totales(movs);
  const hist = ordenar(movs).slice(-8)
    .map((x) => `  ${x.fecha}  ${x.tipo === 'cargo' ? 'Cargo' : 'Pago '}  ${x.concepto}: ${x.tipo === 'cargo' ? '+' : '-'}${fmt(x.monto)}`).join('\n');
  const asunto = `Confirmación de pago – ${e.nombre} (${e.grado}-${e.seccion})`;
  const cuerpo = `Estimado(a) ${e.encargado || 'padre de familia o encargado'}, encargado(a) de ${e.nombre}:\n\nLes confirmamos que recibimos su pago. A continuación el detalle:\n\nRecibo n.º: ${String(m.id).padStart(6, '0')}\nFecha del pago: ${m.fecha}\nEstudiante: ${e.nombre}\nCédula: ${e.cedula || 'No registrada'}\nGrado y sección: ${e.grado}-${e.seccion} (${GN[e.grado]})\nConcepto: ${m.concepto}\nMétodo de pago: ${m.metodo || 'No indicado'}\n` +
    (m.referencia ? `Referencia: ${m.referencia}\n` : '') +
    `Monto pagado: ${fmt(m.monto)}\n\nResumen de la cuenta:\n  Total de cargos: ${fmt(t.cargos)}\n  Total pagado a la fecha: ${fmt(t.pagos)}\n  Saldo pendiente: ${t.saldo > 0 ? fmt(t.saldo) : fmt(0)} (${t.saldo > 0 ? 'pendiente' : 'cuenta al día'})\n\nÚltimos movimientos:\n${hist}\n\nMuchas gracias por su colaboración. Si tiene alguna consulta, con gusto le atendemos.\n\nDepartamento de Bienestar Estudiantil`;
  return { asunto, cuerpo };
}

module.exports = { totales, estadoDeCuenta, avisoPago };
