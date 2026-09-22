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

const GIROS = [
  'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)',
  'Retailer / tienda multimarca / Marketplace',
  'Manufactura / produccion / sourcing',
];

let coincidenciasEmail = [];
let sponsors = [];
let cancelada = null;
let canceladasReagendables = [];
let reservaRecibida = null;
let modificacionRecibida = null;
let cancelacionRecibida = null;
let disponibilidadArgs = null;
let citaPorId = null;

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    GIROS_ELEGIBLES_MATCHMAKING: GIROS,
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
          id: '11111111-1111-1111-1111-111111111111',
          sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          sponsorEmpresa: 'Sponsor Uno',
          inicio: '2026-10-07T10:30:00-06:00',
          mesa: 'Mesa 1',
          checkInRealizado: false,
        },
      ];
    },
    async obtenerDisponibilidadSponsor(args) {
      disponibilidadArgs = args;
      return [{ inicio: `${args.fecha}T10:30:00-06:00`, disponible: true }];
    },
    async buscarCanceladaReagendableDelPar() {
      return cancelada;
    },
    async listarCanceladasReagendablesPorAsistente() {
      return canceladasReagendables;
    },
    async obtenerCitaPorId(id) {
      if (!citaPorId || citaPorId.id !== id) {
        const err = new Error('no existe');
        err.status = 404;
        throw err;
      }
      return citaPorId;
    },
    datosDeCita(pagina) {
      return {
        id: pagina.id,
        asistentePageId: pagina.asistentePageId,
        sponsorPageId: pagina.sponsorPageId,
        inicio: pagina.inicio,
        estatus: pagina.estatus || 'Confirmada',
      };
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
    async modificarCita(args) {
      modificacionRecibida = args;
      return { estado: 'Confirmada', notion_page_id: args.citaId, mesa: 2, inicio: args.nuevaFechaHora };
    },
    async cancelarCita(args) {
      cancelacionRecibida = args;
      return { estado: 'Cancelada', notion_page_id: args.citaId };
    },
    BookingError: class BookingError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
};

delete require.cache[servicePath];
const {
  identificarPorEmail,
  listarSponsorsPublicos,
  obtenerDisponibilidadPublica,
  reservarPublicamente,
  modificarPublicamente,
  cancelarPublicamente,
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
  giroIndustria: GIROS[0],
  quiereCitas1a1: 'No',
  nombre: 'Ana Pérez',
  empresa: 'Moda Ana',
};

const ASISTENTE_COMPARTIDO = {
  ...ASISTENTE,
  id: 'abababab-abab-abab-abab-abababababab',
  nombre: 'Bruno Pérez',
  empresa: 'Moda Bruno',
  ticketTipo: 'Virtual',
};

