#!/usr/bin/env node
/**
 * Solo lectura: inventario y muestreo de vistas de Contactos en Laura.
 * No escribe Notion. No toca pruebas.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.NOTION_API_KEY_LAURA;
const DS = '3b162dda-199a-8029-8d58-000b6d1fed37';
const DB = '3b162dda-199a-80a5-831e-efa14b9748bf';
const VERSION_VIEWS = '2026-03-11';
const VERSION_DS = '2025-09-03';

const EXPECTED = [
  'Default view',
  'Asistentes',
  'VIP',
  'Asistentes Ticketópolis 2026',
  'Enriquecimiento (Exa)',
  'Legacy pre-2026',
  'Sponsors',
  'Board — Sponsors por Faltantes',
  'Speakers',
  'Aliados',
  'Prensa',
  'Comite/Team',
  'Dados de Baja',
  'Checklist Pendiente',
  'Prospección (Agente 3)',
];

const KEY_PROPS = [
  'Tamaño de Negocio',
  'Incluye Entrada Evento',
  'Ticket / Tipo Asistencia',
  'Es VIP',
  'Es Speaker',
  'Citas Confirmadas (Count)',
  'Citas Faltantes',
  'Rango Faltantes',
  'Citas Minimas Prometidas',
  'Citas (relacional)',
  'Categoria',
  'Formato Registro',
];

function txt(p) {
  if (!p) return '';
  if (p.type === 'title' || p.type === 'rich_text') {
    return (p[p.type] || []).map((x) => x.plain_text || '').join('');
  }
  if (p.type === 'select') return p.select?.name || '';
  if (p.type === 'multi_select') return (p.multi_select || []).map((x) => x.name).join(', ');
  if (p.type === 'checkbox') return p.checkbox ? 'true' : 'false';
  if (p.type === 'number') return p.number == null ? '' : String(p.number);
  if (p.type === 'formula') {
    const f = p.formula || {};
    if (f.type === 'number') return f.number == null ? '' : String(f.number);
    if (f.type === 'string') return f.string || '';
    if (f.type === 'boolean') return f.boolean == null ? '' : String(f.boolean);
    if (f.type === 'date') return f.date?.start || '';
    return JSON.stringify(f);
  }
  if (p.type === 'rollup') {
    const r = p.rollup || {};
    if (r.type === 'number') return r.number == null ? '' : String(r.number);
    if (r.type === 'array') return `[${(r.array || []).length}]`;
    return JSON.stringify(r);
  }
  if (p.type === 'relation') return `rel:${(p.relation || []).length}`;
  if (p.type === 'email') return p.email || '';
  return p.type || '';
}

async function notion(version, method, apiPath, body) {
  const r = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': version,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(d.message || JSON.stringify(d));
    err.status = r.status;
    err.notion = d;
    throw err;
  }
  return d;
}

async function listAllViews() {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ database_id: DB, page_size: '100' });
    if (cursor) q.set('start_cursor', cursor);
    const d = await notion(VERSION_VIEWS, 'GET', `/views?${q}`);
    out.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return out;
}

async function queryAll() {
  const pages = [];
  let cursor;
  do {
    const d = await notion(VERSION_DS, 'POST', `/data_sources/${DS}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return pages;
}

function visibleNames(view, idToName) {
  const cfg = view.configuration || {};
  const props = cfg.properties || cfg.table?.properties || [];
  const names = [];
  for (const p of props) {
    const vis = p.visible !== false;
    if (!vis) continue;
    const id = p.property_id || p.id;
    names.push(idToName.get(id) || id);
  }
  return names;
}

function summarizeFilter(node, depth = 0) {
  if (!node) return null;
  if (Array.isArray(node.and)) return { and: node.and.map((x) => summarizeFilter(x, depth + 1)) };
  if (Array.isArray(node.or)) return { or: node.or.map((x) => summarizeFilter(x, depth + 1)) };
  const { property, ...rest } = node;
  return { property, ...rest };
}

function hasFilterOn(filter, propName) {
  const s = JSON.stringify(filter || {});
  return s.includes(`"${propName}"`);
}

(async () => {
  if (!TOKEN) throw new Error('Falta NOTION_API_KEY_LAURA');

  const ds = await notion(VERSION_DS, 'GET', `/data_sources/${DS}`);
  const props = ds.properties || {};
  const idToName = new Map();
  const schema = {};
  for (const [name, p] of Object.entries(props)) {
    idToName.set(p.id, name);
    schema[name] = {
      type: p.type,
      options: (p.select?.options || p.multi_select?.options || []).map((o) => o.name),
      formula: p.formula?.expression || undefined,
    };
  }

  const refs = await listAllViews();
  const views = [];
  for (const ref of refs) {
    const v = await notion(VERSION_VIEWS, 'GET', `/views/${ref.id}`);
    views.push(v);
    await new Promise((r) => setTimeout(r, 120));
  }

  const pages = await queryAll();
  const rows = pages.map((p) => {
    const pr = p.properties || {};
    return {
      id: p.id,
      nombre: txt(pr.Nombre),
      categoria: txt(pr.Categoria),
      ticket: txt(pr['Ticket / Tipo Asistencia']),
      tamano: txt(pr['Tamaño de Negocio']),
      tamanoType: pr['Tamaño de Negocio']?.type,
      incluye: txt(pr['Incluye Entrada Evento']),
      incluyeType: pr['Incluye Entrada Evento']?.type,
      esVip: txt(pr['Es VIP']),
      esSpeaker: txt(pr['Es Speaker']),
      formato: txt(pr['Formato Registro']),
      citasMin: txt(pr['Citas Minimas Prometidas']),
      citasCount: txt(pr['Citas Confirmadas (Count)']),
      citasCountType: pr['Citas Confirmadas (Count)']?.type,
      citasCountRaw: pr['Citas Confirmadas (Count)'],
      citasFalt: txt(pr['Citas Faltantes']),
      citasFaltRaw: pr['Citas Faltantes'],
      rango: txt(pr['Rango Faltantes']),
      rangoRaw: pr['Rango Faltantes'],
      rel: txt(pr['Citas (relacional)']),
    };
  });

  async function queryViewFilter(filter) {
    if (!filter) return { count: rows.length, sample: rows.slice(0, 8) };
    const pages2 = [];
    let cursor;
    try {
      do {
        const d = await notion(VERSION_DS, 'POST', `/data_sources/${DS}/query`, {
          page_size: 100,
          filter,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        pages2.push(...(d.results || []));
        cursor = d.has_more ? d.next_cursor : null;
      } while (cursor);
    } catch (e) {
      return { error: e.message, status: e.status, notion: e.notion, count: 0, sample: [] };
    }
    const mapped = pages2.map((p) => {
      const pr = p.properties || {};
      return {
        id: p.id,
        nombre: txt(pr.Nombre),
        categoria: txt(pr.Categoria),
        ticket: txt(pr['Ticket / Tipo Asistencia']),
        tamano: txt(pr['Tamaño de Negocio']),
        incluye: txt(pr['Incluye Entrada Evento']),
        esVip: txt(pr['Es VIP']),
        esSpeaker: txt(pr['Es Speaker']),
        formato: txt(pr['Formato Registro']),
        citasMin: txt(pr['Citas Minimas Prometidas']),
        citasCount: txt(pr['Citas Confirmadas (Count)']),
        citasFalt: txt(pr['Citas Faltantes']),
        rango: txt(pr['Rango Faltantes']),
      };
    });
    return { count: mapped.length, sample: mapped.slice(0, 12) };
  }

  const viewReports = [];
  for (const v of views) {
    const names = visibleNames(v, idToName);
    const q = await queryViewFilter(v.filter);
    viewReports.push({
      id: v.id,
      name: v.name,
      type: v.type,
      filter: summarizeFilter(v.filter),
      filterOnTamano: hasFilterOn(v.filter, 'Tamaño de Negocio'),
      filterOnIncluye: hasFilterOn(v.filter, 'Incluye Entrada Evento'),
      filterOnTicket: hasFilterOn(v.filter, 'Ticket / Tipo Asistencia'),
      visible: names,
      query: q,
    });
    await new Promise((r) => setTimeout(r, 80));
  }

  const names = viewReports.map((v) => v.name);
  const missingExpected = EXPECTED.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !EXPECTED.includes(n));

  const speakersTicket = rows.filter((r) => r.ticket === 'Speaker');
  const prensa = rows.filter((r) => r.categoria === 'Prensa');
  const sponsors = rows.filter((r) => r.categoria === 'Sponsor');
  const vipCheckbox = rows.filter((r) => r.esVip === 'true');
  const presencialVip = rows.filter((r) => r.ticket === 'Presencial VIP');

  const formulaHealth = sponsors.map((s) => {
    const min = s.citasMin === '' ? null : Number(s.citasMin);
    const count = s.citasCount === '' ? null : Number(s.citasCount);
    const falt = s.citasFalt === '' ? null : Number(s.citasFalt);
    let expectedFalt = null;
    if (min != null && !Number.isNaN(min) && count != null && !Number.isNaN(count)) {
      expectedFalt = min - count;
    }
    return {
      nombre: s.nombre,
      citasMin: s.citasMin,
      citasCount: s.citasCount,
      citasFalt: s.citasFalt,
      rango: s.rango,
      rel: s.rel,
      coherent: expectedFalt == null ? null : expectedFalt === falt,
      countType: s.citasCountType,
      countError: s.citasCountRaw?.formula?.type === 'number' ? null : s.citasCountRaw?.formula,
      faltError: s.citasFaltRaw?.formula,
      rangoError: s.rangoRaw?.formula,
    };
  });

  const report = {
    executedAt: new Date().toISOString(),
    totalPages: pages.length,
    schema: Object.fromEntries(KEY_PROPS.map((n) => [n, schema[n] || 'MISSING'])),
    ticketOptions: schema['Ticket / Tipo Asistencia']?.options,
    incluyeOptions: schema['Incluye Entrada Evento']?.options,
    inventory: { expected: EXPECTED.length, found: names.length, names, missingExpected, extra },
    speakersTicket,
    prensa,
    vipCheckboxCount: vipCheckbox.length,
    presencialVipCount: presencialVip.length,
    formulaHealth,
    views: viewReports,
  };

  const outDir = path.join(__dirname, '../../.local-backups');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'verificar-vistas-laura-02sep.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    totalPages: report.totalPages,
    schema: report.schema,
    inventory: report.inventory,
    speakersTicket: speakersTicket.map((s) => ({ nombre: s.nombre, ticket: s.ticket, categoria: s.categoria, tamano: s.tamano })),
    prensa: prensa.map((s) => ({ nombre: s.nombre, categoria: s.categoria })),
    vipCheckboxCount: vipCheckbox.length,
    presencialVipCount: presencialVip.length,
    formulaHealth: formulaHealth.map((f) => ({
      nombre: f.nombre,
      citasMin: f.citasMin,
      citasCount: f.citasCount,
      citasFalt: f.citasFalt,
      rango: f.rango,
      coherent: f.coherent,
      rel: f.rel,
    })),
    views: viewReports.map((v) => ({
      name: v.name,
      type: v.type,
      filter: v.filter,
      filterOnTamano: v.filterOnTamano,
      filterOnIncluye: v.filterOnIncluye,
      filterOnTicket: v.filterOnTicket,
      visibleKey: v.visible.filter((n) => KEY_PROPS.includes(n) || n === 'Nombre' || n === 'Nivel de Patrocinio'),
      visibleCount: v.visible.length,
      queryError: v.query.error || null,
      queryCount: v.query.count,
      sample: (v.query.sample || []).slice(0, 5).map((s) => ({
        nombre: s.nombre,
        categoria: s.categoria,
        ticket: s.ticket,
        tamano: s.tamano,
        incluye: s.incluye,
        esVip: s.esVip,
        esSpeaker: s.esSpeaker,
        rango: s.rango,
        citasFalt: s.citasFalt,
        citasCount: s.citasCount,
      })),
    })),
  }, null, 2));
})().catch((e) => {
  console.error(e.message);
  if (e.notion) console.error(JSON.stringify(e.notion));
  process.exit(1);
});
