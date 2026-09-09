// Recordatorio 2 h antes, versión cron — mocks, sin Notion ni Plática reales.
//
//   node tests/recordatorio-cita-2h.manual-test.js

const assert = require('assert');
const path = require('path');

process.env.PLATICA_API_BASE_URL = 'https://api.platica.mx';
process.env.PLATICA_API_KEY = 'test-key';
process.env.PLATICA_CHANNEL_ID = 'wb-test';
process.env.PLATICA_RESPONDER_AGENT_ID = 'c1IYnFsr0Jzfqq4NeLAs';
process.env.PLATICA_TEMPLATE_CITA_2H = 'notificacion_cita_2horas_antes';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';

const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const service15Path = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');
const servicePath = path.resolve(__dirname, '../src/services/recordatorio-cita-2h.service.js');

const contactos = {};
const fetches = [];
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
    async buscarCitasParaRecordatorio2h({ desde, hasta, ahora }) {
      const ahoraMs = Date.parse(ahora);
      return filas
        .filter((f) => ['Confirmada', 'Confirmada sin notificar'].includes(f.estatus))
        .filter((f) => Date.parse(f.inicio) > Date.parse(desde) && Date.parse(f.inicio) <= Date.parse(hasta))
        .filter((f) => {
          if (!f.estadoRecordatorio2h || f.estadoRecordatorio2h === 'Falló') return true;
          if (f.estadoRecordatorio2h !== 'En curso') return false;
          const reclamado = Date.parse(f.fechaRecordatorio2h || '');
          if (!Number.isFinite(reclamado)) return true;
          return ahoraMs - reclamado >= RECLAMO_VENCIDO_MINUTOS * 60 * 1000;
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
    async marcarEstadoRecordatorio2h({ notionPageId, estado, fecha, notas }) {
      if (fallaAlMarcar && fallaAlMarcar(estado)) throw new Error('Notion 502 al marcar');
      marcas.push({ notionPageId, estado, notas });
      const fila = filas.find((f) => f.id === notionPageId);
      if (fila) {
        fila.estadoRecordatorio2h = estado;
        fila.fechaRecordatorio2h = fecha || new Date().toISOString();
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
  process.env.PLATICA_TEMPLATE_CITA_2H = 'notificacion_cita_2horas_antes';
  contactos['asistente-1'] = { nombre: 'JUAN PEREZ', whatsapp: '5215512345678' };
  contactos['sponsor-1'] = { nombre: 'MARCO ANTONIO TRUJILLO GARCIA', empresa: 'Plática.mx' };
}

function fila(overrides = {}) {
  return {
    id: 'cita-1',
    estatus: 'Confirmada',
    inicio: '2026-10-07T10:30:00-06:00',
    asistentePageId: 'asistente-1',
    sponsorPageId: 'sponsor-1',
    estadoRecordatorio2h: null,
    fechaRecordatorio2h: null,
    ...overrides,
  };
}

function cargarServicio() {
  delete require.cache[service15Path];
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

// 2 h antes de las 10:30 -06:00
const AHORA = '2026-10-07T08:30:00-06:00';

(async () => {
  const {
    enviarRecordatorios2hPendientes,
    horaCitaParaPlantilla,
    encargadoDeEmpresa,
    nombreRepresentante,
    MINUTOS_ANTES,
  } = cargarServicio();

  console.log('\n=== Helpers ===');
  ok('ventana default = 120 min', () => {
    assert.strictEqual(MINUTOS_ANTES, 120);
  });
  ok('hora de plantilla como en el ejemplo de Meta', () => {
    assert.strictEqual(horaCitaParaPlantilla('2026-10-07T15:00:00-06:00'), '3:00 pm');
    assert.strictEqual(horaCitaParaPlantilla('2026-10-07T10:30:00-06:00'), '10:30 am');
    assert.strictEqual(horaCitaParaPlantilla('2026-10-07T12:00:00-06:00'), '12:00 pm');
    assert.strictEqual(horaCitaParaPlantilla('2026-10-07T00:00:00-06:00'), '12:00 am');
  });
  ok('representante = nombre + apellido paterno', () => {
    assert.strictEqual(nombreRepresentante('MARCO ANTONIO TRUJILLO GARCIA'), 'Marco Trujillo');
    assert.strictEqual(nombreRepresentante('RODRIGO CERDA SOMOZA'), 'Rodrigo Cerda');
    assert.strictEqual(nombreRepresentante('ANA PEREZ'), 'Ana Perez');
  });
  ok('{{3}} = encargado, de empresa', () => {
    assert.strictEqual(
      encargadoDeEmpresa({ nombre: 'MARCO ANTONIO TRUJILLO GARCIA', empresa: 'Plática.mx' }),
      'Marco Trujillo, de Plática.mx'
    );
    assert.strictEqual(encargadoDeEmpresa({ nombre: '', empresa: 'Revie' }), 'Revie');
    assert.strictEqual(encargadoDeEmpresa({ nombre: 'Pedro', empresa: '' }), 'Pedro');
  });

  console.log('\n=== Corrida del cron ===');
  await okAsync('cita confirmada en la ventana → 3 params y sin scheduleTime', async () => {
    limpiar();
    filas = [fila()];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });

    assert.strictEqual(r.revisadas, 1);
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
    assert.ok(!('scheduleTime' in fetches[0].body));
    assert.strictEqual(fetches[0].body.template.name, 'notificacion_cita_2horas_antes');
    assert.deepStrictEqual(fetches[0].body.template.params, [
      'Juan',
      '10:30 am',
      'Marco Trujillo, de Plática.mx',
    ]);
    assert.deepStrictEqual(
      marcas.map((m) => m.estado),
      ['En curso', 'Enviado']
    );
  });

  await okAsync('Confirmada sin notificar también entra', async () => {
    limpiar();
    filas = [fila({ estatus: 'Confirmada sin notificar' })];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
  });

  await okAsync('una cancelada no recibe aviso', async () => {
    limpiar();
    filas = [fila({ estatus: 'Cancelada' })];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('varias citas del mismo asistente → un aviso por cita', async () => {
    limpiar();
    filas = [
      fila({ id: 'c1', inicio: '2026-10-07T10:30:00-06:00' }),
      fila({ id: 'c2', inicio: '2026-10-07T10:00:00-06:00' }),
    ];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 2);
    assert.strictEqual(fetches.length, 2);
  });

  await okAsync('correr el cron dos veces no manda dos avisos', async () => {
    limpiar();
    filas = [fila()];
    await enviarRecordatorios2hPendientes({ ahora: AHORA });
    const r = await enviarRecordatorios2hPendientes({ ahora: '2026-10-07T08:35:00-06:00' });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 1);
  });

  await okAsync('un Enviado de 15 min no bloquea el de 2 h (estados distintos)', async () => {
    limpiar();
    filas = [fila({ estadoRecordatorio15min: 'Enviado' })];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
  });

  await okAsync('asistente sin WhatsApp → Omitido', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Juan', whatsapp: '' };
    filas = [fila()];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.strictEqual(r.omitidos, 1);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('sin env de plantilla → omitida sin tocar Notion', async () => {
    limpiar();
    delete process.env.PLATICA_TEMPLATE_CITA_2H;
    filas = [fila()];
    const r = await enviarRecordatorios2hPendientes({ ahora: AHORA });
    assert.deepStrictEqual(r, { omitido: true, motivo: 'SIN_PLANTILLA', ahora: AHORA });
    assert.strictEqual(marcas.length, 0);
  });

  console.log('\n✅ recordatorio-cita-2h.manual-test.js');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
