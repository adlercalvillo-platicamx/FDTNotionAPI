const crypto = require('crypto');
const { procesarExchange } = require('../services/flow-reserva.service');

const eventIdsVistos = new Set();
const MAX_IDS = 2000;

function verificarFirma(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actual = String(signatureHeader || '');
  if (expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

async function whatsappFlows(req, res) {
  const secret = process.env.FLOW_WEBHOOK_SECRET;
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (secret) {
    const ok = verificarFirma(raw, req.headers['x-webhook-signature'], secret);
    if (!ok) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Firma HMAC inválida' });
    }
  }

  const eventId = req.headers['x-webhook-event-id'] || req.body?.id;
  if (eventId) {
    if (eventIdsVistos.has(eventId)) {
      return res.status(200).json({ data: { acknowledged: true, duplicate: true } });
    }
    eventIdsVistos.add(eventId);
    if (eventIdsVistos.size > MAX_IDS) {
      const first = eventIdsVistos.values().next().value;
      eventIdsVistos.delete(first);
    }
  }

  try {
    const respuesta = await procesarExchange(req.body || {});
    return res.status(200).json(respuesta);
  } catch (err) {
    console.error('[FlowsWebhook]', err);
    const mensaje =
      err.code === 'TIMEOUT'
        ? 'No pudimos cargar los datos. Cierra e intenta de nuevo.'
        : 'No pudimos continuar. Cierra e intenta de nuevo.';
    return res.status(200).json({ data: { error_message: mensaje } });
  }
}

module.exports = { whatsappFlows, verificarFirma, eventIdsVistos };
