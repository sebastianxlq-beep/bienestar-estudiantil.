'use strict';
/* Bienestar estudiantil – cliente. Todo el almacenamiento está en el servidor (PostgreSQL). */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => '₡' + Number(n).toLocaleString('es-CR', { maximumFractionDigits: 2 });
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const GN = { 7: 'Sétimo', 8: 'Octavo', 9: 'Noveno', 10: 'Décimo', 11: 'Undécimo', 12: 'Duodécimo' };
const GR = [7, 8, 9, 10, 11, 12];
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (k) => { const p = k.split('-'); return MES[+p[1] - 1] + ' ' + p[0]; };
const LBL = { pe: 'Pendiente', pa: 'Al día', sc: 'Sin cargos', fa: 'Saldo a favor' };
const estTxt = (e) => (e.estado === 'pe' ? 'Pendiente: ' + fmt(e.saldo) : e.estado === 'fa' ? 'A favor: ' + fmt(-e.saldo) : LBL[e.estado]);
const r2 = (n) => Math.round(n * 100) / 100;
const num = (sel) => { const v = $(sel).value; return v === '' ? NaN : Number(v); };

let CFG = { maxSecciones: 4, mailConfigured: false, selfRegistration: true, requiresRegistrationCode: false, recoveryEnabled: false };
let U = null, CSRF = null;
let view = 'home', open = 0, G = 7, SE = 1, RES = [];
const adm = () => U && U.rol === 'admin';

const gOpt = (s) => GR.map((g) => `<option value="${g}"${g == s ? ' selected' : ''}>${GN[g]} (${g})</option>`).join('');
const sOpt = (g, s) => Array.from({ length: CFG.maxSecciones }, (_, i) => i + 1).map((n) => `<option value="${n}"${n == s ? ' selected' : ''}>${g}-${n}</option>`).join('');

function toast(t) {
  const x = $('#toast'); x.textContent = t; x.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => (x.style.display = 'none'), 4200);
}

/* ---------- Comunicación con el servidor ---------- */
class ApiError extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }

async function rawFetch(path, o = {}) {
  const m = o.method || 'GET', h = { Accept: 'application/json' };
  const init = { method: m, headers: h, credentials: 'same-origin' };
  if (m !== 'GET' && CSRF) h['X-CSRF-Token'] = CSRF;
  if (o.raw) { init.body = o.raw; h['Content-Type'] = 'application/octet-stream'; }
  else if (o.body !== undefined) { h['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
  try { return await fetch('/api' + path, init); }
  catch (e) { throw new ApiError('Sin conexión con el servidor. Revise su internet e intente de nuevo.', 0); }
}
async function api(path, o = {}) {
  const r = await rawFetch(path, o);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) {
    if (r.status === 401 && U && !o.quiet) sessionExpired();
    throw new ApiError(data.error || 'Error del servidor (' + r.status + ').', r.status, data);
  }
  return data;
}
async function descargar(path, fallback) {
  const r = await rawFetch(path);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && U) sessionExpired();
    throw new ApiError(d.error || 'No se pudo descargar el archivo.', r.status);
  }
  const cd = r.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallback;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message || 'Ocurrió un error.'); } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- Acceso ---------- */
let mode = 'in', resetToken = null;
const msg = (t, ok) => { const m = $('#lm'); m.textContent = t || ''; m.style.color = ok ? 'var(--ok)' : ''; };
function lgView() {
  const auth = mode === 'in' || mode === 'up';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  $('#tabs').hidden = !auth; $('#f-in-up').hidden = !auth;
  $('#tabUp').hidden = !CFG.selfRegistration;
  $('#up').hidden = mode !== 'up';
  $('#codeBox').hidden = !CFG.requiresRegistrationCode;
  $('#f-forgot').hidden = mode !== 'forgot'; $('#f-reset').hidden = mode !== 'reset';
  $('#go').textContent = { in: 'Entrar', up: 'Crear cuenta', forgot: 'Enviar enlace', reset: 'Guardar nueva contraseña' }[mode];
  $('#lp').autocomplete = mode === 'up' ? 'new-password' : 'current-password';
  $('#lnkForgot').hidden = !(mode === 'in' && CFG.recoveryEnabled);
  $('#lnkBack').hidden = auth;
  msg('');
}
function showLogin(m) {
  U = null; CSRF = null;
  $('#app').hidden = true; $('#lg').hidden = false;
  ['#lp', '#lp2', '#rp', '#rp2'].forEach((s) => ($(s).value = ''));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  lgView(); if (m) msg(m);
}
function sessionExpired() { showLogin('Su sesión venció. Entre de nuevo.'); }

$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.m; lgView(); } };
$('#lnkForgot').onclick = () => { mode = 'forgot'; lgView(); };
$('#lnkBack').onclick = () => { if (mode === 'reset') history.replaceState(null, '', location.pathname); mode = 'in'; lgView(); };
$('#lgr').innerHTML = gOpt(7);
const fillSe = () => { $('#lse').innerHTML = sOpt($('#lgr').value, 1); };
$('#lgr').onchange = fillSe;

