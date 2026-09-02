// src/controllers/citas.controller.js

const {
  reservarCita,
  modificarCita,
  cancelarCita,
  reintentarNotificacion,
  BookingError,
} = require('../services/booking.service');
const { obtenerDisponibilidadSponsor, consultarSugeridasPorIdentificador } = require('../services/citas.service');
const { variantesTelefono } = require('../services/contactos.service');
const { ejecutarReintentosPendientes } = require('../jobs/reintentar-notificaciones.job');

const STATUS_POR_CODIGO_NEGOCIO = {
  INVALID_INPUT: 400,
  HORARIO_NO_CONFIGURADO: 503,
  SPONSOR_YA_OCUPADO: 409,
  ASISTENTE_YA_OCUPADO: 409,
  CAPACIDAD_MESAS_LLENA: 409,
  CONTACTO_NO_RESUELTO: 409,
  SIN_DESTINATARIOS: 400,
  FILA_BLOQUEO_AGENDA: 409,
  ESTADO_INVALIDO: 409,
  ASISTENTE_NO_ENCONTRADO: 404,
  CITA_NO_ENCONTRADA: 404,
  SIN_CITAS_ACTIVAS: 404,
  CITA_NO_PERTENECE: 403, // el teléfono no corresponde al Contacto Principal de esa cita
  VARIAS_CITAS_ACTIVAS: 409,
  HORARIO_EN_PASADO: 400,
  CITA_YA_OCURRIO: 409,
  LIMITE_INTENTOS_ALCANZADO: 409, // legado — ya no se lanza; se deja por si llega un cliente viejo
  NOTIFICACION_FALLO: 502,
  NOTION_FALLO: 502,
};

// UUID canónico con guiones (8-4-4-4-12). Caso 6 de disponibilidad (14-ago):
// sin este chequeo, un id mal formado llega a Notion y el cliente recibe el
// mensaje crudo de validación de Notion. Con él → 400 controlado.
const UUID_CANONICO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidCanonico(valor) {
  return UUID_CANONICO_RE.test(String(valor || ''));
}

// ─────────────────────────────────────────────────────────────
// POST /citas/reservar
// ─────────────────────────────────────────────────────────────
async function reservar(req, res) {
  const {
    sponsor_calendario_id: _sponsorCalendarioId, // legado 27-ago, se ignora
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
      error: 'INVALID_INPUT',
      message: 'El campo "request_id" es requerido (clave de idempotencia — el mismo valor en un reintento).',
    });
  }
  if (!sponsor_notion_id || !asistente_notion_id) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Los campos "sponsor_notion_id" y "asistente_notion_id" son requeridos.',
    });
  }
  if (!inicio || !fin) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Los campos "inicio" y "fin" son requeridos en formato ISO 8601 (ej. "2026-10-07T10:30:00-06:00").',
    });
  }
  if (asistentes_email !== undefined && !Array.isArray(asistentes_email)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '"asistentes_email" debe ser un arreglo de emails' });
  }

  try {
    const resultado = await reservarCita({
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

function responderErrorDeCita(res, error, contexto) {
  if (error instanceof BookingError) {
    const cuerpo = { error: error.code, message: error.message };
    // detalle trae datos accionables (ej. la lista de citas cuando el
    // teléfono no alcanza para saber cuál es).
    if (error.detalle) Object.assign(cuerpo, error.detalle);
    return res.status(STATUS_POR_CODIGO_NEGOCIO[error.code] || 400).json(cuerpo);
  }
  console.error(`[CitasController] Error inesperado en ${contexto}:`, error);
  return res.status(500).json({
    error: 'Internal Server Error',
    message: `Error al procesar ${contexto}. Revisa los logs.`,
  });
}

/** telefono/whatsapp y citaId son opcionales por separado, pero uno debe venir. */
function validarIdentificacionDeCita({ telefono, citaId }) {
  if (!telefono && !citaId) {
    return 'Se requiere "telefono" (WhatsApp del asistente) o "citaId".';
  }
  if (citaId && !esUuidCanonico(citaId)) {
    return '"citaId" debe ser un UUID válido de Notion.';
  }
  if (telefono && variantesTelefono(telefono).length === 0) {
    return '"telefono" debe ser un número de teléfono (dígitos, con o sin +52).';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// POST /citas/modificar-cita
//
// Dos caminos de identificación (Adler, 27-ago): el agente de Carlos
// manda "telefono" y el servidor valida que la cita sea de esa persona;
// Laura/Liz mandan "citaId" directo, sin validación cruzada. Si vienen
// los dos y no coinciden → 403.
// ─────────────────────────────────────────────────────────────
async function modificar(req, res) {
  const telefono = String(req.body?.telefono || req.body?.whatsapp || '').trim();
  const citaId = String(req.body?.citaId || '').trim();
  const sponsorEmpresa = String(req.body?.sponsorEmpresa || '').trim();
  const nuevaFechaHora = String(req.body?.nuevaFechaHora || '').trim();

  const errorIdentificacion = validarIdentificacionDeCita({ telefono, citaId });
  if (errorIdentificacion) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: errorIdentificacion });
  }
  if (!nuevaFechaHora) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'El campo "nuevaFechaHora" es requerido en formato ISO 8601 (ej. "2026-10-07T11:30:00-06:00").',
    });
  }

  try {
    const resultado = await modificarCita({ telefono, citaId, sponsorEmpresa, nuevaFechaHora });
    return res.status(200).json(resultado);
  } catch (error) {
    return responderErrorDeCita(res, error, 'la modificación de la cita');
  }
}

