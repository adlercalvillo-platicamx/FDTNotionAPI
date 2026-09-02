#!/usr/bin/env node
/**
 * Sincroniza las 11 empresas únicas del formulario de sponsors con Contactos
 * de Laura. Usa la respuesta más reciente por Empresa (Envia.com: Erik Rowe).
 *
 * Dry-run:
 *   node scripts/one-shots/cargar-sponsors-form-laura-02sep.js
 * Real:
 *   node scripts/one-shots/cargar-sponsors-form-laura-02sep.js --confirmar
 *
 * No toca pruebas. Conserva Nivel de Patrocinio, cuota, relaciones y campos
 * operativos que no vienen en el formulario.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const CONFIRMAR = process.argv.includes('--confirmar');
const ROOT = path.resolve(__dirname, '../..');
const CSV_PATH = path.join(ROOT, 'Citas 1a1 (Responses) - Form Responses 1.csv');
const OUT_DIR = path.join(ROOT, '.local-backups');
const RESULT_PATH = path.join(OUT_DIR, 'resultado-sponsors-form-laura-02sep.json');
const VERSION = '2025-09-03';
const LAURA_DS = '3b162dda-199a-8029-8d58-000b6d1fed37';
const PRUEBAS_DS = '9f335308-da0e-4672-9744-c1dabcfb22aa';
const TOKEN = process.env.NOTION_API_KEY_LAURA;

const SIZE_OPTIONS = ['Grande', 'Mediana', 'Pequeña', 'Micro'];
const LEGACY_SIZES = SIZE_OPTIONS.slice(0, 2);
const FORM_CHANGE_DATE = new Date('2026-08-26T00:00:00-06:00');

if (!TOKEN) throw new Error('Falta NOTION_API_KEY_LAURA');
if (!fs.existsSync(CSV_PATH)) throw new Error(`Falta ${CSV_PATH}`);
if (LAURA_DS === PRUEBAS_DS || !LAURA_DS.startsWith('3b162dda')) {
  throw new Error('Abortado: el destino no es Contactos de Laura.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows.shift();
  return rows
    .filter((cells) => cells.some((cell) => String(cell || '').trim()))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] || '']))
    );
}

function normalize(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function clean(value) {
  return String(value || '').trim();
}

function parseTimestamp(value) {
  const match = clean(value).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  );
  if (!match) throw new Error(`Timestamp no reconocido: ${value}`);
  const [, month, day, year, hour, minute, second] = match;
  return new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(
      hour
    ).padStart(2, '0')}:${minute}:${second}-06:00`
  );
}

async function notion(method, apiPath, body) {
  const response = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${apiPath}: ${response.status} ${data.message}`);
  }
  return data;
}

async function queryAll() {
  const pages = [];
  let cursor;
  do {
    const data = await notion('POST', `/data_sources/${LAURA_DS}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function text(prop) {
  return (prop?.title || prop?.rich_text || [])
    .map((part) => part.plain_text || part.text?.content || '')
    .join('');
}

function catalogMap(property) {
  return new Map(
    (property?.[property.type]?.options || []).map((option) => [normalize(option.name), option.name])
  );
}

function splitSelections(value) {
  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean);
}

function mapSelections(raw, catalog) {
  const mapped = [];
  const unknown = [];
  for (const value of splitSelections(raw)) {
    const option = catalog.get(normalize(value));
    if (option) mapped.push(option);
    else unknown.push(value);
  }
  return { mapped: [...new Set(mapped)], unknown: [...new Set(unknown)] };
}

function richText(value) {
  const content = clean(value).slice(0, 2000);
  return { rich_text: content ? [{ text: { content } }] : [] };
}

function sourceProperties(row, catalogs, legacy) {
  const solution = mapSelections(row['Solución (todas las que apliquen):'], catalogs.solution);
  const positions = mapSelections(
    row['Puestos y áreas con los que les gustaría parearse'],
    catalogs.positions
  );
  if (positions.unknown.length) {
    throw new Error(
      `${row.Empresa}: Puestos Buscados fuera de catálogo: ${positions.unknown.join(' | ')}`
    );
  }
  const shortDescription = clean(
    row['Descripción breve (3 palabras) del servicio/producto que ofrecen']
  );
  const otherSolutions = [...solution.unknown, ...(shortDescription ? [shortDescription] : [])];
  const mappedSolutions = solution.mapped.slice();
  if (solution.unknown.length && catalogs.solution.has('otro')) {
    mappedSolutions.push(catalogs.solution.get('otro'));
  }

  const rawSizes = legacy
    ? LEGACY_SIZES
    : splitSelections(row['¿Qué tamaño de empresa estás buscando para tus citas?']);
  const sizes = rawSizes.map((value) => {
    const sizeName = SIZE_OPTIONS.find((name) => normalize(value).startsWith(normalize(name)));
    const option = catalogs.sizes.get(normalize(sizeName));
    if (!option) throw new Error(`${row.Empresa}: tamaño fuera de catálogo: ${value}`);
    return option;
  });

  return {
    Nombre: { title: [{ text: { content: clean(row['Nombre de la persona encargada de citas 1a1']) } }] },
    Empresa: richText(row.Empresa),
    Email: { email: clean(row['Correo corporativo de la persona encargada de citas 1a1']) || null },
    WhatsApp: {
      phone_number: clean(row['Celular de la persona encargada de citas 1a1']) || null,
    },
    Solucion: { multi_select: [...new Set(mappedSolutions)].map((name) => ({ name })) },
    'Otra Solucion Ofrecida': richText(otherSolutions.join(', ')),
    'Servicios / Producto': richText(row['Descripción del servicio/producto que ofrecen']),
    'Clientes Actuales': richText(row['Nombres de clientes actuales']),
    'Etapa Cliente Buscada': { multi_select: [...new Set(sizes)].map((name) => ({ name })) },
    'Puestos Buscados': { multi_select: positions.mapped.map((name) => ({ name })) },
    'Clientes Potenciales Deseados': richText(
      row['Nombres y/o descripción de clientes potenciales (si gustas complementar tus respuestas previas)']
    ),
  };
}

function primitive(prop) {
  if (!prop) return null;
  const type = prop.type || Object.keys(prop)[0];
  const value = prop[type];
  if (type === 'title' || type === 'rich_text') {
    return (value || []).map((part) => part.plain_text || part.text?.content || '').join('');
  }
  if (type === 'select') return value?.name || null;
  if (type === 'multi_select') return (value || []).map((item) => item.name).sort();
  if (type === 'email' || type === 'phone_number') return value || null;
  return value ?? null;
}

function propertyDiffs(properties, page) {
  return Object.entries(properties)
    .filter(([name, desired]) => JSON.stringify(primitive(desired)) !== JSON.stringify(primitive(page?.properties?.[name])))
    .map(([name, desired]) => ({
      field: name,
      before: primitive(page?.properties?.[name]),
      after: primitive(desired),
    }));
}

async function main() {
  if (CONFIRMAR && fs.existsSync(RESULT_PATH)) {
    throw new Error('La carga ya tiene resultado; no se permite reejecutarla.');
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, ''));
  if (rows.length !== 12) throw new Error(`Se esperaban 12 respuestas; hay ${rows.length}.`);

  const latestByCompany = new Map();
  for (const row of rows) {
    const key = normalize(row.Empresa);
    const at = parseTimestamp(row.Timestamp);
    const previous = latestByCompany.get(key);
    if (!previous || at > previous.at) latestByCompany.set(key, { row, at });
  }
  if (latestByCompany.size !== 11) {
    throw new Error(`Se esperaban 11 empresas únicas; hay ${latestByCompany.size}.`);
  }

  const [schema, before] = await Promise.all([
    notion('GET', `/data_sources/${LAURA_DS}`),
    queryAll(),
  ]);
  const currentSizeOptions =
    schema.properties?.['Etapa Cliente Buscada']?.multi_select?.options || [];
  const mergedSizeOptions = [
    ...currentSizeOptions,
    ...SIZE_OPTIONS.filter(
      (name) => !currentSizeOptions.some((option) => normalize(option.name) === normalize(name))
    ).map((name) => ({ name, color: 'default' })),
  ];
  const virtualSizeProperty = {
    type: 'multi_select',
    multi_select: { options: mergedSizeOptions },
  };
  const catalogs = {
    solution: catalogMap(schema.properties.Solucion),
    positions: catalogMap(schema.properties['Puestos Buscados']),
    sizes: catalogMap(virtualSizeProperty),
  };

  const existingSponsors = before.filter(
    (page) => page.properties?.Categoria?.select?.name === 'Sponsor'
  );
  const byCompany = new Map(
    existingSponsors.map((page) => [normalize(text(page.properties.Empresa)), page])
  );
  const operations = [];
  for (const { row, at } of latestByCompany.values()) {
    const existing = byCompany.get(normalize(row.Empresa)) || null;
    const legacy = at < FORM_CHANGE_DATE;
    const properties = sourceProperties(row, catalogs, legacy);
    const diffs = propertyDiffs(properties, existing);
    operations.push({
      action: existing ? 'update' : 'create',
      id: existing?.id || null,
      empresa: clean(row.Empresa),
      timestamp: clean(row.Timestamp),
      legacySizes: legacy,
      nombre: primitive(properties.Nombre),
      email: primitive(properties.Email),
      sizes: primitive(properties['Etapa Cliente Buscada']),
      diffs,
      properties,
    });
  }

  const updates = operations.filter((item) => item.action === 'update');
  const creates = operations.filter((item) => item.action === 'create');
  const envia = operations.find((item) => normalize(item.empresa) === 'envia.com');
  if (
    updates.length !== 8 ||
    creates.length !== 3 ||
    envia?.nombre !== 'Erik Rowe' ||
    !envia.id
  ) {
    throw new Error(
      `Preview inesperado: updates=${updates.length}, creates=${creates.length}, Envia=${JSON.stringify(
        envia && { id: envia.id, nombre: envia.nombre }
      )}`
    );
  }

  console.log(
    JSON.stringify(
      {
        destino: LAURA_DS,
        sourceRows: rows.length,
        uniqueCompanies: latestByCompany.size,
        addSizeOptions: SIZE_OPTIONS.filter(
          (name) => !currentSizeOptions.some((option) => normalize(option.name) === normalize(name))
        ),
        updates: updates.map(({ properties, ...item }) => item),
        creates: creates.map(({ properties, ...item }) => item),
      },
      null,
      2
    )
  );
  if (!CONFIRMAR) {
    console.log('DRY-RUN: no se escribió en Notion.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const backupPath = path.join(OUT_DIR, `laura-pre-sponsors-form-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ createdAt: new Date().toISOString(), schema, pages: before }, null, 2)
  );

  await notion('PATCH', `/data_sources/${LAURA_DS}`, {
    properties: {
      'Etapa Cliente Buscada': {
        multi_select: { options: mergedSizeOptions },
      },
    },
  });

  const written = [];
  for (const item of operations) {
    if (item.action === 'update') {
      await notion('PATCH', `/pages/${item.id}`, { properties: item.properties });
      written.push({ action: 'updated', id: item.id, empresa: item.empresa });
    } else {
      const page = await notion('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: LAURA_DS },
        properties: {
          ...item.properties,
          Categoria: { select: { name: 'Sponsor' } },
          Fuente: { select: { name: 'Referido' } },
        },
      });
      written.push({ action: 'created', id: page.id, empresa: item.empresa });
    }
    await sleep(350);
  }

  const after = await queryAll();
  const afterById = new Map(after.map((page) => [page.id, page]));
  const writtenByCompany = new Map(written.map((item) => [normalize(item.empresa), item]));
  const verification = operations.map((item) => {
    const id = item.id || writtenByCompany.get(normalize(item.empresa))?.id;
    const page = afterById.get(id);
    return {
      id,
      empresa: item.empresa,
      action: item.action,
      remainingDiffs: propertyDiffs(item.properties, page),
      categoria: page?.properties?.Categoria?.select?.name || '',
      nivel: page?.properties?.['Nivel de Patrocinio']?.select?.name || '',
      cuota: page?.properties?.['Citas Minimas Prometidas']?.number ?? null,
    };
  });
  const failed = verification.filter(
    (item) => item.remainingDiffs.length || item.categoria !== 'Sponsor'
  );
  if (failed.length) throw new Error(`Falló verificación: ${JSON.stringify(failed)}`);

  const result = {
    executedAt: new Date().toISOString(),
    dataSourceId: LAURA_DS,
    sourceRows: rows.length,
    uniqueCompanies: latestByCompany.size,
    updated: written.filter((item) => item.action === 'updated'),
    created: written.filter((item) => item.action === 'created'),
    verification,
    backupPath,
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        updated: result.updated.length,
        created: result.created.length,
        verified: result.verification.length,
        totalPagesAfter: after.length,
        envia: verification.find((item) => normalize(item.empresa) === 'envia.com'),
        backupPath,
        resultPath: RESULT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`ERROR: ${error.stack || error.message}`);
  process.exit(1);
});
