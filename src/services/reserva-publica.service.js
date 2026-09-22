const contactos = require('./contactos.service');
const citas = require('./citas.service');
const { reservarCita, modificarCita, cancelarCita } = require('./booking.service');
const { emitirTokenReserva } = require('./reserva-publica-token.service');

const BOLETOS_CON_CITAS = new Set(['Presencial', 'Presencial VIP', 'Virtual', 'Speaker']);
const NIVELES_SIN_CITAS = new Set(['Bronce']);
const WHATSAPP_SOPORTE_CITAS = '+52 33 3236 1963';
const UUID_CANONICO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function pageIdCanonico(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}

function etiquetaGiro(giro) {
  const texto = String(giro || '').trim();
  return texto || 'sin giro';
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
  const giros = contactos.GIROS_ELEGIBLES_MATCHMAKING || [];
  if (!giros.includes(asistente.giroIndustria)) {
    const giro = etiquetaGiro(asistente.giroIndustria);
    throw new ReservaPublicaError(
      'GIRO_NO_ELEGIBLE',
      `El giro registrado de tu empresa es ${giro}. Las citas 1 a 1 están disponibles para marca de moda, retailer/marketplace o manufactura. Este perfil no es elegible. Si hace falta revisarlo, acércate con el equipo de Fashion Digital Talks.`,
      403,
      { giro }
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
    checkInRealizado: cita.checkInRealizado === true,
  };
}

function opcionPersona(asistente) {
  return {
    id: asistente.id,
    nombre: asistente.nombre || 'Asistente',
    empresa: asistente.empresa || '',
    ticketTipo: asistente.ticketTipo || '',
  };
}

async function identificarPorEmail(emailEntrada, contactoIdSeleccionado) {
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
  const seleccion = String(contactoIdSeleccionado || '').trim();
  if (asistentesActivos.length > 1 && !seleccion) {
    throw new ReservaPublicaError(
      'EMAIL_AMBIGUO',
      'Este correo corresponde a más de una persona. Elige para quién quieres gestionar las citas.',
      409,
      { personas: asistentesActivos.map(opcionPersona) }
    );
  }

  const asistenteSeleccionado = seleccion
    ? asistentesActivos.find(
        (asistente) => pageIdCanonico(asistente.id) === pageIdCanonico(seleccion)
      )
    : asistentesActivos[0];
  if (!asistenteSeleccionado) {
    throw new ReservaPublicaError(
      'SELECCION_PERSONA_INVALIDA',
      'La persona elegida no corresponde a este correo.',
      400
    );
  }

  const asistente = exigirAsistenteElegible(asistenteSeleccionado);
  const citasReales = await citas.listarCitasRealesPorAsistente(asistente.id);
  const canceladas = await citas.listarCanceladasReagendablesPorAsistente(asistente.id, {
    citasConfirmadas: citasReales,
  });

  return {
    token: emitirTokenReserva({ contactoId: asistente.id }),
    asistente: {
      nombre: asistente.nombre || '',
      empresa: asistente.empresa || '',
      ticketTipo: asistente.ticketTipo,
      giroIndustria: asistente.giroIndustria || '',
    },
    citasConfirmadas: citasReales
      .slice()
      .sort((a, b) => String(a.inicio || '').localeCompare(String(b.inicio || '')))
      .map(formatearCita),
    citasCanceladasReagendables: canceladas
      .slice()
      .sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')))
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

async function exigirCitaDelContacto(contactoId, citaId) {
  const id = String(citaId || '').trim();
  if (!UUID_CANONICO_RE.test(id)) {
    throw new ReservaPublicaError('INVALID_INPUT', 'citaId debe ser un UUID válido.', 400);
  }

  let pagina;
  try {
    pagina = await citas.obtenerCitaPorId(id);
  } catch (err) {
    if (err.status === 404 || err.status === 400) {
      throw new ReservaPublicaError(
        'CITA_NO_ENCONTRADA',
        'No encontramos esa cita.',
        404
      );
    }
    throw err;
  }

  const cita = citas.datosDeCita(pagina);
  if (pageIdCanonico(cita.asistentePageId) !== pageIdCanonico(contactoId)) {
    throw new ReservaPublicaError(
      'CITA_NO_PERTENECE',
      'Esa cita no corresponde a este registro.',
      403
    );
  }
  return cita;
}

async function obtenerDisponibilidadPublica({ contactoId, sponsorPageId, fecha, exceptCitaId }) {
  let exceptPageId;
  if (exceptCitaId) {
    const cita = await exigirCitaDelContacto(contactoId, exceptCitaId);
    exceptPageId = cita.id;
  }
  return citas.obtenerDisponibilidadSponsor({
    sponsorPageId,
    fecha,
    asistentePageId: contactoId,
    exceptPageId,
  });
}

function etiquetaMesa(mesa) {
  if (mesa == null || mesa === '') return null;
  const texto = String(mesa).trim();
  return /^mesa\s/i.test(texto) ? texto : `Mesa ${texto}`;
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

function respuestaOperacion(resultado) {
  return {
    ...resultado,
    mesa: etiquetaMesa(resultado.mesa),
    whatsappSoporte: WHATSAPP_SOPORTE_CITAS,
  };
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

  return respuestaOperacion(resultado);
}

async function modificarPublicamente({ contactoId, citaId, inicio }) {
  const asistente = await contactos.obtenerContacto(contactoId);
  exigirAsistenteElegible(asistente);
  await exigirCitaDelContacto(contactoId, citaId);

  const resultado = await modificarCita({
    citaId,
    nuevaFechaHora: inicio,
  });
  return respuestaOperacion(resultado);
}

async function cancelarPublicamente({ contactoId, citaId }) {
  const asistente = await contactos.obtenerContacto(contactoId);
  exigirAsistenteElegible(asistente);
  await exigirCitaDelContacto(contactoId, citaId);

  const resultado = await cancelarCita({ citaId });
  return respuestaOperacion(resultado);
}

module.exports = {
  ReservaPublicaError,
  identificarPorEmail,
  listarSponsorsPublicos,
  obtenerDisponibilidadPublica,
  reservarPublicamente,
  modificarPublicamente,
  cancelarPublicamente,
  exigirAsistenteElegible,
};