$('#go').onclick = async () => {
  const go = $('#go'); msg('');
  try {
    if (mode === 'in') {
      const cedula = $('#lc').value.replace(/\D/g, ''), password = $('#lp').value;
      if (!/^\d{9,12}$/.test(cedula)) return msg('Escriba su cédula con solo números (de 9 a 12 dígitos).');
      if (!password) return msg('Escriba su contraseña.');
      go.disabled = true;
      const r = await api('/auth/login', { method: 'POST', body: { cedula, password } });
      U = r.user; CSRF = r.csrf; enter();
    } else if (mode === 'up') {
      const cedula = $('#lc').value.replace(/\D/g, ''), password = $('#lp').value, correo = $('#lcor').value.trim();
      if (!/^\d{9,12}$/.test(cedula)) return msg('Escriba su cédula con solo números (de 9 a 12 dígitos).');
      if (password.length < 8) return msg('La contraseña debe tener al menos 8 caracteres.');
      if (password !== $('#lp2').value) return msg('Las contraseñas no coinciden.');
      if (!/^\S+@\S+\.\S+$/.test(correo)) return msg('Escriba un correo válido.');
      go.disabled = true;
      const r = await api('/auth/register', { method: 'POST', body: { cedula, password, correo, grado: +$('#lgr').value, seccion: +$('#lse').value, codigo: $('#lcod').value } });
      U = r.user; CSRF = r.csrf; enter();
    } else if (mode === 'forgot') {
      go.disabled = true;
      const r = await api('/auth/forgot', { method: 'POST', body: { cedula: $('#fc').value.replace(/\D/g, '') } });
      msg(r.mensaje, true);
    } else if (mode === 'reset') {
      const p = $('#rp').value;
      if (p.length < 8) return msg('La contraseña debe tener al menos 8 caracteres.');
      if (p !== $('#rp2').value) return msg('Las contraseñas no coinciden.');
      go.disabled = true;
      await api('/auth/reset', { method: 'POST', body: { token: resetToken, password: p } });
      history.replaceState(null, '', location.pathname);
      mode = 'in'; lgView(); msg('Contraseña cambiada. Ya puede entrar.', true);
    }
  } catch (e) { msg(e.message); }
  finally { go.disabled = false; }
};
['#lc', '#lp', '#lp2', '#lcor', '#lcod', '#fc', '#rp', '#rp2'].forEach((s) => ($(s).onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); }));

function enter() {
  $('#lp').value = $('#lp2').value = '';
  $('#lg').hidden = true; $('#app').hidden = false;
  $('#mailWarn').hidden = CFG.mailConfigured;
  if (U.rol === 'profe') { G = U.grado; SE = U.seccion; open = U.grado; } else { G = 7; SE = 1; open = 0; }
  view = 'home'; $('#gq').value = ''; $('#gres').innerHTML = '';
  $('#who').textContent = adm() ? 'Administrador – cédula ' + U.cedula : 'Profe guía de ' + U.grado + '-' + U.seccion + ' – cédula ' + U.cedula;
  paint(); refresh();
}
$('#out').onclick = async () => { try { await api('/auth/logout', { method: 'POST', quiet: true }); } catch (e) { /* ya sin sesión */ } showLogin(); };

/* ---------- Vistas ---------- */
function paint() {
  document.querySelectorAll('.adm').forEach((x) => (x.hidden = !adm() || view !== 'home'));
  $('#ayuda').hidden = view !== 'home';
  $('#home').hidden = view !== 'home'; $('#secv').hidden = view !== 'sec';
}
const refresh = run(async () => { if (view === 'sec') await loadSec(); else await loadHome(); });

async function loadHome() {
  RES = (await api('/resumen')).resumen;
  const secs = Array.from({ length: CFG.maxSecciones }, (_, i) => i + 1);
  $('#grades').innerHTML = GR.filter((g) => adm() || g === U.grado).map((g) => {
    const l = RES.filter((x) => x.grado === g);
    const tot = l.reduce((a, x) => a + x.total, 0), pn = l.reduce((a, x) => a + x.pendientes, 0), o = open === g;
    return `<div class="gc"><button class="gh ${o ? 'on' : ''}" data-g="${g}" aria-expanded="${o}"><span><b>${GN[g]}</b> <small>(${g}°)</small></span><span class="gm">${tot} estudiantes · ${pn} con saldo pendiente ${o ? '▲' : '▼'}</span></button>${
      o ? `<div class="sg">${secs.filter((n) => adm() || n === U.seccion).map((n) => {
        const x = l.find((y) => y.seccion === n) || { total: 0, pendientes: 0 };
        return `<button class="sc2" data-s="${n}" data-gg="${g}"><b>${g}-${n}</b><small>${x.total} estudiantes</small><small>${x.pendientes} con saldo pendiente</small></button>`;
      }).join('')}</div>` : ''}</div>`;
  }).join('');
}
$('#grades').onclick = (e) => {
  const s = e.target.closest('[data-s]');
  if (s) { G = +s.dataset.gg; SE = +s.dataset.s; view = 'sec'; $('#q').value = ''; $('#fl').value = ''; paint(); refresh(); return; }
  const b = e.target.closest('[data-g]');
  if (b) { const g = +b.dataset.g; open = open === g ? 0 : g; loadHome().catch((er) => toast(er.message)); }
};
$('#bk').onclick = () => { view = 'home'; open = G; paint(); refresh(); };

