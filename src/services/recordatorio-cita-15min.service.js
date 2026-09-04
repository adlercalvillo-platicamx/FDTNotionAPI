// src/services/recordatorio-cita-15min.service.js
//
// Copia del envío de plantilla de platica-client.service.js, con
// scheduleTime. No modifica enviarPlantilla ni booking.service.js.
// El agente llama POST /citas/programar-recordatorio-15min DESPUÉS de
// un reservar exitoso. Modificar/cancelar no anulan el programado
// (Plática aún no expone cancelar un scheduled).

const contactosService = require('./contactos.service');
const { payloadCanalYAgente } = require('./platica-client.service');

const BASE_URL = (process.env.PLATICA_API_BASE_URL || 'https://api.platica.mx').replace(/\/$/, '');
const MINUTOS_ANTES = 15;
const TEMPLATE_ENV = 'PLATICA_TEMPLATE_CITA_15MIN';

function telefonoConversacion(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^0+/, '') || '';
}

function limpiarParametroPlantilla(texto) {
  return String(texto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function capitalizarPalabra(palabra) {
  if (!palabra) return palabra;
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es');
}

function primerNombreParaSaludo(nombreCompleto) {
  const [primero = ''] = limpiarParametroPlantilla(nombreCompleto).split(' ');
  return primero
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizarPalabra(parte)))
    .join('');
}

function zonaHorariaOffset() {
  return process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';
}

/**
 * inicio menos 15 min, mismo formato ISO local + offset que el resto de citas.
 * Si cruza medianoche, usa Date para no inventar el día.
 */
function scheduleTimeDesdeInicio(inicioIso) {
  const zona = zonaHorariaOffset();
  const m = String(inicioIso || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const fecha = m[1];
  const segundos = m[4] || '00';
  const minutos = Number(m[2]) * 60 + Number(m[3]) - MINUTOS_ANTES;
  if (minutos >= 0) {
    const h = String(Math.floor(minutos / 60)).padStart(2, '0');
    const min = String(minutos % 60).padStart(2, '0');
    return `${fecha}T${h}:${min}:${segundos}${zona}`;
  }
  const parsed = new Date(inicioIso);
  if (Number.isNaN(parsed.getTime())) return null;
  const scheduled = new Date(parsed.getTime() - MINUTOS_ANTES * 60 * 1000);
  return formatearIsoConOffset(scheduled, zona);
}

function formatearIsoConOffset(date, offset) {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.replace(/^[+-]/, '').split(':').map(Number);
  const localMs = date.getTime() + sign * ((oh || 0) * 60 + (om || 0)) * 60 * 1000;
  const iso = new Date(localMs).toISOString();
  return `${iso.slice(0, 19)}${offset}`;
}

async function platicaFetch(path, body) {
  const apiKey = process.env.PLATICA_API_KEY;
  if (!apiKey) throw new Error('Falta PLATICA_API_KEY');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Plática ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function enviarPlantillaProgramada({ phone, templateName, params, scheduleTime }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) throw new Error('Teléfono vacío para WhatsApp');
  if (!templateName) throw new Error('Falta nombre de plantilla');
  if (!scheduleTime) throw new Error('Falta scheduleTime');
  return platicaFetch('/v1/messages/template', {
    ...payloadCanalYAgente(),
    conversationId,
    template: {
      name: templateName,
      params: params || [],
    },
    scheduleTime,
  });
}

async function programarRecordatorioCita15min({
  asistente_notion_id,
  sponsor_notion_id,
  inicio,
}) {
  if (!asistente_notion_id || !sponsor_notion_id || !inicio) {
    const err = new Error('Los campos "asistente_notion_id", "sponsor_notion_id" e "inicio" son requeridos.');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const templateName = process.env[TEMPLATE_ENV];
  if (!templateName) {
    console.warn('[Recordatorio15min] Falta PLATICA_TEMPLATE_CITA_15MIN; se omite');
    return { omitido: true, motivo: 'SIN_PLANTILLA' };
  }

  const scheduleTime = scheduleTimeDesdeInicio(inicio);
  if (!scheduleTime) {
    const err = new Error('"inicio" debe ser ISO 8601 (ej. "2026-10-07T10:30:00-06:00").');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (new Date(scheduleTime).getTime() <= Date.now()) {
    console.warn('[Recordatorio15min] scheduleTime en el pasado; se omite', scheduleTime);
    return { omitido: true, motivo: 'HORARIO_PASADO', scheduleTime };
  }

  const [asistente, sponsor] = await Promise.all([
    contactosService.obtenerContacto(asistente_notion_id),
    contactosService.obtenerContacto(sponsor_notion_id),
  ]);

  if (!telefonoConversacion(asistente?.whatsapp)) {
    console.warn('[Recordatorio15min] Asistente sin WhatsApp; se omite', asistente_notion_id);
    return { omitido: true, motivo: 'SIN_WHATSAPP' };
  }

  const param1 = primerNombreParaSaludo(asistente.nombre) || 'Asistente';
  const param2 = limpiarParametroPlantilla(sponsor.empresa || sponsor.nombre) || 'el sponsor';

  const respuesta = await enviarPlantillaProgramada({
    phone: asistente.whatsapp,
    templateName,
    params: [param1, param2],
    scheduleTime,
  });

  return {
    status: respuesta.status || 'scheduled',
    messageId: respuesta.messageId || null,
    executeAt: respuesta.executeAt || null,
    scheduledTime: respuesta.scheduledTime || scheduleTime,
    params: [param1, param2],
  };
}

module.exports = {
  programarRecordatorioCita15min,
  enviarPlantillaProgramada,
  scheduleTimeDesdeInicio,
  primerNombreParaSaludo,
  limpiarParametroPlantilla,
  telefonoConversacion,
  TEMPLATE_ENV,
  MINUTOS_ANTES,
};
