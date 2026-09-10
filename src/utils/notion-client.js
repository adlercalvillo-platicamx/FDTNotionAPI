// src/utils/notion-client.js
//
// Cliente REST directo a Notion, compartido por todos los servicios de
// Notion (citas, contactos). Antes vivía duplicado en cada archivo — se
// extrajo aquí el 16 de julio 2026 al armar el repo definitivo.
//
// Requiere NOTION_API_KEY en variables de entorno.
//
// ⚠️ La versión de la API tiene que ser 2025-09-03 o más nueva — antes de
// esa versión, el endpoint /v1/data_sources/.../query no existía (todo
// corría bajo /v1/databases/...). Usar una versión vieja aquí no da un
// error obvio de "versión incorrecta" — da "Invalid request URL", porque
// para esa versión antigua de la API, la ruta /data_sources ni existe.
// Ya lo viví en carne propia el 22 de julio, no lo vuelvas a bajar.

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2025-09-03';
const MAX_REINTENTOS_429 = 5;
const TOPE_ESPERA_429_MS = 15000;

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esperaPor429(res, intento) {
  const crudo = res.headers?.get?.('Retry-After');
  const segundos = crudo != null ? Number(crudo) : NaN;
  if (Number.isFinite(segundos) && segundos >= 0) {
    return Math.min(segundos * 1000, TOPE_ESPERA_429_MS);
  }
  return Math.min(400 * 2 ** intento, 8000);
}

async function notionFetch(path, options = {}) {
  if (!NOTION_API_KEY) {
    throw new Error('Falta NOTION_API_KEY en variables de entorno');
  }

  for (let intento = 0; ; intento += 1) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (res.status === 429 && intento < MAX_REINTENTOS_429) {
      await esperarMs(esperaPor429(res, intento));
      continue;
    }

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || `Error de Notion API (status ${res.status})`);
      err.status = res.status;
      err.notion = data;
      throw err;
    }
    return data;
  }
}

module.exports = { notionFetch };
