// Barrido de last call (6-oct 09:30), sin Notion ni WhatsApp reales.
// node tests/lastcall.manual-test.js

const assert = require('assert');

process.env.LASTCALL_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_LASTCALL = 'lastcall_cita1a1';
process.env.LASTCALL_DESDE = '2026-10-06T09:30';

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let contactos = [];
let citasPorAsistente = new Map();
let mensajesPorTelefono = {};
let fallarEnvio = false;
let consultasContactos = 0;
const actualizaciones = [];
const envios = [];

function contactoBase(extras = {}) {
  return {
    id: 'contacto-1',
    nombre: 'ANA MARIA PEREZ',
    whatsapp: '+52 449 000 0000',
    ultimaCampanaEnviada: 'Oferta inicial',
    fechaUltimaCampana: '2026-09-04T16:00:00.000Z',
    respondioOfertaInicial: false,
    estadoLastcall: null,
    fechaLastcall: null,
    reactivacionesEnviadas: 0,
    ...extras,
  };
}

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async listarContactosConOfertaInicialVencida(fechaLimite) {
      consultasContactos += 1;
      const limite = new Date(fechaLimite).getTime();
      return contactos.filter((contacto) => new Date(contacto.fechaUltimaCampana).getTime() <= limite);
    },
    async actualizarEstadoLastcall(datos) {
      actualizaciones.push({ ...datos });
      const contacto = contactos.find((item) => item.id === datos.contactoId);
      if (contacto) {
        contacto.estadoLastcall = datos.estado;
        contacto.fechaLastcall = datos.fecha;
        if (typeof datos.reactivacionesEnviadas === 'number') {
          contacto.reactivacionesEnviadas = datos.reactivacionesEnviadas;
        }
      }
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async cargarCitasPorAsistenteParaRecordatorio() {
      return citasPorAsistente;
    },
  },
};

require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async cargarMensajesCliente(phone) {
      return mensajesPorTelefono[phone] || [];
    },
    async enviarPlantilla(payload) {
      if (fallarEnvio) throw new Error('Plática no disponible');
      envios.push(payload);
      return { messageId: 'msg-lastcall', status: 'sent' };
    },
  },
};

delete require.cache[servicePath];
const {
  enviarLastcall,
  evaluarVentanaLastcall,
  estadoLastcallProcesable,
  lastcallSalientePosterior,
} = require(servicePath);

function reset(lista = [contactoBase()]) {
  contactos = lista;
  citasPorAsistente = new Map();
  mensajesPorTelefono = {};
  fallarEnvio = false;
  consultasContactos = 0;
  actualizaciones.length = 0;
  envios.length = 0;
}

const MARTES_10 = new Date('2026-10-06T16:00:00.000Z');
const ANTES_DE_LA_VENTANA = new Date('2026-10-06T15:29:00.000Z');
const AL_ABRIR_VENTANA = new Date('2026-10-06T15:30:00.000Z');

