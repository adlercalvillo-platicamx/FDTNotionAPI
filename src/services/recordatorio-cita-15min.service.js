// src/services/recordatorio-cita-15min.service.js
//
// Recordatorio de 15 min antes de la cita, disparado por cron.
//
// Antes esto se programaba al reservar, con el scheduleTime de Plática. El
// problema es que Plática no expone cancelar un mensaje ya programado: una
// cita cancelada seguía avisando a su hora vieja, y una reprogramada avisaba
// a la hora anterior y nunca a la nueva. Con la re-agenda de canceladas se
// juntaban las dos cosas (dos avisos, uno equivocado).
//
// Ahora Notion es el que decide: POST /citas/enviar-recordatorios-15min
// pregunta qué citas reales empiezan en los próximos MINUTOS_ANTES y manda la
// plantilla en ese momento, sin scheduleTime. Una cancelada nunca entra a la
// consulta y una reprogramada entra con su horario nuevo, sin que nadie tenga
// que retirar nada en Plática. El estado idempotente vive en Notion
// (Estado / Fecha / Notas Recordatorio 15min), ver citas.service.js.

const contactosService = require('./contactos.service');
const citasService = require('./citas.service');
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

/**
 * Ventana de citas a avisar en esta corrida: las que empiezan después de
 * ahora y hasta `minutos` adelante. Se comparan instantes (ISO en UTC), no
 * texto, para que no importe el offset con el que Notion guardó la fecha.
 *
 * El aviso no cae exacto en el minuto 15: con un cron cada 5 min sale entre
 * 15 y ~10 minutos antes. Es a propósito — mejor un aviso unos minutos
 * temprano que uno programado que ya no se puede retirar.
 */
