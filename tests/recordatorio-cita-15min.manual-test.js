// Recordatorio 15 min antes, versión cron — mocks, sin Notion ni Plática reales.
//
// Lo que importa aquí: que el aviso salga de lo que Notion dice HOY (una
// cancelada no entra, una movida entra con su hora nueva) y que el estado en
// la fila impida mandar dos veces.
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
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const servicePath = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');

const contactos = {};
const fetches = [];
/** Filas de Citas del mock, como las devolvería buscarCitasParaRecordatorio15min. */
let filas = [];
const marcas = [];
let fallaAlMarcar = null;

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

const RECLAMO_VENCIDO_MINUTOS = 10;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    ESTADO_RECORDATORIO_EN_CURSO: 'En curso',
    ESTADO_RECORDATORIO_ENVIADO: 'Enviado',
    ESTADO_RECORDATORIO_FALLO: 'Falló',
    ESTADO_RECORDATORIO_OMITIDO: 'Omitido',
    RECLAMO_RECORDATORIO_VENCIDO_MINUTOS: RECLAMO_VENCIDO_MINUTOS,
    // Réplica del filtro real: estatus + ventana + estado tomable.
    async buscarCitasParaRecordatorio15min({ desde, hasta, ahora }) {
      const ahoraMs = Date.parse(ahora);
      return filas
        .filter((f) => ['Confirmada', 'Confirmada sin notificar'].includes(f.estatus))
        .filter((f) => Date.parse(f.inicio) > Date.parse(desde) && Date.parse(f.inicio) <= Date.parse(hasta))
        .filter((f) => {
          if (!f.estadoRecordatorio15min || f.estadoRecordatorio15min === 'Falló') return true;
          if (f.estadoRecordatorio15min !== 'En curso') return false;
          const reclamado = Date.parse(f.fechaRecordatorio15min || '');
          if (!Number.isFinite(reclamado)) return true;
          return ahoraMs - reclamado >= RECLAMO_VENCIDO_MINUTOS * 60 * 1000;
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
    async marcarEstadoRecordatorio15min({ notionPageId, estado, fecha, notas }) {
      if (fallaAlMarcar && fallaAlMarcar(estado)) throw new Error('Notion 502 al marcar');
      marcas.push({ notionPageId, estado, notas });
      const fila = filas.find((f) => f.id === notionPageId);
      if (fila) {
        fila.estadoRecordatorio15min = estado;
        fila.fechaRecordatorio15min = fecha || new Date().toISOString();
      }
      return {};
    },
  },
};

function limpiar() {
  Object.keys(contactos).forEach((k) => delete contactos[k]);
  fetches.length = 0;
  marcas.length = 0;
  filas = [];
  fallaAlMarcar = null;
  process.env.PLATICA_TEMPLATE_CITA_15MIN = 'notificacion_cita_15min_antes';
  contactos['asistente-1'] = { nombre: 'JUAN PEREZ', whatsapp: '5215512345678' };
  contactos['sponsor-1'] = { nombre: 'Pedro Sponsor', empresa: 'Infracommerce' };
}

function fila(overrides = {}) {
  return {
    id: 'cita-1',
    estatus: 'Confirmada',
    inicio: '2026-10-07T10:30:00-06:00',
    asistentePageId: 'asistente-1',
    sponsorPageId: 'sponsor-1',
    estadoRecordatorio15min: null,
    fechaRecordatorio15min: null,
    ...overrides,
  };
}

function cargarServicio() {
  delete require.cache[servicePath];
  return require(servicePath);
}

const originalFetch = global.fetch;
function fetchOk() {
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    fetches.push({ url, body, headers: opts?.headers });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ messageId: 'msg_test', status: 'sent' });
      },
    };
  };
}
fetchOk();

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

// 15 min antes de las 10:30 -06:00
const AHORA = '2026-10-07T10:15:00-06:00';

