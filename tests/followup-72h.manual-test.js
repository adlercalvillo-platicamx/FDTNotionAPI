// Barrido automático de follow-up 72h, sin Notion ni WhatsApp reales.
// node tests/followup-72h.manual-test.js

const assert = require('assert');

process.env.FOLLOWUP_72H_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_FOLLOWUP_72H = 'followup_72hrs';

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let contactos = [];
let confirmados = new Set();
let mensajesPorTelefono = {};
let fallarEnvio = false;
let consultasContactos = 0;
const actualizaciones = [];
const respuestas = [];
const envios = [];

function contactoBase(extras = {}) {
  return {
    id: 'contacto-1',
    nombre: 'ANA MARIA PEREZ',
    whatsapp: '+52 449 000 0000',
    ultimaCampanaEnviada: 'Oferta inicial',
    fechaUltimaCampana: '2026-09-04T16:00:00.000Z',
    respondioOfertaInicial: false,
    estadoFollowup72h: null,
    fechaFollowup72h: null,
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
    async marcarRespuestaOfertaInicial(contactoId, fecha) {
      respuestas.push({ contactoId, fecha });
      const contacto = contactos.find((item) => item.id === contactoId);
      if (contacto) {
        contacto.respondioOfertaInicial = true;
        contacto.fechaRespuestaOfertaInicial = fecha;
      }
    },
    async actualizarEstadoFollowup72h(datos) {
      actualizaciones.push({ ...datos });
      const contacto = contactos.find((item) => item.id === datos.contactoId);
      if (contacto) {
        contacto.estadoFollowup72h = datos.estado;
        contacto.fechaFollowup72h = datos.fecha;
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
      return new Map(
        [...confirmados].map((contactoId) => [
          contactoId,
          [{ id: `cita-${contactoId}`, estatus: 'Confirmada' }],
        ])
      );
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
      return { messageId: 'msg-followup', status: 'sent' };
    },
  },
};

delete require.cache[servicePath];
const {
  enviarFollowups72h,
  esHorarioLaboralFollowup,
  estadoFollowupProcesable,
  mensajeEntrantePosterior,
  followupSalientePosterior,
} = require(servicePath);

function reset(lista = [contactoBase()]) {
  contactos = lista;
  confirmados = new Set();
  mensajesPorTelefono = {};
  fallarEnvio = false;
  consultasContactos = 0;
  actualizaciones.length = 0;
  respuestas.length = 0;
  envios.length = 0;
}

const LUNES_10 = new Date('2026-09-07T16:00:00.000Z');

async function main() {
  assert.strictEqual(esHorarioLaboralFollowup(LUNES_10), true);
  assert.strictEqual(esHorarioLaboralFollowup(new Date('2026-09-07T14:59:00.000Z')), false);
  assert.strictEqual(esHorarioLaboralFollowup(new Date('2026-09-08T00:00:00.000Z')), false);
  assert.strictEqual(esHorarioLaboralFollowup(new Date('2026-09-07T00:00:00.000Z')), false);
  assert.strictEqual(esHorarioLaboralFollowup(new Date('2026-09-06T16:00:00.000Z')), false);

  reset();
  let resultado = await enviarFollowups72h({
    modoSimulacion: true,
    ahora: new Date('2026-09-06T16:00:00.000Z'),
  });
  assert.strictEqual(resultado.motivo, 'FUERA_DE_HORARIO_LABORAL');
  assert.strictEqual(consultasContactos, 0);

  reset();
  resultado = await enviarFollowups72h({
    modoSimulacion: true,
    ahora: new Date('2026-09-07T15:59:00.000Z'),
  });
  assert.strictEqual(resultado.candidatos, 0, '71:59 todavía no vence');

  reset();
  resultado = await enviarFollowups72h({ modoSimulacion: true, ahora: LUNES_10 });
  assert.strictEqual(resultado.simulados, 1, '72:00 sí vence');
  assert.strictEqual(resultado.detalle[0].payload.params[0], 'Ana');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(actualizaciones.length, 0, 'simulación no escribe Notion');

  reset([contactoBase({ respondioOfertaInicial: true })]);
  resultado = await enviarFollowups72h({ modoSimulacion: true, ahora: LUNES_10 });
  assert.strictEqual(resultado.omitidosRespondio, 1);

  reset();
  confirmados.add('contacto-1');
  resultado = await enviarFollowups72h({ modoSimulacion: true, ahora: LUNES_10 });
  assert.strictEqual(resultado.omitidosConCita, 1);

  reset();
  mensajesPorTelefono['+52 449 000 0000'] = [
    {
      direction: 'incoming',
      role: 'user',
      creationDate: '2026-09-04T17:00:00.000Z',
      content: 'Tengo una duda',
    },
  ];
  resultado = await enviarFollowups72h({ modoSimulacion: false, ahora: LUNES_10 });
  assert.strictEqual(resultado.omitidosRespondio, 1);
  assert.strictEqual(respuestas.length, 1, 'polling repara webhook perdido');
  assert.strictEqual(envios.length, 0);

  reset();
  resultado = await enviarFollowups72h({ modoSimulacion: false, ahora: LUNES_10 });
  assert.strictEqual(resultado.enviados, 1);
  assert.deepStrictEqual(envios[0], {
    phone: '+52 449 000 0000',
    templateName: 'followup_72hrs',
    params: ['Ana'],
  });
  assert.deepStrictEqual(
    actualizaciones.map((item) => item.estado),
    ['En curso', 'Enviado']
  );
  assert.strictEqual(contactos[0].reactivacionesEnviadas, 1);

  reset([
    contactoBase({
      estadoFollowup72h: 'En curso',
      fechaFollowup72h: '2026-09-07T15:40:00.000Z',
    }),
  ]);
  mensajesPorTelefono['+52 449 000 0000'] = [
    {
      direction: 'outgoing',
      creationDate: '2026-09-07T15:41:00.000Z',
      content:
        'Hola Ana, quiero darle seguimiento personalmente a tus citas 1 a 1, te puedo ayudar.',
    },
  ];
  resultado = await enviarFollowups72h({ modoSimulacion: false, ahora: LUNES_10 });
  assert.strictEqual(resultado.reconciliados, 1);
  assert.strictEqual(envios.length, 0, 'un envío visible en Plática no se duplica');
  assert.strictEqual(contactos[0].estadoFollowup72h, 'Enviado');

  reset([
    contactoBase({
      estadoFollowup72h: 'En curso',
      fechaFollowup72h: '2026-09-07T15:55:00.000Z',
    }),
  ]);
  assert.strictEqual(estadoFollowupProcesable(contactos[0], LUNES_10), false);
  resultado = await enviarFollowups72h({ modoSimulacion: false, ahora: LUNES_10 });
  assert.strictEqual(resultado.omitidosEstado, 1);

  reset();
  fallarEnvio = true;
  resultado = await enviarFollowups72h({ modoSimulacion: false, ahora: LUNES_10 });
  assert.strictEqual(resultado.enviados, 0);
  assert.strictEqual(resultado.errores.length, 1);
  assert.strictEqual(contactos[0].estadoFollowup72h, 'Falló');

  assert.ok(
    mensajeEntrantePosterior(
      [{ direction: 'incoming', creationDate: '2026-09-04T16:00:01.000Z' }],
      '2026-09-04T16:00:00.000Z'
    )
  );
  assert.ok(
    followupSalientePosterior(
      [
        {
          direction: 'outgoing',
          creationDate: '2026-09-07T16:00:00.000Z',
          content: 'Quiero darle seguimiento personalmente a tus citas 1 a 1',
        },
      ],
      '2026-09-07T15:00:00.000Z'
    )
  );

  console.log('✅ 72 horas y ventana laboral CDMX se respetan.');
  console.log('✅ Respuesta por webhook/polling y cita confirmada omiten el envío.');
  console.log('✅ Simulación, primer nombre y estados En curso/Enviado/Falló funcionan.');
  console.log('✅ Un En curso vencido se reconcilia sin duplicar WhatsApp.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
