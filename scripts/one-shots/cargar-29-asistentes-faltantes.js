// scripts/one-shots/cargar-29-asistentes-faltantes.js
//
// ⚠️ ONE-SHOT YA EJECUTADO — 12 de agosto 2026.
// Qué hizo: cargó 29 asistentes reales faltantes a `Contactos (nueva)`
// (data_source_id 9f335308-da0e-4672-9744-c1dabcfb22aa), provenientes del
// CSV de Ticketópolis que no se habían importado en la carga original
// (solo se habían metido los que contestaron "Sí" a citas 1a1).
// NO volver a correr sin revisar: crearía duplicados. Usar --verificar
// solo para recontar, o revisar Notion antes de cualquier recarga.
//
// Fuente: mapeo_29_asistentes_faltantes.json
// Ver: INSTRUCCIONES_carga_29_asistentes_faltantes.md
//
// Uso (NO correr de nuevo sin revisar):
//   node scripts/one-shots/cargar-29-asistentes-faltantes.js
//   node scripts/one-shots/cargar-29-asistentes-faltantes.js --verificar

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { notionFetch } = require('../../src/utils/notion-client');

const DATA_SOURCE_ID = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
const JSON_PATH =
  process.argv.find((a) => a.endsWith('.json')) ||
  path.resolve('C:/Users/adler/Downloads/mapeo_29_asistentes_faltantes.json');

function rt(content) {
  return { rich_text: [{ text: { content: String(content) } }] };
}

function buildProperties(row) {
  const props = {
    Nombre: { title: [{ text: { content: row.nombre } }] },
    Categoria: { select: { name: 'Asistente' } },
  };

  if (row.empresa) props['Empresa'] = rt(row.empresa);
  if (row.email) props['Email'] = { email: row.email };
  if (row.whatsapp) props['WhatsApp'] = { phone_number: row.whatsapp };
  if (row.ciudad) props['Ciudad'] = rt(row.ciudad);
  if (row.puesto) props['Rol / Puesto'] = rt(row.puesto);
  if (row.ticket_tipo_asistencia) {
    props['Ticket / Tipo Asistencia'] = { select: { name: row.ticket_tipo_asistencia } };
  }
  if (row.giro_notion) props['Giro / Industria'] = { select: { name: row.giro_notion } };
  if (row.area_notion) props['Area'] = { select: { name: row.area_notion } };

  if (row.formato_registro === '2026' && row.etapa_de_negocio_2026) {
    props['Etapa de Negocio'] = { select: { name: row.etapa_de_negocio_2026 } };
  }
  if (row.formato_registro === 'Legacy pre-2026' && row.etapa_de_negocio_legacy) {
    props['Etapa de Negocio (Legacy)'] = { select: { name: row.etapa_de_negocio_legacy } };
  }

  if (Array.isArray(row.soluciones_notion) && row.soluciones_notion.length > 0) {
    props['Soluciones Buscadas'] = {
      multi_select: row.soluciones_notion.map((name) => ({ name })),
    };
  }

  // §4 — guion suelto = vacío
  const otra = row.otra_solucion_raw;
  if (otra && otra.trim() !== '-' && otra.trim() !== '') {
    props['Otra Solucion Buscada'] = rt(otra.trim());
  }

  // §2 — solo escribir 'No' explícito; null = no escribir la propiedad
  if (row.quiere_citas_1a1 === 'No') {
    props['Quiere Citas 1a1'] = { select: { name: 'No' } };
  }

  if (row.formato_registro) {
    props['Formato Registro'] = { select: { name: row.formato_registro } };
  }

  return props;
}

async function queryAllAsistentes() {
  const results = [];
  let cursor;
  do {
    const body = {
      filter: { property: 'Categoria', select: { equals: 'Asistente' } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function verificar() {
  const rows = await queryAllAsistentes();
  console.log(`\n=== Verificación §5 ===`);
  console.log(`Total Asistente: ${rows.length} (esperado 54)`);

  const quiere = { Sí: 0, No: 0, vacio: 0 };
  const expo = { nuevos_o_todos: 0 };
  let expoCount = 0;

  for (const page of rows) {
    const q = page.properties['Quiere Citas 1a1']?.select?.name;
    if (q === 'Sí') quiere['Sí'] += 1;
    else if (q === 'No') quiere.No += 1;
    else quiere.vacio += 1;

    const ticket = page.properties['Ticket / Tipo Asistencia']?.select?.name;
    if (ticket === 'Expo') expoCount += 1;
  }

  console.log(`Quiere Citas 1a1 — Sí: ${quiere['Sí']} (esperado 25), No: ${quiere.No} (esperado 2), vacío: ${quiere.vacio} (esperado 27)`);
  console.log(`Ticket Expo: ${expoCount} (esperado 8)`);

  const nombresRevisar = [
    'ELIZABETH SALAZAR HUERTA',
    'ULIL QUINTANILLA',
    'ANA CAROLINA SAENZ BARBA',
    'SHARON MEDINA',
  ];
  console.log('\nCasos a revisar a ojo:');
  for (const nombre of nombresRevisar) {
    const match = rows.find((r) => (r.properties.Nombre?.title?.[0]?.plain_text || '').toUpperCase() === nombre);
    if (!match) {
      console.log(`  - ${nombre}: NO ENCONTRADO`);
      continue;
    }
    const etapa = match.properties['Etapa de Negocio']?.select?.name
      || match.properties['Etapa de Negocio (Legacy)']?.select?.name
      || '(vacío)';
    const email = match.properties.Email?.email || '';
    console.log(`  - ${nombre}: etapa=${etapa}; email=${email}`);
  }
}

async function cargar() {
  if (!DATA_SOURCE_ID) throw new Error('Falta NOTION_CONTACTOS_DATA_SOURCE_ID');
  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!Array.isArray(rows) || rows.length !== 29) {
    throw new Error(`Se esperaban 29 registros, hay ${rows?.length}`);
  }

  console.log(`Cargando ${rows.length} asistentes desde ${JSON_PATH}`);
  console.log(`Data source: ${DATA_SOURCE_ID}`);

  let ok = 0;
  const errores = [];

  for (const row of rows) {
    try {
      const created = await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { type: 'data_source_id', data_source_id: DATA_SOURCE_ID },
          properties: buildProperties(row),
        }),
      });
      ok += 1;
      console.log(`  ✅ ${ok}/29 ${row.nombre} → ${created.id}`);
      // ritmo suave para no pegarle rate limit a Notion
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      errores.push({ nombre: row.nombre, email: row.email, error: err.message, notion: err.notion });
      console.error(`  ❌ ${row.nombre}: ${err.message}`);
      if (err.notion) console.error(JSON.stringify(err.notion, null, 2));
    }
  }

  console.log(`\nListo: ${ok} creados, ${errores.length} errores`);
  if (errores.length) {
    console.error(JSON.stringify(errores, null, 2));
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes('--verificar')) {
    await verificar();
    return;
  }
  await cargar();
  await verificar();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
