// tests/disponibilidad.local-smoke.js
// Smoke local SIN Notion / Coolify: Caso 4 (400), 4b (503), 4c (bloques).
// No sustituye los casos 1–3 / 5–7 de tests-disponibilidad.md (post-deploy).

process.env.NOTION_CITAS_DATA_SOURCE_ID =
  process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake-for-local-smoke';

const citas = require('../src/services/citas.service');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  let fallos = 0;

  // --- Caso 4b: 503 si falta horario para la fecha ---
  delete process.env.CITAS_HORA_INICIO_2026_10_07;
  delete process.env.CITAS_HORA_FIN_2026_10_07;
  process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
  try {
    await citas.obtenerDisponibilidadSponsor({
      sponsorPageId: '00000000-0000-0000-0000-000000000000',
      fecha: '2026-10-07',
    });
    console.log('❌ 503 esperado cuando falta horario — no lanzó');
    fallos += 1;
  } catch (err) {
    if (err.status === 503 && /CITAS_HORA_INICIO_2026_10_07/.test(err.message)) {
      console.log('✅ Caso 4b — 503 fail-fast sin horario');
    } else {
      console.log('❌ Caso 4b inesperado:', err.status, err.message);
      fallos += 1;
    }
  }

  // --- Caso 4: 400 fecha fuera del evento ---
  process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
  process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
  try {
    await citas.obtenerDisponibilidadSponsor({
      sponsorPageId: '00000000-0000-0000-0000-000000000000',
      fecha: '2026-12-25',
    });
    console.log('❌ 400 esperado para fecha fuera — no lanzó');
    fallos += 1;
  } catch (err) {
    if (err.status === 400 && /2026-10-07/.test(err.message)) {
      console.log('✅ Caso 4 — 400 fecha fuera del evento');
    } else {
      console.log('❌ Caso 4 inesperado:', err.status, err.message);
      fallos += 1;
    }
  }

  // --- Caso 4c: bloques reales del service ---
  process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
  process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
  process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
  process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';

  try {
    const mie = citas.generarBloquesParaFecha('2026-10-07');
    assert(mie[0] === '2026-10-07T10:30:00-06:00', `primer mié = ${mie[0]}`);
    assert(mie[mie.length - 1] === '2026-10-07T18:30:00-06:00', `último mié = ${mie[mie.length - 1]}`);
    assert(!mie.includes('2026-10-07T19:00:00-06:00'), '19:00 no debe aparecer');
    assert(mie.length === 17, `mié count ${mie.length} (esperado 17)`);
    console.log('✅ Caso 4c — miércoles 10:30→18:30 (17 slots)');
  } catch (e) {
    console.log('❌ Caso 4c miércoles:', e.message);
    fallos += 1;
  }

  try {
    const jue = citas.generarBloquesParaFecha('2026-10-08');
    assert(jue[0] === '2026-10-08T09:00:00-06:00', `primer jue = ${jue[0]}`);
    assert(jue[jue.length - 1] === '2026-10-08T17:30:00-06:00', `último jue = ${jue[jue.length - 1]}`);
    assert(jue.length === 18, `jue count ${jue.length} (esperado 18)`);
    console.log('✅ Caso 4c — jueves 09:00→17:30 (18 slots)');
  } catch (e) {
    console.log('❌ Caso 4c jueves:', e.message);
    fallos += 1;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s)`);
    process.exit(1);
  }
  console.log('\n=== Smoke local OK (4 / 4b / 4c). Notion 1–3 y 5–7 → post-Coolify ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
