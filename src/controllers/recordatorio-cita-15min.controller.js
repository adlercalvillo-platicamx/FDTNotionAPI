// src/controllers/recordatorio-cita-15min.controller.js

const {
  programarRecordatorioCita15min,
} = require('../services/recordatorio-cita-15min.service');

async function programarRecordatorio15min(req, res) {
  const { asistente_notion_id, sponsor_notion_id, inicio } = req.body || {};

  if (!asistente_notion_id || !sponsor_notion_id || !inicio) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Los campos "asistente_notion_id", "sponsor_notion_id" e "inicio" son requeridos.',
    });
  }

  try {
    const resultado = await programarRecordatorioCita15min({
      asistente_notion_id,
      sponsor_notion_id,
      inicio,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: error.message,
      });
    }
    console.error('[Recordatorio15min] Fallo al programar plantilla:', error);
    return res.status(502).json({
      error: 'PLATICA_FALLO',
      message: error.message || 'No se pudo programar la plantilla en Plática.',
    });
  }
}

module.exports = { programarRecordatorio15min };
