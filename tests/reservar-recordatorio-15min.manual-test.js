// Reservar NO toca los recordatorios (7-sep) y la ruta vieja contesta 410.
//
// Antes el controller programaba el aviso de 15 min en Plática tras reservar.
// Se retiró porque un programado no se puede cancelar y quedaba suelto al
// cancelar o mover la cita. Este test cuida que no vuelva a entrar por ahí:
// el único camino es el cron POST /citas/enviar-recordatorios-15min.
//
//   node tests/reservar-recordatorio-15min.manual-test.js

const assert = require('assert');
const path = require('path');

const bookingPath = path.resolve(__dirname, '../src/services/booking.service.js');
const recordatorioPath = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');
const controllerPath = path.resolve(__dirname, '../src/controllers/citas.controller.js');

class BookingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Cualquier llamada al service de recordatorios desde reservar es una regresión. */
const llamadasRecordatorio = [];
let implReservar;
let ultimaReservaParams;

require.cache[bookingPath] = {
  id: bookingPath,
  filename: bookingPath,
  loaded: true,
  exports: {
    BookingError,
    async reservarCita(params) {
      ultimaReservaParams = params;
      return implReservar(params);
    },
    async modificarCita() {},
    async cancelarCita() {},
    async reintentarNotificacion() {},
  },
};

require.cache[recordatorioPath] = {
  id: recordatorioPath,
  filename: recordatorioPath,
  loaded: true,
  exports: {
    MINUTOS_ANTES: 15,
    async enviarRecordatorios15minPendientes(args) {
      llamadasRecordatorio.push(args);
      return { enviados: 0 };
    },
  },
};

delete require.cache[controllerPath];
const { reservar } = require('../src/controllers/citas.controller');
const {
  programarRecordatorio15min,
  enviarRecordatorios15min,
} = require('../src/controllers/recordatorio-cita-15min.controller');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function bodyReserva() {
  return {
    request_id: 'req-1',
    sponsor_notion_id: 'sponsor-1',
    asistente_notion_id: 'asistente-1',
    inicio: '2026-10-07T10:30:00-06:00',
    fin: '2026-10-07T11:00:00-06:00',
  };
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
  console.log('\n=== Reservar ya no programa recordatorios ===');

  await okAsync('reserva Confirmada 201 sin tocar el service de recordatorios', async () => {
    llamadasRecordatorio.length = 0;
    implReservar = async () => ({
      ya_existia: false,
      notion_page_id: 'cita-1',
      estado: 'Confirmada',
      mesa: 1,
      titulo: 'Cita — A - B',
    });
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(res.body, {
      ya_existia: false,
      notion_page_id: 'cita-1',
      estado: 'Confirmada',
      mesa: 1,
      titulo: 'Cita — A - B',
    });
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  await okAsync('Confirmada sin notificar tampoco programa nada', async () => {
    llamadasRecordatorio.length = 0;
    implReservar = async () => ({
      ya_existia: false,
      estado: 'Confirmada sin notificar',
      notion_page_id: 'cita-3',
    });
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 201);
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  await okAsync('BookingError sigue mapeando a su status', async () => {
    llamadasRecordatorio.length = 0;
    implReservar = async () => {
      throw new BookingError('SPONSOR_YA_OCUPADO', 'ocupado');
    };
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 409);
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  console.log('\n=== Reagenda: cita_origen_cancelada_id ===');

  await okAsync('pasa cita_origen_cancelada_id canónico al service', async () => {
    implReservar = async () => ({
      ya_existia: false,
      notion_page_id: 'cita-reagendada',
      estado: 'Confirmada',
    });
    const origen = '3d162dda-199a-8124-a828-fd1d957ede2b';
    const res = mockRes();
    await reservar({ body: { ...bodyReserva(), cita_origen_cancelada_id: origen } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(ultimaReservaParams.cita_origen_cancelada_id, origen);
  });

  await okAsync('rechaza cita_origen_cancelada_id mal formado antes del service', async () => {
    ultimaReservaParams = null;
    const res = mockRes();
    await reservar({ body: { ...bodyReserva(), cita_origen_cancelada_id: 'inventado' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_INPUT');
    assert.strictEqual(ultimaReservaParams, null);
  });

  console.log('\n=== Rutas de recordatorio ===');

  await okAsync('la ruta vieja de programar contesta 410 y no llama a Plática', async () => {
    llamadasRecordatorio.length = 0;
    const res = mockRes();
    await programarRecordatorio15min({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(res.body.error, 'RUTA_RETIRADA');
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  await okAsync('el cron sin body corre con los defaults', async () => {
    llamadasRecordatorio.length = 0;
    const res = mockRes();
    await enviarRecordatorios15min({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(llamadasRecordatorio.length, 1);
    assert.deepStrictEqual(llamadasRecordatorio[0], { ahora: undefined, minutos: undefined });
  });

  await okAsync('"minutos" fuera de rango o "ahora" basura → 400 sin correr', async () => {
    llamadasRecordatorio.length = 0;
    const resMinutos = mockRes();
    await enviarRecordatorios15min({ body: { minutos: 0 } }, resMinutos);
    assert.strictEqual(resMinutos.statusCode, 400);

    const resAhora = mockRes();
    await enviarRecordatorios15min({ body: { ahora: 'mañana' } }, resAhora);
    assert.strictEqual(resAhora.statusCode, 400);
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  console.log('\n✅ reservar-recordatorio-15min.manual-test.js');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
