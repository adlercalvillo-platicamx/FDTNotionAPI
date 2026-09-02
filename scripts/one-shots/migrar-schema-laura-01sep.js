#!/usr/bin/env node
/**
 * Migra únicamente el schema de Contactos/Citas de Laura para igualarlo al
 * workspace de pruebas. Conserva las filas existentes y crea un respaldo
 * local antes de cualquier PATCH.
 *
 * Dry-run:    node scripts/one-shots/migrar-schema-laura-01sep.js
 * Escritura:  node scripts/one-shots/migrar-schema-laura-01sep.js --confirmar
 *
 * One-shot del 1-sep-2026. No reejecutar sin comparar schemas primero.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const VERSION = '2025-09-03';
const SRC_CONTACTOS = '9f335308-da0e-4672-9744-c1dabcfb22aa';
const SRC_CITAS = 'df93bc94-26ee-42fc-92d7-a0ed3a8e1f68';
const DST_CONTACTOS = '3b162dda-199a-8029-8d58-000b6d1fed37';
const DST_CITAS = '3b162dda-199a-8053-8098-000b00916893';
const CONFIRMAR = process.argv.includes('--confirmar');

const SRC_TOKEN = process.env.NOTION_API_KEY;
const DST_TOKEN = process.env.NOTION_API_KEY_LAURA;
if (!SRC_TOKEN || !DST_TOKEN) throw new Error('Faltan NOTION_API_KEY o NOTION_API_KEY_LAURA');

async function notion(token, method, apiPath, body) {
  const response = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${apiPath}: ${response.status} ${data.message}`);
  return data;
}

async function queryAll(token, dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const data = await notion(token, 'POST', `/data_sources/${dataSourceId}/query`, body);
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function createPayload(prop) {
  const type = prop.type;
  if (type === 'rich_text') return { rich_text: {} };
  if (type === 'number') return { number: { format: prop.number?.format || 'number' } };
  if (type === 'select' || type === 'multi_select') {
    return {
      [type]: {
        options: (prop[type]?.options || []).map(({ name, color }) => ({ name, color })),
      },
    };
  }
  if (['date', 'checkbox', 'url', 'email', 'phone_number', 'files', 'people'].includes(type)) {
    return { [type]: {} };
  }
  if (type === 'formula') return { formula: { expression: prop.formula.expression } };
  if (type === 'rollup') {
    return {
      rollup: {
        relation_property_name: prop.rollup.relation_property_name,
        rollup_property_name: prop.rollup.rollup_property_name,
        function: prop.rollup.function,
      },
    };
  }
  return null;
}

function optionNames(prop) {
  return (prop?.[prop.type]?.options || []).map((option) => option.name);
}

function textValue(prop) {
  if (!prop) return '';
  if (prop.type === 'select') return prop.select?.name || '';
  return (prop.rich_text || prop.title || []).map((part) => part.plain_text || '').join('');
}

function richText(content) {
  return { rich_text: content ? [{ text: { content } }] : [] };
}

async function patchSchema(dataSourceId, properties, label) {
  if (!Object.keys(properties).length) return;
  console.log(`${CONFIRMAR ? 'PATCH' : 'DRY'} ${label}: ${Object.keys(properties).join(', ')}`);
  if (CONFIRMAR) {
    await notion(DST_TOKEN, 'PATCH', `/data_sources/${dataSourceId}`, { properties });
  }
}

async function addSimpleAndOptions(src, dst, dstId, label) {
  const updates = {};
  for (const [name, sourceProp] of Object.entries(src.properties)) {
    if (['title', 'relation', 'rollup', 'formula'].includes(sourceProp.type)) continue;
    const targetProp = dst.properties[name];
    if (!targetProp) {
      updates[name] = createPayload(sourceProp);
      continue;
    }
    if (targetProp.type !== sourceProp.type) continue;
    if (['select', 'multi_select'].includes(sourceProp.type)) {
      const expected = optionNames(sourceProp);
      const actual = optionNames(targetProp);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        updates[name] = createPayload(sourceProp);
      }
    }
  }
  await patchSchema(dstId, updates, `${label} simples/opciones`);
}

async function mergeExtraExa(pages) {
  for (const page of pages) {
    const legacySize = textValue(page.properties['Tamaño Empresa (Exa)']);
    const evidence = textValue(page.properties['Tamaño Empresa – Evidencia (Exa)']);
    if (!legacySize && !evidence) continue;
    const current = textValue(page.properties['Pendientes / Notas']);
    const exa = [legacySize, evidence].filter(Boolean).join(' — ');
    const etiqueta = `[Exa tamaño] ${exa}`;
    if (current.includes(etiqueta)) continue;
    const merged = [current, etiqueta].filter(Boolean).join('\n');
    console.log(`${CONFIRMAR ? 'PATCH' : 'DRY'} merge Exa ${page.id}: ${merged}`);
    if (CONFIRMAR) {
      await notion(DST_TOKEN, 'PATCH', `/pages/${page.id}`, {
        properties: { 'Pendientes / Notas': richText(merged) },
      });
    }
  }
}

async function migrate() {
  const [srcContactos, srcCitas, dstContactos, dstCitas, contactosPages, citasPages] =
    await Promise.all([
      notion(SRC_TOKEN, 'GET', `/data_sources/${SRC_CONTACTOS}`),
      notion(SRC_TOKEN, 'GET', `/data_sources/${SRC_CITAS}`),
      notion(DST_TOKEN, 'GET', `/data_sources/${DST_CONTACTOS}`),
      notion(DST_TOKEN, 'GET', `/data_sources/${DST_CITAS}`),
      queryAll(DST_TOKEN, DST_CONTACTOS),
      queryAll(DST_TOKEN, DST_CITAS),
    ]);

  const backup = {
    createdAt: new Date().toISOString(),
    schemas: { contactos: dstContactos, citas: dstCitas },
    rows: { contactos: contactosPages, citas: citasPages },
  };
  const backupDir = path.join(__dirname, '..', '..', '.local-backups');
  if (CONFIRMAR) {
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `laura-pre-schema-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`Backup local: ${file}`);
  } else {
    console.log(`DRY backup preparado: ${contactosPages.length} contactos, ${citasPages.length} citas`);
  }

  await mergeExtraExa(contactosPages);

  // Reemplazo deliberado: 61 checkbox estaban false y no distinguían vacío/No.
  if (dstContactos.properties['Incluye Entrada Evento']?.type !== 'select') {
    await patchSchema(DST_CONTACTOS, { 'Incluye Entrada Evento': null }, 'retirar checkbox ambiguo');
  }
  const contactosAfterDrop = CONFIRMAR
    ? await notion(DST_TOKEN, 'GET', `/data_sources/${DST_CONTACTOS}`)
    : {
        ...dstContactos,
        properties: Object.fromEntries(
          Object.entries(dstContactos.properties).filter(([name]) => name !== 'Incluye Entrada Evento')
        ),
      };
  await addSimpleAndOptions(srcContactos, contactosAfterDrop, DST_CONTACTOS, 'Contactos');

  // Las relaciones de Citas ya existen. Contactos necesita una relación
  // navegable propia para fórmulas y vistas; no altera las filas de Citas.
  let contactosCurrent = CONFIRMAR
    ? await notion(DST_TOKEN, 'GET', `/data_sources/${DST_CONTACTOS}`)
    : contactosAfterDrop;
  if (!contactosCurrent.properties['Citas (relacional)']) {
    await patchSchema(
      DST_CONTACTOS,
      {
        'Citas (relacional)': {
          relation: { data_source_id: DST_CITAS, single_property: {} },
        },
      },
      'Contactos relación Citas'
    );
  }

  // Citas: campos simples y opciones, luego rollups/fórmulas.
  await addSimpleAndOptions(srcCitas, dstCitas, DST_CITAS, 'Citas');
  let citasCurrent = CONFIRMAR ? await notion(DST_TOKEN, 'GET', `/data_sources/${DST_CITAS}`) : dstCitas;
  const citasDerived = {};
  for (const [name, prop] of Object.entries(srcCitas.properties)) {
    if (!citasCurrent.properties[name] && ['rollup', 'formula'].includes(prop.type)) {
      citasDerived[name] = createPayload(prop);
    }
  }
  await patchSchema(DST_CITAS, citasDerived, 'Citas rollups/fórmulas');

  // Contactos: fórmulas/rollup después de que la relación exista.
  contactosCurrent = CONFIRMAR
    ? await notion(DST_TOKEN, 'GET', `/data_sources/${DST_CONTACTOS}`)
    : contactosCurrent;
  // Orden de dependencias: relación → conteo → faltantes → rango.
  for (const name of ['Estatus Citas (rollup)']) {
    contactosCurrent = CONFIRMAR
      ? await notion(DST_TOKEN, 'GET', `/data_sources/${DST_CONTACTOS}`)
      : contactosCurrent;
    const prop = srcContactos.properties[name];
    if (prop && !contactosCurrent.properties[name]) {
      await patchSchema(DST_CONTACTOS, { [name]: createPayload(prop) }, `Contactos ${name}`);
    }
  }
  console.log(
    'MANUAL: Citas Confirmadas (Count), Citas Faltantes y Rango Faltantes ' +
      'no se crean por API (Notion rechaza la fórmula avanzada con Type error).'
  );

  const extras = [
    'Match Sugerido',
    'Tamaño Empresa (Exa)',
    'Tamaño Empresa – Evidencia (Exa)',
    'Match Aprobado',
    'Instagram',
    'LinkedIn',
  ];
  await patchSchema(
    DST_CONTACTOS,
    Object.fromEntries(extras.filter((name) => dstContactos.properties[name]).map((name) => [name, null])),
    'retirar columnas extra ya respaldadas/fusionadas'
  );
}

migrate().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
