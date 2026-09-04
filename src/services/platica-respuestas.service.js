const contactosService = require('./contactos.service');

const OFERTA_INICIAL = 'Oferta inicial';

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
  if (message.direction !== 'incoming') {
    return { procesado: false, motivo: 'MENSAJE_NO_ENTRANTE' };
  }

  const telefono = telefonoDelEvento(payload);
  if (!telefono) return { procesado: false, motivo: 'SIN_TELEFONO' };

  const contacto = await contactosService.buscarAsistentePorWhatsApp(telefono);
  if (!contacto) return { procesado: false, motivo: 'ASISTENTE_NO_ENCONTRADO' };
  if (contacto.ultimaCampanaEnviada !== OFERTA_INICIAL || !contacto.fechaUltimaCampana) {
    return { procesado: false, motivo: 'SIN_OFERTA_INICIAL', contactoId: contacto.id };
  }

  const fechaMensaje = fechaValida(message.creationDate || payload.timestamp);
  const fechaOferta = fechaValida(contacto.fechaUltimaCampana);
  if (!fechaMensaje || !fechaOferta || fechaMensaje.getTime() <= fechaOferta.getTime()) {
    return { procesado: false, motivo: 'RESPUESTA_ANTERIOR_A_OFERTA', contactoId: contacto.id };
  }

  if (contacto.respondioOfertaInicial) {
    return {
      procesado: true,
      actualizado: false,
      motivo: 'RESPUESTA_YA_REGISTRADA',
      contactoId: contacto.id,
    };
  }

  await contactosService.marcarRespuestaOfertaInicial(contacto.id, fechaMensaje.toISOString());
  return {
    procesado: true,
    actualizado: true,
    contactoId: contacto.id,
    fechaRespuesta: fechaMensaje.toISOString(),
  };
}

module.exports = {
  OFERTA_INICIAL,
  telefonoDelEvento,
  registrarRespuestaOfertaInicial,
};
