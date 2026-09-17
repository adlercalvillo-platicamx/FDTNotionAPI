const contactos = require('./contactos.service');
const citas = require('./citas.service');
const { reservarCita } = require('./booking.service');
const { emitirTokenReserva } = require('./reserva-publica-token.service');

const BOLETOS_CON_CITAS = new Set(['Presencial', 'Presencial VIP', 'Virtual', 'Speaker']);
const NIVELES_SIN_CITAS = new Set(['Bronce']);
const WHATSAPP_SOPORTE_CITAS = '+52 33 3236 1963';

class ReservaPublicaError extends Error {
  constructor(code, message, status = 400, detalle) {
    super(message);
    this.name = 'ReservaPublicaError';
    this.code = code;
    this.status = status;
    this.detalle = detalle;
  }
}

function normalizarEmail(valor) {
  return String(valor || '').trim().toLowerCase();
}

function emailValido(valor) {
  return valor.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function exigirAsistenteElegible(asistente) {
  if (!asistente || asistente.categoria !== 'Asistente' || asistente.dadoDeBaja) {
    throw new ReservaPublicaError(
      'ASISTENTE_NO_ELEGIBLE',
      'El contacto no está habilitado como asistente.',
      403
    );
  }
  if (asistente.ticketTipo === 'Expo') {
    throw new ReservaPublicaError(
      'BOLETO_EXPO_NO_PERMITE_CITAS',
      'El boleto Expo no incluye citas 1a1.',
      403
    );
  }
  if (!BOLETOS_CON_CITAS.has(asistente.ticketTipo)) {
    throw new ReservaPublicaError(
      'BOLETO_NO_ELEGIBLE',
      'El tipo de boleto no está habilitado para citas 1a1.',
      403
    );
  }
  return asistente;
}

function formatearCita(cita) {
  return {
    citaId: cita.id,
    sponsorNombre: cita.sponsorEmpresa || cita.sponsorNombre || 'Sponsor',
    sponsor_notion_id: cita.sponsorPageId || null,
    fechaHora: cita.inicio || null,
    mesa: cita.mesa || null,
  };
}

async function identificarPorEmail(emailEntrada) {
  const email = normalizarEmail(emailEntrada);
  if (!emailValido(email)) {
    throw new ReservaPublicaError('EMAIL_INVALIDO', 'El formato del correo no es válido.', 400);
  }

  const coincidencias = await contactos.buscarContactosPorEmail(email);
  if (coincidencias.length === 0) {
    throw new ReservaPublicaError(
      'EMAIL_NO_ENCONTRADO',
      'No se encontró un registro con ese correo.',
      404
    );
  }

  const asistentesActivos = coincidencias.filter(
    (contacto) => contacto.categoria === 'Asistente' && !contacto.dadoDeBaja
  );
  if (asistentesActivos.length === 0) {
    throw new ReservaPublicaError(
      'ASISTENTE_NO_ELEGIBLE',
      'El correo no corresponde a un asistente activo.',
      403
    );
  }
  if (asistentesActivos.length > 1) {
    throw new ReservaPublicaError(
      'EMAIL_AMBIGUO',
      'Hay más de un asistente activo con ese correo; requiere revisión del equipo.',
      409
    );
  }

  const asistente = exigirAsistenteElegible(asistentesActivos[0]);
  const citasReales = await citas.listarCitasRealesPorAsistente(asistente.id);

  return {
    token: emitirTokenReserva({ contactoId: asistente.id }),
    asistente: {
      nombre: asistente.nombre || '',
      empresa: asistente.empresa || '',
      ticketTipo: asistente.ticketTipo,
    },
    citasConfirmadas: citasReales
      .slice()
      .sort((a, b) => String(a.inicio || '').localeCompare(String(b.inicio || '')))
      .map(formatearCita),
  };
}

async function listarSponsorsPublicos() {
  const sponsors = await contactos.listarSponsorsActivos();
  return sponsors
    .filter((sponsor) => !NIVELES_SIN_CITAS.has(sponsor.nivelPatrocinio))
    .map((sponsor) => ({
      id: sponsor.id,
      empresa: sponsor.empresa || sponsor.nombre || 'Sponsor',
      representante: sponsor.nombre || '',
      descripcion: sponsor.bio || sponsor.servicios || '',
      logoUrl: sponsor.logoEmpresaSpeaker || null,
      sitioWeb: sponsor.sitioWebEmpresa || null,
      soluciones: sponsor.solucion || [],
    }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'es'));
}

async function obtenerDisponibilidadPublica({ contactoId, sponsorPageId, fecha }) {
  return citas.obtenerDisponibilidadSponsor({
    sponsorPageId,
    fecha,
    asistentePageId: contactoId,
  });
}

function requestIdPublico(contactoId, requestId) {
  const valor = String(requestId || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(valor)) {
    throw new ReservaPublicaError(
      'REQUEST_ID_INVALIDO',
      'request_id debe tener entre 8 y 80 caracteres alfanuméricos.',
      400
    );
  }
  return `qr:${contactoId}:${valor}`;
}

async function reservarPublicamente({
  contactoId,
  sponsorPageId,
  inicio,
  fin,
  requestId,
}) {
  const asistente = await contactos.obtenerContacto(contactoId);
  exigirAsistenteElegible(asistente);

  const cancelada = await citas.buscarCanceladaReagendableDelPar({
    sponsorPageId,
    asistentePageId: contactoId,
  });

  const resultado = await reservarCita({
    sponsor_notion_id: sponsorPageId,
    asistente_notion_id: contactoId,
    inicio,
    fin,
    request_id: requestIdPublico(contactoId, requestId),
    ...(cancelada ? { cita_origen_cancelada_id: cancelada.id } : {}),
  });

  return {
    ...resultado,
    whatsappSoporte: WHATSAPP_SOPORTE_CITAS,
  };
}

module.exports = {
  ReservaPublicaError,
  identificarPorEmail,
  listarSponsorsPublicos,
  obtenerDisponibilidadPublica,
  reservarPublicamente,
  exigirAsistenteElegible,
};
