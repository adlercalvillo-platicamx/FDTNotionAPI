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

async function notionFetch(path, options = {}) {
  if (!NOTION_API_KEY) {
    throw new Error('Falta NOTION_API_KEY en variables de entorno');
  }

  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || `Error de Notion API (status ${res.status})`);
    err.status = res.status;
    err.notion = data;
    throw err;
  }
  return data;
}

module.exports = { notionFetch };
