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
let lastQueryFilters = [];
const contactosPorId = {};
let telefonoBuscado = null;

function estatusEnFiltro(filter) {
  const names = [];
  function walk(nodo) {
    if (!nodo) return;
    if (nodo.property === 'Estatus' && nodo.select?.equals) names.push(nodo.select.equals);
    if (Array.isArray(nodo.and)) nodo.and.forEach(walk);
    if (Array.isArray(nodo.or)) nodo.or.forEach(walk);
  }
  walk(filter);
  return names;
}

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(path, options = {}) {
      if (String(path).includes('/query')) {
        lastQueryFilters.push(options.body ? JSON.parse(options.body).filter : null);
        const pedidos = estatusEnFiltro(lastQueryFilters[lastQueryFilters.length - 1]);
        const results = pedidos.length
          ? filasNotion.filter((f) => pedidos.includes(f.properties?.Estatus?.select?.name))
          : filasNotion;
        return { results, has_more: false };
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

function filaCita({ id, estatus, score, campanaEnviada, sponsorId, inicio, mesa, checkIn }) {
  return {
    id,
    properties: {
      Estatus: { select: { name: estatus } },
      'Campaña Enviada': { checkbox: campanaEnviada },
      'Contacto Match': { relation: sponsorId ? [{ id: sponsorId }] : [] },
      'Contacto Principal': { relation: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }] },
      Notas: { rich_text: [{ plain_text: `Score: ${score}\n` }] },
      'Fecha y Hora': inicio ? { date: { start: inicio, end: null } } : { date: null },
      'Mesa / Ubicacion': mesa
        ? { rich_text: [{ plain_text: mesa, text: { content: mesa } }] }
        : { rich_text: [] },
      'Check-in Realizado': { checkbox: checkIn === true },
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
  lastQueryFilters = [];
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
  const filtroTxt = JSON.stringify(lastQueryFilters);
  assert.ok(filtroTxt.includes('"Aprobado"'));
  assert.ok(!filtroTxt.includes('Sugerido'), 'el query de Notion no debe pedir Sugerido');
  assert.ok(!filtroTxt.includes('Campaña Enviada'), 'no filtrar por Campaña Enviada');
  assert.deepStrictEqual(resultado.citasConfirmadas, []);
}

async function casoSinAprobadasListaVacia() {
  setupAsistente();
  filasNotion = [];
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    contactoId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  assert.deepStrictEqual(resultado.sugerencias, []);
  assert.deepStrictEqual(resultado.citasConfirmadas, []);
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
  assert.deepStrictEqual(res.body.citasConfirmadas, []);
}

async function casoAprobadasYConfirmadasNoSeMezclan() {
  setupAsistente();
  filasNotion = [
    filaCita({
      id: 'ap-1',
      estatus: 'Aprobado',
      score: 80,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
    }),
    filaCita({
      id: 'ap-2',
      estatus: 'Aprobado',
      score: 20,
      campanaEnviada: true,
      sponsorId: 'sponsor-medio',
    }),
    filaCita({
      id: 'conf-1',
      estatus: 'Confirmada',
      score: 99,
      campanaEnviada: true,
      sponsorId: 'sponsor-bajo',
      inicio: '2026-10-07T12:00:00-06:00',
      mesa: 'Mesa 3',
      checkIn: false,
    }),
    filaCita({
      id: 'cancelada',
      estatus: 'Cancelada',
      score: 1,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
      inicio: '2026-10-07T10:30:00-06:00',
    }),
    filaCita({
      id: 'sugerida',
      estatus: 'Sugerido',
      score: 50,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
    }),
  ];
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    telefono: '+52 33 1234 5678',
  });
  assert.deepStrictEqual(
    resultado.sugerencias.map((s) => s.citaId),
    ['ap-1', 'ap-2']
  );
  assert.deepStrictEqual(
    resultado.citasConfirmadas.map((c) => c.citaId),
    ['conf-1']
  );
  assert.deepStrictEqual(resultado.citasConfirmadas[0], {
    sponsorNombre: 'Empresa Bajo',
    sponsor_notion_id: 'sponsor-bajo',
    fechaHora: '2026-10-07T12:00:00-06:00',
    mesa: 'Mesa 3',
    citaId: 'conf-1',
    checkInRealizado: false,
  });
}

async function casoConfirmadaYSinNotificar() {
  setupAsistente();
  filasNotion = [
    filaCita({
      id: 'sin-notif',
      estatus: 'Confirmada sin notificar',
      score: 10,
      campanaEnviada: false,
      sponsorId: 'sponsor-medio',
      inicio: '2026-10-08T09:00:00-06:00',
      mesa: 'Mesa 1',
    }),
    filaCita({
      id: 'conf',
      estatus: 'Confirmada',
      score: 10,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
      inicio: '2026-10-07T16:00:00-06:00',
      mesa: 'Mesa 2',
      checkIn: true,
    }),
  ];
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    contactoId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  assert.deepStrictEqual(resultado.sugerencias, []);
  assert.deepStrictEqual(
    resultado.citasConfirmadas.map((c) => c.citaId),
    ['conf', 'sin-notif']
  );
  assert.strictEqual(resultado.citasConfirmadas[0].checkInRealizado, true);
  assert.strictEqual(resultado.citasConfirmadas[1].checkInRealizado, false);
}

async function casoOrdenCronologicoConfirmadas() {
  setupAsistente();
  filasNotion = [
    filaCita({
      id: 'tarde',
      estatus: 'Confirmada',
      score: 1,
      campanaEnviada: false,
      sponsorId: 'sponsor-bajo',
      inicio: '2026-10-08T17:00:00-06:00',
    }),
    filaCita({
      id: 'manana',
      estatus: 'Confirmada',
      score: 1,
      campanaEnviada: false,
      sponsorId: 'sponsor-alto',
      inicio: '2026-10-07T10:30:00-06:00',
    }),
    filaCita({
      id: 'medio',
      estatus: 'Confirmada sin notificar',
      score: 1,
      campanaEnviada: false,
      sponsorId: 'sponsor-medio',
      inicio: '2026-10-07T15:00:00-06:00',
    }),
  ];
  const resultado = await consultarSugerenciasAprobadasPorAsistente({
    telefono: '+52 33 1234 5678',
  });
  assert.deepStrictEqual(
    resultado.citasConfirmadas.map((c) => c.citaId),
    ['manana', 'medio', 'tarde']
  );
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
  await casoAprobadasYConfirmadasNoSeMezclan();
  console.log('✅ 2 Aprobado + 1 Confirmada: arrays separados; Cancelada/Sugerido fuera.');
  await casoConfirmadaYSinNotificar();
  console.log('✅ Confirmada y Confirmada sin notificar salen juntas en citasConfirmadas.');
  await casoOrdenCronologicoConfirmadas();
  console.log('✅ citasConfirmadas ordenadas por fechaHora ascendente.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
