#!/usr/bin/env node
/**
 * Excluye citas Cancelada de las vistas operativas por horario/mesa en
 * Citas de Laura. Conserva Fecha y Hora + Mesa / Ubicacion en la fila para
 * auditoría y para poder reenviar el .ics de cancelación.
 *
 * Dry-run:   node scripts/one-shots/excluir-canceladas-vistas-mesa-laura-07sep.js
 * Escribe:   node scripts/one-shots/excluir-canceladas-vistas-mesa-laura-07sep.js --confirmar
 */
require('dotenv').config();

const VIEWS_VER = '2026-03-11';
const DS_VER = '2025-09-03';
const DS_CITAS = '3b162dda-199a-8053-8098-000b00916893';
const CONFIRMAR = process.argv.includes('--confirmar');

const VISTAS = [
  ['Timeline por Mesa', '3cf62dda-199a-8108-b3ce-000c6637c80c'],
  ['Por Horario (Mesas en ese bloque)', '3cf62dda-199a-8197-9128-000c57eea588'],
];

const EXCLUIR_CANCELADA = {
  property: 'Estatus',
  select: { does_not_equal: 'Cancelada' },
};

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

function yaExcluyeCancelada(filter) {
  return (
    JSON.stringify(filter || null).includes('"does_not_equal":"Cancelada"') ||
    JSON.stringify(filter || null).includes('"equals":"Cancelada"')
  );
}

function conExclusionCancelada(filter) {
  if (!filter) return EXCLUIR_CANCELADA;
  if (yaExcluyeCancelada(filter)) return filter;
  if (Array.isArray(filter.and)) return { and: [...filter.and, EXCLUIR_CANCELADA] };
  return { and: [filter, EXCLUIR_CANCELADA] };
}

async function contar(token, filter) {
  let total = 0;
  let cursor;
  do {
    const body = { page_size: 100, filter };
    if (cursor) body.start_cursor = cursor;
    const data = await notion(token, DS_VER, 'POST', `/data_sources/${DS_CITAS}/query`, body);
    total += (data.results || []).length;
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return total;
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA o NOTION_API_KEY');

  const dataSource = await notion(token, DS_VER, 'GET', `/data_sources/${DS_CITAS}`);
  if (!String(dataSource.id).startsWith('3b162dda')) {
    throw new Error(`Abortado: el destino no es Citas de Laura (${dataSource.id})`);
  }

  for (const [nombre, id] of VISTAS) {
    const vista = await notion(token, VIEWS_VER, 'GET', `/views/${id}`);
    const siguiente = conExclusionCancelada(vista.filter);
    const yaEstaba = yaExcluyeCancelada(vista.filter);
    const antes = await contar(token, vista.filter || undefined);
    const despues = await contar(token, siguiente);

    console.log(`${nombre} (${vista.type})`);
    console.log(`  filas: ${antes} -> ${despues}${yaEstaba ? ' [ya excluía Cancelada]' : ''}`);

    if (CONFIRMAR && !yaEstaba) {
      const actualizada = await notion(token, VIEWS_VER, 'PATCH', `/views/${id}`, {
        filter: siguiente,
      });
      if (!yaExcluyeCancelada(actualizada.filter)) {
        throw new Error(`${nombre}: PATCH 200 pero no conservó la exclusión`);
      }
      console.log('  PATCH ok');
    }
  }

  if (!CONFIRMAR) console.log('\nDry-run. Para escribir: --confirmar');
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
