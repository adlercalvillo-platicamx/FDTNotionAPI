// src/services/calendar-client.service.js
//
// Este repo NO duplica google.service.js. En vez de eso, llama por HTTP al
// servicio de Calendar que Plática ya tiene desplegado en producción
// (platica-google-docs-api / repo de Ernesto) — así el código de OAuth y de
// la API de Google se mantiene en un solo lugar para todos los clientes.
//
// Requiere en variables de entorno:
//   GOOGLE_API_BASE_URL   — ej. https://uoo48gc0og4ss0osg8kso0g8.appsplatica.site
//   GOOGLE_API_KEY        — el X-API-Key de ese servicio (no es NOTION_API_KEY)
//   GOOGLE_API_CLIENTE_ID — cliente_id de FDT ya conectado por OAuth ahí
//
// platica-google-docs-api soporta dos modelos de autenticación con Google.
// FDT usa el Modelo 2 (OAuth por cliente, con cliente_id en cada llamada)
// — confirmado por Adler el 16 de julio 2026. NO el Modelo 1 (cuenta única
// de la agencia con refresh token fijo, sin cliente_id).
//
// ⚠️ El cliente_id de FDT tiene que existir en la plataforma de Plática
// ANTES de que esto funcione — es la conexión OAuth que Adler dijo que
// maneja él directamente, no es un paso de este repo.
//
// ⚠️ El shape exacto de la respuesta de /calendar/crear-evento no se
// verificó end-to-end desde este repo — el campo `evento_id` de abajo es la
// mejor suposición a partir de la revisión de código de google_service.js.
// Confirmar con una llamada de prueba antes de ir a producción.

const BASE_URL = process.env.GOOGLE_API_BASE_URL;
const API_KEY = process.env.GOOGLE_API_KEY;
const CLIENTE_ID = process.env.GOOGLE_API_CLIENTE_ID;

async function callCalendarApi(path, body) {
  if (!BASE_URL) throw new Error('Falta GOOGLE_API_BASE_URL en variables de entorno');
  if (!API_KEY) throw new Error('Falta GOOGLE_API_KEY en variables de entorno');
  if (!CLIENTE_ID) {
    throw new Error(
      'Falta GOOGLE_API_CLIENTE_ID — la cuenta de Google de los sponsors debe estar conectada primero en platica-google-docs-api'
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ cliente_id: CLIENTE_ID, ...body }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || `Error del servicio de Calendar (status ${res.status})`);
    err.status = res.status;
    err.detalle = data;
    throw err;
  }
  return data;
}

/**
 * Crea un evento en el calendario del sponsor. Mismos parámetros que ya
 * esperaba booking.service.js — el único cambio es el transporte (HTTP en
 * vez de import directo de google.service.js).
 */
async function createEvent({ calendario_id, titulo, descripcion, inicio, fin, zona_horaria, asistentes, recordatorios }) {
  const data = await callCalendarApi('/calendar/crear-evento', {
    calendario_id,
    titulo,
    descripcion,
    inicio,
    fin,
    zona_horaria,
    asistentes,
    recordatorios,
  });
  return { evento_id: data.evento_id || data.id };
}

/** Cancela un evento existente (usado en el rollback de booking.service.js). */
async function cancelEvent({ calendario_id, evento_id, enviar_notificaciones }) {
  return callCalendarApi('/calendar/cancelar-evento', { calendario_id, evento_id, enviar_notificaciones });
}

module.exports = { createEvent, cancelEvent };
