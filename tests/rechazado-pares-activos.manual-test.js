// Verifica que Rechazado bloquee un par en los dos caminos:
// consulta individual y caché de sugerirMatchesGlobal.
//
//   node tests/rechazado-pares-activos.manual-test.js

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'citas-test';

const notionClientPath = require.resolve('../src/utils/notion-client');
const citasServicePath = require.resolve('../src/services/citas.service');

const cuerpos = [];
require.cache[notionClientPath] = {
  id: notionClientPath,
  filename: notionClientPath,
  loaded: true,
  exports: {
    async notionFetch(_path, options) {
      const body = JSON.parse(options.body);
      cuerpos.push(body);

      if (body.page_size === 100) {
        return {
          results: [
            {
              properties: {
                'Contacto Match': { relation: [{ id: 'sponsor-1' }] },
                'Contacto Principal': { relation: [{ id: 'asistente-1' }] },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        };
      }

      return { results: [{ id: 'fila-rechazada' }] };
    },
  },
};

delete require.cache[citasServicePath];
const citasService = require('../src/services/citas.service');

async function main() {
  const existe = await citasService.existeCitaActivaEntre({
    sponsorPageId: 'sponsor-1',
    asistentePageId: 'asistente-1',
  });
  assert.strictEqual(existe, true);

  const filtroIndividual = cuerpos[0].filter.and[2].or;
  assert.ok(
    filtroIndividual.some((condicion) => condicion.property === 'Estatus' && condicion.select?.equals === 'Rechazado'),
    'existeCitaActivaEntre debe incluir Estatus=Rechazado'
  );

  const pares = await citasService.obtenerParesConCitaActiva();
  const filtroCache = cuerpos[1].filter.or;
  assert.ok(
    filtroCache.some((condicion) => condicion.property === 'Estatus' && condicion.select?.equals === 'Rechazado'),
    'ESTATUS_ACTIVOS debe incluir Rechazado'
  );
  assert.strictEqual(
    citasService.existeCitaActivaEntreEnCache(pares, {
      sponsorPageId: 'sponsor-1',
      asistentePageId: 'asistente-1',
    }),
    true
  );

  console.log('✅ Rechazado bloquea el par en consulta individual y caché global.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
