#!/usr/bin/env node
/**
 * Solo lectura: audita el CSV contra pruebas y genera el preview de Laura.
 * No escribe en Notion. Los artefactos contienen PII y van a .local-backups/.
 *
 * node scripts/one-shots/preparar-ticketopolis-01sep.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const VERSION = '2025-09-03';
const CSV_PATH = path.join(__dirname, '..', '..', 'reservaciones_fashiondigitaltalks2026_260901.csv');
const OUT_DIR = path.join(__dirname, '..', '..', '.local-backups');
const TEST_DS = '9f335308-da0e-4672-9744-c1dabcfb22aa';
const LAURA_DS = '3b162dda-199a-8029-8d58-000b6d1fed37';

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
    .filter((cells) => cells.some(Boolean))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

function cleanExcel(value) {
  const text = String(value || '').trim();
  const match = text.match(/^=\("?(.+?)"?\)$/s);
  return match ? match[1] : text;
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[(),.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phone10(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length >= 13) digits = digits.slice(3);
  else if (digits.startsWith('52') && digits.length >= 12) digits = digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function parseLocalDate(value) {
  const match = String(value || '').trim().match(
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([ap])\. m\.$/i
  );
  if (!match) return null;
  let [, day, month, year, hour, minute, second, meridiem] = match;
  let h = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'p') h += 12;
  return `${year}-${month}-${day}T${String(h).padStart(2, '0')}:${minute}:${second}-06:00`;
}

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
  if (!response.ok) throw new Error(`${response.status} ${data.message}`);
  return data;
}

async function queryAll(token, dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const data = await notion(token, 'POST', `/data_sources/${dataSourceId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

const text = (prop) =>
  (prop?.rich_text || prop?.title || []).map((part) => part.plain_text || '').join('');
const select = (prop) => prop?.select?.name || '';
const email = (prop) => String(prop?.email || '').trim().toLowerCase();
const phone = (prop) => prop?.phone_number || '';

const TICKET = {
  'Acceso Virtual': 'Virtual',
  'Acceso Presencial': 'Presencial',
  'Acceso Presencial - Full pass (cupo limitado) *Exclusivo comercios': 'Presencial VIP',
  'Acceso Presencial VIP (cupo limitado)': 'Presencial VIP',
  'Acceso Presencial - VIP (cupo limitado) *Exclusivo Marcas de Moda': 'Presencial VIP',
  'Acceso Expo': 'Expo',
  SPEAKER: 'Speaker',
};

function catalogMap(prop) {
  return new Map((prop?.[prop.type]?.options || []).map((option) => [normalize(option.name), option.name]));
}

function expectedCategory(row) {
  return row['Título:'] === 'Prensa' ? 'Prensa' : 'Asistente';
}

function expectedOptIn(ticket, raw) {
  if (ticket === 'Presencial VIP' || ticket === 'Speaker') return 'Sí';
  if (ticket === 'Expo') return 'No';
  if (ticket === 'Presencial' || ticket === 'Virtual') {
    const value = normalize(raw);
    if (value === 'si') return 'Sí';
    if (value === 'no') return 'No';
  }
  return '';
}

function notionValue(row, catalogs) {
  const errors = [];
  const pick = (catalog, raw, field) => {
    if (!raw.trim()) return '';
    const found = catalog.get(normalize(raw));
    if (!found) errors.push(`${field}: valor sin catálogo "${raw}"`);
    return found || '';
  };
  const ticket = TICKET[row['Título:']] || '';
  const category = expectedCategory(row);
  const giro = pick(catalogs.giro, row['Giro:'], 'Giro / Industria');
  const area = pick(catalogs.area, row['Área:'], 'Area');
  const solutions = String(row['Soluciones que estás buscando:'] || '')
    .split(', ')
    .filter(Boolean)
    .map((value) => pick(catalogs.solutions, value, 'Soluciones Buscadas'))
    .filter(Boolean);
  const optIn = expectedOptIn(
    ticket,
    row['¿Te gustaría tener reuniones con proveedores relevantes durante el evento?:']
  );
  const include = pick(catalogs.include, row['Incluye entrada al evento:'], 'Incluye Entrada Evento');

  const props = {
    Nombre: { title: [{ text: { content: `${row['Nombre(s):']} ${row['Apellidos:']}`.trim() } }] },
    Email: { email: row['Correo electrónico:'].trim().toLowerCase() },
    WhatsApp: { phone_number: row['Whatsapp:'].trim() },
    Categoria: { select: { name: category } },
    'Formato Registro': { select: { name: '2026' } },
    Fuente: { select: { name: 'Ticketopolis' } },
  };
  const rich = {
    Ciudad: row['Ciudad:'],
    Empresa: row['Empresa:'],
    'Rol / Puesto': row['Puesto:'],
    'Web / Redes': row['Página Web:'],
    'LinkedIn/Instagram': row['LinkedIn Instagram o red social profesional:'],
    'Tamaño de Negocio': row['¿De qué tamaño es el negocio?:'],
    'Otra Solucion Buscada': row['¿Hay alguna otra solución que estés buscando que no veas en la lista?:'],
    'Folio Reservacion': cleanExcel(row['Folio de la reservación:']),
    'Folio Boleto': cleanExcel(row['Folio de boleto autorizado(s):']),
    'Estatus Ticketopolis': row['Estatus:'],
    'Codigo Promocion': cleanExcel(row['Código de promoción:']),
    'Datos Facturacion': row['Datos de facturación:'],
    Caracteristicas: row['Características:'],
    'Boletos Individuales Incluidos': row['Boletos individuales incluidos:'],
    'Nombre Asistente 2': row['Nombre(s) asistente 2:'] || '',
    'Nombre Asistente 3': row['Nombre(s) asistente 3:'] || '',
    'Nombre Asistente 4': row['Nombre(s) asistente 4:'] || '',
    'Revendedor Empresa': row['Revendedor - Empresa:'],
    'Revendedor Agente': row['Revendedor - Agente:'],
  };
  for (const [name, value] of Object.entries(rich)) {
    if (String(value || '').trim()) {
      props[name] = { rich_text: [{ text: { content: String(value).trim().slice(0, 2000) } }] };
    }
  }
  if (row['Revendedor - Correo:'].trim()) {
    props['Revendedor Correo'] = { email: row['Revendedor - Correo:'].trim() };
  }
  if (ticket) props['Ticket / Tipo Asistencia'] = { select: { name: ticket } };
  if (giro) props['Giro / Industria'] = { select: { name: giro } };
  if (area) props.Area = { select: { name: area } };
  if (solutions.length) props['Soluciones Buscadas'] = { multi_select: solutions.map((name) => ({ name })) };
  if (optIn) props['Quiere Citas 1a1'] = { select: { name: optIn } };
  if (include) props['Incluye Entrada Evento'] = { select: { name: include } };
  for (const [name, raw] of [
    ['Fecha Reservacion', row['Fecha de la reservación:']],
    ['Vencimiento', row['Vencimiento:']],
    ['Fecha Autorizacion', row['Fecha de autorización:']],
  ]) {
    if (raw.trim()) {
      const parsed = parseLocalDate(raw);
      if (parsed) props[name] = { date: { start: parsed } };
      else errors.push(`${name}: fecha no reconocida "${raw}"`);
    }
  }
  const amount = Number(String(row['Importe a pagar:'] || '').replace(/[^0-9.-]/g, ''));
  if (Number.isFinite(amount)) props['Importe Pagado'] = { number: amount };
  const quantity = Number(row['Cantidad:']);
  if (Number.isFinite(quantity)) props.Cantidad = { number: quantity };
  return { properties: props, errors, ticket, category, optIn, giro, area, solutions };
}

function compareRow(row, page, mapped) {
  const differences = [];
  const check = (field, csv, notion) => {
    if (normalize(csv) !== normalize(notion)) differences.push({ field, csv, notion });
  };
  check('Nombre', `${row['Nombre(s):']} ${row['Apellidos:']}`.trim(), text(page.properties.Nombre));
  check('Empresa', row['Empresa:'], text(page.properties.Empresa));
  if (mapped.giro) check('Giro / Industria', mapped.giro, select(page.properties['Giro / Industria']));
  if (mapped.ticket || row['Título:'] === 'Prensa') {
    check('Ticket / Tipo Asistencia', mapped.ticket, select(page.properties['Ticket / Tipo Asistencia']));
  }
  if (mapped.optIn) check('Quiere Citas 1a1', mapped.optIn, select(page.properties['Quiere Citas 1a1']));
  check('Categoria', mapped.category, select(page.properties.Categoria));

  const rawSize = row['¿De qué tamaño es el negocio?:'];
  if (/^(grande|mediana|pequeña|pequena|micro)/i.test(normalize(rawSize))) {
    check('Tamaño de Negocio', rawSize, text(page.properties['Tamaño de Negocio']));
  } else if (rawSize.trim()) {
    const currentStage = select(page.properties['Etapa de Negocio']);
    const legacyStage = select(page.properties['Etapa de Negocio (Legacy)']);
    const rawNormalized = normalize(rawSize.replace(/^[1-4]\s*/, ''));
    const stageAliases = new Map([
      ['exploracion de e commerce', 'Exploracion de e-commerce'],
      ['operacion basica de e commerce', 'Operacion basica de e-commerce'],
      ['escalamiento de e commerce', 'Escalamiento de e-commerce'],
      ['estrategia omnicanal avanzada', 'Estrategia omnicanal avanzada'],
      ['vendo principalmente por redes sociales', 'Vendo principalmente por redes sociales'],
      ['por lanzar mi marca o negocio', 'Por lanzar mi marca o negocio'],
      ['ya vendo en redes sociales por lanzar e commerce', 'Ya vendo en redes sociales - por lanzar e-commerce'],
      ['ya tengo e commerce propio y quiero crecer ventas', 'Ya tengo mi e-commerce propio y quiero crecer ventas'],
      ['ya tengo mi e commerce propio y quiero crecer ventas', 'Ya tengo mi e-commerce propio y quiero crecer ventas'],
      ['ya tengo e commerce ventas quiero mas rentabilidad', 'Ya tengo tienda en linea - quiero mas rentabilidad'],
      ['ya tengo tienda en linea quiero mas rentabilidad', 'Ya tengo tienda en linea - quiero mas rentabilidad'],
      ['ninguna de las anteriores', 'Ninguna de las anteriores'],
    ]);
    const expectedStage = stageAliases.get(rawNormalized) || rawSize;
    if (![currentStage, legacyStage].some((value) => normalize(value) === normalize(expectedStage))) {
      differences.push({
        field: 'Etapa desde columna Tamaño',
        csv: rawSize,
        notion: currentStage || legacyStage || '',
      });
    }
  }
  if (['Vencido', 'Esperando pago'].includes(row['Estatus:']) && !page.properties['Dado de Baja']?.checkbox) {
    differences.push({ field: 'Dado de Baja', csv: row['Estatus:'], notion: 'false' });
  }
  return differences;
}

