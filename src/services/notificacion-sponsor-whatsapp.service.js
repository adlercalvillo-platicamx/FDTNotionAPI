// Aviso por plantilla al sponsor tras agendar, modificar o cancelar una cita
// real. Solo WhatsApp del sponsor en Notion; no bloquea reserva/correo.

const platicaClient = require('./platica-client.service');
const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const { textoEnTituloSiGritado } = require('./perfil-platica.service');
const {
  limpiarParametroPlantilla,
  primerNombreParaSaludo,
} = require('./recordatorio-cita-15min.service');

const TEMPLATE_ENV = {
  agendada: 'PLATICA_TEMPLATE_SPONSOR_CITA_AGENDADA',
  modificada: 'PLATICA_TEMPLATE_SPONSOR_CITA_MODIFICADA',
  cancelada: 'PLATICA_TEMPLATE_SPONSOR_CITA_CANCELADA',
  recordatorio24h: 'PLATICA_TEMPLATE_SPONSOR_AGENDA_24H',
};

const TEMPLATE_NAME = {
  agendada: 'notificacion_sponsor_cita_agendada',
  modificada: 'notificacion_sponsor_cita_modificada',
  cancelada: 'notificacion_sponsor_cita_cancelada',
  recordatorio24h: 'recordatorio_sponsor_agenda_24h',
};

// El tope de Meta es el mensaje ya armado, no el molde. El colchón cubre
// el conteo distinto que a veces hace Meta con emojis.
const TOPE_CUERPO_META = 1024;
const COLCHON_CONTEO_META = 24;
const AGENDA_VACIA = 'Por ahora no tienes otras reuniones 1 a 1.';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const CUERPO_AGENDADA_O_MODIFICADA_BASE = {
  agendada: `Hola {{1}}. {{2}} agendó una cita 1 a 1 contigo.

📅 {{3}}
🕐 {{4}}
📍 Mesa {{5}}
Modalidad: {{6}}

Preséntate en la zona de citas 1 a 1. Si la reunión es virtual, el asistente entra por Google Meet y tú desde tu mesa. El link llega a tu correo unos 15 minutos antes.

Así queda tu agenda:
{{7}}

Si quieres, respóndeme y te ayudo a revisarla.`,
  modificada: `Hola {{1}}. {{2}} modificó el horario de su cita 1 a 1 contigo.

Nuevo horario:
📅 {{3}}
🕐 {{4}}
📍 Mesa {{5}}
Modalidad: {{6}}

Preséntate en la zona de citas 1 a 1. Si la reunión es virtual, el asistente entra por Google Meet y tú desde tu mesa. El link llega a tu correo unos 15 minutos antes.

Así queda tu agenda:
{{7}}

Si quieres, respóndeme y te ayudo a revisarla.`,
};

const CUERPO_CANCELADA = `Hola {{1}}. Se canceló la cita 1 a 1 con {{2}}.

Horario que quedó libre:
📅 {{3}}
🕐 {{4}}
Modalidad: {{5}}

Así queda tu agenda:
{{6}}

También te enviamos el aviso a tu correo electrónico.`;

const CUERPO_RECORDATORIO_24H = `Hola {{1}}. Mañana empiezan tus reuniones 1 a 1 de Fashion Digital Talks. Esta es tu agenda de los dos días:

{{2}}

Si tienes una duda de horario, mesa o sede, respóndeme por aquí.`;

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

function textoNormalizado(valor) {
  return textoEnTituloSiGritado(valor) || limpiarParametroPlantilla(valor);
}

function fechaCorta(inicio) {
  const match = String(inicio || '').match(/^\d{4}-(\d{2})-(\d{2})T/);
  if (!match) return '';
  const mes = MESES[Number(match[1]) - 1];
  if (!mes) return '';
  return `${Number(match[2])} ${mes}`;
}

/** "Patricia Lopez, de Nomadas". Sin empresa, solo la persona. */
function personaYEmpresa({ nombre, empresa }) {
  const persona = textoNormalizado(nombre);
  const compania = textoNormalizado(empresa);
  if (persona && compania) return limpiarParametroPlantilla(`${persona}, de ${compania}`);
  return limpiarParametroPlantilla(persona || compania || 'Un asistente');
}

function piezasAgenda({ inicio, mesa, ticketTipo, nombre, empresa }) {
  const cuando = [fechaCorta(inicio), horaCitaParaPlantilla(inicio)].filter(Boolean).join(' ');
  const persona = textoNormalizado(nombre) || 'Un asistente';
  const compania = textoNormalizado(empresa);
  const quien = compania ? `${persona} de ${compania}` : persona;
  const numeroMesa = mesaParaPlantilla(mesa);
  const mesaTexto = numeroMesa && numeroMesa !== 'Por confirmar' ? `mesa ${numeroMesa}` : '';
  const modalidad = modalidadParaPlantilla(ticketTipo).toLocaleLowerCase('es');
  return {
    cuando: limpiarParametroPlantilla(cuando),
    quien: limpiarParametroPlantilla(quien),
    quienSinEmpresa: limpiarParametroPlantilla(persona),
    mesaTexto,
    modalidad,
  };
}

