// Cliente HTTP a la API de Plática (mensajes WhatsApp 2.2 / 2.3).
// No es el MCP: el job de reserva llama esto después de reservarCita.

const BASE_URL = (process.env.PLATICA_API_BASE_URL || 'https://api.platica.mx').replace(/\/$/, '');
const API_KEY = process.env.PLATICA_API_KEY;
const CHANNEL_ID = process.env.PLATICA_CHANNEL_ID;

function telefonoConversacion(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^0+/, '') || '';
}

function payloadCanalYAgente() {
  const channelId = process.env.PLATICA_CHANNEL_ID || CHANNEL_ID;
  if (!channelId) throw new Error('Falta PLATICA_CHANNEL_ID');
  const payload = { channelId };
  const responderAgentId = String(process.env.PLATICA_RESPONDER_AGENT_ID || '').trim();
  if (responderAgentId) {
    payload.responderAgentId = responderAgentId;
  } else {
    console.warn(
      '[Platica] Falta PLATICA_RESPONDER_AGENT_ID; cuando Plática desacople canal y agente, la conversación quedará sin bot.'
    );
  }
  return payload;
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

async function platicaGet(path) {
  if (!API_KEY) throw new Error('Falta PLATICA_API_KEY');
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (res.status === 404) return null;
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Plática GET ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function obtenerConversacion(phoneDigits) {
  if (!CHANNEL_ID) throw new Error('Falta PLATICA_CHANNEL_ID');
  return platicaGet(
    `/v1/conversations/${encodeURIComponent(phoneDigits)}?channelId=${encodeURIComponent(CHANNEL_ID)}`
  );
}

function conversacionesDeRespuesta(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  if (Array.isArray(respuesta?.conversations)) return respuesta.conversations;
  if (Array.isArray(respuesta?.data)) return respuesta.data;
  if (Array.isArray(respuesta?.results)) return respuesta.results;
  const workspaces = Array.isArray(respuesta?.workspaces) ? respuesta.workspaces : [];
  return workspaces.flatMap((workspace) =>
    Array.isArray(workspace?.conversations) ? workspace.conversations : []
  );
}

async function listarConversacionesCliente(phone) {
  if (!CHANNEL_ID) throw new Error('Falta PLATICA_CHANNEL_ID');
  const cliente = telefonoConversacion(phone);
  if (!cliente) return [];
  const conversaciones = new Map();
  let offset = 0;
  let hasMore;
  do {
    const respuesta = await platicaGet(
      `/v1/clients/${encodeURIComponent(cliente)}/conversations?channelId=${encodeURIComponent(
        CHANNEL_ID
      )}&limit=200&offset=${offset}`
    );
    for (const conversacion of conversacionesDeRespuesta(respuesta)) {
      if (conversacion?.id) conversaciones.set(conversacion.id, conversacion);
    }
    hasMore = (respuesta?.workspaces || []).some(
      (workspace) => workspace?.pagination?.hasMore === true
    );
    offset += 200;
  } while (hasMore);
  return [...conversaciones.values()];
}

async function obtenerConversacionPorId(id) {
  if (!id) return null;
  const respuesta = await platicaGet(`/v1/conversations/${encodeURIComponent(id)}`);
  if (respuesta?.id === id || Array.isArray(respuesta?.messages)) return respuesta;
  const conversaciones = conversacionesDeRespuesta(respuesta);
  return conversaciones.find((conversacion) => conversacion.id === id) || conversaciones[0] || null;
}

async function cargarMensajesCliente(phone) {
  const conversaciones = await listarConversacionesCliente(phone);
  const completas = await Promise.all(
    conversaciones
      .filter((conversacion) => conversacion?.id)
      .map((conversacion) => obtenerConversacionPorId(conversacion.id))
  );
  return completas.filter(Boolean).flatMap((conversacion) =>
    (Array.isArray(conversacion.messages) ? conversacion.messages : []).map((message) => ({
      ...message,
      conversationId: conversacion.id,
      channelId: conversacion.channelId,
      platform: conversacion.platform,
    }))
  );
}

async function enviarTexto({ phone, text }) {
  const conversationId = telefonoConversacion(phone);
  if (!conversationId) throw new Error('Teléfono vacío para WhatsApp');
  return platicaFetch('/v1/messages', {
    ...payloadCanalYAgente(),
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
    ...payloadCanalYAgente(),
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
  listarConversacionesCliente,
  obtenerConversacionPorId,
  cargarMensajesCliente,
  conversacionesDeRespuesta,
  payloadCanalYAgente,
};
