// Aviso por plantilla al sponsor tras agendar, modificar o cancelar una cita
// real. Solo WhatsApp del sponsor en Notion; no bloquea reserva/correo.

const platicaClient = require('./platica-client.service');
const { limpiarParametroPlantilla } = require('./recordatorio-cita-15min.service');

const TEMPLATE_ENV = {
  agendada: 'PLATICA_TEMPLATE_SPONSOR_CITA_AGENDADA',
  modificada: 'PLATICA_TEMPLATE_SPONSOR_CITA_MODIFICADA',
  cancelada: 'PLATICA_TEMPLATE_SPONSOR_CITA_CANCELADA',
};

function modalidadParaPlantilla(ticketTipo) {
  return String(ticketTipo || '').trim() === 'Virtual' ? 'Virtual' : 'Presencial';
}

function fechaCitaParaPlantilla(inicio) {
  const match = String(inicio || '').match(/^(\d{4}-\d{2}-\d{2})T/);
  if (!match) return limpiarParametroPlantilla(inicio);
  const fechaObj = new Date(`${match[1]}T12:00:00Z`);
  const fechaConComa = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(fechaObj);
  return limpiarParametroPlantilla(fechaConComa.replace(',', ''));
}

/** Misma regla que recordatorio 2 h: "10:30 am" desde el ISO guardado. */
function horaCitaParaPlantilla(inicio) {
  const match = String(inicio || '').match(/T(\d{2}):(\d{2})/);
  if (!match) return '';
  const hora24 = Number(match[1]);
  const minutos = match[2];
  const sufijo = hora24 >= 12 ? 'pm' : 'am';
  const hora12 = hora24 % 12 || 12;
  return `${hora12}:${minutos} ${sufijo}`;
}

function mesaParaPlantilla(mesa) {
  if (mesa == null || mesa === '') return 'Por confirmar';
  if (typeof mesa === 'number' && Number.isFinite(mesa)) return String(mesa);
  const m = String(mesa).match(/(\d+)/);
  return m ? m[1] : limpiarParametroPlantilla(mesa);
}

function paramsAgendadaOModificada({ empresaAsistente, inicio, mesa, ticketTipo }) {
  return [
    limpiarParametroPlantilla(empresaAsistente) || 'Un asistente',
    fechaCitaParaPlantilla(inicio),
    horaCitaParaPlantilla(inicio),
    mesaParaPlantilla(mesa),
    modalidadParaPlantilla(ticketTipo),
  ];
}

function paramsCancelada({ empresaAsistente, inicio, ticketTipo }) {
  return [
    limpiarParametroPlantilla(empresaAsistente) || 'Un asistente',
    fechaCitaParaPlantilla(inicio),
    horaCitaParaPlantilla(inicio),
    modalidadParaPlantilla(ticketTipo),
  ];
}

async function enviarPlantillaSponsor({ accion, phone, params }) {
  const templateName = String(process.env[TEMPLATE_ENV[accion]] || '').trim();
  if (!templateName) {
    return { omitido: true, motivo: 'SIN_PLANTILLA' };
  }
  const conversationId = platicaClient.telefonoConversacion(phone);
  if (!conversationId) {
    return { omitido: true, motivo: 'SIN_WHATSAPP' };
  }
  try {
    await platicaClient.enviarPlantilla({
      phone: conversationId,
      templateName,
      params,
      skipHidratar: true,
    });
    return { enviado: true, template: templateName };
  } catch (error) {
    console.warn(
      `[NotifSponsorWA] Falló plantilla ${accion} a ${conversationId}:`,
      error.message
    );
    return { enviado: false, error: error.message };
  }
}

async function notificarSponsorCitaAgendada({ whatsappSponsor, empresaAsistente, inicio, mesa, ticketTipo }) {
  return enviarPlantillaSponsor({
    accion: 'agendada',
    phone: whatsappSponsor,
    params: paramsAgendadaOModificada({ empresaAsistente, inicio, mesa, ticketTipo }),
  });
}

async function notificarSponsorCitaModificada({ whatsappSponsor, empresaAsistente, inicio, mesa, ticketTipo }) {
  return enviarPlantillaSponsor({
    accion: 'modificada',
    phone: whatsappSponsor,
    params: paramsAgendadaOModificada({ empresaAsistente, inicio, mesa, ticketTipo }),
  });
}

async function notificarSponsorCitaCancelada({ whatsappSponsor, empresaAsistente, inicio, ticketTipo }) {
  return enviarPlantillaSponsor({
    accion: 'cancelada',
    phone: whatsappSponsor,
    params: paramsCancelada({ empresaAsistente, inicio, ticketTipo }),
  });
}

module.exports = {
  modalidadParaPlantilla,
  fechaCitaParaPlantilla,
  horaCitaParaPlantilla,
  mesaParaPlantilla,
  paramsAgendadaOModificada,
  paramsCancelada,
  notificarSponsorCitaAgendada,
  notificarSponsorCitaModificada,
  notificarSponsorCitaCancelada,
};