function lineaDesdePiezas(piezas, { empresa = true, modalidad = true, mesa = true } = {}) {
  const quien = empresa ? piezas.quien : piezas.quienSinEmpresa;
  const extras = [];
  if (mesa && piezas.mesaTexto) extras.push(piezas.mesaTexto);
  if (modalidad) extras.push(piezas.modalidad);
  return limpiarParametroPlantilla([piezas.cuando, [quien, ...extras].filter(Boolean).join(', ')].filter(Boolean).join(', '));
}

function rellenarCuerpo(cuerpo, params) {
  return params.reduce(
    (texto, valor, indice) => texto.split(`{{${indice + 1}}}`).join(String(valor ?? '')),
    cuerpo
  );
}

function sufijoRecorte(cantidad) {
  if (cantidad === 1) return 'y 1 reunión más. Pídeme el resto por aquí.';
  return `y ${cantidad} reuniones más. Pídeme el resto por aquí.`;
}

/**
 * La agenda va en el último parámetro. Primero quita empresa, modalidad y
 * mesa. Si aún no cabe, deja las primeras y dice cuántas faltan.
 */
function agendaQueCabe(cuerpo, paramsPrevios, piezas) {
  if (!piezas.length) return AGENDA_VACIA;
  const tope = TOPE_CUERPO_META - COLCHON_CONTEO_META;
  const etapas = [
    { empresa: true, modalidad: true, mesa: true },
    { empresa: false, modalidad: true, mesa: true },
    { empresa: false, modalidad: false, mesa: true },
    { empresa: false, modalidad: false, mesa: false },
  ];
  for (const etapa of etapas) {
    const lineas = piezas.map((pieza) => lineaDesdePiezas(pieza, etapa));
    const texto = lineas.join('; ');
    if (rellenarCuerpo(cuerpo, [...paramsPrevios, texto]).length <= tope) return texto;
  }
  const cortas = piezas.map((pieza) => lineaDesdePiezas(pieza, { empresa: false, modalidad: false, mesa: false }));
  const tomadas = [];
  for (let i = 0; i < cortas.length; i += 1) {
    const siguientes = tomadas.concat(cortas[i]);
    const fuera = cortas.length - siguientes.length;
    const texto = fuera
      ? `${siguientes.join('; ')}; ${sufijoRecorte(fuera)}`
      : siguientes.join('; ');
    if (rellenarCuerpo(cuerpo, [...paramsPrevios, texto]).length <= tope) {
      tomadas.push(cortas[i]);
      continue;
    }
    break;
  }
  if (!tomadas.length) {
    const una = limpiarParametroPlantilla(cortas[0]).slice(0, 180);
    return una || AGENDA_VACIA;
  }
  const fuera = cortas.length - tomadas.length;
  return fuera ? `${tomadas.join('; ')}; ${sufijoRecorte(fuera)}` : tomadas.join('; ');
}

function paramsAgendadaOModificada({
  primerNombreSponsor,
  nombreAsistente,
  empresaAsistente,
  inicio,
  mesa,
  ticketTipo,
  agenda,
}) {
  return [
    primerNombreParaSaludo(primerNombreSponsor) || 'equipo',
    personaYEmpresa({ nombre: nombreAsistente, empresa: empresaAsistente }),
    fechaCitaParaPlantilla(inicio),
    horaCitaParaPlantilla(inicio),
    mesaParaPlantilla(mesa),
    modalidadParaPlantilla(ticketTipo),
    limpiarParametroPlantilla(agenda) || AGENDA_VACIA,
  ];
}

function paramsCancelada({
  primerNombreSponsor,
  nombreAsistente,
  empresaAsistente,
  inicio,
  ticketTipo,
  agenda,
}) {
  return [
    primerNombreParaSaludo(primerNombreSponsor) || 'equipo',
    personaYEmpresa({ nombre: nombreAsistente, empresa: empresaAsistente }),
    fechaCitaParaPlantilla(inicio),
    horaCitaParaPlantilla(inicio),
    modalidadParaPlantilla(ticketTipo),
    limpiarParametroPlantilla(agenda) || AGENDA_VACIA,
  ];
}

function paramsRecordatorio24h({ primerNombreSponsor, agenda }) {
  return [
    primerNombreParaSaludo(primerNombreSponsor) || 'equipo',
    limpiarParametroPlantilla(agenda) || AGENDA_VACIA,
  ];
}

