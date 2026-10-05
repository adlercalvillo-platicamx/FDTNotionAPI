// src/controllers/recordatorio-cita-24h.controller.js

const {
  enviarRecordatorios24hPendientes,
  MINUTOS_ANTES,
} = require('../services/recordatorio-cita-24h.service');

const MINUTOS_MAX = 48 * 60;

/**
 * Cron de Coolify cada 15 min el 6 y 7 de octubre. Un asistente recibe un
 * mensaje por día, solo con las citas de ese día. Los días ya enviados quedan
 * en Notas Recordatorio 24h.
 *
 * `ahora`, `minutos` y `simulacion` son solo para pruebas; el cron va sin body.
 * `simulacion: true` lee Notion y arma {{1}}/{{2}}, no escribe ni manda WhatsApp.
 * Plantilla default: confirmacion_cita_1_dia_antes. Env vacía no escribe.
 */
async function enviarRecordatorios24h(req, res) {
  const { ahora, minutos, simulacion } = req.body || {};

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
    const resultado = await enviarRecordatorios24hPendientes({
      ahora,
      minutos,
      simulacion: simulacion === true,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error.message });
    }
    console.error('[Recordatorio24h] Fallo la corrida completa:', error);
    return res.status(502).json({
      error: 'RECORDATORIOS_FALLO',
      message: error.message || 'No se pudo completar la corrida de recordatorios de 24 horas.',
    });
  }
}

module.exports = { enviarRecordatorios24h };
