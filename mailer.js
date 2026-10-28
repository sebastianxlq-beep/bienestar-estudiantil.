'use strict';
const nodemailer = require('nodemailer');
const cfg = require('./config');
const { HttpError } = require('./util');

let transport = null;
function getTransport() {
  if (!cfg.smtpConfigured) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure || cfg.smtp.port === 465,
      auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) throw new HttpError(503, 'El correo no está configurado en el servidor (faltan las variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM).');
  try {
    await t.sendMail({
      from: cfg.smtp.from,
      to,
      subject,
      text,
      html: `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${escHtml(text)}</div>`,
    });
  } catch (e) {
    console.error('Error SMTP:', e.message);
    throw new HttpError(502, 'No se pudo enviar el correo. Revise la configuración SMTP del servidor.');
  }
}

module.exports = { sendMail };
