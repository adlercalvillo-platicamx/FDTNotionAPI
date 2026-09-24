#!/usr/bin/env node
/**
 * Solo lectura. Snapshot de schema + todas las vistas de Contactos y Citas
 * de Laura. JSON completo (gitignore) + markdown en la raíz.
 *
 *   node scripts/one-shots/snapshot-vistas-schema-laura-23sep.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DS_VER = '2025-09-03';
const VIEWS_VER = '2026-03-11';
const RAIZ = path.join(__dirname, '..', '..');
const STAMP = '23sep';
const JSON_OUT = path.join(RAIZ, '.local-backups', `schema-vistas-laura-${STAMP}.json`);
const MD_OUT = path.join(RAIZ, `snapshot-vistas-campos-laura-${STAMP}.md`);

function token() {
  return process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;
}

async function notion(tok, version, method, apiPath) {
  for (let intento = 0; ; intento += 1) {
    const r = await fetch(`https://api.notion.com/v1${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
    });
    if (r.status === 429 && intento < 6) {
      const espera = Number(r.headers.get('Retry-After') || 1) * 1000;
      await new Promise((x) => setTimeout(x, Math.min(espera || 800 * 2 ** intento, 12000)));
      continue;
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${apiPath} -> ${r.status} ${d.message || ''}`);
    return d;
  }
}

function mapaIdNombre(ds) {
  const m = new Map();
  for (const [nombre, prop] of Object.entries(ds.properties || {})) {
    m.set(decodeURIComponent(prop.id), nombre);
  }
  m.set('title', 'Nombre');
  return m;
}

function nombreDe(mapa, id) {
  if (!id || typeof id !== 'string') return null;
  return mapa.get(id) || mapa.get(decodeURIComponent(id)) || null;
}

function legible(node, mapa) {
  if (Array.isArray(node)) return node.map((x) => legible(x, mapa));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'property' || k === 'property_id') && typeof v === 'string') {
      out[k] = nombreDe(mapa, v) || v;
    } else {
      out[k] = legible(v, mapa);
    }
  }
  return out;
}

function resumirFiltro(filtro, mapa) {
  if (!filtro) return '(sin filtro)';
  const f = legible(filtro, mapa);
  const parte = (n) => {
    if (!n || typeof n !== 'object') return String(n);
    if (n.and) return `(${n.and.map(parte).join(' AND ')})`;
    if (n.or) return `(${n.or.map(parte).join(' OR ')})`;
    const prop = n.property;
    const cond = Object.entries(n).find(([k]) => k !== 'property');
    if (!cond) return String(prop);
    const [, valor] = cond;
    const [op, val] = Object.entries(valor || {})[0] || [];
    return `${prop} ${op} ${JSON.stringify(val)}`;
  };
  try {
    return parte(f);
  } catch {
    return JSON.stringify(f);
  }
}

function resumirSorts(sorts, mapa) {
  if (!sorts || !sorts.length) return '(sin sort)';
  return sorts
    .map((s) => {
      const prop = nombreDe(mapa, s.property || s.property_id) || s.timestamp || s.property || '?';
      return `${prop} ${s.direction || ''}`.trim();
    })
    .join(', ');
}

function resumirGroup(group, mapa) {
  if (!group) return '(sin group_by)';
  const id = group.property_name || group.property || group.property_id;
  const nombre =
    (typeof id === 'string' && (nombreDe(mapa, id) || id)) || JSON.stringify(group);
  const dir = group.sort && (group.sort.type || group.sort.direction || group.sort);
  const extra = [dir, group.hide_empty_groups ? 'hide_empty' : null].filter(Boolean);
  return extra.length ? `${nombre} (${extra.join(', ')})` : String(nombre);
}

function detalleCampo(nombre, def) {
  const t = def.type;
  const extra = def[t] || {};
  const partes = [t];
  if (t === 'select' || t === 'multi_select') {
    partes.push((extra.options || []).map((o) => o.name).join(', '));
  }
  if (t === 'status') {
    const ops = (extra.options || []).map((o) => o.name);
    partes.push(ops.join(', '));
  }
  if (t === 'formula') partes.push(extra.expression || '');
  if (t === 'relation') {
    partes.push(`ds=${extra.data_source_id || extra.database_id || ''}`);
    if (extra.dual_property) partes.push(`dual=${extra.dual_property.name || extra.dual_property.id}`);
  }
  if (t === 'rollup') {
    partes.push(
      `${extra.relation_property_name || extra.relation_property_id} → ${extra.rollup_property_name || extra.rollup_property_id} (${extra.function})`
    );
  }
  if (t === 'number' && extra.format) partes.push(extra.format);
  return partes.filter(Boolean).join(' · ');
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function listarVistas(tok, dsId) {
  const refs = [];
  let cursor;
  do {
    const q = new URLSearchParams({ data_source_id: dsId, page_size: '100' });
    if (cursor) q.set('start_cursor', cursor);
    const d = await notion(tok, VIEWS_VER, 'GET', `/views?${q}`);
    refs.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  const vistas = [];
  for (const ref of refs) {
    const v = await notion(tok, VIEWS_VER, 'GET', `/views/${ref.id}`);
    vistas.push(v);
    await new Promise((x) => setTimeout(x, 120));
  }
  vistas.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  return vistas;
}

function seccionVistas(titulo, vistas, mapa) {
  const lineas = [`## ${titulo}: ${vistas.length} vistas`, ''];
  for (const v of vistas) {
    const props = v.configuration?.properties || [];
    const visibles = props
      .filter((p) => p.visible !== false)
      .map((p) => nombreDe(mapa, p.property || p.property_id) || p.property_name || '(huérfana)');
    const ocultas = props.filter((p) => p.visible === false).length;
    lineas.push(`### ${mdEscape(v.name)} \`${v.type}\``);
    lineas.push('');
    lineas.push(`- id: \`${v.id}\``);
    if (v.database_id) lineas.push(`- database_id: \`${v.database_id}\``);
    lineas.push(`- filtro: \`${mdEscape(resumirFiltro(v.filter, mapa))}\``);
    lineas.push(`- sort: ${mdEscape(resumirSorts(v.sorts || v.configuration?.sorts, mapa))}`);
    lineas.push(`- group_by: ${mdEscape(resumirGroup(v.configuration?.group_by || v.group_by, mapa))}`);
    lineas.push(`- columnas visibles (${visibles.length}, ${ocultas} ocultas): ${visibles.map(mdEscape).join(' · ')}`);
    lineas.push('');
  }
  return lineas.join('\n');
}

function seccionCampos(titulo, ds) {
  const lineas = [`## ${titulo}: ${Object.keys(ds.properties || {}).length} campos`, ''];
  lineas.push('| Campo | Detalle |');
  lineas.push('|---|---|');
  const nombres = Object.keys(ds.properties || {}).sort((a, b) => a.localeCompare(b, 'es'));
  for (const nombre of nombres) {
    lineas.push(`| ${mdEscape(nombre)} | ${mdEscape(detalleCampo(nombre, ds.properties[nombre]))} |`);
  }
  lineas.push('');
  return lineas.join('\n');
}

async function main() {
  const tok = token();
  if (!tok) throw new Error('Falta NOTION_API_KEY_LAURA o NOTION_API_KEY');
  const contactosId = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
  const citasId = process.env.NOTION_CITAS_DATA_SOURCE_ID;
  if (!String(contactosId).startsWith('3b162dda') || !String(citasId).startsWith('3b162dda')) {
    throw new Error('Los data sources del .env no son los de Laura (prefijo 3b162dda). Aborto.');
  }

  const [schemaContactos, schemaCitas] = await Promise.all([
    notion(tok, DS_VER, 'GET', `/data_sources/${contactosId}`),
    notion(tok, DS_VER, 'GET', `/data_sources/${citasId}`),
  ]);

  console.log('listando vistas Contactos…');
  const vistasContactos = await listarVistas(tok, contactosId);
  console.log(`  ${vistasContactos.length}`);
  console.log('listando vistas Citas…');
  const vistasCitas = await listarVistas(tok, citasId);
  console.log(`  ${vistasCitas.length}`);

  const generadoEn = new Date().toISOString();
  const payload = {
    generadoEn,
    aviso: 'Solo lectura. Schema + vistas de producción Laura. No incluye filas.',
    dataSources: { contactos: contactosId, citas: citasId },
    schema: { contactos: schemaContactos, citas: schemaCitas },
    vistas: { contactos: vistasContactos, citas: vistasCitas },
  };

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');

  const md = [
    `# Snapshot vistas y campos — Notion Laura (${STAMP} 2026)`,
    '',
    'Handoff de estructura, no de filas. Código/API gana si esto se desactualiza.',
    `Generado ${generadoEn} (solo GET). Contactos \`${contactosId}\`, Citas \`${citasId}\`.`,
    '',
    'JSON completo (payload de Notion, gitignore): `.local-backups/schema-vistas-laura-23sep.json`.',
    'Las filas siguen en el gzip diario de R2. Este archivo cubre **pestañas y columnas**.',
    'Recrear vistas por API es posible; fórmulas que cruzan relaciones a veces no.',
    '',
    seccionCampos('Contactos FDT', schemaContactos),
    seccionCampos('Citas FDT', schemaCitas),
    seccionVistas('Vistas de Contactos', vistasContactos, mapaIdNombre(schemaContactos)),
    seccionVistas('Vistas de Citas', vistasCitas, mapaIdNombre(schemaCitas)),
  ].join('\n');

  fs.writeFileSync(MD_OUT, md, 'utf8');
  console.log(`JSON ${JSON_OUT}`);
  console.log(`MD   ${MD_OUT}`);
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
