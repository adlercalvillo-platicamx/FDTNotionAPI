// src/controllers/recordatorio-cita-15min.controller.js

const {
  enviarRecordatorios15minPendientes,
  MINUTOS_ANTES,
} = require('../services/recordatorio-cita-15min.service');

const MINUTOS_MAX = 120;

/**
 * Cron de Coolify cada 5 min los días del evento. Idempotente: el estado vive
 * en Notion, así que dispararlo de más no manda avisos repetidos.
 *
 * `ahora` y `minutos` son solo para pruebas manuales; en el cron va sin body.
 */
async function enviarRecordatorios15min(req, res) {
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
    const resultado = await enviarRecordatorios15minPendientes({ ahora, minutos });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error.message });
    }
    console.error('[Recordatorio15min] Fallo la corrida completa:', error);
    return res.status(502).json({
      error: 'RECORDATORIOS_FALLO',
      message: error.message || 'No se pudo completar la corrida de recordatorios.',
    });
  }
}

/**
 * Retirada el 7-sep. Programaba el aviso en Plática con scheduleTime al
 * reservar, y Plática no expone cancelar un programado: la cita cancelada o
 * movida seguía avisando a la hora vieja. Lo reemplaza el cron de arriba.
 */
async function programarRecordatorio15min(_req, res) {
  return res.status(410).json({
    error: 'RUTA_RETIRADA',
    message:
      'Los recordatorios ya no se programan al reservar. El cron POST /citas/enviar-recordatorios-15min los manda leyendo Notion.',
  });
}

module.exports = { enviarRecordatorios15min, programarRecordatorio15min };
