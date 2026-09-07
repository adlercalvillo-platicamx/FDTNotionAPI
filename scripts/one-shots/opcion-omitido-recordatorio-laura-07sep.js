#!/usr/bin/env node
/**
 * Agrega la opción "Omitido" al select "Estado Recordatorio 15min" de Citas.
 *
 * El cron de recordatorios necesita un estado terminal para las citas que no
 * se pueden avisar (asistente sin WhatsApp). Sin él tendría que dejarlas en
 * "Falló" y reintentarlas cada corrida sin posibilidad de éxito.
 *
 * Un PATCH de opciones NO borra las existentes: hay que mandar la lista
 * completa o Notion las quita. Se leen primero y se reenvían tal cual.
 *
 * Dry-run:  node scripts/one-shots/opcion-omitido-recordatorio-laura-07sep.js
 * Escribe:  node scripts/one-shots/opcion-omitido-recordatorio-laura-07sep.js --confirmar
 */
require('dotenv').config();

const DS_CITAS = '3b162dda-199a-8053-8098-000b00916893';
const VERSION = '2025-09-03';
const CAMPO = 'Estado Recordatorio 15min';
const NUEVA_OPCION = { name: 'Omitido', color: 'gray' };
const CONFIRMAR = process.argv.includes('--confirmar');

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

  const propiedad = actual.properties?.[CAMPO];
  if (propiedad?.type !== 'select') {
    throw new Error(`"${CAMPO}" no existe o no es select (type=${propiedad?.type})`);
  }

  const opciones = propiedad.select.options || [];
  console.log('Citas de Laura:', actual.id);
  console.log('Opciones actuales:', opciones.map((o) => o.name).join(' | '));

  if (opciones.some((o) => o.name === NUEVA_OPCION.name)) {
    console.log(`"${NUEVA_OPCION.name}" ya existe. Nada que hacer.`);
    return;
  }
  if (!CONFIRMAR) {
    console.log(`Dry-run. Agregaría "${NUEVA_OPCION.name}". Para escribir: --confirmar`);
    return;
  }

  const actualizado = await notion(token, 'PATCH', `/data_sources/${DS_CITAS}`, {
    properties: {
      [CAMPO]: {
        select: {
          options: [...opciones.map(({ id, name, color }) => ({ id, name, color })), NUEVA_OPCION],
        },
      },
    },
  });

  const finales = (actualizado.properties?.[CAMPO]?.select?.options || []).map((o) => o.name);
  for (const previa of opciones) {
    if (!finales.includes(previa.name)) throw new Error(`Se perdió la opción "${previa.name}"`);
  }
  if (!finales.includes(NUEVA_OPCION.name)) throw new Error('Notion no devolvió "Omitido"');
  console.log('PATCH ok. Opciones:', finales.join(' | '));
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