// ─────────────────────────────────────────────────────────────
// POST /citas/cancelar-cita — mismos dos caminos de identificación.
// ─────────────────────────────────────────────────────────────
async function cancelar(req, res) {
  const telefono = String(req.body?.telefono || req.body?.whatsapp || '').trim();
  const citaId = String(req.body?.citaId || '').trim();
  const sponsorEmpresa = String(req.body?.sponsorEmpresa || '').trim();

  const errorIdentificacion = validarIdentificacionDeCita({ telefono, citaId });
  if (errorIdentificacion) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: errorIdentificacion });
  }

  try {
    const resultado = await cancelarCita({ telefono, citaId, sponsorEmpresa });
    return res.status(200).json(resultado);
  } catch (error) {
    return responderErrorDeCita(res, error, 'la cancelación de la cita');
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
  const { sponsor_notion_id, fecha, asistente_notion_id } = req.query;

  if (!sponsor_notion_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El parámetro "sponsor_notion_id" es requerido.',
    });
  }
  if (!esUuidCanonico(sponsor_notion_id)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'sponsor_notion_id debe ser un UUID válido',
    });
  }
  if (!fecha) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El parámetro "fecha" es requerido (formato "2026-10-07" o "2026-10-08").',
    });
  }
  const asistenteId = String(asistente_notion_id || '').trim();
  if (asistenteId && !esUuidCanonico(asistenteId)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'asistente_notion_id debe ser un UUID válido',
    });
  }

  try {
    const bloques = await obtenerDisponibilidadSponsor({
      sponsorPageId: sponsor_notion_id,
      fecha,
      asistentePageId: asistenteId || undefined,
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

async function sugeridas(req, res) {
  const whatsapp = String(req.query.whatsapp || req.query.telefono || '').trim();
  const asistente_notion_id = String(req.query.asistente_notion_id || '').trim();

  if (!whatsapp && !asistente_notion_id) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Se requiere whatsapp (teléfono del asistente) o asistente_notion_id.',
    });
  }
  if (whatsapp && variantesTelefono(whatsapp).length === 0) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'whatsapp debe ser un número de teléfono (dígitos, con o sin +52).',
    });
  }
  if (!whatsapp && !esUuidCanonico(asistente_notion_id)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'asistente_notion_id debe ser un UUID válido',
    });
  }

  try {
    const resultado = await consultarSugeridasPorIdentificador({
      whatsapp: whatsapp || undefined,
      asistentePageId: whatsapp ? undefined : asistente_notion_id,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.status === 404 || error.code === 'CONTACTO_NO_RESUELTO') {
      return res.status(404).json({ error: 'CONTACTO_NO_RESUELTO', message: error.message });
    }
    if (error.status === 400 || error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error.message });
    }
    console.error('[CitasController] Error en sugeridas:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al consultar sugeridas. Revisa los logs.',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /citas/:id/reenviar-notificacion
// ─────────────────────────────────────────────────────────────
async function reenviarNotificacion(req, res) {
  const { id } = req.params;
  if (!esUuidCanonico(id)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'El parámetro "id" debe ser un UUID válido de Notion.',
    });
  }
  try {
    const resultado = await reintentarNotificacion(id);
    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(STATUS_POR_CODIGO_NEGOCIO[error.code] || 400).json({
        error: error.code,
        message: error.message,
      });
    }
    console.error('[CitasController] Error en reenviarNotificacion:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al reintentar notificación. Revisa los logs.',
    });
  }
}

// POST /citas/reintentar-notificaciones-pendientes — a demanda (MCP), no cron.
async function reintentarNotificacionesPendientes(req, res) {
  try {
    const resultado = await ejecutarReintentosPendientes();
  // 200 aunque haya fallidos parciales: el detalle trae el motivo de cada uno.
  // 502 solo si TODAS fallaron y había candidatas. Las filas de bloqueo de
  // conferencia no entran en `total` (el service las filtra antes).
    if (resultado.total > 0 && resultado.exitosos === 0) {
      return res.status(502).json({
        ...resultado,
        error: 'NOTIFICACION_FALLO',
        message:
          'Ninguna de las notificaciones pendientes se pudo reenviar. Revisa el detalle de cada cita (categoria y mensaje).',
      });
    }
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[CitasController] Error en reintentarNotificacionesPendientes:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al ejecutar el barrido de reenvíos. Revisa los logs.',
    });
  }
}

module.exports = {
  reservar,
  modificar,
  cancelar,
  disponibilidad,
  sugeridas,
  reenviarNotificacion,
  reintentarNotificacionesPendientes,
  esUuidCanonico,
};