let seq = 0;
async function loadSec() {
  const my = ++seq;
  const qs = new URLSearchParams({ grado: G, seccion: SE });
  if ($('#q').value.trim()) qs.set('q', $('#q').value.trim());
  if ($('#fl').value) qs.set('estado', $('#fl').value);
  const d = await api('/estudiantes?' + qs);
  if (my !== seq) return;                                   // llegó una respuesta más nueva
  $('#stt').textContent = 'Sección ' + G + '-' + SE + ' (' + GN[G] + ')';
  const r = d.resumen || { total: 0, pendientes: 0, porCobrar: 0, cobrado: 0 };
  $('#sum').innerHTML = `<div><b>${r.total}</b><span>Estudiantes</span></div><div><b>${r.pendientes}</b><span>Con saldo pendiente</span></div><div><b>${fmt(r.porCobrar)}</b><span>Por cobrar</span></div><div><b>${fmt(r.cobrado)}</b><span>Cobrado</span></div>`;
  const filtrando = $('#q').value.trim() || $('#fl').value;
  $('#rows').innerHTML = d.estudiantes.length ? d.estudiantes.map((e) =>
    `<tr data-id="${e.id}"><td><b>${esc(e.nombre)}</b></td><td class="hm">${esc(e.cedula)}</td><td class="hm">${esc(e.encargado) || '—'}</td><td class="r hm">${fmt(e.cargos)}</td><td class="r hm">${fmt(e.pagos)}</td><td class="r"><b>${fmt(Math.max(e.saldo, 0))}</b></td><td><span class="tag ${e.estado}">${esc(estTxt(e))}</span></td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">${filtrando ? 'Ningún estudiante coincide con la búsqueda.' : 'No hay estudiantes en esta sección. Use “+ Agregar un estudiante”' + (adm() ? ' o “Subir Excel”.' : '.')}</td></tr>`;
}
const reloadSec = debounce(() => loadSec().catch((e) => toast(e.message)), 250);
$('#q').oninput = reloadSec; $('#fl').onchange = reloadSec;
$('#rows').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) run(detail)(tr.dataset.id); };

// Búsqueda en todas las secciones permitidas
const gSearch = debounce(run(async () => {
  const q = $('#gq').value.trim();
  if (q.length < 2) { $('#gres').innerHTML = ''; return; }
  const d = await api('/estudiantes?q=' + encodeURIComponent(q));
  $('#gres').innerHTML = `<div class="tw" style="margin-bottom:12px"><table><thead><tr><th>Estudiante</th><th>Sección</th><th class="hm">Encargado</th><th class="r">Saldo</th><th>Estado</th></tr></thead><tbody>${
    d.estudiantes.length ? d.estudiantes.slice(0, 100).map((e) => `<tr data-id="${e.id}"><td><b>${esc(e.nombre)}</b></td><td>${e.grado}-${e.seccion}</td><td class="hm">${esc(e.encargado)}</td><td class="r">${fmt(Math.max(e.saldo, 0))}</td><td><span class="tag ${e.estado}">${esc(estTxt(e))}</span></td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sin resultados.</td></tr>'}</tbody></table></div>`;
}), 300);
$('#gq').oninput = gSearch;
$('#gres').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) run(detail)(tr.dataset.id); };

/* ---------- Agregar estudiante ---------- */
$('#add').onclick = () => {
  const dl = $('#dt'), lock = !adm();
  const g0 = lock ? U.grado : (view === 'sec' ? G : 7), s0 = lock ? U.seccion : (view === 'sec' ? SE : 1);
  dl.innerHTML = `<div class="bar"><h2>Nuevo estudiante</h2><span class="sp"></span><button id="x">Cerrar</button></div>
  <div class="g2"><div><label for="an">Nombre del estudiante *</label><input id="an" autocomplete="off" maxlength="200"></div><div><label for="ad">Cédula del estudiante *</label><input id="ad" inputmode="numeric" autocomplete="off" maxlength="12"></div></div>
  <div class="g2"><div><label for="ag">Grado</label><select id="ag" ${lock ? 'disabled' : ''}>${gOpt(g0)}</select></div><div><label for="as">Sección</label><select id="as" ${lock ? 'disabled' : ''}></select></div></div>
  <div class="g2"><div><label for="ae">Nombre del encargado *</label><input id="ae" autocomplete="off" maxlength="200"></div><div><label for="ac">Correo del encargado *</label><input id="ac" type="email" maxlength="200"></div></div>
  <div class="g2"><div><label for="at">Teléfono (opcional)</label><input id="at" maxlength="40"></div><div></div></div>
  <div class="g2"><div><label for="am">Monto adeudado (₡)</label><input id="am" type="number" min="0" step="any" placeholder="45000"></div><div><label for="ao">Concepto</label><input id="ao" value="Matrícula" maxlength="200"></div></div>
  <div class="bar" style="margin:14px 0 0"><button class="p" id="sv">Guardar estudiante</button></div>`;
  const fs = () => { $('#as').innerHTML = sOpt($('#ag').value, lock ? s0 : (+$('#ag').value === g0 ? s0 : 1)); };
  fs(); $('#ag').onchange = fs;
  dl.showModal(); $('#x').onclick = () => dl.close();
  $('#sv').onclick = run(async () => {
    const b = {
      nombre: $('#an').value.trim(), cedula: $('#ad').value.replace(/\D/g, ''), encargado: $('#ae').value.trim(), correo: $('#ac').value.trim(),
      telefono: $('#at').value.trim(), grado: +$('#ag').value, seccion: +$('#as').value, concepto: $('#ao').value,
    };
    if (!b.nombre) return toast('Escriba el nombre del estudiante');
    if (!/^\d{9,12}$/.test(b.cedula)) return toast('Escriba la cédula del estudiante (9 a 12 dígitos)');
    if (!b.encargado) return toast('Escriba el nombre del encargado');
    if (!/^\S+@\S+\.\S+$/.test(b.correo)) return toast('Escriba un correo válido del encargado');
    const m = num('#am'); if (m > 0) b.monto = m;
    $('#sv').disabled = true;
    try { await api('/estudiantes', { method: 'POST', body: b }); } finally { $('#sv').disabled = false; }
    dl.close(); toast('Estudiante guardado'); refresh();
  });
};