function indexPages(pages) {
  const byPhone = new Map();
  const byEmail = new Map();
  for (const page of pages) {
    const p = phone10(phone(page.properties.WhatsApp));
    const e = email(page.properties.Email);
    if (p) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(page);
    }
    if (e) {
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(page);
    }
  }
  return { byPhone, byEmail };
}

function findPage(row, index) {
  const phoneMatches = index.byPhone.get(phone10(row['Whatsapp:'])) || [];
  if (phoneMatches.length) return phoneMatches;
  return index.byEmail.get(row['Correo electrónico:'].trim().toLowerCase()) || [];
}

function choosePageForRow(row, matches) {
  const folio = cleanExcel(row['Folio de la reservación:']);
  return (
    matches.find(
      (page) => cleanExcel(text(page.properties['Folio Reservacion'])) === folio
    ) || matches[0]
  );
}

function primitiveProperty(prop) {
  if (!prop) return null;
  const type = prop.type || Object.keys(prop)[0];
  const value = prop[type];
  if (type === 'title' || type === 'rich_text') {
    return (value || []).map((part) => part.plain_text || part.text?.content || '').join('');
  }
  if (type === 'select') return value?.name || null;
  if (type === 'multi_select') return (value || []).map((item) => item.name).sort();
  if (type === 'date') return value?.start || null;
  if (type === 'email') return String(value || '').toLowerCase() || null;
  if (type === 'phone_number') return phone10(value) || null;
  return value ?? null;
}

