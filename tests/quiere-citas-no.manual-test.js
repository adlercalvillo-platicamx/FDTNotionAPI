// Audiencia y simulación de quiere_citas_no. No llama a Notion ni a Plática.
// node tests/quiere-citas-no.manual-test.js

const assert = require('assert');

const contactosReales = require('../src/services/contactos.service');
const respuestas = require('../src/services/platica-respuestas.service');

const GIRO = contactosReales.GIROS_ELEGIBLES_MATCHMAKING[0];
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicioPath = require.resolve('../src/services/quiere-citas-no.service');

let listados = [];
const envios = [];
const marcas = [];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    GIROS_ELEGIBLES_MATCHMAKING: contactosReales.GIROS_ELEGIBLES_MATCHMAKING,
    TIPOS_BOLETO_CON_OPTIN: contactosReales.TIPOS_BOLETO_CON_OPTIN,
    CAMPANA_OFERTA_INICIAL: contactosReales.CAMPANA_OFERTA_INICIAL,
    CAMPANA_QUIERE_CITAS_NO: contactosReales.CAMPANA_QUIERE_CITAS_NO,
    async listarAsistentesConQuiereCitasNo() {
      return listados;
    },
    async actualizarEstadoCampana(datos) {
      marcas.push(datos);
    },
  },
};

require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async enviarPlantilla(payload) {
      envios.push(payload);
      return { ok: true };
    },
  },
};

delete require.cache[servicioPath];
const {
  esAudienciaQuiereCitasNo,
  viaTamanoQuiereCitasNo,
  motivoNoEnviar,
  payloadQuiereCitasNo,
  enviarQuiereCitasNo,
  CAMPANA,
} = require(servicioPath);

function persona(extra) {
  return {
    id: 'c1',
    categoria: 'Asistente',
    dadoDeBaja: false,
    quiereCitas1a1: 'No',
    giroIndustria: GIRO,
    ticketTipo: 'Presencial',
    tamanoNegocio: 'Grande - más de 250 empleados',
    madurezNegocioExa: null,
    whatsapp: '+525500000000',
    ultimaCampanaEnviada: null,
    citasConfirmadasAsistente: 0,
    nombre: 'ANA MARIA PEREZ LOPEZ',
    empresa: 'Marca',
    ...extra,
  };
}