/* ---------- Ficha, abonos y cargos ---------- */
async function detail(id) {
  const d = await api('/estudiantes/' + id);
  const e = d.estudiante, movs = d.movimientos, dl = $('#dt'), lock = !adm();
  let dirty = false;
  dl.innerHTML = `<div class="bar"><h2>${esc(e.nombre)}</h2><span class="sp"></span><button id="ver">Estado de cuenta</button><button id="x">Cerrar</button></div>
  <div id="ef">
  <div class="g2"><div><label for="en">Nombre</label><input id="en" value="${esc(e.nombre)}" maxlength="200"></div><div><label for="ed">Cédula</label><input id="ed" value="${esc(e.cedula)}" inputmode="numeric" maxlength="12"></div></div>
  <div class="g2"><div><label for="eg">Grado</label><select id="eg" ${lock ? 'disabled' : ''}>${gOpt(e.grado)}</select></div><div><label for="es">Sección</label><select id="es" ${lock ? 'disabled' : ''}>${sOpt(e.grado, e.seccion)}</select></div></div>
  <div class="g2"><div><label for="ee">Nombre del encargado</label><input id="ee" value="${esc(e.encargado)}" maxlength="200"></div><div><label for="ec">Correo del encargado</label><input id="ec" type="email" value="${esc(e.correo)}" maxlength="200"></div></div>
  <div class="g2"><div><label for="et">Teléfono</label><input id="et" value="${esc(e.telefono)}" maxlength="40"></div><div style="display:flex;align-items:flex-end"><button class="p" id="sv">Guardar cambios</button></div></div>
  </div>
  <div class="sum" style="margin-top:12px"><div><b>${fmt(e.cargos)}</b><span>Total a pagar</span></div><div><b>${fmt(e.pagos)}</b><span>Total abonado</span></div><div><b>${fmt(Math.max(e.saldo, 0))}</b><span>Saldo (${LBL[e.estado]}${e.estado === 'fa' ? ': ' + fmt(-e.saldo) : ''})</span></div></div>
  <div class="tw hp" style="max-height:200px;overflow:auto"><table style="min-width:0"><tbody>${movs.length ? movs.slice().reverse().map((m) =>
    `<tr><td>${esc(m.fecha)}</td><td>${esc(m.concepto)}${m.metodo ? ' (' + esc(m.metodo) + (m.referencia ? ' · ref. ' + esc(m.referencia) : '') + ')' : ''}</td><td class="r" style="color:${m.tipo === 'pago' ? 'var(--ok)' : 'var(--wr)'}">${m.tipo === 'pago' ? '−' : '+'}${fmt(m.monto)}</td><td>${m.tipo === 'pago' ? `<button class="xs" data-av="${m.id}">Aviso</button> ` : ''}${m.puede_borrar ? `<button class="xs d" data-dm="${m.id}" title="Eliminar este movimiento" aria-label="Eliminar movimiento">✕</button>` : ''}</td></tr>`).join('')
    : '<tr><td class="empty">Sin movimientos todavía.</td></tr>'}</tbody></table></div>
  <div class="box"><h3>Registrar abono</h3>
  <div class="g3"><div><label for="pm">Monto (₡)</label><input id="pm" type="number" min="0" step="any" value="${e.saldo > 0 ? e.saldo : ''}"></div>
  <div><label for="pt">Método</label><select id="pt"><option>Efectivo</option><option>Transferencia</option><option>SINPE Móvil</option><option>Tarjeta</option><option>Depósito</option></select></div>
  <div><label for="pr">Referencia</label><input id="pr" placeholder="Opcional" maxlength="100"></div></div>
  <div class="g2"><div><label for="pc">Concepto</label><input id="pc" value="Abono mensual" maxlength="200"></div><div><label for="pfe">Fecha del abono</label><input id="pfe" type="date" value="${hoy()}"></div></div>
  <div class="bar" style="margin:10px 0 0"><button class="p" id="pg">Registrar abono y preparar aviso</button></div></div>
  <div class="box"><h3>Agregar cargo</h3><div class="g2"><div><label for="cc">Concepto</label><input id="cc" value="Mensualidad" maxlength="200"></div><div><label for="cm">Monto (₡)</label><input id="cm" type="number" min="0" step="any"></div></div><div class="bar" style="margin:10px 0 0"><button id="cg">Agregar cargo</button></div></div>
  ${adm() ? '<button class="d" id="del">Eliminar estudiante</button>' : ''}`;
  dl.showModal();
  $('#ef').oninput = () => { dirty = true; };
  $('#eg').onchange = () => { $('#es').innerHTML = sOpt($('#eg').value, 1); };
  const cerrar = () => { if (dirty && !confirm('Hay cambios sin guardar en los datos del estudiante. ¿Cerrar sin guardar?')) return; dl.close(); };
  $('#x').onclick = cerrar;
  const guardar = async () => {
    const n = $('#en').value.trim();
    if (!n) throw new ApiError('El nombre no puede quedar vacío.');
    await api('/estudiantes/' + id, { method: 'PUT', body: {
      nombre: n, cedula: $('#ed').value.replace(/\D/g, ''), encargado: $('#ee').value.trim(), correo: $('#ec').value.trim(),
      telefono: $('#et').value.trim(), grado: +$('#eg').value, seccion: +$('#es').value, version: e.version } });
    dirty = false;
  };
  $('#sv').onclick = run(async () => { await guardar(); toast('Cambios guardados'); refresh(); await detail(id); });
  $('#ver').onclick = run(async () => { if (dirty) await guardar(); dl.close(); refresh(); await estado(id); });
  $('#cg').onclick = run(async () => {
    const m = num('#cm'); if (!(m > 0)) return toast('Escriba un monto mayor a cero');
    if (dirty) await guardar();
    await api(`/estudiantes/${id}/movimientos`, { method: 'POST', body: { tipo: 'cargo', concepto: $('#cc').value, monto: m } });
    toast('Cargo agregado'); refresh(); await detail(id);
  });
  $('#pg').onclick = run(async () => {
    const m = num('#pm'); if (!(m > 0)) return toast('Escriba un monto mayor a cero');
    if (dirty) await guardar();
    $('#pg').disabled = true;
    let r;
    try { r = await api(`/estudiantes/${id}/movimientos`, { method: 'POST', body: { tipo: 'pago', concepto: $('#pc').value, monto: m, fecha: $('#pfe').value || hoy(), metodo: $('#pt').value, referencia: $('#pr').value } }); }
    finally { $('#pg').disabled = false; }
    refresh(); dl.close(); toast('Abono registrado'); await compose(id, 'aviso', r.movimiento.id, true);
  });
  dl.querySelectorAll('[data-av]').forEach((b) => (b.onclick = run(async () => { if (dirty) await guardar(); dl.close(); await compose(id, 'aviso', b.dataset.av); })));
  dl.querySelectorAll('[data-dm]').forEach((b) => (b.onclick = run(async () => {
    if (!confirm('¿Eliminar este movimiento? Esta acción queda registrada y no se puede deshacer.')) return;
    await api('/movimientos/' + b.dataset.dm, { method: 'DELETE' });
    toast('Movimiento eliminado'); refresh(); await detail(id);
  })));
  const del = $('#del');
  if (del) { let sure = false; del.onclick = run(async () => {
    if (!sure) { sure = true; del.textContent = '¿Seguro? Presione otra vez para eliminar'; return; }
    await api('/estudiantes/' + id, { method: 'DELETE' }); dl.close(); toast('Estudiante eliminado'); refresh();
  }); }
}

