// Push Sugerido Infracommerce/Revie — sin Notion ni Plática reales.
// node tests/push-oportunidad-sponsor.manual-test.js

const assert = require('assert');

process.env.PUSH_OPORTUNIDAD_SPONSOR_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_PROPUESTA_CITA = 'propuesta_cita';
process.env.PLATICA_TEMPLATE_OFERTA_INICIAL_1 = 'agendar_cita_inicial_aprobado_1';

const citasPath = require.resolve('../src/services/citas.service');
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const pushPath = require.resolve('../src/services/push-oportunidad-sponsor.service');

const SPONSOR_INFRA = '3bc62dda-199a-81bb-b769-f4ef0eab9a5f';
const filas = [];
const aprobados = [];
const envios = [];
const actualizaciones = [];
let ultimaCampana = null;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async listarSugeridasParaPushOportunidad(sponsorPageId) {
      return filas.filter((f) => f.sponsorPageId === sponsorPageId);
    },
    async listarAprobadosSinCampanaPorAsistente(asistentePageId) {
      return aprobados.filter((f) => f.asistentePageId === asistentePageId);
    },
    async actualizarEstadoEnvioCampana(ids, datos) {
      actualizaciones.push({ ids, datos });
    },
    async marcarCampanaEnviada(ids) {
      actualizaciones.push({ marcarCampanaEnviada: ids });
    },
  },
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    CAMPANA_OFERTA_INICIAL: 'Oferta inicial',
    async obtenerContacto(id) {
      if (id === SPONSOR_INFRA) {
        return {
          id,
          empresa: 'Infracommerce',
          nombre: 'Rep Infra',
          solucion: ['CRM / Automatización', 'Marketplace / ecommerce'],
        };
      }
      return {
        id,
        nombre: 'ANA MARIA LOPEZ',
        whatsapp: '+524490000000',
        ticketTipo: 'Presencial',
        solucionesBuscadas: ['CRM / Automatización', 'Customer experience'],
        ultimaCampanaEnviada: ultimaCampana,
      };
    },
    async actualizarEstadoCampana(datos) {
      actualizaciones.push({ actualizarEstadoCampana: datos });
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

const { ejecutarPushOportunidadSponsor } = require(pushPath);

async function run() {
  filas.length = 0;
  aprobados.length = 0;
  envios.length = 0;
  actualizaciones.length = 0;
  ultimaCampana = 'Oferta inicial';

  filas.push({
    id: 'cita-sug-1',
    asistentePageId: 'asistente-1',
    sponsorPageId: SPONSOR_INFRA,
    estadoEnvioCampana: null,
    fechaInicioEnvio: null,
  });

  const propuesta = await ejecutarPushOportunidadSponsor({
    sponsor: 'infracommerce',
    modoSimulacion: true,
  });
  assert.strictEqual(propuesta.simuladosPropuestaCita, 1);
  assert.strictEqual(propuesta.detalle[0].rama, 'propuesta_cita');
  assert.strictEqual(propuesta.detalle[0].payload.templateName, 'propuesta_cita');

  ultimaCampana = null;
  envios.length = 0;
  const oferta = await ejecutarPushOportunidadSponsor({
    sponsor: 'infracommerce',
    modoSimulacion: true,
  });
  assert.strictEqual(oferta.simuladosOfertaInicial, 1);
  assert.strictEqual(oferta.detalle[0].rama, 'oferta_inicial');
  assert.match(oferta.detalle[0].payload.templateName, /agendar_cita_inicial_aprobado_/);

  ultimaCampana = null;
  envios.length = 0;
  actualizaciones.length = 0;
  await ejecutarPushOportunidadSponsor({ sponsor: 'infracommerce', modoSimulacion: false });
  assert.strictEqual(envios.length, 1);
  assert.ok(actualizaciones.some((a) => a.actualizarEstadoCampana));

  console.log('push-oportunidad-sponsor.manual-test.js: OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
