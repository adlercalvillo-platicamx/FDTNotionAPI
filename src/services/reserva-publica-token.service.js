const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;

function secretRequerido() {
  const secret = String(process.env.PAGINA_RESERVA_TOKEN_SECRET || '');
  if (secret.length < 32) {
    const error = new Error('PAGINA_RESERVA_TOKEN_SECRET debe tener al menos 32 caracteres.');
    error.code = 'RESERVA_PUBLICA_NO_CONFIGURADA';
    error.status = 503;
    throw error;
  }
  return secret;
}

function ttlSeconds() {
  const configurado = Number(process.env.PAGINA_RESERVA_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(configurado) || configurado <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.floor(configurado), MAX_TTL_SECONDS);
}

function codificar(valor) {
  return Buffer.from(valor).toString('base64url');
}

function firma(payloadCodificado, secret) {
  return crypto.createHmac('sha256', secret).update(payloadCodificado).digest('base64url');
}

function emitirTokenReserva({ contactoId, ahora = Date.now() }) {
  const emitido = Math.floor(ahora / 1000);
  const payload = codificar(
    JSON.stringify({
      sub: contactoId,
      aud: 'reserva-qr-fdt',
      iat: emitido,
      exp: emitido + ttlSeconds(),
    })
  );
  return `${payload}.${firma(payload, secretRequerido())}`;
}

function verificarTokenReserva(token, ahora = Date.now()) {
  const [payloadCodificado, firmaRecibida, sobrante] = String(token || '').split('.');
  if (!payloadCodificado || !firmaRecibida || sobrante !== undefined) return null;

  const esperada = firma(payloadCodificado, secretRequerido());
  const a = Buffer.from(firmaRecibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadCodificado, 'base64url').toString('utf8'));
    const ahoraSegundos = Math.floor(ahora / 1000);
    if (
      payload.aud !== 'reserva-qr-fdt' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= ahoraSegundos
    ) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = {
  emitirTokenReserva,
  verificarTokenReserva,
};