async function main() {
  assert.strictEqual(evaluarVentanaLastcall(ANTES_DE_LA_VENTANA).cumplida, false);
  assert.strictEqual(evaluarVentanaLastcall(AL_ABRIR_VENTANA).cumplida, true);

  reset();
  let resultado = await enviarLastcall({
    modoSimulacion: true,
    ahora: ANTES_DE_LA_VENTANA,
  });
  assert.strictEqual(resultado.motivo, 'VENTANA_NO_CUMPLIDA');
  assert.strictEqual(consultasContactos, 0);

  reset();
  resultado = await enviarLastcall({
    modoSimulacion: true,
    ahora: new Date('2026-10-07T14:00:00.000Z'),
  });
  assert.strictEqual(resultado.motivo, 'FUERA_DE_HORARIO_LABORAL');
  assert.strictEqual(consultasContactos, 0);

  reset();
  resultado = await enviarLastcall({ modoSimulacion: true, ahora: AL_ABRIR_VENTANA });
  assert.strictEqual(resultado.simulados, 1);
  assert.strictEqual(resultado.detalle[0].payload.params[0], 'Ana');
  assert.strictEqual(resultado.detalle[0].payload.templateName, 'lastcall_cita1a1');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(actualizaciones.length, 0);

  reset([contactoBase({ respondioOfertaInicial: true })]);
  resultado = await enviarLastcall({ modoSimulacion: true, ahora: MARTES_10 });
  assert.strictEqual(resultado.simulados, 1, 'haber respondido no excluye si no hay cita activa');

  reset();
  citasPorAsistente.set('contacto-1', [{ id: 'cita-1', estatus: 'Confirmada' }]);
  resultado = await enviarLastcall({ modoSimulacion: true, ahora: MARTES_10 });
  assert.strictEqual(resultado.omitidosConCita, 1);

  reset();
  citasPorAsistente.set('contacto-1', [{ id: 'cita-1', estatus: 'Cancelada' }]);
  resultado = await enviarLastcall({ modoSimulacion: true, ahora: MARTES_10 });
  assert.strictEqual(resultado.simulados, 1, 'solo Cancelada no cuenta como cita activa');

  reset();
  resultado = await enviarLastcall({ modoSimulacion: false, ahora: MARTES_10 });
  assert.strictEqual(resultado.enviados, 1);
  assert.deepStrictEqual(envios[0], {
    phone: '+52 449 000 0000',
    templateName: 'lastcall_cita1a1',
    params: ['Ana'],
  });
  assert.deepStrictEqual(
    actualizaciones.map((item) => item.estado),
    ['En curso', 'Enviado']
  );
  assert.strictEqual(contactos[0].reactivacionesEnviadas, 1);

  reset([
    contactoBase({
      estadoLastcall: 'En curso',
      fechaLastcall: '2026-10-06T15:40:00.000Z',
    }),
  ]);
  mensajesPorTelefono['+52 449 000 0000'] = [
    {
      direction: 'outgoing',
      creationDate: '2026-10-06T15:41:00.000Z',
      content: 'Hoy cerramos la agenda preliminar de las citas de negocio y nos encantaría.',
    },
  ];
  resultado = await enviarLastcall({ modoSimulacion: false, ahora: MARTES_10 });
  assert.strictEqual(resultado.reconciliados, 1);
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(contactos[0].estadoLastcall, 'Enviado');

  reset([
    contactoBase({
      estadoLastcall: 'En curso',
      fechaLastcall: '2026-10-06T15:55:00.000Z',
    }),
  ]);
  assert.strictEqual(estadoLastcallProcesable(contactos[0], MARTES_10), false);
  resultado = await enviarLastcall({ modoSimulacion: false, ahora: MARTES_10 });
  assert.strictEqual(resultado.omitidosEstado, 1);

  reset();
  fallarEnvio = true;
  resultado = await enviarLastcall({ modoSimulacion: false, ahora: MARTES_10 });
  assert.strictEqual(resultado.enviados, 0);
  assert.strictEqual(resultado.errores.length, 1);
  assert.strictEqual(contactos[0].estadoLastcall, 'Falló');

  assert.ok(
    lastcallSalientePosterior(
      [
        {
          direction: 'outgoing',
          creationDate: '2026-10-06T16:00:00.000Z',
          content: 'Hoy cerramos la agenda preliminar de las citas de negocio',
        },
      ],
      '2026-10-06T15:00:00.000Z'
    )
  );

  console.log('✅ La ventana del 6-oct 09:30 CDMX se respeta.');
  console.log('✅ Sin cita activa entra; Confirmada sale; Cancelada entra; respondió no excluye.');
  console.log('✅ Simulación, primer nombre y estados En curso/Enviado/Falló funcionan.');
  console.log('✅ Un En curso vencido se reconcilia sin duplicar WhatsApp.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
