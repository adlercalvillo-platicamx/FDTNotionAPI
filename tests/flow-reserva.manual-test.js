process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';
process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake';
process.env.FLOW_WEBHOOK_SECRET = 'test-secret';

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const jobPath = require.resolve('../src/jobs/reservar-desde-flow.job');

const encolados = [];
let ultimaListaOpts = null;

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    buscarAsistentePorWhatsApp: async (phone) => {
      if (!phone) return null;
      return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', nombre: 'Asistente Test', whatsapp: '5511111111' };
    },
    obtenerContacto: async () => ({ nombre: 'Sponsor', whatsapp: '5522222222' }),
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    listarSugeridasPorAsistente: async (id, opts = {}) => {
      ultimaListaOpts = opts;
      return [
      {
        cita_page_id: 'c1',
        estatus: 'Aprobado',
        sponsor_notion_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
        sponsor_nombre: 'Sponsor Uno',
        nivel_patrocinio: 'Oro',
      },
    ];
    },
    obtenerFechasEvento: () => ['2026-10-07', '2026-10-08'],
    obtenerDisponibilidadSponsor: async ({ fecha }) => {
      if (fecha === '2026-10-07') {
        return [
          {
            inicio: '2026-10-07T10:30:00-06:00',
            fin: '2026-10-07T11:00:00-06:00',
            disponible: true,
            motivo: null,
          },
          {
            inicio: '2026-10-07T11:00:00-06:00',
            fin: '2026-10-07T11:30:00-06:00',
            disponible: false,
            motivo: 'SPONSOR_YA_OCUPADO',
          },
          {
            inicio: '2026-10-07T11:30:00-06:00',
            fin: '2026-10-07T12:00:00-06:00',
            disponible: false,
            motivo: 'CAPACIDAD_MESAS_LLENA',
          },
        ];
      }
      return [];
    },
    finDeBloque: (inicio) => inicio.replace('T10:30:00', 'T11:00:00'),
  },
};

require.cache[jobPath] = {
  id: jobPath,
  filename: jobPath,
  loaded: true,
  exports: {
    COPY: {
      SPONSOR_YA_OCUPADO: 'Ese horario con ese sponsor ya no está disponible. Elige otro horario o otro sponsor.',
      CAPACIDAD_MESAS_LLENA: 'Ya no hay lugar en ese horario. Elige otra hora.',
    },
    encolarReservaFlow: (params) => encolados.push(params),
  },
};

const flow = require('../src/services/flow-reserva.service');
const { verificarFirma } = require('../src/controllers/flows.controller');

function envelope({ action, screen, payload, phone }) {
  return {
    event: action === 'init' ? 'whatsapp.flows.init' : 'whatsapp.flows.screen_advance',
    resourceId: 'token-abc',
    data: {
      client: phone ? { phoneNumber: phone } : null,
      conversation: phone ? { phoneNumber: phone } : null,
      flowExchange: { action, screen: screen || null, payload: payload || {} },
      flowResponse: { flowToken: 'token-abc' },
    },
  };
}

async function main() {
  let fallos = 0;
  const ok = async (name, fn) => {
    try {
      await fn();
      console.log('✅', name);
    } catch (e) {
      fallos += 1;
      console.log('❌', name, e.message);
    }
  };

  await ok('INIT sin teléfono', async () => {
    const r = await flow.procesarExchange(envelope({ action: 'init' }));
    assert.ok(r.data.error_message);
  });

  await ok('INIT con teléfono → SPONSOR', async () => {
    const r = await flow.procesarExchange(envelope({ action: 'init', phone: '5511111111' }));
    assert.strictEqual(r.screen, 'SPONSOR');
    assert.strictEqual(r.data.sponsors.length, 1);
    assert.strictEqual(ultimaListaOpts.soloAprobado, true);
  });

  await ok('SPONSOR → FECHA', async () => {
    const r = await flow.procesarExchange(
      envelope({
        action: 'data_exchange',
        screen: 'SPONSOR',
        phone: '5511111111',
        payload: {
          sponsor_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        },
      })
    );
    assert.strictEqual(r.screen, 'FECHA');
    assert.ok(r.data.fechas.length >= 2);
  });

  await ok('HORARIO ocupado → copy B', async () => {
    const r = await flow.procesarExchange(
      envelope({
        action: 'data_exchange',
        screen: 'HORARIO',
        payload: {
          sponsor_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          fecha: '2026-10-07',
          inicio: '2026-10-07T11:00:00-06:00',
        },
      })
    );
    assert.ok(/otro sponsor/i.test(r.data.error_message));
  });

  await ok('HORARIO mesas → copy C', async () => {
    const r = await flow.procesarExchange(
      envelope({
        action: 'data_exchange',
        screen: 'HORARIO',
        payload: {
          sponsor_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          fecha: '2026-10-07',
          inicio: '2026-10-07T11:30:00-06:00',
        },
      })
    );
    assert.ok(/otra hora/i.test(r.data.error_message));
    assert.ok(!/otro sponsor/i.test(r.data.error_message));
  });

  await ok('RESUMEN encola y no confirma', async () => {
    encolados.length = 0;
    const r = await flow.procesarExchange(
      envelope({
        action: 'data_exchange',
        screen: 'RESUMEN',
        payload: {
          sponsor_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          fecha: '2026-10-07',
          inicio: '2026-10-07T10:30:00-06:00',
        },
      })
    );
    assert.strictEqual(r.screen, 'RESULTADO_PENDIENTE');
    assert.strictEqual(encolados.length, 1);
    assert.ok(encolados[0].request_id);
    assert.strictEqual(r.data.sponsor_nombre, undefined);
    assert.ok(r.data.mensaje_pendiente);
    assert.ok(r.data.sponsor_id);
  });

  await ok('HMAC válido', () => {
    const body = '{"a":1}';
    const sig =
      'sha256=' + crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');
    assert.strictEqual(verificarFirma(body, sig, 'test-secret'), true);
    assert.strictEqual(verificarFirma(body, 'sha256=dead', 'test-secret'), false);
  });

  await ok('complete no encola de nuevo', async () => {
    const n = encolados.length;
    const r = await flow.procesarExchange({
      event: 'whatsapp.flows.screen_advance',
      resourceId: 'token-abc',
      data: {
        flowExchange: {
          action: 'complete',
          screen: 'RESULTADO_PENDIENTE',
          payload: { sponsor_id: 'x', inicio: '2026-10-07T10:30:00-06:00' },
        },
      },
    });
    assert.strictEqual(r.data.acknowledged, true);
    assert.strictEqual(encolados.length, n);
  });

  await ok('BACK no encola', async () => {
    const n = encolados.length;
    await flow.procesarExchange(
      envelope({
        action: 'back',
        screen: 'HORARIO',
        payload: {
          sponsor_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          fecha: '2026-10-07',
        },
      })
    );
    assert.strictEqual(encolados.length, n);
  });

  const { finDeBloque } = require('../src/services/citas.service');
  // citas.service está mockeado en cache — finDeBloque del mock
  assert.ok(typeof require.cache[citasPath].exports.finDeBloque === 'function');

  if (fallos) process.exit(1);
  console.log('\n=== flow-reserva OK ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
