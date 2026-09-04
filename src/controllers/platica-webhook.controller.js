const crypto = require('crypto');
const { registrarRespuestaOfertaInicial } = require('../services/platica-respuestas.service');

const MAX_BODY_BYTES = 100 * 1024;
const VENTANA_RATE_MS = 60 * 1000;
const MAX_POR_VENTANA_DEFAULT = 60;
const golpesPorIp = new Map();

function maxPorVentana() {
  const n = Number(process.env.PLATICA_WEBHOOK_RATE_MAX);
  return Number.isFinite(n) && n > 0 ? n : MAX_POR_VENTANA_DEFAULT;
}

function ipDeRequest(req) {
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

function permitirPorIp(ip, ahora = Date.now()) {
  const tope = maxPorVentana();
  const vigente = golpesPorIp.get(ip);
  if (!vigente || ahora - vigente.inicio >= VENTANA_RATE_MS) {
    golpesPorIp.set(ip, { inicio: ahora, n: 1 });
    return true;
  }
  if (vigente.n >= tope) return false;
  vigente.n += 1;
  return true;
}

function resetRateLimitForTests() {
  golpesPorIp.clear();
}

function verificarFirmaWebhook(secret, rawBody, firmaRecibida) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  const esperadaHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = String(firmaRecibida || '');
  const prefijo = 'sha256=';
  if (!actual.startsWith(prefijo)) return false;
  const recibidaHex = actual.slice(prefijo.length);
  if (Buffer.byteLength(esperadaHex) !== Buffer.byteLength(recibidaHex)) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(esperadaHex, 'utf8'), Buffer.from(recibidaHex, 'utf8'));
  } catch {
    return false;
  }
}

async function mensajesPlatica(req, res) {
  const secret = process.env.PLATICA_WEBHOOK_SECRET;
  const workspaceEsperado = process.env.PLATICA_WORKSPACE_ID;
  const channelEsperado = process.env.PLATICA_CHANNEL_ID;
  if (!secret || !workspaceEsperado || !channelEsperado) {
    console.error('[PlaticaWebhook] Faltan PLATICA_WEBHOOK_SECRET/WORKSPACE_ID/CHANNEL_ID');
    return res.status(500).json({ error: 'WEBHOOK_NO_CONFIGURADO' });
  }

  if (!permitirPorIp(ipDeRequest(req))) {
    return res.status(429).json({ error: 'RATE_LIMIT' });
  }

  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from('');
  if (rawBody.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'PAYLOAD_DEMASIADO_GRANDE' });
  }

  if (!verificarFirmaWebhook(secret, rawBody, req.headers['x-webhook-signature'])) {
    return res.status(401).json({ error: 'FIRMA_INVALIDA' });
  }

  if (req.body?.workspaceId !== workspaceEsperado) {
    return res.status(202).json({ procesado: false, motivo: 'WORKSPACE_NO_APLICA' });
  }
  const channelId = req.body?.data?.conversation?.channelId;
  const platform = req.body?.data?.conversation?.platform;
  if (channelId !== channelEsperado || platform !== 'whatsapp') {
    return res.status(202).json({ procesado: false, motivo: 'CANAL_NO_APLICA' });
  }

  try {
    const resultado = await registrarRespuestaOfertaInicial(req.body);
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[PlaticaWebhook]', error);
    return res.status(500).json({
      error: 'ERROR_REGISTRANDO_RESPUESTA',
      message: error.message || 'No se pudo registrar la respuesta.',
    });
  }
}

module.exports = {
  mensajesPlatica,
  verificarFirmaWebhook,
  resetRateLimitForTests,
  MAX_BODY_BYTES,
};
