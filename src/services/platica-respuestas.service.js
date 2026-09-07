const contactosService = require('./contactos.service');
const { hidratarPerfilPlatica } = require('./perfil-platica.service');

const OFERTA_INICIAL = 'Oferta inicial';
const FUENTES_PLANTILLA_EXTERNAS = new Set([
  'campaign.message.received',
  'scheduler.scheduled_event.created',
]);

function telefonoDelEvento(payload) {
  const data = payload?.data || {};
  return (
    data.conversation?.phoneNumber ||
    data.client?.phoneNumber ||
    data.conversation?.conversationId ||
    data.client?.id ||
    ''
  );
}

function fechaValida(valor) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

async function registrarRespuestaOfertaInicial(payload) {
  if (payload?.event !== 'message.created') {
    return { procesado: false, motivo: 'EVENTO_NO_APLICA' };
  }

  const message = payload?.data?.message || {};
  const telefono = telefonoDelEvento(payload);
  if (!telefono) return { procesado: false, motivo: 'SIN_TELEFONO' };

  // Las campañas y la herramienta de programación de Plática no pasan por
  // platica-client.service.js. Sus eventos permiten aplicar la misma
  // hidratación aunque la plantilla se haya originado fuera del backend.
  if (message.direction === 'outgoing' && FUENTES_PLANTILLA_EXTERNAS.has(payload?.source)) {
    const contacto = await contactosService.buscarAsistentePorWhatsApp(telefono);
    if (!contacto) return { procesado: false, motivo: 'ASISTENTE_NO_ENCONTRADO' };
    const hidratacion = await hidratarPerfilPlatica({
      whatsapp: telefono,
      asistentePageId: contacto.id,
    });
    return {
      procesado: true,
      motivo: 'PERFIL_HIDRATADO_POR_PLANTILLA_EXTERNA',
      contactoId: contacto.id,
      hidratacion,
    };
  }

  if (message.direction !== 'incoming') {
    return { procesado: false, motivo: 'MENSAJE_NO_ENTRANTE' };
  }

  const contacto = await contactosService.buscarAsistentePorWhatsApp(telefono);
  if (!contacto) return { procesado: false, motivo: 'ASISTENTE_NO_ENCONTRADO' };

  // Cualquier mensaje entrante refresca el perfil (decisión Adler 7-sep). Antes
  // solo hidrataba a quien no tenía campaña, así que el perfil de alguien que ya
  // recibió la oferta se quedaba viejo por más que escribiera. La respuesta a la
  // oferta se sigue evaluando abajo con su propia lógica.
  let hidratacion = null;
  try {
    hidratacion = await hidratarPerfilPlatica({
      whatsapp: telefono,
      asistentePageId: contacto.id,
    });
  } catch (error) {
    console.warn(
      `[PlaticaRespuestas] No se pudo hidratar ${telefono} en el incoming:`,
      error.message
    );
  }

  if (!contacto.ultimaCampanaEnviada) {
    return {
      procesado: true,
      motivo: 'PERFIL_HIDRATADO_SIN_PLANTILLA',
      contactoId: contacto.id,
      hidratacion,
    };
  }
  if (contacto.ultimaCampanaEnviada !== OFERTA_INICIAL || !contacto.fechaUltimaCampana) {
    return { procesado: false, motivo: 'SIN_OFERTA_INICIAL', contactoId: contacto.id, hidratacion };
  }

  const fechaMensaje = fechaValida(message.creationDate || payload.timestamp);
  const fechaOferta = fechaValida(contacto.fechaUltimaCampana);
  if (!fechaMensaje || !fechaOferta || fechaMensaje.getTime() <= fechaOferta.getTime()) {
    return {
      procesado: false,
      motivo: 'RESPUESTA_ANTERIOR_A_OFERTA',
      contactoId: contacto.id,
      hidratacion,
    };
  }

  if (contacto.respondioOfertaInicial) {
    return {
      procesado: true,
      actualizado: false,
      motivo: 'RESPUESTA_YA_REGISTRADA',
      contactoId: contacto.id,
      hidratacion,
    };
  }

  await contactosService.marcarRespuestaOfertaInicial(contacto.id, fechaMensaje.toISOString());
  return {
    procesado: true,
    actualizado: true,
    contactoId: contacto.id,
    fechaRespuesta: fechaMensaje.toISOString(),
    hidratacion,
  };
}

module.exports = {
  OFERTA_INICIAL,
  FUENTES_PLANTILLA_EXTERNAS,
  telefonoDelEvento,
  registrarRespuestaOfertaInicial,
};
