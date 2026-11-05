// Recibe el webhook de la integración de Notion.
// Hoy solo guarda el token de verificación para pegarlo en la pantalla de
// Notion. Los eventos de páginas se acusan con 200 y no se sincronizan.

const tokenVerificacion = {
  valor: null,
  recibidoEn: null,
};

function resetTokenVerificacionForTests() {
  tokenVerificacion.valor = null;
  tokenVerificacion.recibidoEn = null;
}

function tokenValido(valor) {
  const token = String(valor || '').trim();
  return token.startsWith('secret_') && token.length >= 20 && token.length <= 200;
}

function guardarTokenVerificacion(token) {
  tokenVerificacion.valor = token;
  tokenVerificacion.recibidoEn = new Date().toISOString();
}

function claveValida(req) {
  const esperada = process.env.API_SECRET_KEY;
  const recibida = req.headers['x-api-key'];
  return Boolean(esperada) && recibida === esperada;
}

async function webhookNotion(req, res) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'PAYLOAD_INVALIDO' });
  }

  if (tokenValido(body.verification_token)) {
    const reemplazado = Boolean(tokenVerificacion.valor);
    guardarTokenVerificacion(String(body.verification_token).trim());
    console.log(
      `[NotionWebhook] Token de verificación ${reemplazado ? 'reemplazado' : 'recibido'}. Léelo con GET /webhooks/notion/verificacion`
    );
    return res.status(200).json({ recibido: true });
  }

  const tipo = typeof body.type === 'string' ? body.type : 'sin tipo';
  console.log(`[NotionWebhook] Evento recibido sin procesar: ${tipo}`);
  return res.status(200).json({ recibido: true, procesado: false });
}

function leerVerificacion(req, res) {
  if (!process.env.API_SECRET_KEY) {
    return res.status(500).json({ error: 'WEBHOOK_NO_CONFIGURADO' });
  }
  if (!claveValida(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!tokenVerificacion.valor) {
    return res.status(200).json({ recibido: false });
  }
  return res.status(200).json({
    recibido: true,
    recibidoEn: tokenVerificacion.recibidoEn,
    verification_token: tokenVerificacion.valor,
  });
}

module.exports = {
  webhookNotion,
  leerVerificacion,
  resetTokenVerificacionForTests,
  tokenValido,
};
