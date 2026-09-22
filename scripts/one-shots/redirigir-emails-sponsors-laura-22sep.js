// scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js
//
// Solo Categoria=Sponsor → adler.calvillo@platica.mx.
// No toca asistentes. Backup JSON para restaurar.
//
//   node scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js --dry-run
//   node scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js --aplicar
//   node scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js --restaurar tests/_emails-sponsors-backup-XXXX.json

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { notionFetch } = require('../../src/utils/notion-client');

const DATA_SOURCE_ID = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
const EMAIL_SPONSOR = 'adler.calvillo@platica.mx';

const MODE = (() => {
  if (process.argv.includes('--aplicar')) return 'aplicar';
  if (process.argv.includes('--restaurar')) return 'restaurar';
  return 'dry-run';
})();

function texto(prop) {
  return prop?.title?.[0]?.plain_text || prop?.rich_text?.[0]?.plain_text || '';
}

function empresa(prop) {
  return prop?.rich_text?.[0]?.plain_text || '';
}

async function querySponsors() {
  const rows = [];
  let cursor;
  do {
    const body = {
      filter: { property: 'Categoria', select: { equals: 'Sponsor' } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    rows.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return rows;
}

function mapPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    nombre: texto(p.Nombre),
    empresa: empresa(p.Empresa),
    email: p.Email?.email || null,
  };
}

async function patchEmail(pageId, email) {
  return notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { Email: { email } } }),
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function restaurar(backupPath) {
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const rows = backup.contactos || backup.results || [];
  console.log(`Restaurando ${rows.length} correos de sponsors desde ${backupPath}`);
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    if (!r.oldEmail) {
      console.log(`  SKIP  ${r.empresa || r.nombre} (no había email original)`);
      continue;
    }
    try {
      await patchEmail(r.id, r.oldEmail);
      ok += 1;
      console.log(`  OK    ${r.empresa || r.nombre}: → ${r.oldEmail}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL  ${r.empresa || r.nombre}: ${err.message}`);
    }
    await sleep(350);
  }
  console.log(`Listo. ok=${ok} fail=${fail}`);
}

async function main() {
  if (!DATA_SOURCE_ID) throw new Error('Falta NOTION_CONTACTOS_DATA_SOURCE_ID');

  if (MODE === 'restaurar') {
    const idx = process.argv.indexOf('--restaurar');
    const backupPath = process.argv[idx + 1];
    if (!backupPath) throw new Error('Uso: --restaurar <ruta-al-backup.json>');
    await restaurar(path.resolve(backupPath));
    return;
  }

  const pages = await querySponsors();
  const contactos = pages.map(mapPage);
  console.log(`Sponsors: ${contactos.length}. Destino: ${EMAIL_SPONSOR}. Modo: ${MODE}`);

  if (MODE === 'dry-run') {
    for (const c of contactos) {
      const mark = c.email === EMAIL_SPONSOR ? 'SKIP' : 'SET ';
      console.log(`  ${mark} ${c.empresa || c.nombre}: ${c.email || '(vacío)'} → ${EMAIL_SPONSOR}`);
    }
    console.log('\nDry-run listo. Corre con --aplicar para escribir.');
    return;
  }

  const ts = Date.now();
  const backupPath = path.resolve(`tests/_emails-sponsors-backup-${ts}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        target: EMAIL_SPONSOR,
        contactos: contactos.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          empresa: c.empresa,
          oldEmail: c.email,
        })),
      },
      null,
      2
    )
  );
  console.log(`Backup: ${backupPath}`);

  const results = [];
  for (const c of contactos) {
    const entry = {
      id: c.id,
      nombre: c.nombre,
      empresa: c.empresa,
      oldEmail: c.email,
      ok: false,
      skipped: false,
    };
    if (c.email === EMAIL_SPONSOR) {
      entry.ok = true;
      entry.skipped = true;
      results.push(entry);
      console.log(`  SKIP  ${c.empresa || c.nombre}`);
      continue;
    }
    try {
      await patchEmail(c.id, EMAIL_SPONSOR);
      entry.ok = true;
      console.log(`  OK    ${c.empresa || c.nombre}: ${c.email} → ${EMAIL_SPONSOR}`);
    } catch (err) {
      entry.error = err.message;
      console.error(`  FAIL  ${c.empresa || c.nombre}: ${err.message}`);
    }
    results.push(entry);
    await sleep(350);
  }

  const reportPath = path.resolve(`tests/_emails-sponsors-report-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ backupPath, results }, null, 2));
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nListo. ok=${results.filter((r) => r.ok).length} fail=${fail}`);
  console.log(`Restaurar: node scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js --restaurar ${backupPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
