// Días permitidos por sponsor (CITAS_SPONSOR_FECHAS). Sin Notion.
//
//   node tests/sponsor-fechas.manual-test.js

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-sponsor-fechas';
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';

const PIK = '3df62dda-199a-81e1-bf0d-c64484844e02';
const OTRO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

delete process.env.CITAS_SPONSOR_FECHAS;

const citas = require('../src/services/citas.service');
const { validarDuracionYFecha, BookingError } = require('../src/services/booking.service');

function ok(nombre, fn) {
  try {
    fn();
    console.log(`  ok ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}: ${err.message}`);
    throw err;
  }
}

async function okAsync(nombre, fn) {
  try {
    await fn();
    console.log(`  ok ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}: ${err.message}`);
    throw err;
  }
}

console.log('\n=== CITAS_SPONSOR_FECHAS ===');

ok('sin env, todos los sponsors ven ambos días', () => {
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(PIK), ['2026-10-07', '2026-10-08']);
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(OTRO), ['2026-10-07', '2026-10-08']);
});

process.env.CITAS_SPONSOR_FECHAS = `${PIK}:2026-10-08`;

ok('Pikstudio solo el 8; el resto igual', () => {
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(PIK), ['2026-10-08']);
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(PIK.replace(/-/g, '')), ['2026-10-08']);
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(OTRO), ['2026-10-07', '2026-10-08']);
});

ok('id en env sin guiones también matchea', () => {
  process.env.CITAS_SPONSOR_FECHAS = `${PIK.replace(/-/g, '')}:2026-10-08`;
  assert.deepStrictEqual(citas.fechasPermitidasParaSponsor(PIK), ['2026-10-08']);
  process.env.CITAS_SPONSOR_FECHAS = `${PIK}:2026-10-08`;
});

ok('assertFechaPermitida: 8 ok, 7 lanza código propio', () => {
  citas.assertFechaPermitidaParaSponsor(PIK, '2026-10-08');
  try {
    citas.assertFechaPermitidaParaSponsor(PIK, '2026-10-07');
    throw new Error('debía lanzar');
  } catch (err) {
    assert.strictEqual(err.code, 'FECHA_NO_PERMITIDA_PARA_SPONSOR');
    assert.strictEqual(err.status, 400);
    assert.deepStrictEqual(err.detalle.fechas_permitidas, ['2026-10-08']);
    assert.ok(!/ocupado/i.test(err.message));
  }
});

(async () => {
  await okAsync('disponibilidad el 7 para Pikstudio no pega Notion', async () => {
    try {
      await citas.obtenerDisponibilidadSponsor({
        sponsorPageId: PIK,
        fecha: '2026-10-07',
      });
      throw new Error('debía lanzar');
    } catch (err) {
      assert.strictEqual(err.code, 'FECHA_NO_PERMITIDA_PARA_SPONSOR');
      assert.strictEqual(err.status, 400);
    }
  });

  ok('booking rechaza el 7 y acepta el 8 para ese sponsor', () => {
    assert.throws(
      () =>
        validarDuracionYFecha(
          '2026-10-07T10:30:00-06:00',
          '2026-10-07T11:00:00-06:00',
          PIK
        ),
      (e) =>
        e instanceof BookingError &&
        e.code === 'FECHA_NO_PERMITIDA_PARA_SPONSOR' &&
        e.detalle.fechas_permitidas[0] === '2026-10-08'
    );
    validarDuracionYFecha('2026-10-08T09:00:00-06:00', '2026-10-08T09:30:00-06:00', PIK);
    validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:00:00-06:00', OTRO);
    validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:00:00-06:00');
  });

  ok('bloquesDisponiblesParaSponsor no enumera el 7', () => {
    const bloques = citas.bloquesDisponiblesParaSponsor({
      sponsorPageId: PIK,
      indiceConfirmadas: new Map(),
    });
    assert.ok(bloques.length > 0);
    assert.ok(bloques.every((b) => String(b.inicio).startsWith('2026-10-08')));
    assert.ok(!bloques.some((b) => String(b.inicio).startsWith('2026-10-07')));
  });

  const otro = citas.bloquesDisponiblesParaSponsor({
    sponsorPageId: OTRO,
    indiceConfirmadas: new Map(),
  });
  ok('otro sponsor sigue viendo ambos días', () => {
    assert.ok(otro.some((b) => String(b.inicio).startsWith('2026-10-07')));
    assert.ok(otro.some((b) => String(b.inicio).startsWith('2026-10-08')));
  });

  console.log('\n=== Resultado: TODOS PASARON ===\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