(async () => {
  const {
    ventanaRecordatorio,
    primerNombreParaSaludo,
    enviarRecordatorios15minPendientes,
    MINUTOS_ANTES,
  } = cargarServicio();

  console.log('\n=== Helpers ===');
  ok('ventana = ahora .. ahora + 15 min, en instantes', () => {
    const { desde, hasta } = ventanaRecordatorio({ ahora: AHORA });
    assert.strictEqual(desde, '2026-10-07T16:15:00.000Z');
    assert.strictEqual(hasta, '2026-10-07T16:30:00.000Z');
    assert.strictEqual(MINUTOS_ANTES, 15);
  });
  ok('primerNombre recorta Ticketópolis', () => {
    assert.strictEqual(primerNombreParaSaludo('ANA MARIA PEREZ LOPEZ'), 'Ana');
  });
  ok('"ahora" basura → INVALID_INPUT', () => {
    assert.throws(() => ventanaRecordatorio({ ahora: 'mañana' }), (err) => err.code === 'INVALID_INPUT');
  });

  console.log('\n=== Corrida del cron ===');
  await okAsync('cita confirmada en la ventana → plantilla sin scheduleTime + Enviado', async () => {
    limpiar();
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });

    assert.strictEqual(r.revisadas, 1);
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(r.fallidos, 0);
    assert.strictEqual(fetches.length, 1);
    assert.ok(String(fetches[0].url).endsWith('/v1/messages/template'));
    assert.ok(!('scheduleTime' in fetches[0].body), 'no debe programar, manda ya');
    assert.strictEqual(fetches[0].body.template.name, 'notificacion_cita_15min_antes');
    assert.deepStrictEqual(fetches[0].body.template.params, ['Juan', 'Infracommerce']);
    assert.strictEqual(fetches[0].body.conversationId, '5215512345678');
    assert.strictEqual(fetches[0].body.channelId, 'wb-test');
    assert.strictEqual(fetches[0].body.responderAgentId, 'c1IYnFsr0Jzfqq4NeLAs');
    assert.deepStrictEqual(
      marcas.map((m) => m.estado),
      ['En curso', 'Enviado'],
      'reclama antes de llamar a Plática'
    );
  });

  await okAsync('la razón de todo esto: una cancelada no recibe aviso', async () => {
    limpiar();
    filas = [fila({ estatus: 'Cancelada' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.length, 0);
  });

  await okAsync('una reprogramada avisa a su hora nueva, no a la vieja', async () => {
    limpiar();
    // Movida de 10:30 a 13:00: a las 10:15 no le toca nada.
    filas = [fila({ inicio: '2026-10-07T13:00:00-06:00' })];
    let r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);

    r = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T12:45:00-06:00' });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
  });

  await okAsync('correr el cron dos veces no manda dos avisos', async () => {
    limpiar();
    filas = [fila()];
    await enviarRecordatorios15minPendientes({ ahora: AHORA });
    const r = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 1);
  });

  await okAsync('cita fuera de la ventana o ya empezada → no entra', async () => {
    limpiar();
    filas = [
      fila({ id: 'lejana', inicio: '2026-10-07T11:30:00-06:00' }),
      fila({ id: 'ya-empezo', inicio: '2026-10-07T10:00:00-06:00' }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('varias citas en el mismo bloque → un aviso por cita', async () => {
    limpiar();
    contactos['asistente-2'] = { nombre: 'Ana', whatsapp: '5215599999999' };
    filas = [fila({ id: 'c1' }), fila({ id: 'c2', asistentePageId: 'asistente-2' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 2);
    assert.strictEqual(fetches.length, 2);
    assert.deepStrictEqual(
      fetches.map((f) => f.body.conversationId).sort(),
      ['5215512345678', '5215599999999']
    );
  });

  console.log('\n=== Fallos y reintentos ===');
  await okAsync('Plática 500 → Falló con motivo, y la siguiente corrida reintenta', async () => {
    limpiar();
    filas = [fila()];
    global.fetch = async () => ({ ok: false, status: 500, async text() { return 'boom'; } });
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(r.enviados, 0);
    const ultima = marcas[marcas.length - 1];
    assert.strictEqual(ultima.estado, 'Falló');
    assert.ok(/Plática 500/.test(ultima.notas));

    fetchOk();
    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.enviados, 1, 'un Falló se reintenta mientras siga en ventana');
  });

  await okAsync('un fallo no deja sin aviso a las demás citas del lote', async () => {
    limpiar();
    contactos['asistente-2'] = { nombre: 'Ana', whatsapp: '5215599999999' };
    filas = [fila({ id: 'c1' }), fila({ id: 'c2', asistentePageId: 'asistente-2' })];
    let llamadas = 0;
    global.fetch = async (url, opts) => {
      llamadas += 1;
      if (llamadas === 1) throw new Error('socket hang up');
      const body = opts?.body ? JSON.parse(opts.body) : {};
      fetches.push({ url, body });
      return { ok: true, status: 200, async text() { return JSON.stringify({ messageId: 'msg_2' }); } };
    };
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(r.enviados, 1);
    fetchOk();
  });

  await okAsync('asistente sin WhatsApp → Omitido terminal, no reintenta', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Juan', whatsapp: '' };
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.omitidos, 1);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas[marcas.length - 1].estado, 'Omitido');

    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.revisadas, 0, 'Omitido no vuelve a entrar');
  });

  await okAsync('contacto que ya no existe → Falló, no tumba la corrida', async () => {
    limpiar();
    filas = [fila({ asistentePageId: 'borrado' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(fetches.length, 0);
    assert.ok(/Contacto no encontrado/.test(marcas[marcas.length - 1].notas));
  });

  await okAsync('si no se puede reclamar la fila, no se manda nada', async () => {
    limpiar();
    filas = [fila()];
    fallaAlMarcar = (estado) => estado === 'En curso';
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(fetches.length, 0, 'sin reclamo no hay envío');
  });

  await okAsync('un "En curso" trabado se vuelve a tomar tras 10 min', async () => {
    limpiar();
    filas = [
      fila({
        estadoRecordatorio15min: 'En curso',
        fechaRecordatorio15min: '2026-10-07T09:50:00-06:00',
      }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
  });

  await okAsync('un "En curso" reciente se respeta (otra corrida lo tiene)', async () => {
    limpiar();
    filas = [
      fila({
        estadoRecordatorio15min: 'En curso',
        fechaRecordatorio15min: '2026-10-07T10:14:00-06:00',
      }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('sin env de plantilla → corrida omitida sin tocar Notion', async () => {
    limpiar();
    delete process.env.PLATICA_TEMPLATE_CITA_15MIN;
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.deepStrictEqual(r, { omitido: true, motivo: 'SIN_PLANTILLA', ahora: AHORA });
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.length, 0);
  });

  await okAsync('{{2}} cae al nombre si el sponsor no tiene empresa', async () => {
    limpiar();
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: '' };
    filas = [fila()];
    await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.deepStrictEqual(fetches[0].body.template.params, ['Juan', 'Pedro']);
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
