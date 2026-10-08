#!/usr/bin/env node
/**
 * Citas (Laura): board por asistente como "Cola — Sugeridas por aprobar",
 * filtrado por sponsor, con Sugerido + Aprobado + Rechazado (sin cupo < 4).
 *
 * Uso:
 *   node scripts/one-shots/crear-vista-cola-sponsor-push-laura-08oct.js
 *   node scripts/one-shots/crear-vista-cola-sponsor-push-laura-08oct.js --confirmar
 *   node scripts/one-shots/crear-vista-cola-sponsor-push-laura-08oct.js --solo infracommerce --confirmar
 */
require('dotenv').config();

const DS_VER = '2025-09-03';
const VIEWS_VER = '2026-03-11';
const CITAS_DS = process.env.NOTION_CITAS_DATA_SOURCE_ID || '3b162dda-199a-8053-8098-000b00916893';
const CITAS_DB = '3b162dda-199a-803f-bd71-fb15af9dc9a4';
const COLA_ID = '3d062dda-199a-8159-82ed-000c83a37787';
const BLOQUEO =
  process.env.NOTION_CONTACTO_BLOQUEO_AGENDA_ID || '3cf62dda-199a-81fa-85fc-c32e95485c04';

const SPONSORES = {
  infracommerce: {
    pageId: '3bc62dda-199a-81bb-b769-f4ef0eab9a5f',
    nombreVista: 'Cola — Infracommerce (Sugerido / Aprobado / Rechazado)',
  },
  revie: {
    pageId: '3bc62dda-199a-8189-805d-ee8b4fcca080',
    nombreVista: 'Cola — Revie (Sugerido / Aprobado / Rechazado)',
  },
};

const CONFIRMAR = process.argv.includes('--confirmar');
const soloArg = process.argv.find((a) => a === '--solo');
const soloKey = soloArg
  ? process.argv[process.argv.indexOf(soloArg) + 1]?.toLowerCase()
  : null;

const SORTS = [{ property: 'Score (de Notas)', direction: 'descending' }];

function filtroParaSponsor(sponsorPageId) {
  return {
    and: [
      {
        or: [
          { property: 'Estatus', select: { equals: 'Sugerido' } },
          { property: 'Estatus', select: { equals: 'Aprobado' } },
          { property: 'Estatus', select: { equals: 'Rechazado' } },
        ],
      },
      { property: 'Contacto Match', relation: { contains: sponsorPageId } },
      { property: 'Contacto Principal', relation: { does_not_contain: BLOQUEO } },
    ],
  };
}

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

function mapaPropiedades(ds) {
  const idToName = new Map();
  for (const [nombre, propiedad] of Object.entries(ds.properties || {})) {
    idToName.set(decodeURIComponent(propiedad.id), nombre);
  }
  idToName.set('title', 'Nombre');
  return idToName;
}

function propiedadConfig(item) {
  return {
    property_id: decodeURIComponent(item.property_id || ''),
    visible: item.visible !== false,
  };
}

async function contar(token, filtro) {
  let total = 0;
  let cursor;
  do {
    const body = { page_size: 100, filter: filtro };
    if (cursor) body.start_cursor = cursor;
    const q = await notion(token, DS_VER, 'POST', `/data_sources/${CITAS_DS}/query`, body);
    total += (q.results || []).length;
    cursor = q.has_more ? q.next_cursor : null;
  } while (cursor);
  return total;
}

async function buscarVistaPorNombre(token, nombreVista) {
  const refs = await notion(token, VIEWS_VER, 'GET', `/views?data_source_id=${CITAS_DS}&page_size=100`);
  for (const ref of refs.results || []) {
    const vista = await notion(token, VIEWS_VER, 'GET', `/views/${ref.id}`);
    if (vista.name === nombreVista) return vista;
  }
  return null;
}

async function crearVista({
  token,
  idToName,
  groupBy,
  properties,
  nombreVista,
  sponsorPageId,
}) {
  const filtro = filtroParaSponsor(sponsorPageId);
  const existente = await buscarVistaPorNombre(token, nombreVista);
  if (existente) {
    const filas = await contar(token, filtro);
    console.log(`${nombreVista}: YA EXISTE (${existente.id}) — ${filas} filas`);
    return { creada: false, id: existente.id, filas };
  }

  const filas = await contar(token, filtro);
  console.log(`${nombreVista}: ${filas} filas (nueva)`);

  if (!CONFIRMAR) {
    return { creada: false, id: null, filas, dryRun: true };
  }

  const creada = await notion(token, VIEWS_VER, 'POST', '/views', {
    database_id: CITAS_DB,
    data_source_id: CITAS_DS,
    name: nombreVista,
    type: 'board',
    filter: filtro,
    sorts: SORTS,
    configuration: {
      type: 'board',
      group_by: groupBy,
      properties,
    },
  });

  const gb = creada.configuration?.group_by;
  if (
    !gb ||
    decodeURIComponent(gb.property_id || '') !== decodeURIComponent(groupBy.property_id)
  ) {
    throw new Error(`Se creó "${nombreVista}" sin agrupar por Contacto Principal`);
  }
  console.log(`Creada: ${creada.id}`);
  return { creada: true, id: creada.id, filas };
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA');

  const keys = soloKey ? [soloKey] : Object.keys(SPONSORES);
  for (const key of keys) {
    if (!SPONSORES[key]) {
      throw new Error(`--solo desconocido: ${key}. Usa: ${Object.keys(SPONSORES).join(', ')}`);
    }
  }

  const citas = await notion(token, DS_VER, 'GET', `/data_sources/${CITAS_DS}`);
  if (!String(citas.id).startsWith('3b162dda')) {
    throw new Error(`Destino Citas no es Laura producción (${citas.id})`);
  }
  const idToName = mapaPropiedades(citas);

  const cola = await notion(token, VIEWS_VER, 'GET', `/views/${COLA_ID}`);
  if (cola.type !== 'board') throw new Error('La cola modelo ya no es board');
  const { group_by: groupBy } = cola.configuration || {};
  if (!groupBy) throw new Error('La cola modelo perdió group_by');

  const properties = (cola.configuration.properties || [])
    .map(propiedadConfig)
    .filter((item) => idToName.has(item.property_id));
  const visibles = properties
    .filter((item) => item.visible)
    .map((item) => idToName.get(item.property_id));
  console.log(`Tarjeta heredada de "${cola.name}": ${visibles.join(' | ')}\n`);

  const resumen = [];
  for (const key of keys) {
    const { pageId, nombreVista } = SPONSORES[key];
    const resultado = await crearVista({
      token,
      idToName,
      groupBy,
      properties,
      nombreVista,
      sponsorPageId: pageId,
    });
    resumen.push({ key, nombreVista, ...resultado });
  }

  if (!CONFIRMAR && resumen.some((r) => !r.id)) {
    console.log('\nDRY-RUN. Nada escrito. Agrega --confirmar.');
  }

  console.log('\nResumen:', JSON.stringify(resumen, null, 2));
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