async function piezasAgendaDeSponsor(sponsorPageId) {
  if (!sponsorPageId) return [];
  const citas = await citasService.listarCitasRealesPorSponsor(sponsorPageId);
  const cache = new Map();
  const piezas = [];
  for (const cita of citas) {
    let contacto = cache.get(cita.asistentePageId);
    if (contacto === undefined) {
      try {
        contacto = await contactosService.obtenerContacto(cita.asistentePageId);
      } catch (_) {
        contacto = null;
      }
      cache.set(cita.asistentePageId, contacto);
    }
    piezas.push(
      piezasAgenda({
        inicio: cita.inicio,
        mesa: cita.mesa,
        ticketTipo: contacto?.ticketTipo,
        nombre: contacto?.nombre,
        empresa: contacto?.empresa,
      })
    );
  }
  return piezas;
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

async function agendaParaAccion(accion, sponsorPageId, paramsPrevios) {
  let piezas = [];
  try {
    piezas = await piezasAgendaDeSponsor(sponsorPageId);
  } catch (error) {
    console.warn('[NotifSponsorWA] No se pudo armar la agenda:', error.message);
  }
  const cuerpo =
    accion === 'cancelada'
      ? CUERPO_CANCELADA
      : accion === 'recordatorio24h'
        ? CUERPO_RECORDATORIO_24H
        : CUERPO_AGENDADA_O_MODIFICADA_BASE[accion];
  return agendaQueCabe(cuerpo, paramsPrevios, piezas);
}

async function notificarSponsorCitaAgendada({
  whatsappSponsor,
  primerNombreSponsor,
  nombreAsistente,
  empresaAsistente,
  inicio,
  mesa,
  ticketTipo,
  sponsorPageId,
}) {
  const previos = paramsAgendadaOModificada({
    primerNombreSponsor,
    nombreAsistente,
    empresaAsistente,
    inicio,
    mesa,
    ticketTipo,
    agenda: ' ',
  }).slice(0, 6);
  const agenda = await agendaParaAccion('agendada', sponsorPageId, previos);
  return enviarPlantillaSponsor({
    accion: 'agendada',
    phone: whatsappSponsor,
    params: [...previos, agenda],
  });
}

async function notificarSponsorCitaModificada({
  whatsappSponsor,
  primerNombreSponsor,
  nombreAsistente,
  empresaAsistente,
  inicio,
  mesa,
  ticketTipo,
  sponsorPageId,
}) {
  const previos = paramsAgendadaOModificada({
    primerNombreSponsor,
    nombreAsistente,
    empresaAsistente,
    inicio,
    mesa,
    ticketTipo,
    agenda: ' ',
  }).slice(0, 6);
  const agenda = await agendaParaAccion('modificada', sponsorPageId, previos);
  return enviarPlantillaSponsor({
    accion: 'modificada',
    phone: whatsappSponsor,
    params: [...previos, agenda],
  });
}

async function notificarSponsorCitaCancelada({
  whatsappSponsor,
  primerNombreSponsor,
  nombreAsistente,
  empresaAsistente,
  inicio,
  ticketTipo,
  sponsorPageId,
}) {
  const previos = paramsCancelada({
    primerNombreSponsor,
    nombreAsistente,
    empresaAsistente,
    inicio,
    ticketTipo,
    agenda: ' ',
  }).slice(0, 5);
  const agenda = await agendaParaAccion('cancelada', sponsorPageId, previos);
  return enviarPlantillaSponsor({
    accion: 'cancelada',
    phone: whatsappSponsor,
    params: [...previos, agenda],
  });
}

/**
 * Arma {{1}} y {{2}} del recordatorio de 24 h. No envía: no hay cron.
 * Se manda cuando se pida, con PLATICA_TEMPLATE_SPONSOR_AGENDA_24H.
 */
async function armarRecordatorioSponsor24h({ primerNombreSponsor, sponsorPageId, nombreSponsor }) {
  const nombre = primerNombreSponsor || primerNombreParaSaludo(nombreSponsor);
  const previos = [limpiarParametroPlantilla(nombre) || 'equipo'];
  const agenda = await agendaParaAccion('recordatorio24h', sponsorPageId, previos);
  return {
    template: TEMPLATE_NAME.recordatorio24h,
    params: paramsRecordatorio24h({ primerNombreSponsor: previos[0], agenda }),
  };
}

module.exports = {
  modalidadParaPlantilla,
  fechaCitaParaPlantilla,
  horaCitaParaPlantilla,
  mesaParaPlantilla,
  personaYEmpresa,
  piezasAgenda,
  lineaDesdePiezas,
  agendaQueCabe,
  rellenarCuerpo,
  paramsAgendadaOModificada,
  paramsCancelada,
  paramsRecordatorio24h,
  armarRecordatorioSponsor24h,
  notificarSponsorCitaAgendada,
  notificarSponsorCitaModificada,
  notificarSponsorCitaCancelada,
  CUERPO_AGENDADA_O_MODIFICADA_BASE,
  CUERPO_CANCELADA,
  CUERPO_RECORDATORIO_24H,
  AGENDA_VACIA,
  TEMPLATE_NAME,
};
