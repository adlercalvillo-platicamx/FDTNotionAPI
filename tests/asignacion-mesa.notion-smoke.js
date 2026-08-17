// tests/asignacion-mesa.notion-smoke.js
//
// Verificación REAL contra Notion de pruebas (Citas nueva,
// data_source df93bc94-…). Calendar mockeado — no crea eventos Google.
//
//   node -r dotenv/config tests/asignacion-mesa.notion-smoke.js

const assert = require('assert');
const path = require('path');

// Workspace de pruebas (confirmado en contexto Adler 17-ago). Se fuerza
// ANTES de require de citas.service porque el ID se captura al cargar el módulo.
const CITAS_PRUEBAS_DS = 'df93bc94-26ee-42fc-92d7-a0ed3a8e1f68';
process.env.NOTION_CITAS_DATA_SOURCE_ID = CITAS_PRUEBAS_DS;

process.env.CITAS_FECHAS_EVENTO = process.env.CITAS_FECHAS_EVENTO || '2026-10-07,2026-10-08';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = process.env.CITAS_DURACION_BLOQUE_MINUTOS || '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';
process.env.CITAS_HORA_INICIO_2026_10_07 = process.env.CITAS_HORA_INICIO_2026_10_07 || '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = process.env.CITAS_HORA_FIN_2026_10_07 || '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = process.env.CITAS_HORA_INICIO_2026_10_08 || '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = process.env.CITAS_HORA_FIN_2026_10_08 || '18:00';

const calendarPath = path.resolve(__dirname, '../src/services/calendar-client.service.js');
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const bookingPath = path.resolve(__dirname, '../src/services/booking.service.js');
delete require.cache[calendarPath];
delete require.cache[citasPath];
delete require.cache[bookingPath];

require.cache[calendarPath] = {
  id: calendarPath,
  filename: calendarPath,
  loaded: true,
  exports: {
    async createEvent() {
      return { evento_id: `smoke-mesa-${Date.now()}` };
    },
    async cancelEvent() {
      return { ok: true };
    },
  },
};

const { notionFetch } = require('../src/utils/notion-client');
const { reservarCita } = require('../src/services/booking.service');

// Bloque poco usado para no chocar con Confirmadas de prueba viejas.
const INICIO = '2026-10-07T17:00:00-06:00';
const FIN = '2026-10-07T17:30:00-06:00';

// page_ids de Contactos (pruebas) — Daniela, Rodrigo, Magali, Zuleyma
const SPONSOR_A = '3b790fe2-7345-812a-a04c-df6cd3dae01b';
const SPONSOR_B = '3b790fe2-7345-8145-95ef-e7aac48114f3';
const ASISTENTE_A = '3b790fe2-7345-8164-bc7e-ec3c81a07486';
const ASISTENTE_B = '3b790fe2-7345-8176-bb46-d70de6d2a979';

function textoMesa(page) {
  const rt = page.properties?.['Mesa / Ubicacion']?.rich_text || [];
  return rt.map((t) => t.plain_text).join('');
}

async function archivar(pageId) {
  await notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

(async () => {
  if (!process.env.NOTION_API_KEY) {
    console.error('Falta NOTION_API_KEY — abortando.');
    process.exit(1);
  }

  const creadas = [];
  try {
    console.log(`\nSmoke mesa → data_source pruebas, bloque ${INICIO}`);
    const r1 = await reservarCita({
      sponsor_calendario_id: 'smoke-cal',
      sponsor_notion_id: SPONSOR_A,
      asistente_notion_id: ASISTENTE_A,
      inicio: INICIO,
      fin: FIN,
      request_id: `smoke-mesa-1-${Date.now()}`,
      titulo: 'SMOKE mesa auto 1',
    });
    creadas.push(r1.notion_page_id);
    console.log(`  r1 return.mesa=${r1.mesa} page=${r1.notion_page_id}`);

    const r2 = await reservarCita({
      sponsor_calendario_id: 'smoke-cal',
      sponsor_notion_id: SPONSOR_B,
      asistente_notion_id: ASISTENTE_B,
      inicio: INICIO,
      fin: FIN,
      request_id: `smoke-mesa-2-${Date.now()}`,
      titulo: 'SMOKE mesa auto 2',
    });
    creadas.push(r2.notion_page_id);
    console.log(`  r2 return.mesa=${r2.mesa} page=${r2.notion_page_id}`);

    assert.strictEqual(r1.mesa, 1, `primera esperaba 1, got ${r1.mesa}`);
    assert.strictEqual(r2.mesa, 2, `segunda esperaba 2, got ${r2.mesa}`);

    const p1 = await notionFetch(`/pages/${r1.notion_page_id}`);
    const p2 = await notionFetch(`/pages/${r2.notion_page_id}`);
    const m1 = textoMesa(p1);
    const m2 = textoMesa(p2);
    console.log(`  Notion Mesa/Ubicacion p1="${m1}" p2="${m2}"`);
    assert.strictEqual(m1, 'Mesa 1');
    assert.strictEqual(m2, 'Mesa 2');
    assert.strictEqual(p1.properties?.Estatus?.select?.name, 'Confirmada');
    assert.strictEqual(p2.properties?.Estatus?.select?.name, 'Confirmada');

    console.log('\n✅ Smoke Notion OK\n');
  } catch (err) {
    console.error('\n❌ Smoke Notion FALLÓ:', err.message);
    if (err.notion) console.error(JSON.stringify(err.notion, null, 2));
    process.exitCode = 1;
  } finally {
    for (const id of creadas) {
      try {
        await archivar(id);
        console.log(`  archivada ${id}`);
      } catch (e) {
        console.warn(`  no se pudo archivar ${id}: ${e.message}`);
      }
    }
  }
})();
