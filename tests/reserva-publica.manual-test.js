// Capa pública de reserva QR, sin Notion, SMTP ni escrituras reales.
// node tests/reserva-publica.manual-test.js

const assert = require('assert');

process.env.PAGINA_RESERVA_TOKEN_SECRET =
  'test-secret-reserva-publica-32-caracteres-minimo';
process.env.PAGINA_RESERVA_TOKEN_TTL_SECONDS = '28800';
process.env.NODE_ENV = 'test';
process.env.API_SECRET_KEY = 'test-api-key';

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const bookingPath = require.resolve('../src/services/booking.service');
const servicePath = require.resolve('../src/services/reserva-publica.service');

let coincidenciasEmail = [];
let sponsors = [];
let cancelada = null;
let reservaRecibida = null;

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async buscarContactosPorEmail() {
      return coincidenciasEmail;
    },
    async listarSponsorsActivos() {
      return sponsors;
    },
    async obtenerContacto(id) {
      const contacto = coincidenciasEmail.find((item) => item.id === id);
      if (!contacto) throw new Error(`Contacto inesperado: ${id}`);
      return contacto;
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async listarCitasRealesPorAsistente() {
      return [
        {
          id: 'cita-1',
          sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          sponsorEmpresa: 'Sponsor Uno',
          inicio: '2026-10-07T10:30:00-06:00',
          mesa: 'Mesa 1',
        },
      ];
    },
    async obtenerDisponibilidadSponsor(args) {
      return [{ inicio: `${args.fecha}T10:30:00-06:00`, disponible: true }];
    },
    async buscarCanceladaReagendableDelPar() {
      return cancelada;
    },
  },
};

require.cache[bookingPath] = {
  id: bookingPath,
  filename: bookingPath,
  loaded: true,
  exports: {
    async reservarCita(args) {
      reservaRecibida = args;
      return { estado: 'Confirmada', notion_page_id: 'nueva-cita', mesa: 3 };
    },
  },
};

delete require.cache[servicePath];
const {
  identificarPorEmail,
  listarSponsorsPublicos,
  obtenerDisponibilidadPublica,
  reservarPublicamente,
} = require('../src/services/reserva-publica.service');
const {
  emitirTokenReserva,
  verificarTokenReserva,
} = require('../src/services/reserva-publica-token.service');

const ASISTENTE = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  categoria: 'Asistente',
  dadoDeBaja: false,
  ticketTipo: 'Presencial',
  quiereCitas1a1: 'No',
  nombre: 'Ana Pérez',
  empresa: 'Moda Ana',
};

async function rechaza(codigo, fn) {
  await assert.rejects(fn, (error) => error.code === codigo);
}

async function main() {
  coincidenciasEmail = [];
  await rechaza('EMAIL_NO_ENCONTRADO', () => identificarPorEmail('ana@example.com'));

  coincidenciasEmail = [{ ...ASISTENTE, ticketTipo: 'Expo' }];
  await rechaza('BOLETO_EXPO_NO_PERMITE_CITAS', () =>
    identificarPorEmail('expo@example.com')
  );

  coincidenciasEmail = [ASISTENTE, { ...ASISTENTE, id: 'duplicado' }];
  await rechaza('EMAIL_AMBIGUO', () => identificarPorEmail('ana@example.com'));

  coincidenciasEmail = [ASISTENTE];
  const identidad = await identificarPorEmail(' ANA@EXAMPLE.COM ');
  assert.equal(identidad.asistente.nombre, 'Ana Pérez');
  assert.equal(identidad.asistente.ticketTipo, 'Presencial');
  assert.equal(identidad.citasConfirmadas.length, 1);
  assert.equal(verificarTokenReserva(identidad.token).sub, ASISTENTE.id);
  assert.equal(ASISTENTE.quiereCitas1a1, 'No', 'el QR no usa el opt-out de campaña');

  const token = emitirTokenReserva({ contactoId: ASISTENTE.id, ahora: 1_000_000 });
  assert.equal(verificarTokenReserva(token, 1_000_001).sub, ASISTENTE.id);
  assert.equal(verificarTokenReserva(`${token}x`, 1_000_001), null);
  assert.equal(verificarTokenReserva(token, 1_000_000 + 28_801_000), null);

  sponsors = [
    { id: 'oro', empresa: 'Oro', nivelPatrocinio: 'Oro', solucion: [] },
    { id: 'bronce', empresa: 'Bronce', nivelPatrocinio: 'Bronce', solucion: [] },
  ];
  const catalogo = await listarSponsorsPublicos();
  assert.deepEqual(catalogo.map((item) => item.id), ['oro']);

  const bloques = await obtenerDisponibilidadPublica({
    contactoId: ASISTENTE.id,
    sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    fecha: '2026-10-07',
  });
  assert.equal(bloques[0].disponible, true);

  cancelada = { id: 'cancelada-1' };
  const reserva = await reservarPublicamente({
    contactoId: ASISTENTE.id,
    sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    inicio: '2026-10-07T10:30:00-06:00',
    fin: '2026-10-07T10:50:00-06:00',
    requestId: '12345678-abcd',
  });
  assert.equal(reserva.estado, 'Confirmada');
  // La reserva devuelve el número crudo; la página imprime la etiqueta.
  assert.equal(reserva.mesa, 'Mesa 3');
  assert.equal(reserva.whatsappSoporte, '+52 33 3236 1963');
  assert.equal(reservaRecibida.cita_origen_cancelada_id, 'cancelada-1');
  assert.match(reservaRecibida.request_id, /^qr:aaaaaaaa-/);

  const app = require('../src/index');
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const preflight = await fetch(`${base}/reserva-publica/identificar`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');

    const invalido = await fetch(`${base}/reserva-publica/identificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-es-email' }),
    });
    assert.equal(invalido.status, 400);

    const sinSesion = await fetch(`${base}/reserva-publica/sponsors`);
    assert.equal(sinSesion.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('✅ reserva-publica: 15 casos sin Notion/SMTP');
}

main().catch((error) => {
  console.error('❌ reserva-publica:', error);
  process.exitCode = 1;
});