const CITA_PROPIA = {
  id: '11111111-1111-1111-1111-111111111111',
  asistentePageId: ASISTENTE.id,
  sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  inicio: '2026-10-07T10:30:00-06:00',
  estatus: 'Confirmada',
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

  coincidenciasEmail = [{ ...ASISTENTE, giroIndustria: 'Agencia de marketing / publicidad' }];
  await assert.rejects(
    () => identificarPorEmail('agencia@example.com'),
    (error) =>
      error.code === 'GIRO_NO_ELEGIBLE' &&
      error.detalle.giro === 'Agencia de marketing / publicidad' &&
      /Agencia de marketing/.test(error.message)
  );

  coincidenciasEmail = [{ ...ASISTENTE, giroIndustria: '' }];
  await assert.rejects(
    () => identificarPorEmail('singiro@example.com'),
    (error) => error.code === 'GIRO_NO_ELEGIBLE' && error.detalle.giro === 'sin giro'
  );

  coincidenciasEmail = [ASISTENTE, ASISTENTE_COMPARTIDO];
  await assert.rejects(
    () => identificarPorEmail('compartido@example.com'),
    (error) =>
      error.code === 'EMAIL_AMBIGUO' &&
      error.status === 409 &&
      error.detalle.personas.length === 2 &&
      error.detalle.personas[1].nombre === 'Bruno Pérez'
  );
  const identidadCompartida = await identificarPorEmail(
    'compartido@example.com',
    ASISTENTE_COMPARTIDO.id
  );
  assert.equal(identidadCompartida.asistente.nombre, 'Bruno Pérez');
  assert.equal(
    verificarTokenReserva(identidadCompartida.token).sub,
    ASISTENTE_COMPARTIDO.id
  );
  await rechaza('SELECCION_PERSONA_INVALIDA', () =>
    identificarPorEmail(
      'compartido@example.com',
      'ffffffff-ffff-ffff-ffff-ffffffffffff'
    )
  );

  canceladasReagendables = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      sponsorPageId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      sponsorEmpresa: 'Sponsor Dos',
      inicio: '2026-10-08T11:00:00-06:00',
    },
  ];
  coincidenciasEmail = [ASISTENTE];
  const identidad = await identificarPorEmail(' ANA@EXAMPLE.COM ');
  assert.equal(identidad.asistente.nombre, 'Ana Pérez');
  assert.equal(identidad.asistente.ticketTipo, 'Presencial');
  assert.equal(identidad.citasConfirmadas.length, 1);
  assert.equal(identidad.citasCanceladasReagendables.length, 1);
  assert.equal(identidad.citasCanceladasReagendables[0].sponsorNombre, 'Sponsor Dos');
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
  assert.equal(disponibilidadArgs.exceptPageId, undefined);

  citaPorId = CITA_PROPIA;
  await obtenerDisponibilidadPublica({
    contactoId: ASISTENTE.id,
    sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    fecha: '2026-10-07',
    exceptCitaId: CITA_PROPIA.id,
  });
  assert.equal(disponibilidadArgs.exceptPageId, CITA_PROPIA.id);

  citaPorId = { ...CITA_PROPIA, asistentePageId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' };
  await rechaza('CITA_NO_PERTENECE', () =>
    obtenerDisponibilidadPublica({
      contactoId: ASISTENTE.id,
      sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fecha: '2026-10-07',
      exceptCitaId: CITA_PROPIA.id,
    })
  );

  cancelada = { id: 'cancelada-1' };
  const reserva = await reservarPublicamente({
    contactoId: ASISTENTE.id,
    sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    inicio: '2026-10-07T10:30:00-06:00',
    fin: '2026-10-07T10:50:00-06:00',
    requestId: '12345678-abcd',
  });
  assert.equal(reserva.estado, 'Confirmada');
  assert.equal(reserva.mesa, 'Mesa 3');
  assert.equal(reserva.whatsappSoporte, '+52 33 3236 1963');
  assert.equal(reservaRecibida.cita_origen_cancelada_id, 'cancelada-1');
  assert.match(reservaRecibida.request_id, /^qr:aaaaaaaa-/);

  coincidenciasEmail = [{ ...ASISTENTE, giroIndustria: 'Pagos / fintech' }];
  await rechaza('GIRO_NO_ELEGIBLE', () =>
    reservarPublicamente({
      contactoId: ASISTENTE.id,
      sponsorPageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T10:50:00-06:00',
      requestId: '12345678-abcd',
    })
  );
  coincidenciasEmail = [ASISTENTE];

  citaPorId = CITA_PROPIA;
  const modificada = await modificarPublicamente({
    contactoId: ASISTENTE.id,
    citaId: CITA_PROPIA.id,
    inicio: '2026-10-07T16:00:00-06:00',
  });
  assert.equal(modificada.estado, 'Confirmada');
  assert.equal(modificacionRecibida.citaId, CITA_PROPIA.id);
  assert.equal(modificacionRecibida.nuevaFechaHora, '2026-10-07T16:00:00-06:00');
  assert.equal(modificacionRecibida.telefono, undefined);

  citaPorId = { ...CITA_PROPIA, asistentePageId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };
  await rechaza('CITA_NO_PERTENECE', () =>
    modificarPublicamente({
      contactoId: ASISTENTE.id,
      citaId: CITA_PROPIA.id,
      inicio: '2026-10-07T16:00:00-06:00',
    })
  );

  citaPorId = CITA_PROPIA;
  const canceladaRespuesta = await cancelarPublicamente({
    contactoId: ASISTENTE.id,
    citaId: CITA_PROPIA.id,
  });
  assert.equal(canceladaRespuesta.estado, 'Cancelada');
  assert.equal(cancelacionRecibida.citaId, CITA_PROPIA.id);

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

    const sesion = emitirTokenReserva({ contactoId: ASISTENTE.id });
    const sinAuthModificar = await fetch(
      `${base}/reserva-publica/citas/${CITA_PROPIA.id}/modificar`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    assert.equal(sinAuthModificar.status, 401);

    citaPorId = { ...CITA_PROPIA, asistentePageId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
    const ajena = await fetch(`${base}/reserva-publica/citas/${CITA_PROPIA.id}/cancelar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion}`,
      },
    });
    assert.equal(ajena.status, 403);
    const ajenaJson = await ajena.json();
    assert.equal(ajenaJson.error, 'CITA_NO_PERTENECE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('✅ reserva-publica: correo compartido, giro, modificar/cancelar y exceptPageId sin Notion/SMTP');
}

main().catch((error) => {
  console.error('❌ reserva-publica:', error);
  process.exitCode = 1;
});
