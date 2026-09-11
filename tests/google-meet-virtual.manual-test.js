// Contrato e idempotencia del cliente Apps Script (sin Calendar real).
//
//   node tests/google-meet-virtual.manual-test.js

const assert = require('assert');
const path = require('path');

const servicePath = path.resolve(__dirname, '../src/services/google-meet-virtual.service.js');

function cargar() {
  delete require.cache[servicePath];
  return require(servicePath);
}

const originalFetch = global.fetch;
const fetches = [];

(async () => {
  const {
    eventIdFromCitaId,
    esAsistenteVirtual,
    meetVirtualHabilitado,
    asegurarMeetVirtual,
    ORGANIZADOR_MEET,
  } = cargar();

  assert.strictEqual(eventIdFromCitaId('3d162dda-199a-812f-9265-ef6b3a1ee913'), '3d162dda199a812f9265ef6b3a1ee913');
  assert.strictEqual(eventIdFromCitaId('cita-1'), '');
  const ocurrencia1230 = eventIdFromCitaId(
    '3d162dda-199a-812f-9265-ef6b3a1ee913',
    '2026-10-07T12:30:00-06:00'
  );
  assert.match(ocurrencia1230, /^[0-9a-f]{32}$/);
  assert.strictEqual(
    ocurrencia1230,
    eventIdFromCitaId('3d162dda-199a-812f-9265-ef6b3a1ee913', '2026-10-07T12:30:00-06:00')
  );
  assert.notStrictEqual(
    ocurrencia1230,
    eventIdFromCitaId('3d162dda-199a-812f-9265-ef6b3a1ee913', '2026-10-07T16:00:00-06:00')
  );
  assert.strictEqual(esAsistenteVirtual({ ticketTipo: 'Virtual' }), true);
  assert.strictEqual(esAsistenteVirtual({ ticketTipo: 'Expo' }), false);
  assert.strictEqual(ORGANIZADOR_MEET, 'rp@fashiondigitaltalks.com');

  delete process.env.MEET_VIRTUAL_HABILITADO;
  assert.strictEqual(meetVirtualHabilitado(), false);
  process.env.MEET_VIRTUAL_HABILITADO = 'true';
  assert.strictEqual(meetVirtualHabilitado(), true);

  process.env.MEET_VIRTUAL_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
  process.env.MEET_VIRTUAL_SECRET = 's3cret';
  global.fetch = async (url, opts) => {
    fetches.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          eventId: fetches[fetches.length - 1].body.citaId,
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          existing: true,
        });
      },
    };
  };

  const r = await asegurarMeetVirtual({
    cita: {
      id: '3d162dda-199a-812f-9265-ef6b3a1ee913',
      inicio: '2026-10-07T12:30:00-06:00',
      fin: '2026-10-07T13:00:00-06:00',
      titulo: 'Cita — A - B',
    },
    asistente: { nombre: 'Ana', empresa: 'Marca', email: 'ana@x.com' },
    sponsor: { nombre: 'Marco', empresa: 'Plática.mx', email: 'marco@x.com' },
  });
  assert.strictEqual(r.existing, true);
  assert.strictEqual(fetches[0].body.secret, 's3cret');
  assert.strictEqual(fetches[0].body.asistente.email, 'ana@x.com');
  assert.strictEqual(fetches[0].body.sponsor.email, 'marco@x.com');
  assert.strictEqual(fetches[0].body.citaId, ocurrencia1230);

  console.log('  OK  eventId por ocurrencia, flag, payload con ambos invitados');
  console.log('\n✅ google-meet-virtual.manual-test.js');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
