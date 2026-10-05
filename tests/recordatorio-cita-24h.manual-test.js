// Recordatorio 24 h antes, un mensaje por asistente — mocks, sin Notion ni Plática.
//
//   node tests/recordatorio-cita-24h.manual-test.js

const assert = require('assert');
const path = require('path');

process.env.PLATICA_API_BASE_URL = 'https://api.platica.mx';
process.env.PLATICA_API_KEY = 'test-key';
process.env.PLATICA_CHANNEL_ID = 'wb-test';
process.env.PLATICA_RESPONDER_AGENT_ID = 'c1IYnFsr0Jzfqq4NeLAs';
process.env.PLATICA_TEMPLATE_CITA_24H = 'confirmacion_cita_1_dia_antes';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';

const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const service15Path = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');
const service2Path = path.resolve(__dirname, '../src/services/recordatorio-cita-2h.service.js');
const servicePath = path.resolve(__dirname, '../src/services/recordatorio-cita-24h.service.js');

const contactos = {};
const fetches = [];
let filas = [];
const marcas = [];
let consultas = 0;
let fallaAlMarcar = null;
let fallaAlEnviar = false;

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
    async actualizarEstadoRecordatorio24h({ contactoId, estado, fecha, notas }) {
      if (fallaAlMarcar && fallaAlMarcar(estado)) throw new Error('Notion 502 al marcar');
      marcas.push({ contactoId, estado, notas });
      const contacto = contactos[contactoId];
      if (contacto) {
        contacto.estadoRecordatorio24h = estado;
        contacto.fechaRecordatorio24h = fecha || new Date().toISOString();
        if (notas !== undefined) contacto.notasRecordatorio24h = notas;
      }
      return {};
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    ESTADO_RECORDATORIO_EN_CURSO: 'En curso',
    ESTADO_RECORDATORIO_ENVIADO: 'Enviado',
    ESTADO_RECORDATORIO_FALLO: 'Falló',
    ESTADO_RECORDATORIO_OMITIDO: 'Omitido',
    RECLAMO_RECORDATORIO_VENCIDO_MINUTOS: 10,
    async buscarCitasRealesDesde() {
      consultas += 1;
      return filas
        .filter((f) => ['Confirmada', 'Confirmada sin notificar'].includes(f.estatus))
        .slice()
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
  },
};

function limpiar() {
  Object.keys(contactos).forEach((k) => delete contactos[k]);
  fetches.length = 0;
  marcas.length = 0;
  filas = [];
  consultas = 0;
  fallaAlMarcar = null;
  fallaAlEnviar = false;
  process.env.PLATICA_TEMPLATE_CITA_24H = 'confirmacion_cita_1_dia_antes';
  contactos['asistente-1'] = {
    nombre: 'JUAN PEREZ',
    whatsapp: '5215512345678',
    estadoRecordatorio24h: null,
    fechaRecordatorio24h: null,
  };
  contactos['asistente-2'] = {
    nombre: 'ANA LOPEZ',
    whatsapp: '5215587654321',
    estadoRecordatorio24h: null,
    fechaRecordatorio24h: null,
  };
  contactos['sponsor-1'] = { nombre: 'MARCO ANTONIO TRUJILLO GARCIA', empresa: 'Plática.mx' };
  contactos['sponsor-2'] = { nombre: 'RODRIGO CERDA SOMOZA', empresa: 'Tiendanube' };
}

function fila(overrides = {}) {
  return {
    id: 'cita-1',
    estatus: 'Confirmada',
    inicio: '2026-10-07T10:30:00-06:00',
    asistentePageId: 'asistente-1',
    sponsorPageId: 'sponsor-1',
    ...overrides,
  };
}

function cargarServicio() {
  delete require.cache[service15Path];
  delete require.cache[service2Path];
  delete require.cache[servicePath];
  return require(servicePath);
}

