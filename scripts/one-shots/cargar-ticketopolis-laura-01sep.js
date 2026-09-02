#!/usr/bin/env node
/**
 * Carga aprobada 1-sep-2026:
 * - crea 44 contactos nuevos;
 * - llena campos vacíos de 51 existentes;
 * - permite corregir solo Formato Registro y Ticket / Tipo Asistencia;
 * - Magali Parra permanece Sponsor y solo recibe datos transaccionales.
 *
 * Dry-run:   node scripts/one-shots/cargar-ticketopolis-laura-01sep.js
 * Real:      node scripts/one-shots/cargar-ticketopolis-laura-01sep.js --confirmar
 *
 * One-shot. No reejecutar después de una corrida real exitosa.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CONFIRMAR = process.argv.includes('--confirmar');
const VERSION = '2025-09-03';
const DATA_SOURCE_ID = '3b162dda-199a-8029-8d58-000b6d1fed37';
const PREVIEW = path.join(__dirname, '..', '..', '.local-backups', 'preview-carga-laura-01sep.json');
const BACKUP_DIR = path.join(__dirname, '..', '..', '.local-backups');
const RESULT_PATH = path.join(BACKUP_DIR, 'resultado-carga-laura-01sep.json');
const TOKEN = process.env.NOTION_API_KEY_LAURA;
const MAGALI_FOLIO = 'C8F9A4';
const COMPLETAR_NORA = process.argv.includes('--completar-nora');
const CONFLICTOS_APROBADOS = new Set(['Formato Registro', 'Ticket / Tipo Asistencia']);
const TRANSACCIONALES_MAGALI = new Set([
  'Folio Reservacion',
  'Folio Boleto',
  'Estatus Ticketopolis',
  'Fecha Reservacion',
  'Vencimiento',
  'Fecha Autorizacion',
  'Codigo Promocion',
  'Importe Pagado',
  'Datos Facturacion',
  'Cantidad',
  'Caracteristicas',
  'Incluye Entrada Evento',
  'Boletos Individuales Incluidos',
  'Nombre Asistente 2',
  'Nombre Asistente 3',
  'Nombre Asistente 4',
  'Revendedor Empresa',
  'Revendedor Agente',
  'Revendedor Correo',
]);

if (!TOKEN) throw new Error('Falta NOTION_API_KEY_LAURA');
if (!fs.existsSync(PREVIEW)) throw new Error('Falta generar preview-carga-laura-01sep.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function notion(method, apiPath, body, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
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
    if (response.ok) return data;
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(Number(response.headers.get('retry-after') || 1) * 1000);
      continue;
    }
    throw new Error(`${method} ${apiPath}: ${response.status} ${data.message}`);
  }
}

async function queryAll() {
  const pages = [];
  let cursor;
  do {
    const data = await notion('POST', `/data_sources/${DATA_SOURCE_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function titleFrom(properties) {
  return (properties.Nombre?.title || []).map((part) => part.text?.content || '').join('');
}

function existingPatch(item) {
  if (item.source.folio === MAGALI_FOLIO) {
    return Object.fromEntries(
      Object.entries(item.properties).filter(([name]) => TRANSACCIONALES_MAGALI.has(name))
    );
  }
  const allowed = new Set([
    ...(item.fullDifferences?.fill || []).map((difference) => difference.field),
    ...(item.fullDifferences?.conflict || [])
      .filter((difference) => CONFLICTOS_APROBADOS.has(difference.field))
      .map((difference) => difference.field),
  ]);
  return Object.fromEntries(
    Object.entries(item.properties).filter(([name]) => allowed.has(name))
  );
}

async function main() {
  const preview = JSON.parse(fs.readFileSync(PREVIEW, 'utf8'));
  if (COMPLETAR_NORA) {
    const item = preview.pages.find((page) => page.source.folio === 'F13446');
    if (!item || item.existingPageIds.length !== 1) {
      throw new Error('No se encontró una única página existente para Nora/F13446');
    }
    const allowed = new Set((item.fullDifferences?.fill || []).map((difference) => difference.field));
    const properties = Object.fromEntries(
      Object.entries(item.properties).filter(([name]) => allowed.has(name))
    );
    console.log(`Nora F13446: llenar ${Object.keys(properties).join(', ')}`);
    if (!CONFIRMAR) {
      console.log('DRY-RUN: no se escribió en Notion.');
      return;
    }
    const before = await notion('GET', `/pages/${item.existingPageIds[0]}`);
    const backupPath = path.join(BACKUP_DIR, `nora-pre-completar-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(before, null, 2));
    await notion('PATCH', `/pages/${item.existingPageIds[0]}`, { properties });
    const after = await notion('GET', `/pages/${item.existingPageIds[0]}`);
    const missing = Object.keys(properties).filter((name) => {
      const prop = after.properties[name];
      if (!prop) return true;
      const value = prop[prop.type];
      return value == null || value === '' || (Array.isArray(value) && value.length === 0);
    });
    if (missing.length) throw new Error(`Campos de Nora no verificados: ${missing.join(', ')}`);
    console.log(JSON.stringify({ updated: true, pageId: after.id, fields: Object.keys(properties).length, backupPath }, null, 2));
    return;
  }
  if (CONFIRMAR && fs.existsSync(RESULT_PATH)) {
    throw new Error('La carga principal ya tiene resultado; no se permite reejecutarla.');
  }
  if (preview.counts.create !== 44 || preview.counts.existingReview !== 51 || preview.counts.validationErrors !== 0) {
    throw new Error(`El preview cambió: ${JSON.stringify(preview.counts)}`);
  }
  const createItems = preview.pages.filter((item) => item.action === 'create');
  const updateItems = preview.pages.filter((item) => item.action === 'existing-review');
  if (updateItems.some((item) => item.existingPageIds.length !== 1)) {
    throw new Error('Hay match ambiguo en páginas existentes; se aborta.');
  }

  console.log(`Destino: Contactos FDT Laura (${DATA_SOURCE_ID})`);
  console.log(`Crear: ${createItems.length}; actualizar conservadoramente: ${updateItems.length}`);
  console.log(`Altas: ${createItems.map((item) => titleFrom(item.properties)).join(' | ')}`);
  if (!CONFIRMAR) {
    console.log('DRY-RUN: no se escribió en Notion.');
    return;
  }

  const before = await queryAll();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `laura-pre-carga-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), pages: before }, null, 2));
  console.log(`Backup pre-carga: ${backupPath}`);

  const created = [];
  const updated = [];
  for (const item of createItems) {
    const page = await notion('POST', '/pages', {
      parent: { data_source_id: DATA_SOURCE_ID },
      properties: item.properties,
    });
    created.push({ id: page.id, folio: item.source.folio, name: titleFrom(item.properties) });
    await sleep(360);
  }
  for (const item of updateItems) {
    const properties = existingPatch(item);
    await notion('PATCH', `/pages/${item.existingPageIds[0]}`, { properties });
    updated.push({
      id: item.existingPageIds[0],
      folio: item.source.folio,
      fields: Object.keys(properties),
      magaliSponsorPreservada: item.source.folio === MAGALI_FOLIO,
    });
    await sleep(360);
  }

  const after = await queryAll();
  if (after.length !== before.length + created.length) {
    throw new Error(`Conteo post-carga inesperado: antes=${before.length}, creadas=${created.length}, después=${after.length}`);
  }
  const byId = new Map(after.map((page) => [page.id, page]));
  const missingCreated = created.filter((item) => !byId.has(item.id));
  if (missingCreated.length) throw new Error(`No se releyeron ${missingCreated.length} altas creadas`);

  const result = {
    executedAt: new Date().toISOString(),
    dataSourceId: DATA_SOURCE_ID,
    beforeRows: before.length,
    afterRows: after.length,
    createdCount: created.length,
    updatedCount: updated.length,
    created,
    updated,
    sampleVerified: created.slice(0, 10).map((item) => ({
      id: item.id,
      folio: item.folio,
      name: item.name,
      foundAfterWrite: byId.has(item.id),
    })),
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    beforeRows: result.beforeRows,
    afterRows: result.afterRows,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    sampleVerified: result.sampleVerified.length,
    reportPath: RESULT_PATH,
  }, null, 2));
}

main().catch((error) => {
  console.error(`ERROR: ${error.stack || error.message}`);
  process.exit(1);
});
