// Cliente HTTP a la API de Plática (mensajes WhatsApp 2.2 / 2.3).
// No es el MCP: el job de reserva llama esto después de reservarCita.

const BASE_URL = (process.env.PLATICA_API_BASE_URL || 'https://api.platica.mx').replace(/\/$/, '');
const API_KEY = process.env.PLATICA_API_KEY;
const CHANNEL_ID = process.env.PLATICA_CHANNEL_ID;

function telefonoConversacion(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^0+/, '') || '';
}

async function platicaFetch(path, body) {
  if (!API_KEY) throw new Error('Falta PLATICA_API_KEY');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Plática ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function obtenerConversacion(phoneDigits) {
  if (!CHANNEL_ID) throw new Error('Falta PLATICA_CHANNEL_ID');
  const res = await fetch(
    `${BASE_URL}/v1/conversations/${encodeURIComponent(phoneDigits)}?channelId=${encodeURIComponent(CHANNEL_ID)}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Plática GET conversation ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function enviarTexto({ phone, text }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) throw new Error('Teléfono vacío para WhatsApp');
  return platicaFetch('/v1/messages', {
    channelId: CHANNEL_ID,
    conversationId,
    type: 'text',
    content: { text },
  });
}

async function enviarPlantilla({ phone, templateName, params }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) throw new Error('Teléfono vacío para WhatsApp');
  if (!templateName) throw new Error('Falta nombre de plantilla');
  return platicaFetch('/v1/messages/template', {
    channelId: CHANNEL_ID,
    conversationId,
    template: {
      name: templateName,
      params: params || [],
    },
  });
}

/**
 * Intenta mensaje de sesión; si la ventana de 24 h está cerrada, plantilla.
 */
async function enviarAvisoCita({ phone, text, templateName, templateParams }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) {
    console.warn('[Platica] Sin teléfono, se omite WhatsApp');
    return { omitido: true };
  }
  try {
    const conv = await obtenerConversacion(conversationId);
    if (conv && conv.canSendDirectMessage === false) {
      if (!templateName) {
        console.warn('[Platica] Ventana cerrada y no hay plantilla configurada');
        return { omitido: true, motivo: 'ventana_cerrada' };
      }
      return enviarPlantilla({ phone: conversationId, templateName, params: templateParams });
    }
    return enviarTexto({ phone: conversationId, text });
  } catch (err) {
    if (templateName) {
      console.warn('[Platica] Fallback a plantilla:', err.message);
      return enviarPlantilla({ phone: conversationId, templateName, params: templateParams });
    }
    throw err;
  }
}

module.exports = {
  telefonoConversacion,
  enviarTexto,
  enviarPlantilla,
  enviarAvisoCita,
  obtenerConversacion,
};
