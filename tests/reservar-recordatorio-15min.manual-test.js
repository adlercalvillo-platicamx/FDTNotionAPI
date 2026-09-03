// El controller dispara el recordatorio 15 min tras reservar, sin cambiar el HTTP.
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

const llamadasRecordatorio = [];
let implRecordatorio = async () => ({ status: 'scheduled' });
let implReservar;

require.cache[bookingPath] = {
  id: bookingPath,
  filename: bookingPath,
  loaded: true,
  exports: {
    BookingError,
    async reservarCita(params) {
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
    async programarRecordatorioCita15min(args) {
      llamadasRecordatorio.push(args);
      return implRecordatorio(args);
    },
  },
};

delete require.cache[controllerPath];
const { reservar } = require('../src/controllers/citas.controller');

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
  console.log('\n=== Controller reservar → recordatorio 15 min ===');

  await okAsync('reserva Confirmada 201 dispara recordatorio con los mismos ids', async () => {
    llamadasRecordatorio.length = 0;
    implRecordatorio = async () => ({ status: 'scheduled' });
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
    assert.strictEqual(res.body.estado, 'Confirmada');
    assert.strictEqual(res.body.recordatorio_15min, undefined);
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 1);
    assert.deepStrictEqual(llamadasRecordatorio[0], {
      asistente_notion_id: 'asistente-1',
      sponsor_notion_id: 'sponsor-1',
      inicio: '2026-10-07T10:30:00-06:00',
    });
  });

  await okAsync('Plática throw no cambia 201 ni el body de agendar', async () => {
    llamadasRecordatorio.length = 0;
    implRecordatorio = async () => {
      throw new Error('Plática 500: boom');
    };
    implReservar = async () => ({
      ya_existia: false,
      notion_page_id: 'cita-2',
      estado: 'Confirmada',
      mesa: 2,
      titulo: 'Cita — A - B',
    });
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(res.body, {
      ya_existia: false,
      notion_page_id: 'cita-2',
      estado: 'Confirmada',
      mesa: 2,
      titulo: 'Cita — A - B',
    });
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 1);
  });

  await okAsync('Confirmada sin notificar también encola', async () => {
    llamadasRecordatorio.length = 0;
    implRecordatorio = async () => ({ status: 'scheduled' });
    implReservar = async () => ({
      ya_existia: false,
      estado: 'Confirmada sin notificar',
      notion_page_id: 'cita-3',
    });
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 201);
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 1);
  });

  await okAsync('ya_existia no vuelve a programar (idempotencia)', async () => {
    llamadasRecordatorio.length = 0;
    implReservar = async () => ({
      ya_existia: true,
      estado: 'Confirmada',
      notion_page_id: 'cita-1',
    });
    const res = mockRes();
    await reservar({ body: bodyReserva() }, res);
    assert.strictEqual(res.statusCode, 200);
    await flushImmediate();
    assert.strictEqual(llamadasRecordatorio.length, 0);
  });

  await okAsync('BookingError no dispara recordatorio', async () => {
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

  console.log('\n✅ reservar-recordatorio-15min.manual-test.js');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
