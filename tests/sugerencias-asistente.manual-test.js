// Sugerencias Aprobado por asistente (agente de Carlos), sin Notion real.
//
//   node tests/sugerencias-asistente.manual-test.js

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-citas-ds';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'fake-contactos-ds';

const notionPath = require.resolve('../src/utils/notion-client');
const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const controllerPath = require.resolve('../src/controllers/matchmaking.controller');

let filasNotion = [];
let lastQueryFilter = null;
const contactosPorId = {};
let telefonoBuscado = null;

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(path, options = {}) {
      if (String(path).includes('/query')) {
        lastQueryFilter = options.body ? JSON.parse(options.body).filter : null;
        return { results: filasNotion, has_more: false };
      }
      throw new Error(`notionFetch inesperado: ${path}`);
    },
  },
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async buscarAsistentePorWhatsApp(telefono) {
      telefonoBuscado = telefono;
      const d = String(telefono || '').replace(/\D/g, '');
      if (d.endsWith('3312345678') || d === '523312345678') {
        return contactosPorId['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'];
      }
      return null;
    },
    async obtenerContacto(id) {
      if (!contactosPorId[id]) {
        const err = new Error('object_not_found');
        err.status = 404;
        throw err;
      }
      return contactosPorId[id];
    },
    variantesTelefono(raw) {
      const digits = String(raw || '').replace(/\D/g, '');
      return digits ? [digits] : [];
    },
  },
};

delete require.cache[citasPath];
const {
  consultarSugerenciasAprobadasPorAsistente,
  formatearSugerenciaAprobada,
} = require('../src/services/citas.service');

delete require.cache[controllerPath];
const { sugerenciasAsistente } = require('../src/controllers/matchmaking.controller');

function filaCita({ id, estatus, score, campanaEnviada, sponsorId }) {
  return {
    id,
    properties: {
      Estatus: { select: { name: estatus } },
      'Campaña Enviada': { checkbox: campanaEnviada },
      'Contacto Match': { relation: sponsorId ? [{ id: sponsorId }] : [] },
      Notas: { rich_text: [{ plain_text: `Score: ${score}\n` }] },
    },
  };
}

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

function setupAsistente() {
  const asistenteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  contactosPorId[asistenteId] = {
    id: asistenteId,
    nombre: 'Ana',
    empresa: 'Marca Ana',
    whatsapp: '+52 33 1234 5678',
  };
  contactosPorId['asistente-1'] = contactosPorId[asistenteId];
  contactosPorId['sponsor-alto'] = {
    id: 'sponsor-alto',
    nombre: 'Persona Alto',
    empresa: 'Empresa Alto',
    solucion: ['PLM'],
  };
  contactosPorId['sponsor-medio'] = {
    id: 'sponsor-medio',
    nombre: 'Persona Medio',
    empresa: 'Empresa Medio',
    solucion: ['Anti fraude'],
  };
  contactosPorId['sponsor-bajo'] = {
    id: 'sponsor-bajo',
    nombre: 'Persona Bajo',
    empresa: 'Empresa Bajo',
    solucion: ['WhatsApp 24/7'],
  };
}

async function casoTresAprobadasOrdenadasPorScore() {
  setupAsistente();
  filasNotion = [
    filaCita({
      id: 'cita-baja',
      estatus: 'Aprobado',
      score: 10,
      campanaEnviada: false,
      sponsorId: 'sponsor-bajo',
    }),
    filaCita({
      id: 'cita-alta',
      estatus: 'Aprobado',
      score: 90,
      campanaEnviada: true,
      sponsorId: 'sponsor-alto',
    }),
    filaCita({
      id: 'cita-media',
      estatus: 'Aprobado',
      score: 40,
      campanaEnviada: false,
      sponsorId: 'sponsor-medio',
    }),
  ];
  lastQueryFilter = null;
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    telefono: '+52 33 1234 5678',
  });
  assert.strictEqual(telefonoBuscado, '+52 33 1234 5678');
  assert.deepStrictEqual(resultado.asistente, {
    nombre: 'Ana',
    telefono: '+52 33 1234 5678',
    empresa: 'Marca Ana',
  });
  assert.deepStrictEqual(
    resultado.sugerencias.map((s) => s.citaId),
    ['cita-alta', 'cita-media', 'cita-baja']
  );
  assert.strictEqual(resultado.sugerencias[0].sponsorNombre, 'Empresa Alto');
  assert.strictEqual(resultado.sugerencias[0].solucion, 'PLM');
  assert.strictEqual(resultado.sugerencias[0].score, 90);
  assert.strictEqual(resultado.sugerencias[0].campanaEnviada, true);
  assert.strictEqual(resultado.sugerencias[1].campanaEnviada, false);
  assert.strictEqual(resultado.sugerencias[2].campanaEnviada, false);
  const filtroTxt = JSON.stringify(lastQueryFilter);
  assert.ok(filtroTxt.includes('"Aprobado"'));
  assert.ok(!filtroTxt.includes('Sugerido'), 'el query de Notion no debe pedir Sugerido');
  assert.ok(!filtroTxt.includes('Campaña Enviada'), 'no filtrar por Campaña Enviada');
}

async function casoSinAprobadasListaVacia() {
  setupAsistente();
  filasNotion = [];
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    contactoId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  assert.deepStrictEqual(resultado.sugerencias, []);
}

function casoFormatoCampanaEnviadaUsaCheckbox() {
  const enviada = formatearSugerenciaAprobada(
    filaCita({
      id: 'c1',
      estatus: 'Aprobado',
      score: 1,
      campanaEnviada: true,
      sponsorId: 's1',
    }),
    { empresa: 'X', solucion: ['A'] }
  );
  const noEnviada = formatearSugerenciaAprobada(
    filaCita({
      id: 'c2',
      estatus: 'Aprobado',
      score: 1,
      campanaEnviada: false,
      sponsorId: 's1',
    }),
    { empresa: 'X', solucion: ['A'] }
  );
  assert.strictEqual(enviada.campanaEnviada, true);
  assert.strictEqual(noEnviada.campanaEnviada, false);
}

async function casoControllerSinParams400() {
  const res = mockRes();
  await sugerenciasAsistente({ query: {} }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'INVALID_INPUT');
}

async function casoControllerTelefonoDesconocido404() {
  const res = mockRes();
  await sugerenciasAsistente({ query: { telefono: '529999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.error, 'CONTACTO_NO_RESUELTO');
}

async function casoControllerPorContactoId() {
  setupAsistente();
  filasNotion = [
    filaCita({
      id: 'cita-id',
      estatus: 'Aprobado',
      score: 12,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
    }),
  ];
  const res = mockRes();
  await sugerenciasAsistente(
    { query: { contactoId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.sugerencias.length, 1);
  assert.strictEqual(res.body.sugerencias[0].citaId, 'cita-id');
}

async function main() {
  await casoTresAprobadasOrdenadasPorScore();
  console.log('✅ Solo Aprobado, orden por score, campanaEnviada real, query sin filtro de campaña.');
  await casoSinAprobadasListaVacia();
  console.log('✅ Sin Aprobado → sugerencias: [] (no error).');
  casoFormatoCampanaEnviadaUsaCheckbox();
  console.log('✅ campanaEnviada sale del checkbox, no de un default.');
  await casoControllerSinParams400();
  console.log('✅ Sin telefono ni contactoId → 400.');
  await casoControllerTelefonoDesconocido404();
  console.log('✅ Teléfono desconocido → 404.');
  await casoControllerPorContactoId();
  console.log('✅ contactoId resuelve sin pasar por teléfono.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