function ventanaRecordatorio({ ahora, minutos = MINUTOS_ANTES }) {
  const ahoraMs = Date.parse(ahora);
  if (!Number.isFinite(ahoraMs)) {
    const err = new Error('"ahora" debe ser ISO 8601.');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return {
    desde: new Date(ahoraMs).toISOString(),
    hasta: new Date(ahoraMs + minutos * 60 * 1000).toISOString(),
  };
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

/** Sin scheduleTime: el cron ya está parado en el minuto correcto. */
async function enviarPlantillaRecordatorio({ phone, templateName, params }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) throw new Error('Teléfono vacío para WhatsApp');
  if (!templateName) throw new Error('Falta nombre de plantilla');
  return platicaFetch('/v1/messages/template', {
    ...payloadCanalYAgente(),
    conversationId,
    template: {
      name: templateName,
      params: params || [],
    },
  });
}

/** Los dos params de la plantilla: primer nombre del asistente y empresa del sponsor. */
async function paramsDeRecordatorio({ asistentePageId, sponsorPageId }) {
  const [asistente, sponsor] = await Promise.all([
    contactosService.obtenerContacto(asistentePageId),
    contactosService.obtenerContacto(sponsorPageId),
  ]);
  return {
    whatsapp: asistente?.whatsapp || '',
    params: [
      primerNombreParaSaludo(asistente?.nombre) || 'Asistente',
      limpiarParametroPlantilla(sponsor?.empresa || sponsor?.nombre) || 'el sponsor',
    ],
  };
}

/**
 * Una corrida del cron. Cada cita se resuelve por separado: un fallo de
 * Plática o de un contacto marca esa fila y sigue con las demás, porque
 * abortar el lote dejaría sin aviso a citas que sí se podían mandar.
 *
 * Un fallo queda en "Falló" y la siguiente corrida lo reintenta mientras la
 * cita siga dentro de la ventana. "Omitido" es terminal: no hay a dónde
 * mandarlo (asistente sin WhatsApp) y reintentar no cambiaría nada.
 */
async function enviarRecordatorios15minPendientes({ ahora, minutos = MINUTOS_ANTES } = {}) {
  const momento = ahora || new Date().toISOString();
  const templateName = process.env[TEMPLATE_ENV];
  if (!templateName) {
    console.warn('[Recordatorio15min] Falta PLATICA_TEMPLATE_CITA_15MIN; se omite la corrida');
    return { omitido: true, motivo: 'SIN_PLANTILLA', ahora: momento };
  }

  const { desde, hasta } = ventanaRecordatorio({ ahora: momento, minutos });
  const citas = await citasService.buscarCitasParaRecordatorio15min({ desde, hasta, ahora: momento });

  const resultado = {
    ahora: momento,
    ventana: { desde, hasta, minutos },
    revisadas: citas.length,
    enviados: 0,
    omitidos: 0,
    fallidos: 0,
    detalle: [],
  };

  for (const cita of citas) {
    const marca = new Date().toISOString();
    try {
      await citasService.marcarEstadoRecordatorio15min({
        notionPageId: cita.id,
        estado: citasService.ESTADO_RECORDATORIO_EN_CURSO,
        fecha: marca,
      });
    } catch (error) {
      // Sin reclamo no se manda: preferimos no avisar a arriesgar un doble
      // envío si otra corrida está tomando la misma fila.
      resultado.fallidos += 1;
      resultado.detalle.push({ citaId: cita.id, inicio: cita.inicio, estado: 'Falló', motivo: `RECLAMO: ${error.message}` });
      continue;
    }

    try {
      const { whatsapp, params } = await paramsDeRecordatorio({
        asistentePageId: cita.asistentePageId,
        sponsorPageId: cita.sponsorPageId,
      });

      if (!telefonoConversacion(whatsapp)) {
        await citasService.marcarEstadoRecordatorio15min({
          notionPageId: cita.id,
          estado: citasService.ESTADO_RECORDATORIO_OMITIDO,
          notas: 'SIN_WHATSAPP: el asistente no tiene teléfono en Contactos.',
        });
        resultado.omitidos += 1;
        resultado.detalle.push({ citaId: cita.id, inicio: cita.inicio, estado: 'Omitido', motivo: 'SIN_WHATSAPP' });
        continue;
      }

      const respuesta = await enviarPlantillaRecordatorio({ phone: whatsapp, templateName, params });
      await citasService.marcarEstadoRecordatorio15min({
        notionPageId: cita.id,
        estado: citasService.ESTADO_RECORDATORIO_ENVIADO,
        notas: '',
      });
      resultado.enviados += 1;
      resultado.detalle.push({
        citaId: cita.id,
        inicio: cita.inicio,
        estado: 'Enviado',
        messageId: respuesta?.messageId || null,
        params,
      });
      console.log(
        '[Recordatorio15min] Enviado',
        JSON.stringify({ citaId: cita.id, inicio: cita.inicio, messageId: respuesta?.messageId || null })
      );
    } catch (error) {
      console.error('[Recordatorio15min] Falló', JSON.stringify({ citaId: cita.id, error: error.message }));
      try {
        await citasService.marcarEstadoRecordatorio15min({
          notionPageId: cita.id,
          estado: citasService.ESTADO_RECORDATORIO_FALLO,
          notas: error.message,
        });
      } catch (errorAlMarcar) {
        // La fila se queda "En curso" y el reclamo vencido la vuelve a tomar.
        console.error('[Recordatorio15min] Tampoco se pudo marcar el fallo:', errorAlMarcar.message);
      }
      resultado.fallidos += 1;
      resultado.detalle.push({ citaId: cita.id, inicio: cita.inicio, estado: 'Falló', motivo: error.message });
    }
  }

  console.log('[Recordatorio15min] Corrida', JSON.stringify({ ...resultado, detalle: undefined }));
  return resultado;
}

module.exports = {
  enviarRecordatorios15minPendientes,
  enviarPlantillaRecordatorio,
  ventanaRecordatorio,
  primerNombreParaSaludo,
  limpiarParametroPlantilla,
  telefonoConversacion,
  TEMPLATE_ENV,
  MINUTOS_ANTES,
};
