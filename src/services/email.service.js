// src/services/email.service.js
//
// Genera el .ics y lo envía por correo al confirmar una cita 1-a-1.
// Formato universal (RFC 5545): lo interpretan Outlook, Google Calendar,
// Apple Calendar, Yahoo, etc. — resuelve el problema de que los sponsors
// usan calendarios distintos (Laura, Demo 2, 13-ago) sin necesidad de
// compartir el Google Calendar del agente con terceros externos.
//
// UID estable = notion_page_id de la cita. Esto es INTENCIONAL: un
// reintento (manual o de cron) que regenera el mismo .ics para la misma
// cita debe actualizar el evento en el calendario del sponsor, no crear
// uno duplicado. RFC 5545 exige que un mismo UID + SEQUENCE mayor sea
// tratado como actualización por el cliente de correo.
//
// Requiere en .env: EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER,
// EMAIL_SMTP_APP_PASSWORD, EMAIL_FROM_NAME.

const nodemailer = require('nodemailer');
const { createEvent } = require('ics');
const { UBICACION_ICS_EVENTO, GEO_ICS_EVENTO, URL_MAPS_EVENTO } = require('../utils/sede-evento');

class EmailError extends Error {
  constructor(categoria, message, causaOriginal) {
    super(message);
    this.name = 'EmailError';
    this.categoria = categoria; // ver CATEGORIAS abajo
    this.causaOriginal = causaOriginal;
  }
}

// Categorías del motivo de falla — no todas son reintentables igual.
// Ver conversación 17-ago: el cron solo tiene sentido para las que se
// resuelven solas con el tiempo (red/SMTP); las de dato incorrecto
// necesitan corrección manual antes de que cualquier reintento sirva.
const CATEGORIAS = {
  CORREO_INVALIDO: 'CORREO_INVALIDO', // ej. 550 5.1.1 — no reintentable solo
  BUZON_RECHAZADO: 'BUZON_RECHAZADO', // ej. 552 mailbox full — reintentable más tarde
  SMTP_NO_DISPONIBLE: 'SMTP_NO_DISPONIBLE', // timeout/conexión — reintentable de inmediato
  AUTH_INVALIDA: 'AUTH_INVALIDA', // App Password revocada/incorrecta — reintentable pero nunca solo
  ICS_GENERACION_FALLO: 'ICS_GENERACION_FALLO', // datos faltantes para construir el archivo — no es de correo, es bug
};

let transporterSingleton = null;
function getTransporter() {
  if (transporterSingleton) return transporterSingleton;

  const { EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_APP_PASSWORD } = process.env;
  if (!EMAIL_SMTP_HOST || !EMAIL_SMTP_PORT || !EMAIL_SMTP_USER || !EMAIL_SMTP_APP_PASSWORD) {
    throw new EmailError(
      CATEGORIAS.AUTH_INVALIDA,
      'Configuración de correo incompleta: faltan EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER o EMAIL_SMTP_APP_PASSWORD.'
    );
  }

  transporterSingleton = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: Number(EMAIL_SMTP_PORT),
    secure: Number(EMAIL_SMTP_PORT) === 465,
    auth: { user: EMAIL_SMTP_USER, pass: EMAIL_SMTP_APP_PASSWORD },
  });
  return transporterSingleton;
}

/** Solo para tests — permite inyectar un transporter mock. */
function _setTransporterForTests(transporter) {
  transporterSingleton = transporter;
}

/**
 * Construye el string .ics de una cita.
 * UID estable = notionPageId — ver nota de cabecera sobre por qué.
 *
 * `cancelacion: true` genera METHOD:CANCEL + STATUS:CANCELLED sobre el
 * MISMO UID: el cliente de correo lo trata como "borra este evento", no
 * como uno nuevo. Verificado contra la librería `ics` que ya usa el
 * proyecto — no hizo falta cambiarla.
 */
function generarIcs({ notionPageId, titulo, descripcion, inicio, fin, secuencia, cancelacion }) {
  const fecha = new Date(inicio);
  const fechaFin = new Date(fin);

  const evento = {
    uid: `${notionPageId}@fashiondigitaltalks.com`,
    sequence: secuencia || 0,
    ...(cancelacion ? { method: 'CANCEL' } : {}),
    start: [
      fecha.getUTCFullYear(),
      fecha.getUTCMonth() + 1,
      fecha.getUTCDate(),
      fecha.getUTCHours(),
      fecha.getUTCMinutes(),
    ],
    startInputType: 'utc',
    end: [
      fechaFin.getUTCFullYear(),
      fechaFin.getUTCMonth() + 1,
      fechaFin.getUTCDate(),
      fechaFin.getUTCHours(),
      fechaFin.getUTCMinutes(),
    ],
    endInputType: 'utc',
    title: titulo,
    description: descripcion || '',
    location: UBICACION_ICS_EVENTO,
    geo: GEO_ICS_EVENTO,
    url: URL_MAPS_EVENTO,
    status: cancelacion ? 'CANCELLED' : 'CONFIRMED',
  };

  const { error, value } = createEvent(evento);
  if (error) {
    throw new EmailError(
      CATEGORIAS.ICS_GENERACION_FALLO,
      `No se pudo generar el archivo .ics: ${error.message}`,
      error
    );
  }
  return value;
}

