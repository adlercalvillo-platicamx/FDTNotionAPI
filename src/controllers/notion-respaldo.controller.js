const { respaldarNotion, RespaldoError } = require('../services/notion-respaldo.service');

async function respaldar(req, res) {
  try {
    const resultado = await respaldarNotion();
    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof RespaldoError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    console.error('[NotionRespaldo] Falló la corrida:', error);
    return res.status(502).json({
      error: 'RESPALDO_FALLO',
      message: error.message || 'No se pudo completar el respaldo de Notion.',
    });
  }
}

module.exports = { respaldar };