function isEmptyPrimitive(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function diffAllProperties(desired, existingPage) {
  const fill = [];
  const conflict = [];
  for (const [name, desiredProp] of Object.entries(desired)) {
    const expected = primitiveProperty(desiredProp);
    const actual = primitiveProperty(existingPage.properties[name]);
    if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
    const detail = { field: name, current: actual, desired: expected };
    if (isEmptyPrimitive(actual)) fill.push(detail);
    else conflict.push(detail);
  }
  return { fill, conflict };
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH).toString('utf16le').replace(/^\uFEFF/, '');
  const firstBreak = raw.indexOf('\n');
  if (raw.slice(0, firstBreak).trim() !== 'SEP=,') throw new Error('No se encontró SEP=,');
  const rows = parseCsv(raw.slice(firstBreak + 1));
  if (rows.length !== 110) throw new Error(`Se esperaban 110 filas; se parsearon ${rows.length}`);

  const [testPages, lauraPages, lauraSchema] = await Promise.all([
    queryAll(process.env.NOTION_API_KEY, TEST_DS),
    queryAll(process.env.NOTION_API_KEY_LAURA, LAURA_DS),
    notion(process.env.NOTION_API_KEY_LAURA, 'GET', `/data_sources/${LAURA_DS}`),
  ]);
  const catalogs = {
    giro: catalogMap(lauraSchema.properties['Giro / Industria']),
    area: catalogMap(lauraSchema.properties.Area),
    solutions: catalogMap(lauraSchema.properties['Soluciones Buscadas']),
    include: catalogMap(lauraSchema.properties['Incluye Entrada Evento']),
  };
  const mappedRows = rows.map((row) => ({ row, mapped: notionValue(row, catalogs) }));
  const testIndex = indexPages(testPages);
  const audit = { exact: [], different: [], missing: [], special: [] };
  for (const item of mappedRows) {
    const { row, mapped } = item;
    const folio = cleanExcel(row['Folio de la reservación:']);
    const matches = findPage(row, testIndex);
    const expectedAbsent =
      row['Título:'] === 'Acceso Sponsor' || ['Vencido', 'Esperando pago'].includes(row['Estatus:']);
    if (!matches.length) {
      if (expectedAbsent) audit.special.push({ folio, kind: 'ausencia esperada', row });
      else audit.missing.push({ folio, row });
      continue;
    }
    const page = choosePageForRow(row, matches);
    const differences = compareRow(row, page, mapped);
    if (differences.length) audit.different.push({ folio, row, pageId: page.id, differences });
    else audit.exact.push({ folio, pageId: page.id });
    if (expectedAbsent || ['Acceso Sponsor', 'SPEAKER', 'Prensa'].includes(row['Título:'])) {
      audit.special.push({ folio, kind: 'caso especial presente', row, pageId: page.id, differences });
    }
  }

  const byCsvEmail = new Map();
  for (const row of rows) {
    const key = row['Correo electrónico:'].trim().toLowerCase();
    if (!byCsvEmail.has(key)) byCsvEmail.set(key, []);
    byCsvEmail.get(key).push(row);
  }
  const duplicateEmails = [...byCsvEmail.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([emailAddress, group]) => ({
      email: emailAddress,
      folios: group.map((row) => cleanExcel(row['Folio de la reservación:'])),
      notionPageIds: [...new Set(group.flatMap((row) => findPage(row, testIndex).map((page) => page.id)))],
    }));
  const csvPhones = new Set(rows.map((row) => phone10(row['Whatsapp:'])).filter(Boolean));
  const csvEmails = new Set(rows.map((row) => row['Correo electrónico:'].trim().toLowerCase()));
  const notionOnly = testPages
    .filter((page) => select(page.properties.Fuente) === 'Ticketopolis')
    .filter(
      (page) =>
        !csvPhones.has(phone10(phone(page.properties.WhatsApp))) &&
        !csvEmails.has(email(page.properties.Email))
    )
    .map((page) => ({
      id: page.id,
      nombre: text(page.properties.Nombre),
      email: email(page.properties.Email),
      whatsapp: phone(page.properties.WhatsApp),
    }));

  const authorized = mappedRows.filter(({ row }) => row['Estatus:'] === 'Autorizado');
  const excluded = mappedRows
    .filter(({ row }) => row['Estatus:'] !== 'Autorizado' || row['Título:'] === 'Acceso Sponsor')
    .map(({ row }) => ({
      folio: cleanExcel(row['Folio de la reservación:']),
      email: row['Correo electrónico:'],
      reason: row['Título:'] === 'Acceso Sponsor' ? 'Acceso Sponsor' : row['Estatus:'],
    }));
  const loadable = authorized.filter(({ row }) => row['Título:'] !== 'Acceso Sponsor');
  const chosen = new Map();
  const deduped = [];
  for (const item of loadable) {
    const emailKey = item.row['Correo electrónico:'].trim().toLowerCase();
    // Evidencia real 1-sep: este correo compartido pertenece a dos personas
    // con nombres y teléfonos distintos; no es un duplicado de persona.
    const key =
      emailKey === 'norinmm@icloud.com'
        ? `${emailKey}|${phone10(item.row['Whatsapp:'])}`
        : emailKey;
    const previous = chosen.get(key);
    if (
      !previous ||
      new Date(item.mapped.properties['Fecha Reservacion']?.date?.start || 0) >
        new Date(previous.mapped.properties['Fecha Reservacion']?.date?.start || 0)
    ) {
      chosen.set(key, item);
    }
  }
  deduped.push(...chosen.values());

  const lauraIndex = indexPages(lauraPages);
  const preview = deduped.map(({ row, mapped }) => {
    const existing = findPage(row, lauraIndex);
    const existingPage = existing.length ? choosePageForRow(row, existing) : null;
    const fullDifferences = existingPage
      ? diffAllProperties(mapped.properties, existingPage)
      : { fill: [], conflict: [] };
    return {
      action: existing.length ? 'existing-review' : 'create',
      existingPageIds: existing.map((page) => page.id),
      existingDifferences: existingPage ? compareRow(row, existingPage, mapped) : [],
      fullDifferences,
      source: {
        folio: cleanExcel(row['Folio de la reservación:']),
        email: row['Correo electrónico:'].trim().toLowerCase(),
        whatsapp: row['Whatsapp:'],
        titulo: row['Título:'],
      },
      properties: mapped.properties,
      validationErrors: mapped.errors,
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const previewPath = path.join(OUT_DIR, 'preview-carga-laura-01sep.json');
  fs.writeFileSync(
    previewPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceRows: rows.length,
        uniqueEmails: byCsvEmail.size,
        excluded,
        duplicateEmails,
        counts: {
          pagesAfterRulesAndDedup: preview.length,
          create: preview.filter((item) => item.action === 'create').length,
          existingReview: preview.filter((item) => item.action === 'existing-review').length,
          existingExact: preview.filter(
            (item) => item.action === 'existing-review' && item.existingDifferences.length === 0
          ).length,
          existingWithDifferences: preview.filter(
            (item) => item.action === 'existing-review' && item.existingDifferences.length > 0
          ).length,
          existingFillOnly: preview.filter(
            (item) =>
              item.action === 'existing-review' &&
              item.fullDifferences.fill.length > 0 &&
              item.fullDifferences.conflict.length === 0
          ).length,
          existingWithConflicts: preview.filter(
            (item) => item.action === 'existing-review' && item.fullDifferences.conflict.length > 0
          ).length,
          validationErrors: preview.filter((item) => item.validationErrors.length).length,
        },
        pages: preview,
      },
      null,
      2
    )
  );

  const report = [
    '# Auditoría Ticketópolis vs Notion de pruebas — 1 sep 2026',
    '',
    `CSV: 110 filas; ${byCsvEmail.size} emails únicos. Notion de pruebas: ${testPages.length} páginas.`,
    '',
    `- A. Coincide exacto: ${audit.exact.length}`,
    `- B. Existe con diferencias: ${audit.different.length}`,
    `- C. Emails duplicados en CSV: ${duplicateEmails.length}`,
    `- D. CSV autorizado/cargable no encontrado: ${audit.missing.length}`,
    `- E. Ticketopolis en Notion no presente en CSV: ${notionOnly.length}`,
    `- F. Casos especiales observados: ${audit.special.length}`,
    '',
    '## B. Diferencias',
    '',
    '| Folio | Nombre | Diferencias |',
    '|---|---|---|',
    ...audit.different.map(
      (item) =>
        `| ${item.folio} | ${mdEscape(`${item.row['Nombre(s):']} ${item.row['Apellidos:']}`)} | ${mdEscape(
          item.differences.map((d) => `${d.field}: CSV="${d.csv}" / Notion="${d.notion}"`).join('; ')
        )} |`
    ),
    '',
    '## C. Duplicados de email',
    '',
    '| Email | Folios CSV | Páginas Notion encontradas |',
    '|---|---|---|',
    ...duplicateEmails.map(
      (item) => `| ${item.email} | ${item.folios.join(', ')} | ${item.notionPageIds.length} (${item.notionPageIds.join(', ')}) |`
    ),
    '',
    '## D. En CSV pero no en Notion',
    '',
    '| Folio | Nombre | Email | WhatsApp |',
    '|---|---|---|---|',
    ...audit.missing.map(
      (item) =>
        `| ${item.folio} | ${mdEscape(`${item.row['Nombre(s):']} ${item.row['Apellidos:']}`)} | ${item.row['Correo electrónico:']} | ${item.row['Whatsapp:']} |`
    ),
    '',
    '## E. En Notion Ticketopolis pero no en CSV',
    '',
    '| Nombre | Email | WhatsApp | Page ID |',
    '|---|---|---|---|',
    ...notionOnly.map((item) => `| ${mdEscape(item.nombre)} | ${item.email} | ${item.whatsapp} | ${item.id} |`),
    '',
    '## F. Casos especiales',
    '',
    '| Folio | Estatus | Título | Resultado |',
    '|---|---|---|---|',
    ...audit.special.map(
      (item) =>
        `| ${item.folio} | ${item.row['Estatus:']} | ${mdEscape(item.row['Título:'])} | ${item.kind}${
          item.pageId ? `; página ${item.pageId}` : ''
        } |`
    ),
    '',
    'Nota: los emails placeholder de pruebas se ignoraron como discrepancia, según el contrato de auditoría.',
  ].join('\n');
  const reportPath = path.join(OUT_DIR, 'auditoria-ticketopolis-vs-pruebas-01sep.md');
  fs.writeFileSync(reportPath, report);

  console.log(
    JSON.stringify(
      {
        audit: {
          exact: audit.exact.length,
          different: audit.different.length,
          duplicateEmails: duplicateEmails.length,
          missing: audit.missing.length,
          notionOnly: notionOnly.length,
          special: audit.special.length,
        },
        preview: {
          pages: preview.length,
          create: preview.filter((item) => item.action === 'create').length,
          existingReview: preview.filter((item) => item.action === 'existing-review').length,
          existingExact: preview.filter(
            (item) => item.action === 'existing-review' && item.existingDifferences.length === 0
          ).length,
          existingWithDifferences: preview.filter(
            (item) => item.action === 'existing-review' && item.existingDifferences.length > 0
          ).length,
          existingFillOnly: preview.filter(
            (item) =>
              item.action === 'existing-review' &&
              item.fullDifferences.fill.length > 0 &&
              item.fullDifferences.conflict.length === 0
          ).length,
          existingWithConflicts: preview.filter(
            (item) => item.action === 'existing-review' && item.fullDifferences.conflict.length > 0
          ).length,
          validationErrors: preview.filter((item) => item.validationErrors.length).length,
          excluded: excluded.length,
        },
        reportPath,
        previewPath,
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