/**
 * Clasifica el error crudo de Nodemailer/SMTP en una de las CATEGORIAS.
 * Nodemailer expone `responseCode` (código SMTP) y `code` (código de
 * error de Node, ej. ETIMEDOUT) — no hay un estándar único, así que se
 * revisan ambos.
 */
function clasificarErrorSmtp(err) {
  const codigoSmtp = err.responseCode;
  const codigoNode = err.code;

  if (codigoSmtp === 550 || codigoSmtp === 551 || codigoSmtp === 553) {
    return CATEGORIAS.CORREO_INVALIDO;
  }
  if (codigoSmtp === 552) {
    return CATEGORIAS.BUZON_RECHAZADO;
  }
  if (codigoNode === 'ETIMEDOUT' || codigoNode === 'ECONNREFUSED' || codigoNode === 'ESOCKET' || codigoNode === 'ECONNRESET') {
    return CATEGORIAS.SMTP_NO_DISPONIBLE;
  }
  if (codigoSmtp === 535 || err.command === 'AUTH') {
    return CATEGORIAS.AUTH_INVALIDA;
  }
  // Default conservador: si no reconocemos el patrón, tratarlo como
  // problema de red antes que como dato inválido — evita marcar como
  // "corrige el correo" algo que en realidad se hubiera resuelto solo.
  return CATEGORIAS.SMTP_NO_DISPONIBLE;
}

/**
 * Envía el correo de confirmación con el .ics adjunto. Lanza EmailError
 * con categoría clasificada si falla — nunca deja pasar un error crudo de
 * Nodemailer sin categorizar, porque quien llama (booking.service.js)
 * necesita la categoría para decidir el mensaje que va a Notas Envio Email.
 *
 * IMPORTANTE — logging: nunca loggear el objeto de config completo del
 * transporter (contendría la App Password) — solo el mensaje de error.
 */
async function enviarConfirmacionCita({
  notionPageId,
  destinatarios, // array de emails para ESTE envío (uno al sponsor, otro al asistente)
  titulo,
  asunto, // opcional: solo cambia el Subject; el SUMMARY del .ics sigue siendo `titulo`
  descripcion,
  inicio,
  fin,
  secuencia,
}) {
  return enviarCorreoConIcs({
    notionPageId,
    destinatarios,
    titulo,
    asunto,
    descripcion,
    inicio,
    fin,
    secuencia,
    cancelacion: false,
  });
}

/**
 * Aviso de cancelación con el .ics de baja (mismo UID, secuencia mayor,
 * METHOD:CANCEL). Mismos destinatarios que ya recibieron la confirmación
 * original — no se agrega a nadie más.
 *
 * Igual que en la confirmación, quien llama es responsable de decidir qué
 * hacer si esto falla: la cancelación en Notion ya es cierta y no se
 * revierte por un problema de correo.
 */
async function enviarCancelacionCita({
  notionPageId,
  destinatarios,
  titulo,
  asunto,
  descripcion,
  inicio,
  fin,
  secuencia,
}) {
  return enviarCorreoConIcs({
    notionPageId,
    destinatarios,
    titulo,
    asunto,
    descripcion,
    inicio,
    fin,
    secuencia,
    cancelacion: true,
  });
}

async function enviarCorreoConIcs({
  notionPageId,
  destinatarios,
  titulo,
  asunto,
  descripcion,
  inicio,
  fin,
  secuencia,
  cancelacion,
}) {
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    throw new EmailError(
      CATEGORIAS.CORREO_INVALIDO,
      `No hay destinatarios válidos para enviar ${
        cancelacion ? 'la cancelación' : 'la confirmación'
      } (destinatarios vacío).`
    );
  }

  const icsContent = generarIcs({
    notionPageId,
    titulo,
    descripcion,
    inicio,
    fin,
    secuencia,
    cancelacion,
  });

  const transporter = getTransporter();
  try {
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Fashion Digital Talks'}" <${process.env.EMAIL_SMTP_USER}>`,
      to: destinatarios,
      subject: asunto || titulo,
      text: descripcion || (cancelacion ? 'Tu cita 1 a 1 fue cancelada.' : 'Tu cita 1 a 1 ha sido confirmada.'),
      icalEvent: {
        filename: cancelacion ? 'cancelacion.ics' : 'invitacion.ics',
        method: cancelacion ? 'CANCEL' : 'REQUEST',
        content: icsContent,
      },
    });
  } catch (err) {
    const categoria = clasificarErrorSmtp(err);
    throw new EmailError(
      categoria,
      `Fallo al enviar correo de ${cancelacion ? 'cancelación' : 'confirmación'} (${categoria}): ${err.message}`,
      err
    );
  }
}

module.exports = {
  enviarConfirmacionCita,
  enviarCancelacionCita,
  generarIcs,
  EmailError,
  CATEGORIAS,
  clasificarErrorSmtp,
  _setTransporterForTests,
};
