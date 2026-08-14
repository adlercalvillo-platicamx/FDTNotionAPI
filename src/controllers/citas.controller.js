// src/controllers/citas.controller.js

const { reservarCita, BookingError } = require('../services/booking.service');
const { obtenerDisponibilidadSponsor } = require('../services/citas.service');

const STATUS_POR_CODIGO_NEGOCIO = {
  INVALID_INPUT: 400,
  SPONSOR_YA_OCUPADO: 409,
  CAPACIDAD_MESAS_LLENA: 409,
  CALENDAR_FALLO: 502,
  NOTION_FALLO: 502,
};

// ─────────────────────────────────────────────────────────────
// POST /citas/reservar
// ─────────────────────────────────────────────────────────────
async function reservar(req, res) {
  const {
    sponsor_calendario_id,
    sponsor_notion_id,
    asistente_notion_id,
    inicio,
    fin,
    zona_horaria,
    request_id,
    titulo,
    descripcion,
    asistentes_email,
  } = req.body;

  if (!request_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El campo "request_id" es requerido (clave de idempotencia — el mismo valor en un reintento).',
    });
  }
  if (!sponsor_calendario_id || !sponsor_notion_id || !asistente_notion_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Los campos "sponsor_calendario_id", "sponsor_notion_id" y "asistente_notion_id" son requeridos.',
    });
  }
  if (!inicio || !fin) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Los campos "inicio" y "fin" son requeridos en formato ISO 8601 (ej. "2026-10-07T10:30:00-06:00").',
    });
  }
  if (asistentes_email !== undefined && !Array.isArray(asistentes_email)) {
    return res.status(400).json({ error: 'Bad Request', message: '"asistentes_email" debe ser un arreglo de emails' });
  }

  try {
    const resultado = await reservarCita({
      sponsor_calendario_id,
      sponsor_notion_id,
      asistente_notion_id,
      inicio,
      fin,
      zona_horaria,
      request_id,
      titulo,
      descripcion,
      asistentes_email,
    });

    return res.status(resultado.ya_existia ? 200 : 201).json(resultado);
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(STATUS_POR_CODIGO_NEGOCIO[error.code] || 400).json({
        error: error.code,
        message: error.message,
      });
    }

    console.error('[CitasController] Error inesperado:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al procesar la reserva. Revisa los logs.',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /citas/disponibilidad?sponsor_notion_id=...&fecha=2026-10-07
//
// Solo lectura — para que el formulario (WhatsApp Flow / mini web app)
// sepa qué horarios ofrecerle al asistente antes de que intente
// reservar. No es una garantía de que el horario siga libre al momento
// de confirmar (ver nota en el service) — reservar_cita sigue siendo la
// verificación final y autoritativa.
// ─────────────────────────────────────────────────────────────
async function disponibilidad(req, res) {
  const { sponsor_notion_id, fecha } = req.query;

  if (!sponsor_notion_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El parámetro "sponsor_notion_id" es requerido.',
    });
  }
  if (!fecha) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El parámetro "fecha" es requerido (formato "2026-10-07" o "2026-10-08").',
    });
  }

  try {
    const bloques = await obtenerDisponibilidadSponsor({
      sponsorPageId: sponsor_notion_id,
      fecha,
    });

    return res.status(200).json({
      sponsor_notion_id,
      fecha,
      bloques,
    });
  } catch (error) {
    // Fecha fuera del evento → error controlado (400), es un dato inválido del cliente.
    if (error.status === 400) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }

    // Horario de citas todavía no configurado en variables de entorno para
    // esa fecha (pendiente de negocio, no un bug) → 503 explícito, NUNCA
    // debe caer en el 500 genérico de abajo. El formulario/Cursor tiene que
    // poder distinguir "esto está mal construido" de "esto está bien
    // construido pero la variable de entorno todavía no se puso".
    if (error.status === 503) {
      return res.status(503).json({ error: 'Service Unavailable', message: error.message });
    }

    console.error('[CitasController] Error en disponibilidad:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al consultar disponibilidad. Revisa los logs.',
    });
  }
}

module.exports = { reservar, disponibilidad };
