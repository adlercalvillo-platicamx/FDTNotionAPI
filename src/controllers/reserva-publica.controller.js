const {
  ReservaPublicaError,
  identificarPorEmail,
  listarSponsorsPublicos,
  obtenerDisponibilidadPublica,
  reservarPublicamente,
  modificarPublicamente,
  cancelarPublicamente,
} = require('../services/reserva-publica.service');
const { BookingError } = require('../services/booking.service');

const UUID_CANONICO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BOOKING = {
  INVALID_INPUT: 400,
  HORARIO_EN_PASADO: 400,
  SPONSOR_CATEGORIA_INVALIDA: 400,
  BOLETO_EXPO_NO_PERMITE_CITAS: 403,
  CITA_NO_PERTENECE: 403,
  ASISTENTE_NO_ENCONTRADO: 404,
  SPONSOR_NO_ENCONTRADO: 404,
  CITA_NO_ENCONTRADA: 404,
  SPONSOR_YA_OCUPADO: 409,
  ASISTENTE_YA_OCUPADO: 409,
  CAPACIDAD_MESAS_LLENA: 409,
  CITA_PARA_YA_ACTIVA: 409,
  CITA_CANCELADA_YA_REAGENDADA: 409,
  CITA_YA_OCURRIO: 409,
  ESTADO_INVALIDO: 409,
  NOTION_FALLO: 502,
  NOTIFICACION_FALLO: 502,
  HORARIO_NO_CONFIGURADO: 503,
};

function responderError(res, error, contexto) {
  if (error instanceof ReservaPublicaError) {
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...(error.detalle || {}),
    });
  }
  if (error instanceof BookingError) {
    return res.status(STATUS_BOOKING[error.code] || 400).json({
      error: error.code,
      message: error.message,
      ...(error.detalle || {}),
    });
  }
  if (error?.code === 'RESERVA_PUBLICA_NO_CONFIGURADA') {
    return res.status(503).json({ error: error.code, message: error.message });
  }
  console.error(`[ReservaPublica] Error en ${contexto}:`, error);
  return res.status(502).json({
    error: 'RESERVA_PUBLICA_FALLO',
    message: 'No se pudo completar la operación.',
  });
}

function sponsorValido(sponsorPageId) {
  return UUID_CANONICO_RE.test(String(sponsorPageId || ''));
}

async function identificar(req, res) {
  try {
    const resultado = await identificarPorEmail(
      req.body?.email,
      req.body?.contactoId
    );
    return res.status(200).json(resultado);
  } catch (error) {
    return responderError(res, error, 'identificar');
  }
}

async function sponsors(_req, res) {
  try {
    return res.status(200).json({ sponsors: await listarSponsorsPublicos() });
  } catch (error) {
    return responderError(res, error, 'listar sponsors');
  }
}

async function disponibilidad(req, res) {
  const sponsorPageId = String(req.query.sponsor || '').trim();
  const fecha = String(req.query.fecha || '').trim();
  const exceptCitaId = String(req.query.exceptCitaId || '').trim() || undefined;
  if (!sponsorValido(sponsorPageId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Se requiere sponsor UUID y fecha YYYY-MM-DD.',
    });
  }
  try {
    const bloques = await obtenerDisponibilidadPublica({
      contactoId: req.reservaContactoId,
      sponsorPageId,
      fecha,
      exceptCitaId,
    });
    return res.status(200).json({ sponsor: sponsorPageId, fecha, bloques });
  } catch (error) {
    return responderError(res, error, 'consultar disponibilidad');
  }
}

async function reservar(req, res) {
  const sponsorPageId = String(req.body?.sponsor || '').trim();
  if (!sponsorValido(sponsorPageId)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'sponsor debe ser un UUID válido.',
    });
  }
  try {
    const resultado = await reservarPublicamente({
      contactoId: req.reservaContactoId,
      sponsorPageId,
      inicio: req.body?.inicio,
      fin: req.body?.fin,
      requestId: req.body?.request_id,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    return responderError(res, error, 'reservar');
  }
}

async function modificar(req, res) {
  try {
    const resultado = await modificarPublicamente({
      contactoId: req.reservaContactoId,
      citaId: req.params.citaId,
      inicio: req.body?.inicio,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    return responderError(res, error, 'modificar');
  }
}

async function cancelar(req, res) {
  try {
    const resultado = await cancelarPublicamente({
      contactoId: req.reservaContactoId,
      citaId: req.params.citaId,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    return responderError(res, error, 'cancelar');
  }
}

module.exports = {
  identificar,
  sponsors,
  disponibilidad,
  reservar,
  modificar,
  cancelar,
};