const originalFetch = global.fetch;
function fetchOk() {
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    fetches.push({ url, body, headers: opts?.headers });
    if (fallaAlEnviar) {
      return { ok: false, status: 500, async text() { return 'fallo platica'; } };
    }
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

// 24 h antes de las 10:30 del 7 oct
const AHORA = '2026-10-06T10:30:00-06:00';

(async () => {
  const {
    enviarRecordatorios24hPendientes,
    fechaCorta,
    lineaDeCita,
    agendaParaPlantilla,
    TEMPLATE_NAME,
    MINUTOS_ANTES,
    MAX_AGENDA,
  } = cargarServicio();

  console.log('\n=== Helpers ===');
  ok('ventana default = 24 h', () => {
    assert.strictEqual(MINUTOS_ANTES, 1440);
  });
  ok('plantilla aprobada fija en el service', () => {
    assert.strictEqual(TEMPLATE_NAME, 'confirmacion_cita_1_dia_antes');
  });
  ok('fecha corta sale del día local del ISO', () => {
    assert.strictEqual(fechaCorta('2026-10-07T10:30:00-06:00'), '7 oct');
    assert.strictEqual(fechaCorta('2026-10-08T11:00:00-06:00'), '8 oct');
  });
  ok('cada reunión sale como en las plantillas de 1 día antes', () => {
    assert.strictEqual(
      lineaDeCita(
        { inicio: '2026-10-07T15:00:00-06:00' },
        { nombre: 'PEDRO LOPEZ', empresa: 'Revie' }
      ),
      '7 oct a las 3:00 pm con Pedro Lopez, de Revie'
    );
  });
  ok('la agenda cabe en un parámetro y avisa si se corta', () => {
    const corta = agendaParaPlantilla(['7 oct a las 10:30 am con Marco Trujillo, de Plática.mx']);
    assert.strictEqual(corta.recortada, false);
    assert.strictEqual(corta.texto, '7 oct a las 10:30 am con Marco Trujillo, de Plática.mx');
    const larga = agendaParaPlantilla([
      'a'.repeat(MAX_AGENDA - 10),
      'b'.repeat(40),
    ]);
    assert.strictEqual(larga.recortada, true);
    assert.ok(larga.texto.length <= MAX_AGENDA);
    assert.ok(larga.texto.endsWith('más'));
  });

  console.log('\n=== Corrida del cron ===');
  await okAsync('sin env usa la plantilla aprobada', async () => {
    limpiar();
    delete process.env.PLATICA_TEMPLATE_CITA_24H;
    filas = [fila()];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches[0].body.template.name, 'confirmacion_cita_1_dia_antes');
  });

  await okAsync('env vacía no consulta ni escribe', async () => {
    limpiar();
    process.env.PLATICA_TEMPLATE_CITA_24H = '';
    filas = [fila()];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.deepStrictEqual(
      { omitido: r.omitido, motivo: r.motivo },
      { omitido: true, motivo: 'SIN_PLANTILLA' }
    );
    assert.strictEqual(consultas, 0);
    assert.strictEqual(marcas.length, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('simulacion arma params y no marca ni manda', async () => {
    limpiar();
    filas = [
      fila(),
      fila({ id: 'cita-tarde', inicio: '2026-10-08T11:00:00-06:00', sponsorPageId: 'sponsor-2' }),
    ];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA, simulacion: true });
    assert.strictEqual(r.simulacion, true);
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(r.detalle[0].estado, 'Simulado');
    assert.strictEqual(r.detalle[0].nombre, 'JUAN PEREZ');
    assert.strictEqual(r.detalle[0].dia, '2026-10-07');
    assert.deepStrictEqual(r.detalle[0].params, [
      'Juan',
      '7 oct a las 10:30 am con Marco Trujillo, de Plática.mx',
    ]);
    assert.strictEqual(marcas.length, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('el 6 manda solo las del 7, aunque también tenga el 8', async () => {
    limpiar();
    filas = [
      fila({ id: 'cita-8', inicio: '2026-10-08T11:00:00-06:00', sponsorPageId: 'sponsor-2' }),
      fila({ id: 'cita-tarde', inicio: '2026-10-07T16:00:00-06:00', sponsorPageId: 'sponsor-2' }),
      fila(),
    ];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisados, 1);
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
    assert.ok(!('scheduleTime' in fetches[0].body));
    assert.strictEqual(fetches[0].body.template.name, 'confirmacion_cita_1_dia_antes');
    assert.deepStrictEqual(fetches[0].body.template.params, [
      'Juan',
      '7 oct a las 10:30 am con Marco Trujillo, de Plática.mx; 7 oct a las 4:00 pm con Rodrigo Cerda, de Tiendanube',
    ]);
    assert.strictEqual(marcas.at(-1).notas, '2026-10-07');
    assert.deepStrictEqual(
      marcas.map((m) => m.estado),
      ['En curso', 'Enviado']
    );
  });

  await okAsync('el 7 manda solo las del 8 y no repite las del 7', async () => {
    limpiar();
    contactos['asistente-1'].estadoRecordatorio24h = 'Enviado';
    contactos['asistente-1'].notasRecordatorio24h = '2026-10-07';
    filas = [
      fila({ id: 'cita-7-tarde', inicio: '2026-10-07T18:00:00-06:00' }),
      fila({ id: 'cita-8', inicio: '2026-10-08T11:00:00-06:00', sponsorPageId: 'sponsor-2' }),
      fila({ id: 'cita-8-tarde', inicio: '2026-10-08T16:00:00-06:00', sponsorPageId: 'sponsor-2' }),
    ];
    const r = await enviarRecordatorios24hPendientes({ ahora: '2026-10-07T11:00:00-06:00' });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
    assert.strictEqual(r.detalle[0].dia, '2026-10-08');
    assert.deepStrictEqual(fetches[0].body.template.params, [
      'Juan',
      '8 oct a las 11:00 am con Rodrigo Cerda, de Tiendanube; 8 oct a las 4:00 pm con Rodrigo Cerda, de Tiendanube',
    ]);
    assert.ok(String(marcas.at(-1).notas).includes('2026-10-07'));
    assert.ok(String(marcas.at(-1).notas).includes('2026-10-08'));
  });

  await okAsync('la cita del otro día, sola, todavía no entra', async () => {
    limpiar();
    filas = [fila({ id: 'solo-dia-2', inicio: '2026-10-08T11:00:00-06:00', asistentePageId: 'asistente-2' })];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisados, 0);
    assert.strictEqual(r.enviados, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('ya enviado no se repite', async () => {
    limpiar();
    contactos['asistente-1'].estadoRecordatorio24h = 'Enviado';
    contactos['asistente-1'].notasRecordatorio24h = '2026-10-07';
    filas = [fila(), fila({ id: 'cita-2', inicio: '2026-10-08T11:00:00-06:00', sponsorPageId: 'sponsor-2' })];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisados, 1);
    assert.strictEqual(r.enviados, 0);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.length, 0);
  });

  await okAsync('dos asistentes reciben cada uno el suyo', async () => {
    limpiar();
    filas = [
      fila({ inicio: '2026-10-07T10:00:00-06:00' }),
      fila({
        id: 'cita-ana',
        inicio: '2026-10-07T10:20:00-06:00',
        asistentePageId: 'asistente-2',
        sponsorPageId: 'sponsor-2',
      }),
    ];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 2);
    assert.strictEqual(fetches.length, 2);
    assert.strictEqual(fetches[0].body.template.params[0], 'Juan');
    assert.strictEqual(fetches[1].body.template.params[0], 'Ana');
    assert.ok(fetches[1].body.template.params[1].includes('Tiendanube'));
    assert.ok(!fetches[0].body.template.params[1].includes('Tiendanube'));
  });

  await okAsync('sin WhatsApp queda Omitido', async () => {
    limpiar();
    contactos['asistente-1'].whatsapp = '';
    filas = [fila()];
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.omitidos, 1);
    assert.strictEqual(r.enviados, 0);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.at(-1).estado, 'Omitido');
  });

  await okAsync('Falló se vuelve a tomar; En curso reciente no', async () => {
    limpiar();
    contactos['asistente-1'].estadoRecordatorio24h = 'Falló';
    filas = [fila()];
    const primero = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(primero.enviados, 1);

    contactos['asistente-1'].estadoRecordatorio24h = 'En curso';
    contactos['asistente-1'].notasRecordatorio24h = '';
    contactos['asistente-1'].fechaRecordatorio24h = '2026-10-06T10:29:00-06:00';
    fetches.length = 0;
    const fresco = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(fresco.enviados, 0);
    assert.strictEqual(fetches.length, 0);

    contactos['asistente-1'].fechaRecordatorio24h = '2026-10-06T10:19:00-06:00';
    const vencido = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(vencido.enviados, 1);
  });

  await okAsync('un fallo no aborta al siguiente', async () => {
    limpiar();
    filas = [
      fila({ inicio: '2026-10-07T10:00:00-06:00' }),
      fila({
        id: 'cita-ana',
        inicio: '2026-10-07T10:20:00-06:00',
        asistentePageId: 'asistente-2',
        sponsorPageId: 'sponsor-2',
      }),
    ];
    fallaAlEnviar = true;
    const r = await enviarRecordatorios24hPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 2);
    assert.strictEqual(r.enviados, 0);
    assert.ok(marcas.filter((m) => m.estado === 'Falló').length === 2);
  });

  global.fetch = originalFetch;
  console.log('\nTodo el recordatorio de 24 h pasó.\n');
})().catch((err) => {
  global.fetch = originalFetch;
  console.error(err);
  process.exit(1);
});