/* ---------- Estado de cuenta y correos ---------- */
async function estado(id) {
  const d = await api('/estudiantes/' + id), e = d.estudiante, dl = $('#em');
  const ms = d.movimientos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  let run_ = 0; const filas = ms.map((m) => { run_ = r2(run_ + (m.tipo === 'cargo' ? m.monto : -m.monto)); return { ...m, run: run_ }; });
  const pm = {}; ms.filter((m) => m.tipo === 'pago').forEach((m) => { const k = m.fecha.slice(0, 7); pm[k] = pm[k] || { n: 0, t: 0 }; pm[k].n++; pm[k].t = r2(pm[k].t + m.monto); });
  const ks = Object.keys(pm).sort();
  dl.innerHTML = `<div class="bar"><h2>Estado de cuenta</h2><span class="sp"></span><button id="pr_">Imprimir</button><button id="ex">Cerrar</button></div>
  <p class="sub" style="margin-bottom:8px">${esc(e.nombre)} – ${e.grado}-${e.seccion} – Cédula ${esc(e.cedula) || 'sin registrar'} – Encargado: ${esc(e.encargado) || 'sin registrar'}</p>
  <div class="sum"><div><b>${fmt(e.cargos)}</b><span>Total a pagar</span></div><div><b>${fmt(e.pagos)}</b><span>Total abonado</span></div><div><b>${fmt(Math.max(e.saldo, 0))}</b><span>Saldo pendiente</span></div><div><b>${LBL[e.estado]}</b><span>Estado de cuenta</span></div></div>
  <h3>Abonos por mes</h3>
  <div class="tw hp"><table style="min-width:0"><thead><tr><th>Mes</th><th class="r">Abonos</th><th class="r">Total abonado</th></tr></thead><tbody>${ks.length ? ks.map((k) => `<tr><td>${mesDe(k)}</td><td class="r">${pm[k].n}</td><td class="r">${fmt(pm[k].t)}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Todavía no hay abonos.</td></tr>'}</tbody></table></div>
  <h3 style="margin-top:12px">Movimientos</h3>
  <div class="tw hp" style="max-height:240px;overflow:auto"><table style="min-width:0"><thead><tr><th>Fecha</th><th>Concepto</th><th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th></tr></thead><tbody>${filas.length ? filas.map((m) => `<tr><td>${esc(m.fecha)}</td><td>${esc(m.concepto)}${m.metodo ? ' <small>(' + esc(m.metodo) + (m.referencia ? ' · ' + esc(m.referencia) : '') + ')</small>' : ''}</td><td class="r">${m.tipo === 'cargo' ? fmt(m.monto) : ''}</td><td class="r">${m.tipo === 'pago' ? fmt(m.monto) : ''}</td><td class="r">${fmt(m.run)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin movimientos.</td></tr>'}</tbody></table></div>
  <div class="bar" style="margin:12px 0 0"><button class="p" id="env">Preparar correo al encargado</button></div>`;
  dl.showModal(); $('#ex').onclick = () => dl.close(); $('#pr_').onclick = () => window.print();
  $('#env').onclick = run(async () => { dl.close(); await compose(id, 'estado'); });
}

function mailto(to, subj, body) {
  const a = document.createElement('a');
  a.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
  a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
async function compose(id, tipo, mov, recien) {
  const m = await api(`/estudiantes/${id}/mensaje?tipo=${tipo}${mov ? '&mov=' + mov : ''}`), dl = $('#em');
  const puedeEnviar = m.correoConfigurado && m.para;
  dl.innerHTML = `<div class="bar"><h2>${tipo === 'aviso' ? 'Aviso de pago a los padres' : 'Estado de cuenta al encargado'}</h2><span class="sp"></span><button id="ex">Cerrar</button></div>
  <p class="sub" style="margin-bottom:6px">${recien ? 'El pago quedó registrado. ' : ''}El mensaje ya está listo. ${puedeEnviar ? 'Revíselo y presione “Enviar correo ahora”.' : (m.correoConfigurado ? 'Falta el correo del encargado.' : 'El envío automático no está configurado en el servidor: use “Abrir en mi correo”.')}</p>
  <label for="to">Para (correo del encargado registrado)</label><input id="to" value="${esc(m.para)}" readonly>
  <label for="as2">Asunto</label><input id="as2" value="${esc(m.asunto)}" maxlength="200">
  <label for="bd">Mensaje</label><textarea id="bd">${esc(m.cuerpo)}</textarea>
  <div class="bar" style="margin:12px 0 0">${puedeEnviar ? '<button class="p" id="snd">Enviar correo ahora</button>' : ''}<button id="mt2" ${puedeEnviar ? '' : 'class="p"'}>Abrir en mi correo</button><button id="cpy">Copiar mensaje</button></div>`;
  dl.showModal(); $('#ex').onclick = () => dl.close();
  const snd = $('#snd');
  if (snd) snd.onclick = run(async () => {
    snd.disabled = true; snd.textContent = 'Enviando…';
    try { const r = await api(`/estudiantes/${id}/correo`, { method: 'POST', body: { tipo, mov, asunto: $('#as2').value, mensaje: $('#bd').value } }); dl.close(); toast('Correo enviado a ' + r.para); }
    finally { snd.disabled = false; snd.textContent = 'Enviar correo ahora'; }
  });
  $('#mt2').onclick = () => { if (!m.para) return toast('Este estudiante no tiene correo del encargado'); mailto(m.para, $('#as2').value, $('#bd').value); };
  $('#cpy').onclick = async () => {
    const v = $('#bd'); v.select();
    try { await navigator.clipboard.writeText(v.value); } catch (x) { document.execCommand('copy'); }
    toast('Mensaje copiado');
  };
}

/* ---------- Excel ---------- */
$('#tpl').onclick = run(() => descargar('/excel/plantilla', 'plantilla-estudiantes.xlsx'));
$('#exp').onclick = run(() => descargar('/excel/exportar', 'estados-de-cuenta.xlsx'));
$('#bak').onclick = run(() => descargar('/admin/respaldo', 'respaldo-bienestar.json'));

const CL = { nombre: 'Nombre del estudiante', cedula: 'Cédula del estudiante', grado: 'Grado', seccion: 'Sección', encargado: 'Encargado', correo: 'Correo del encargado', telefono: 'Teléfono', monto: 'Monto adeudado', concepto: 'Concepto' };
function importView(r, buf) {
  const dl = $('#dt');
  const ks = Object.keys(r.distribucion).sort((a, b) => { const p = a.split('-'), q = b.split('-'); return p[0] - q[0] || p[1] - q[1]; });
  const hojas = r.hojas.map((h) => `<details class="box" style="margin:6px 0"><summary><b>Hoja “${esc(h.nombre)}”</b> ${h.faltantes.length ? '<span class="tag pe">Se omitió: faltan columnas</span>' : '<span class="tag pa">Columnas detectadas</span>'}</summary>
    ${h.faltantes.length ? `<p class="msg">Faltan: ${esc(h.faltantes.join(', '))}</p>` : ''}
    <div class="chips">${Object.keys(h.columnas).map((k) => `<span>${esc(CL[k] || k)} ← «${esc(h.columnas[k])}»</span>`).join('')}</div></details>`).join('');
  const puede = !r.aplicado && (r.nuevos + r.actualizados) > 0;
  dl.innerHTML = `<div class="bar"><h2>${r.aplicado ? 'Importación lista' : 'Revisión de la importación'}</h2><span class="sp"></span><button id="x">${r.aplicado ? 'Cerrar' : 'Cancelar'}</button></div>
  <p class="sub">${r.aplicado ? 'Se guardó en la base de datos.' : 'Todavía NO se ha guardado nada. Revise y confirme.'} Se leyeron ${r.filasLeidas} filas: <b>${r.nuevos}</b> estudiantes nuevos, <b>${r.actualizados}</b> existentes actualizados (por cédula, sin duplicar) y <b>${r.filasConError}</b> con errores.</p>
  ${hojas}
  ${ks.length ? `<div class="sum">${ks.map((k) => `<div><b>${r.distribucion[k]}</b><span>Sección ${k}</span></div>`).join('')}</div>` : ''}
  ${r.errores.length ? `<h3>Filas con errores${r.filasConError > r.errores.length ? ' (primeras ' + r.errores.length + ')' : ''}</h3><div class="tw hp err-list"><table style="min-width:0"><thead><tr><th>Hoja</th><th>Fila</th><th>Motivo</th></tr></thead><tbody>${r.errores.map((x) => `<tr><td>${esc(x.hoja)}</td><td>${x.fila}</td><td>${esc(x.motivo)}</td></tr>`).join('')}</tbody></table></div><p class="note">Las filas con errores NO se importan. Corríjalas en el Excel y súbalo de nuevo (los estudiantes ya guardados no se duplican).</p>` : ''}
  ${puede ? '<div class="bar" style="margin:14px 0 0"><button class="p" id="ok">Confirmar e importar</button></div>' : ''}`;
  dl.showModal(); $('#x').onclick = () => dl.close();
  if (puede) $('#ok').onclick = run(async () => {
    $('#ok').disabled = true; $('#ok').textContent = 'Importando…';
    const r2_ = await api('/excel/importar?modo=aplicar', { method: 'POST', raw: buf });
    importView(r2_, null); refresh();
  });
}
$('#file').onchange = async (ev) => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  if (f.size > 5.5 * 1024 * 1024) return toast('El archivo es demasiado grande (máximo 5 MB).');
  try { const buf = await f.arrayBuffer(); toast('Revisando el archivo…'); importView(await api('/excel/importar?modo=previa', { method: 'POST', raw: buf }), buf); }
  catch (e) { toast(e.message); }
};

/* ---------- Administración ---------- */
$('#yr').onclick = () => {
  const dl = $('#dt');
  dl.innerHTML = `<div class="bar"><h2>Nuevo año</h2><span class="sp"></span><button id="x">Cerrar</button></div>
  <p class="sub">Antes de borrar, descargue un respaldo y el Excel actualizado. Esta acción no se puede deshacer.</p>
  <div class="bar"><button id="r1">Descargar respaldo completo (JSON)</button><button id="r2">Descargar Excel actualizado</button></div>
  <div class="box"><h3>Confirmación</h3><label for="cf">Escriba BORRAR para activar los botones</label><input id="cf" autocomplete="off"></div>
  <div class="bar"><button class="d" id="b1" disabled>Borrar solo cargos y pagos (conservar estudiantes)</button></div>
  <div class="bar"><button class="d" id="b2" disabled>Borrar TODOS los estudiantes y sus datos</button></div>
  <p class="note">Las cuentas de usuarios no se borran. Para actualizar a los estudiantes del año nuevo: borre todo e importe la lista nueva, o edite cada ficha.</p>`;
  dl.showModal(); $('#x').onclick = () => dl.close();
  $('#r1').onclick = run(() => descargar('/admin/respaldo', 'respaldo-bienestar.json'));
  $('#r2').onclick = run(() => descargar('/excel/exportar', 'estados-de-cuenta.xlsx'));
  $('#cf').oninput = () => { const ok = $('#cf').value.trim() === 'BORRAR'; $('#b1').disabled = $('#b2').disabled = !ok; };
  const go = (modo, txt) => run(async () => { await api('/admin/nuevo-anio', { method: 'POST', body: { modo, confirmacion: $('#cf').value.trim() } }); dl.close(); toast(txt); refresh(); });
  $('#b1').onclick = go('movimientos', 'Cargos y pagos borrados');
  $('#b2').onclick = go('todo', 'Todos los estudiantes fueron borrados');
};

$('#usr').onclick = run(async () => {
  const dl = $('#dt'); let us = [], edit = null;
  async function draw() {
    us = (await api('/usuarios')).usuarios;
    const u = edit ? us.find((x) => x.id === edit) : null;
    dl.innerHTML = `<div class="bar"><h2>Usuarios</h2><span class="sp"></span><button id="x">Cerrar</button></div>
    <div class="tw hp"><table style="min-width:0"><tbody>${us.map((x) => `<tr><td>${esc(x.cedula)}<br><small class="gm">${esc(x.correo || 'sin correo')}</small></td><td>${x.rol === 'admin' ? 'Administrador' : 'Profe guía ' + x.grado + '-' + x.seccion}</td><td>${x.id === U.id ? '(usted)' : `<button class="xs" data-e="${x.id}">Editar</button> <button class="xs d" data-u="${x.id}">Eliminar</button>`}</td></tr>`).join('') || '<tr><td class="empty">Sin usuarios.</td></tr>'}</tbody></table></div>
    <div class="box"><h3>${u ? 'Editar cuenta ' + esc(u.cedula) : 'Crear cuenta'}</h3>
    <div class="g2"><div><label for="nc">Cédula</label><input id="nc" inputmode="numeric" maxlength="12" value="${u ? esc(u.cedula) : ''}" ${u ? 'readonly' : ''}></div><div><label for="np">${u ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña (mín. 8)'}</label><input id="np" type="password" autocomplete="new-password"></div></div>
    <div class="g2"><div><label for="nco">Correo (opcional)</label><input id="nco" type="email" value="${u ? esc(u.correo || '') : ''}"></div><div><label for="nr">Tipo</label><select id="nr"><option value="profe"${u && u.rol === 'admin' ? '' : ' selected'}>Profe guía</option><option value="admin"${u && u.rol === 'admin' ? ' selected' : ''}>Administrador</option></select></div></div>
    <div class="g2" id="gs"><div><label for="ng">Grado</label><select id="ng">${gOpt(u && u.grado ? u.grado : 7)}</select></div><div><label for="ns">Sección</label><select id="ns">${sOpt(u && u.grado ? u.grado : 7, u && u.seccion ? u.seccion : 1)}</select></div></div>
    <div class="bar" style="margin:10px 0 0"><button class="p" id="nb">${u ? 'Guardar cambios' : 'Crear cuenta'}</button>${u ? '<button id="nx">Cancelar edición</button>' : ''}</div></div>
    <p class="note">Para restablecer una contraseña olvidada: pulse “Editar” y escriba una nueva.</p>`;
    $('#x').onclick = () => dl.close();
    const tg = () => { $('#gs').hidden = $('#nr').value === 'admin'; };
    $('#nr').onchange = tg; tg();
    $('#ng').onchange = () => { $('#ns').innerHTML = sOpt($('#ng').value, 1); };
    dl.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { edit = +b.dataset.e; draw().catch((e) => toast(e.message)); }));
    if ($('#nx')) $('#nx').onclick = () => { edit = null; draw().catch((e) => toast(e.message)); };
    dl.querySelectorAll('[data-u]').forEach((b) => (b.onclick = run(async () => {
      if (!confirm('¿Eliminar esta cuenta? Perderá el acceso de inmediato.')) return;
      await api('/usuarios/' + b.dataset.u, { method: 'DELETE' }); toast('Cuenta eliminada'); await draw();
    })));
    $('#nb').onclick = run(async () => {
      const body = { cedula: $('#nc').value.replace(/\D/g, ''), password: $('#np').value, correo: $('#nco').value.trim(), rol: $('#nr').value, grado: +$('#ng').value, seccion: +$('#ns').value };
      if (u) { await api('/usuarios/' + u.id, { method: 'PATCH', body }); toast('Cuenta actualizada'); edit = null; }
      else {
        if (!/^\d{9,12}$/.test(body.cedula)) return toast('Cédula inválida (9 a 12 dígitos)');
        if (body.password.length < 8) return toast('La contraseña debe tener al menos 8 caracteres');
        await api('/usuarios', { method: 'POST', body }); toast('Cuenta creada');
      }
      await draw();
    });
  }
  await draw(); dl.showModal();
});

