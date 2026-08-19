const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-citas';

const asistenteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const sponsorId = '11111111-2222-3333-4444-555555555555';
const filtros = [];

const notionPath = require.resolve('../src/utils/notion-client');
require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    notionFetch: async (ruta, opciones) => {
      assert.strictEqual(ruta, '/data_sources/fake-citas/query');
      filtros.push(JSON.parse(opciones.body).filter);
      return {
        results: [
          {
            id: 'cita-sugerida',
            properties: {
              Estatus: { select: { name: 'Aprobado' } },
              'Contacto Match': { relation: [{ id: sponsorId }] },
            },
          },
        ],
        has_more: false,
      };
    },
  },
};

const contactosPath = require.resolve('../src/services/contactos.service');
require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    buscarAsistentePorWhatsApp: async () => ({
      id: asistenteId,
      nombre: 'Ana Test',
      empresa: 'Marca Test',
      whatsapp: '+52 55 1111 1111',
    }),
    obtenerContacto: async (id) => {
      if (id === asistenteId) {
        return {
          id,
          nombre: 'Ana Test',
          empresa: 'Marca Test',
          whatsapp: '+52 55 1111 1111',
        };
      }
      assert.strictEqual(id, sponsorId);
      return {
        id,
        nombre: 'Daniela Test',
        empresa: 'Sponsor Test',
        calendarioGoogleId: 'calendar@test',
        nivelPatrocinio: 'Diamante',
      };
    },
  },
};

const { consultarSugeridasPorIdentificador } = require('../src/services/citas.service');

async function main() {
  const porWhatsapp = await consultarSugeridasPorIdentificador({ whatsapp: '525511111111' });
  assert.strictEqual(porWhatsapp.asistente_empresa, 'Marca Test');
  assert.strictEqual(porWhatsapp.sugeridas[0].sponsor_empresa, 'Sponsor Test');
  assert.strictEqual(porWhatsapp.sugeridas[0].sponsor_nombre, 'Daniela Test');
  assert.strictEqual(porWhatsapp.sugeridas[0].estatus, 'Aprobado');

  const porPageId = await consultarSugeridasPorIdentificador({ asistentePageId: asistenteId });
  assert.strictEqual(porPageId.asistente_nombre, 'Ana Test');
  assert.strictEqual(porPageId.asistente_empresa, 'Marca Test');
  assert.strictEqual(porPageId.whatsapp, '+52 55 1111 1111');

  for (const filtro of filtros) {
    const estatuses = filtro.and[1].or.map((condicion) => condicion.Estatus || condicion.property)
      .map((valor, indice) => valor === 'Estatus'
        ? filtro.and[1].or[indice].select.equals
        : valor);
    assert.deepStrictEqual(estatuses, ['Sugerido', 'Aprobado']);
  }

  console.log('✅ sugeridas hidrata empresas por WhatsApp y page_id');
  console.log('✅ consulta únicamente Estatus Sugerido/Aprobado');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