async function main() {
  assert.strictEqual(CAMPANA, 'Quiere citas no');
  assert.strictEqual(contactosReales.CAMPANA_QUIERE_CITAS_NO, CAMPANA);
  assert.strictEqual(respuestas.CAMPANA_QUIERE_CITAS_NO, CAMPANA);
  assert.notStrictEqual(CAMPANA, contactosReales.CAMPANA_OFERTA_INICIAL);
  assert.ok(respuestas.CAMPANAS_QUE_MARCAN_RESPUESTA.has('Oferta inicial'));
  assert.ok(respuestas.CAMPANAS_QUE_MARCAN_RESPUESTA.has(CAMPANA));
  assert.strictEqual(respuestas.CAMPANAS_QUE_MARCAN_RESPUESTA.has('C - Reactivación'), false);

  assert.strictEqual(viaTamanoQuiereCitasNo(persona()), 'Grande');
  assert.strictEqual(
    viaTamanoQuiereCitasNo(persona({ tamanoNegocio: 'Mediana - 50 a 250 empleados' })),
    'Mediana'
  );
  assert.strictEqual(
    viaTamanoQuiereCitasNo(
      persona({
        tamanoNegocio: 'Pequeña - 10 a 50 empleados',
        madurezNegocioExa: 'PyME',
      })
    ),
    'Pequeña+PyME'
  );
  assert.strictEqual(
    viaTamanoQuiereCitasNo(
      persona({
        tamanoNegocio: 'Micro - menos de 10 empleados',
        madurezNegocioExa: 'Consolidado',
      })
    ),
    'Micro+Consolidado'
  );
  assert.strictEqual(
    viaTamanoQuiereCitasNo(persona({ tamanoNegocio: null, madurezNegocioExa: 'Consolidado' })),
    'legacy_Consolidado'
  );
  assert.strictEqual(
    viaTamanoQuiereCitasNo(
      persona({ tamanoNegocio: 'Pequeña - 10 a 50 empleados', madurezNegocioExa: 'Temprano' })
    ),
    null
  );
  assert.strictEqual(
    viaTamanoQuiereCitasNo(persona({ tamanoNegocio: null, madurezNegocioExa: null })),
    null
  );
  assert.strictEqual(
    esAudienciaQuiereCitasNo(persona({ tamanoNegocio: 'Pequeña - 10 a 50 empleados' })),
    false,
    'Pequeña sin Exa queda fuera'
  );
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ ticketTipo: 'Speaker' })), false);
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ ticketTipo: 'Presencial VIP' })), false);
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ ticketTipo: 'Expo' })), false);
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ ticketTipo: 'Breakfast' })), true);
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ quiereCitas1a1: 'Sí' })), false);
  assert.strictEqual(esAudienciaQuiereCitasNo(persona({ giroIndustria: 'Marketing' })), false);
  assert.strictEqual(
    esAudienciaQuiereCitasNo(
      persona({ tamanoNegocio: 'Pequeña - 10 a 50 empleados', madurezNegocioExa: 'PyME' })
    ),
    true
  );

  assert.strictEqual(motivoNoEnviar(persona()), null);
  assert.strictEqual(motivoNoEnviar(persona({ whatsapp: '' })), 'SIN_WHATSAPP');
  assert.strictEqual(
    motivoNoEnviar(persona({ ultimaCampanaEnviada: 'Oferta inicial' })),
    'YA_TIENE_CAMPANA'
  );
  assert.strictEqual(motivoNoEnviar(persona({ citasConfirmadasAsistente: 1 })), 'YA_TIENE_CITAS');

  const payload = payloadQuiereCitasNo(persona(), true);
  assert.strictEqual(payload.templateName, 'quiere_citas_no');
  assert.deepStrictEqual(payload.params, ['Ana']);

  listados = [
    persona(),
    persona({
      id: 'chica',
      nombre: 'LUZ MARIA SOTO',
      tamanoNegocio: 'Pequeña - 10 a 50 empleados',
      madurezNegocioExa: 'Consolidado',
      ticketTipo: 'Virtual',
    }),
    persona({ id: 'speaker', ticketTipo: 'Speaker' }),
    persona({ id: 'sin-tel', whatsapp: null }),
    persona({ id: 'ya', ultimaCampanaEnviada: 'Oferta inicial' }),
  ];

  delete process.env.QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO;
  const sim = await enviarQuiereCitasNo({ modoSimulacion: true });
  assert.strictEqual(sim.modoSimulacion, true);
  assert.strictEqual(sim.campana, 'Quiere citas no');
  assert.strictEqual(sim.simulados, 2);
  assert.strictEqual(sim.enviados, 0);
  assert.strictEqual(sim.omitidos, 2);
  assert.strictEqual(envios.length, 0, 'simulación no manda WhatsApp');
  assert.strictEqual(marcas.length, 0, 'simulación no escribe Notion');
  assert.deepStrictEqual(
    sim.detalle.filter((fila) => fila.simulado).map((fila) => fila.payload.params[0]),
    ['Ana', 'Luz']
  );

  await assert.rejects(
    () => enviarQuiereCitasNo({ modoSimulacion: false }),
    /QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO/
  );
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(marcas.length, 0);

  process.env.QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO = 'true';
  process.env.PLATICA_TEMPLATE_QUIERE_CITAS_NO = 'quiere_citas_no';
  listados = [persona({ id: 'real', nombre: 'PEDRO ALVAREZ' })];
  const real = await enviarQuiereCitasNo({ modoSimulacion: false });
  assert.strictEqual(real.enviados, 1);
  assert.strictEqual(real.simulados, 0);
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(envios[0].templateName, 'quiere_citas_no');
  assert.deepStrictEqual(envios[0].params, ['Pedro']);
  assert.strictEqual(marcas.length, 1);
  assert.strictEqual(marcas[0].contactoId, 'real');
  assert.strictEqual(marcas[0].campana, 'Quiere citas no');
  assert.ok(marcas[0].fechaEnvio);
  delete process.env.QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO;
  delete process.env.PLATICA_TEMPLATE_QUIERE_CITAS_NO;

  console.log('✅ Grande/Mediana entran; Pequeña/Micro solo con Exa Consolidado o PyME.');
  console.log('✅ Speaker, VIP y Expo quedan fuera. Follow-up sigue en Oferta inicial.');
  console.log('✅ Simulación no manda WhatsApp ni escribe Notion.');
  console.log('✅ El envío real (mock) marca Última Campaña = Quiere citas no.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
