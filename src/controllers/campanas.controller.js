const crypto = require('crypto');
const { dispararCampanasAprobadas } = require('../services/campanas-matchmaking.service');

function secretosIguales(recibido, esperado) {
  const a = Buffer.from(String(recibido || ''));
  const b = Buffer.from(String(esperado || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function enviarCampanasAprobadas(req, res) {
  const secret = process.env.NOTION_CAMPANAS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[CampanasWebhook] NOTION_CAMPANAS_WEBHOOK_SECRET no está configurado');
    return res.status(500).json({ error: 'Internal Server Error', message: 'Webhook no configurado.' });
  }
  if (!secretosIguales(req.headers['x-notion-campanas-secret'], secret)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Secret inválido o faltante.' });
  }

  try {
    const resultado = await dispararCampanasAprobadas();
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('[CampanasWebhook]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'No se pudieron procesar las campañas.',
    });
  }
}

module.exports = { enviarCampanasAprobadas, secretosIguales };
