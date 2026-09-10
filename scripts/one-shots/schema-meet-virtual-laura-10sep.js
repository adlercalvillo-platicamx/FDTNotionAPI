#!/usr/bin/env node
/**
 * Agrega a Citas de Laura los campos del Meet virtual (cron 15 min).
 * No reusa "Google Event ID" (histórico del Calendar retirado).
 *
 * Dry-run:  node scripts/one-shots/schema-meet-virtual-laura-10sep.js
 * Escribe:  node scripts/one-shots/schema-meet-virtual-laura-10sep.js --confirmar
 */
require('dotenv').config();

const DS_CITAS = '3b162dda-199a-8053-8098-000b00916893';
const VERSION = '2025-09-03';
const CONFIRMAR = process.argv.includes('--confirmar');

const DESEADAS = {
  'Google Meet Event ID': { rich_text: {} },
  'Google Meet URL': { url: {} },
  'Intentos Google Meet': { number: {} },
  'Notas Google Meet': { rich_text: {} },
};

async function notion(token, method, path, body) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${data.message || ''}`);
  }
  return data;
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA o NOTION_API_KEY');

  const actual = await notion(token, 'GET', `/data_sources/${DS_CITAS}`);
  if (!String(actual.id).startsWith('3b162dda')) {
    throw new Error(`Abortado: el destino no es Citas de Laura (${actual.id})`);
  }

  const faltantes = Object.fromEntries(
    Object.entries(DESEADAS).filter(([nombre]) => !actual.properties?.[nombre])
  );

  console.log('Citas de Laura:', actual.id);
  console.log('Campos faltantes:', Object.keys(faltantes).join(' | ') || '(ninguno)');
  if (!CONFIRMAR) {
    console.log('Dry-run. Para escribir: --confirmar');
    return;
  }
  if (Object.keys(faltantes).length === 0) return;

  const actualizado = await notion(token, 'PATCH', `/data_sources/${DS_CITAS}`, {
    properties: faltantes,
  });
  for (const nombre of Object.keys(DESEADAS)) {
    if (!actualizado.properties?.[nombre]) {
      throw new Error(`Notion no devolvió la propiedad "${nombre}" después del PATCH`);
    }
  }
  console.log('PATCH ok. Campos de Meet virtual presentes.');
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
