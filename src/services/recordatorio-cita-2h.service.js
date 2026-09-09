// src/services/recordatorio-cita-2h.service.js
//
// Recordatorio 2 horas antes de cada cita Confirmada / Confirmada sin
// notificar. Misma idea que el de 15 min: un cron lee Notion y manda ya,
// sin scheduleTime. Plática no deja cancelar un programado; si el aviso
// se agendaba al confirmar asistencia, una cancelada o un cambio de hora
// seguían avisando.
//
// Cada cita recibe el suyo (no solo la primera del día). El estado vive
// en campos propios (Estado / Fecha / Notas Recordatorio 2h), independiente
// del de 15 min.

const contactosService = require('./contactos.service');
const citasService = require('./citas.service');
const {
  ventanaRecordatorio,
  primerNombreParaSaludo,
  limpiarParametroPlantilla,
  telefonoConversacion,
  enviarPlantillaRecordatorio,
} = require('./recordatorio-cita-15min.service');

const MINUTOS_ANTES = 120;
const TEMPLATE_ENV = 'PLATICA_TEMPLATE_CITA_2H';

function capitalizarPalabra(palabra) {
  if (!palabra) return palabra;
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es');
}

function capitalizarTokenNombre(token) {
  return token
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizarPalabra(parte)))
    .join('');
}

// Primer nombre + apellido paterno. Misma regla que la oferta inicial
// (Adler 4-sep): 2 tokens se quedan; 3+ usa el primero y el penúltimo.
function nombreRepresentante(nombreCompleto) {
  const tokens = limpiarParametroPlantilla(nombreCompleto)
    .split(' ')
    .filter(Boolean)
    .map(capitalizarTokenNombre);
  if (tokens.length === 0) return '';
  if (tokens.length <= 2) return tokens.join(' ');
  return `${tokens[0]} ${tokens[tokens.length - 2]}`;
}

/**
 * {{2}} de notificacion_cita_2horas_antes: hora de la cita en el texto
 * de la plantilla ("a las 3:00 pm"). Se lee del ISO guardado (offset CDMX),
 * no se convierte a UTC.
 */
function horaCitaParaPlantilla(inicio) {
  const match = String(inicio || '').match(/T(\d{2}):(\d{2})/);
  if (!match) return '';
  const hora24 = Number(match[1]);
  const minutos = match[2];
  const sufijo = hora24 >= 12 ? 'pm' : 'am';
  const hora12 = hora24 % 12 || 12;
  return `${hora12}:${minutos} ${sufijo}`;
}

/**
 * {{3}}: "Marco Trujillo, de Plática.mx". Encargado = nombre + apellido
 * paterno; empresa tal cual está en Contactos. Si falta uno, se manda
 * el que sí hay. Si faltan los dos, "el sponsor".
 */
function encargadoDeEmpresa(sponsor) {
  const persona = nombreRepresentante(sponsor?.nombre);
  const empresa = limpiarParametroPlantilla(sponsor?.empresa);
  if (persona && empresa && persona.localeCompare(empresa, 'es', { sensitivity: 'accent' }) !== 0) {
    return `${persona}, de ${empresa}`;
  }
  return persona || empresa || 'el sponsor';
}

async function paramsDeRecordatorio2h({ asistentePageId, sponsorPageId, inicio }) {
  const [asistente, sponsor] = await Promise.all([
    contactosService.obtenerContacto(asistentePageId),
    contactosService.obtenerContacto(sponsorPageId),
  ]);
  return {
    whatsapp: asistente?.whatsapp || '',
    params: [
      primerNombreParaSaludo(asistente?.nombre) || 'Asistente',
      horaCitaParaPlantilla(inicio) || 'la hora acordada',
      encargadoDeEmpresa(sponsor),
    ],
  };
}

async function enviarRecordatorios2hPendientes({ ahora, minutos = MINUTOS_ANTES } = {}) {
  const momento = ahora || new Date().toISOString();
  const templateName = process.env[TEMPLATE_ENV];
  if (!templateName) {
    console.warn('[Recordatorio2h] Falta PLATICA_TEMPLATE_CITA_2H; se omite la corrida');
    return { omitido: true, motivo: 'SIN_PLANTILLA', ahora: momento };
  }

  const { desde, hasta } = ventanaRecordatorio({ ahora: momento, minutos });
  const citas = await citasService.buscarCitasParaRecordatorio2h({ desde, hasta, ahora: momento });

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
      await citasService.marcarEstadoRecordatorio2h({
        notionPageId: cita.id,
        estado: citasService.ESTADO_RECORDATORIO_EN_CURSO,
        fecha: marca,
      });
    } catch (error) {
      resultado.fallidos += 1;
      resultado.detalle.push({
        citaId: cita.id,
        inicio: cita.inicio,
        estado: 'Falló',
        motivo: `RECLAMO: ${error.message}`,
      });
      continue;
    }

    try {
      const { whatsapp, params } = await paramsDeRecordatorio2h({
        asistentePageId: cita.asistentePageId,
        sponsorPageId: cita.sponsorPageId,
        inicio: cita.inicio,
      });

      if (!telefonoConversacion(whatsapp)) {
        await citasService.marcarEstadoRecordatorio2h({
          notionPageId: cita.id,
          estado: citasService.ESTADO_RECORDATORIO_OMITIDO,
          notas: 'SIN_WHATSAPP: el asistente no tiene teléfono en Contactos.',
        });
        resultado.omitidos += 1;
        resultado.detalle.push({
          citaId: cita.id,
          inicio: cita.inicio,
          estado: 'Omitido',
          motivo: 'SIN_WHATSAPP',
        });
        continue;
      }

      const respuesta = await enviarPlantillaRecordatorio({ phone: whatsapp, templateName, params });
      await citasService.marcarEstadoRecordatorio2h({
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
        '[Recordatorio2h] Enviado',
        JSON.stringify({ citaId: cita.id, inicio: cita.inicio, messageId: respuesta?.messageId || null })
      );
    } catch (error) {
      console.error('[Recordatorio2h] Falló', JSON.stringify({ citaId: cita.id, error: error.message }));
      try {
        await citasService.marcarEstadoRecordatorio2h({
          notionPageId: cita.id,
          estado: citasService.ESTADO_RECORDATORIO_FALLO,
          notas: error.message,
        });
      } catch (errorAlMarcar) {
        console.error('[Recordatorio2h] Tampoco se pudo marcar el fallo:', errorAlMarcar.message);
      }
      resultado.fallidos += 1;
      resultado.detalle.push({ citaId: cita.id, inicio: cita.inicio, estado: 'Falló', motivo: error.message });
    }
  }

  console.log('[Recordatorio2h] Corrida', JSON.stringify({ ...resultado, detalle: undefined }));
  return resultado;
}

module.exports = {
  enviarRecordatorios2hPendientes,
  horaCitaParaPlantilla,
  encargadoDeEmpresa,
  nombreRepresentante,
  TEMPLATE_ENV,
  MINUTOS_ANTES,
};
