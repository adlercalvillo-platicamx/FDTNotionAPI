#!/usr/bin/env node
/**
 * Agrega a Contactos de Laura los campos operativos del last call
 * y los deja visibles en "Raw — todos los campos".
 *
 * Dry-run: node scripts/one-shots/lastcall-schema-laura-09sep.js
 * Escribe:  node scripts/one-shots/lastcall-schema-laura-09sep.js --confirmar
 */
require('dotenv').config();

const DS_VER = '2025-09-03';
const VIEWS_VER = '2026-03-11';
const CONTACTOS_DS = '3b162dda-199a-8029-8d58-000b6d1fed37';
const CONTACTOS_DB = '3b162dda-199a-80a5-831e-efa14b9748bf';
const NOMBRE_RAW = 'Raw — todos los campos';
const CONFIRMAR = process.argv.includes('--confirmar');

const CAMPOS = {
  'Estado Lastcall': {
    select: {
      options: [
        { name: 'En curso', color: 'yellow' },
        { name: 'Enviado', color: 'green' },
        { name: 'Falló', color: 'red' },
      ],
    },
  },
  'Fecha Lastcall': { date: {} },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function notion(token, version, method, apiPath, body) {
  const response = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': version,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} -> ${response.status} ${data.message || ''}`);
  }
  return data;
}

async function listarVistas(token) {
  const refs = [];
  let cursor;
  do {
    const query = new URLSearchParams({ database_id: CONTACTOS_DB, page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const data = await notion(token, VIEWS_VER, 'GET', `/views?${query}`);
    refs.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  const vistas = [];
  for (const ref of refs) {
    vistas.push(await notion(token, VIEWS_VER, 'GET', `/views/${ref.id}`));
    await sleep(120);
  }
  return vistas;
}

function columnasTodasVisibles(properties) {
  const entradas = Object.entries(properties || {}).map(([name, prop]) => ({
    name,
    id: decodeURIComponent(prop.id),
    tipo: prop.type,
  }));
  const title = entradas.find((e) => e.tipo === 'title');
  if (!title) throw new Error('El schema no trae propiedad title');
  const orden = [title, ...entradas.filter((e) => e.id !== title.id)];
  return {
    entradas,
    properties: orden.map((e) => ({ property_id: e.id, visible: true })),
  };
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA o NOTION_API_KEY');

  let dataSource = await notion(token, DS_VER, 'GET', `/data_sources/${CONTACTOS_DS}`);
  if (!String(dataSource.id).startsWith('3b162dda')) {
    throw new Error(`Destino no es Contactos de Laura (${dataSource.id})`);
  }
  console.log(`Contactos: ${dataSource.name || dataSource.id}`);

  const faltantes = Object.entries(CAMPOS).filter(([nombre]) => !dataSource.properties?.[nombre]);
  for (const [nombre] of Object.entries(CAMPOS)) {
    console.log(`${nombre}: ${dataSource.properties?.[nombre] ? 'ya existe' : 'se crearía'}`);
  }

  if (!CONFIRMAR) {
    console.log('\nDRY-RUN. Nada escrito. Agrega --confirmar.');
    return;
  }

  if (faltantes.length) {
    dataSource = await notion(token, DS_VER, 'PATCH', `/data_sources/${CONTACTOS_DS}`, {
      properties: Object.fromEntries(faltantes),
    });
    for (const [nombre] of faltantes) {
      if (!dataSource.properties?.[nombre]) throw new Error(`No se creó ${nombre}`);
      console.log(`${nombre}: creado`);
    }
  } else {
    console.log('Schema completo; no hay campos nuevos.');
  }

  const { entradas, properties } = columnasTodasVisibles(dataSource.properties);
  const vistas = await listarVistas(token);
  const raw = vistas.find((v) => v.name === NOMBRE_RAW);
  if (!raw) throw new Error(`No encontré la vista "${NOMBRE_RAW}"`);

  const actualizada = await notion(token, VIEWS_VER, 'PATCH', `/views/${raw.id}`, {
    configuration: { type: 'table', properties },
  });
  const columnas = actualizada.configuration?.properties || [];
  const visibles = columnas.filter((col) => col.visible !== false);
  const nombresVisibles = visibles.map((col) => {
    const id = decodeURIComponent(col.property_id || '');
    const found = entradas.find((e) => e.id === id);
    return found?.name || id;
  });
  for (const nombre of Object.keys(CAMPOS)) {
    if (!nombresVisibles.includes(nombre)) {
      throw new Error(`${nombre} no quedó visible en "${NOMBRE_RAW}"`);
    }
  }
  console.log(`"${NOMBRE_RAW}" (${raw.id}): ${visibles.length} columnas visibles`);
  console.log(`lastcall visibles: ${Object.keys(CAMPOS).join(' | ')}`);
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
