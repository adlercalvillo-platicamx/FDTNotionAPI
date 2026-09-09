// src/controllers/recordatorio-cita-2h.controller.js

const {
  enviarRecordatorios2hPendientes,
  MINUTOS_ANTES,
} = require('../services/recordatorio-cita-2h.service');

const MINUTOS_MAX = 180;

/**
 * Cron de Coolify cada 5 min los días del evento. Idempotente: el estado
 * vive en Notion (campos Recordatorio 2h), distinto del de 15 min.
 *
 * `ahora` y `minutos` son solo para pruebas; el cron va sin body.
 */
async function enviarRecordatorios2h(req, res) {
  const { ahora, minutos } = req.body || {};

  if (ahora !== undefined && !Number.isFinite(Date.parse(ahora))) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '"ahora" debe ser ISO 8601.' });
  }
  if (minutos !== undefined && (!Number.isInteger(minutos) || minutos < 1 || minutos > MINUTOS_MAX)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: `"minutos" debe ser un entero entre 1 y ${MINUTOS_MAX} (default ${MINUTOS_ANTES}).`,
    });
  }

  try {
    const resultado = await enviarRecordatorios2hPendientes({ ahora, minutos });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error.message });
    }
    console.error('[Recordatorio2h] Fallo la corrida completa:', error);
    return res.status(502).json({
      error: 'RECORDATORIOS_FALLO',
      message: error.message || 'No se pudo completar la corrida de recordatorios de 2 horas.',
    });
  }
}

module.exports = { enviarRecordatorios2h };
