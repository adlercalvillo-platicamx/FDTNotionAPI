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
      const filter = JSON.parse(opciones.body).filter;
      filtros.push(filter);
      const estatuses = [];
      function walk(nodo) {
        if (!nodo) return;
        if (nodo.property === 'Estatus' && nodo.select?.equals) estatuses.push(nodo.select.equals);
        if (Array.isArray(nodo.and)) nodo.and.forEach(walk);
        if (Array.isArray(nodo.or)) nodo.or.forEach(walk);
      }
      walk(filter);
      if (estatuses.includes('Confirmada')) {
        return {
          results: [
            {
              id: 'cita-confirmada',
              properties: {
                Nombre: { title: [{ plain_text: 'Cita — Marca Test - Sponsor Test' }] },
                Estatus: { select: { name: 'Confirmada' } },
                'Contacto Match': { relation: [{ id: sponsorId }] },
                'Contacto Principal': { relation: [{ id: asistenteId }] },
                'Fecha y Hora': {
                  date: {
                    start: '2026-10-07T12:00:00-06:00',
                    end: '2026-10-07T12:30:00-06:00',
                  },
                },
                'Mesa / Ubicacion': { rich_text: [{ plain_text: 'Mesa 3' }] },
                'Check-in Realizado': { checkbox: false },
              },
            },
          ],
          has_more: false,
        };
      }
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
  assert.strictEqual(porWhatsapp.sugeridas[0].sponsor_calendario_id, undefined);
  assert.ok(!JSON.stringify(porWhatsapp).includes('calendarioGoogleId'));
  assert.ok(!JSON.stringify(porWhatsapp).includes('sponsor_calendario_id'));
  assert.deepStrictEqual(porWhatsapp.citasConfirmadas, [
    {
      sponsorNombre: 'Sponsor Test',
      fechaHora: '2026-10-07T12:00:00-06:00',
      mesa: 'Mesa 3',
      citaId: 'cita-confirmada',
      checkInRealizado: false,
    },
  ]);

  const porPageId = await consultarSugeridasPorIdentificador({ asistentePageId: asistenteId });
  assert.strictEqual(porPageId.asistente_nombre, 'Ana Test');
  assert.strictEqual(porPageId.asistente_empresa, 'Marca Test');
  assert.strictEqual(porPageId.whatsapp, '+52 55 1111 1111');

  const filtrosSugeridas = filtros.filter((filtro) =>
    JSON.stringify(filtro).includes('"Sugerido"')
  );
  const filtrosConfirmadas = filtros.filter((filtro) =>
    JSON.stringify(filtro).includes('"Confirmada"')
  );
  assert.ok(filtrosSugeridas.length >= 1);
  assert.ok(filtrosConfirmadas.length >= 1);
  for (const filtro of filtrosSugeridas) {
    const estatuses = filtro.and[1].or.map((condicion) => condicion.Estatus || condicion.property)
      .map((valor, indice) => valor === 'Estatus'
        ? filtro.and[1].or[indice].select.equals
        : valor);
    assert.deepStrictEqual(estatuses, ['Sugerido', 'Aprobado']);
  }

  console.log('✅ sugeridas hidrata empresas por WhatsApp y page_id');
  console.log('✅ consulta únicamente Estatus Sugerido/Aprobado para sugeridas');
  console.log('✅ incluye citasConfirmadas y ya no expone calendarioGoogleId');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
