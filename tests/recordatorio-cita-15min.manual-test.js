// Recordatorio 15 min antes — mocks, sin Notion ni Plática reales.
//
//   node tests/recordatorio-cita-15min.manual-test.js

const assert = require('assert');
const path = require('path');

process.env.PLATICA_API_BASE_URL = 'https://api.platica.mx';
process.env.PLATICA_API_KEY = 'test-key';
process.env.PLATICA_CHANNEL_ID = 'wb-test';
process.env.PLATICA_RESPONDER_AGENT_ID = 'c1IYnFsr0Jzfqq4NeLAs';
process.env.PLATICA_TEMPLATE_CITA_15MIN = 'notificacion_cita_15min_antes';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';

const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const servicePath = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');

const contactos = {};
const fetches = [];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      const c = contactos[id];
      if (!c) {
        const err = new Error(`Contacto no encontrado: ${id}`);
        err.status = 404;
        throw err;
      }
      return c;
    },
  },
};

function limpiar() {
  Object.keys(contactos).forEach((k) => {
    delete contactos[k];
  });
  fetches.length = 0;
  process.env.PLATICA_TEMPLATE_CITA_15MIN = 'notificacion_cita_15min_antes';
}

function cargarServicio() {
  delete require.cache[servicePath];
  return require(servicePath);
}

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  fetches.push({ url, body, headers: opts?.headers });
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        messageId: 'msg_test',
        status: 'scheduled',
        executeAt: '2026-10-07T16:15:00.000Z',
        scheduledTime: body.scheduleTime,
      });
    },
  };
};

function ok(nombre, fn) {
  try {
    fn();
    console.log(`  OK  ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}`);
    throw err;
  }
}

async function okAsync(nombre, fn) {
  try {
    await fn();
    console.log(`  OK  ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}`);
    throw err;
  }
}

(async () => {
  const {
    scheduleTimeDesdeInicio,
    primerNombreParaSaludo,
    programarRecordatorioCita15min,
  } = cargarServicio();

  console.log('\n=== Helpers ===');
  ok('inicio 10:30 → scheduleTime 10:15 -06:00', () => {
    assert.strictEqual(
      scheduleTimeDesdeInicio('2026-10-07T10:30:00-06:00'),
      '2026-10-07T10:15:00-06:00'
    );
  });
  ok('primerNombre recorta Ticketópolis', () => {
    assert.strictEqual(primerNombreParaSaludo('ANA MARIA PEREZ LOPEZ'), 'Ana');
  });

  console.log('\n=== Programar ===');
  await okAsync('envía plantilla con scheduleTime y params de asistente/empresa', async () => {
    limpiar();
    contactos['asistente-1'] = {
      id: 'asistente-1',
      nombre: 'JUAN PEREZ',
      whatsapp: '5215512345678',
    };
    contactos['sponsor-1'] = {
      id: 'sponsor-1',
      nombre: 'Pedro Sponsor',
      empresa: 'Infracommerce',
    };
    const r = await programarRecordatorioCita15min({
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2026-10-07T10:30:00-06:00',
    });
    assert.strictEqual(r.status, 'scheduled');
    assert.strictEqual(r.messageId, 'msg_test');
    assert.deepStrictEqual(r.params, ['Juan', 'Infracommerce']);
    assert.strictEqual(fetches.length, 1);
    assert.ok(String(fetches[0].url).endsWith('/v1/messages/template'));
    assert.strictEqual(fetches[0].body.scheduleTime, '2026-10-07T10:15:00-06:00');
    assert.strictEqual(fetches[0].body.template.name, 'notificacion_cita_15min_antes');
    assert.deepStrictEqual(fetches[0].body.template.params, ['Juan', 'Infracommerce']);
    assert.strictEqual(fetches[0].body.conversationId, '5215512345678');
    assert.strictEqual(fetches[0].body.channelId, 'wb-test');
    assert.strictEqual(fetches[0].body.responderAgentId, 'c1IYnFsr0Jzfqq4NeLAs');
    assert.ok(!('delay' in fetches[0].body));
  });

  await okAsync('{{2}} cae al nombre si el sponsor no tiene empresa', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Luis', whatsapp: '5511111111' };
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: '' };
    const r = await programarRecordatorioCita15min({
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2026-10-07T10:30:00-06:00',
    });
    assert.deepStrictEqual(r.params, ['Luis', 'Pedro']);
  });

  await okAsync('sin env de plantilla → omitido SIN_PLANTILLA, no fetch', async () => {
    limpiar();
    delete process.env.PLATICA_TEMPLATE_CITA_15MIN;
    contactos['asistente-1'] = { nombre: 'Luis', whatsapp: '5511111111' };
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: 'Acme' };
    const r = await programarRecordatorioCita15min({
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2026-10-07T10:30:00-06:00',
    });
    assert.deepStrictEqual(r, { omitido: true, motivo: 'SIN_PLANTILLA' });
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('sin WhatsApp → omitido SIN_WHATSAPP', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Luis', whatsapp: '' };
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: 'Acme' };
    const r = await programarRecordatorioCita15min({
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2026-10-07T10:30:00-06:00',
    });
    assert.strictEqual(r.omitido, true);
    assert.strictEqual(r.motivo, 'SIN_WHATSAPP');
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('horario ya pasado → omitido HORARIO_PASADO', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Luis', whatsapp: '5511111111' };
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: 'Acme' };
    const r = await programarRecordatorioCita15min({
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2020-01-01T10:30:00-06:00',
    });
    assert.strictEqual(r.omitido, true);
    assert.strictEqual(r.motivo, 'HORARIO_PASADO');
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('Plática 500 → lanza, no se traga el error', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Luis', whatsapp: '5511111111' };
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: 'Acme' };
    global.fetch = async () => ({
      ok: false,
      status: 500,
      async text() {
        return 'boom';
      },
    });
    await assert.rejects(
      () =>
        programarRecordatorioCita15min({
          asistente_notion_id: 'asistente-1',
          sponsor_notion_id: 'sponsor-1',
          inicio: '2026-10-07T10:30:00-06:00',
        }),
      (err) => /Plática 500/.test(err.message)
    );
    global.fetch = originalFetch;
    global.fetch = async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      fetches.push({ url, body });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ messageId: 'msg_test', status: 'scheduled' });
        },
      };
    };
  });

  console.log('\n✅ recordatorio-cita-15min.manual-test.js');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