$('#acct').onclick = () => {
  const dl = $('#dt');
  dl.innerHTML = `<div class="bar"><h2>Mi cuenta</h2><span class="sp"></span><button id="x">Cerrar</button></div>
  <p class="sub">Cédula ${esc(U.cedula)} – ${adm() ? 'Administrador' : 'Profe guía de ' + U.grado + '-' + U.seccion}</p>
  <div class="box"><h3>Cambiar contraseña</h3>
  <label for="ca">Contraseña actual</label><input id="ca" type="password" autocomplete="current-password">
  <div class="g2"><div><label for="cn">Nueva contraseña (mín. 8)</label><input id="cn" type="password" autocomplete="new-password"></div><div><label for="cn2">Repita la nueva</label><input id="cn2" type="password" autocomplete="new-password"></div></div>
  <label for="cco">Correo para recuperar la contraseña</label><input id="cco" type="email" value="${esc(U.correo || '')}">
  <div class="bar" style="margin:10px 0 0"><button class="p" id="cs">Guardar</button></div></div>`;
  dl.showModal(); $('#x').onclick = () => dl.close();
  $('#cs').onclick = run(async () => {
    if ($('#cn').value.length < 8) return toast('La nueva contraseña debe tener al menos 8 caracteres');
    if ($('#cn').value !== $('#cn2').value) return toast('Las contraseñas nuevas no coinciden');
    await api('/auth/password', { method: 'POST', body: { actual: $('#ca').value, nueva: $('#cn').value, correo: $('#cco').value.trim() } });
    U.correo = $('#cco').value.trim() || U.correo; dl.close(); toast('Contraseña actualizada');
  });
};

/* ---------- Arranque ---------- */
(async function boot() {
  try { CFG = await api('/config'); } catch (e) { $('#lg').hidden = false; $('#lst').textContent = 'No se pudo conectar con el servidor. Recargue la página.'; return; }
  fillSe();
  const rm = location.hash.match(/^#reset=([0-9a-f]{64})$/);
  try {
    const me = await api('/me', { quiet: true });
    U = me.user; CSRF = me.csrf;
    if (!rm) { enter(); return; }
  } catch (e) { /* sin sesión */ }
  $('#lg').hidden = false;
  if (rm) { resetToken = rm[1]; mode = 'reset'; }
  lgView();
})();
