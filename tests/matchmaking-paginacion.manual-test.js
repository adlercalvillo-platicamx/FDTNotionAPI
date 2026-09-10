// Paginación de buscarAsistentesCandidatos: Notion corta en 100; el pool
// debe concatenar has_more. Sin red, mock de notionFetch.
//
//   node tests/matchmaking-paginacion.manual-test.js

const assert = require('assert');

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'test-contactos-paginacion';

const notionPath = require.resolve('../src/utils/notion-client');
const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const matchmakingPath = require.resolve('../src/services/matchmaking.service');

function paginaVip(id) {
  return {
    id,
    properties: {
      Nombre: { title: [{ plain_text: id }] },
      Empresa: { rich_text: [{ plain_text: `Empresa ${id}` }] },
      Categoria: { select: { name: 'Asistente' } },
      'Ticket / Tipo Asistencia': { select: { name: 'Presencial VIP' } },
      'Giro / Industria': {
        select: {
          name: 'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)',
        },
      },
      'Dado de Baja': { checkbox: false },
      'Quiere Citas 1a1': { select: null },
      'Soluciones Buscadas': { multi_select: [{ name: 'Pagos' }] },
    },
  };
}

const idsPagina1 = Array.from({ length: 100 }, (_, i) => `pool-${String(i + 1).padStart(3, '0')}`);
const idsPagina2 = ['pool-101', 'pool-102'];
let llamadasQuery = 0;

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(_path, options) {
      const body = JSON.parse(options.body || '{}');
      llamadasQuery += 1;
      if (!body.start_cursor) {
        return {
          results: idsPagina1.map(paginaVip),
          has_more: true,
          next_cursor: 'cursor-pagina-2',
        };
      }
      if (body.start_cursor === 'cursor-pagina-2') {
        return {
          results: idsPagina2.map(paginaVip),
          has_more: false,
        };
      }
      throw new Error(`cursor inesperado: ${body.start_cursor}`);
    },
  },
};

delete require.cache[contactosPath];
const contactos = require('../src/services/contactos.service');

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async existeCitaActivaEntre() {
      throw new Error('no debe llamarse existeCitaActivaEntre en el camino individual');
    },
    async obtenerParesConCitaActiva() {
      return new Set();
    },
    existeCitaActivaEntreEnCache(paresActivos, { sponsorPageId, asistentePageId }) {
      return paresActivos.has(`${sponsorPageId}|${asistentePageId}`);
    },
    async contarCitasConfirmadasPorSponsor() {
      return 0;
    },
  },
};

delete require.cache[matchmakingPath];
const { sugerirMatchesParaSponsor } = require('../src/services/matchmaking.service');

async function main() {
  const pool = await contactos.buscarAsistentesCandidatos({});
  assert.strictEqual(llamadasQuery, 2, 'debe pedir las dos páginas');
  assert.strictEqual(pool.length, 102);
  assert.ok(pool.some((c) => c.id === 'pool-101'), 'la segunda página entra al pool');
  assert.ok(pool.some((c) => c.id === 'pool-102'));

  const obtenerContactoOrig = contactos.obtenerContacto;
  contactos.obtenerContacto = async () => ({
    id: 'sponsor-paginacion',
    nombre: 'Sponsor Paginacion',
    categoria: 'Sponsor',
    empresa: 'Sponsor SA',
    nivelPatrocinio: 'Oro',
    citasMinimasPrometidas: 2,
    etapaClienteBuscada: [],
    puestosBuscados: [],
    solucion: ['Pagos'],
    clientesActuales: '',
    clientesPotencialesDeseados: '',
  });

  const r = await sugerirMatchesParaSponsor('sponsor-paginacion', {
    topN: 200,
    escribirEnNotion: false,
  });
  assert.strictEqual(r.totalCandidatosEvaluados, 102);
  assert.strictEqual(r.totalCandidatosValidos, 102);
  assert.ok(r.sugerencias.some((s) => s.id === 'pool-102'));
  contactos.obtenerContacto = obtenerContactoOrig;
  console.log('OK paginación 102 candidatos (2 páginas) y camino individual sin HTTP por par');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
