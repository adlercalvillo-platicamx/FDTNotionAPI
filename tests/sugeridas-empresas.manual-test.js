const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-citas';

const asistenteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const sponsorId = '11111111-2222-3333-4444-555555555555';
const sponsorSugeridoId = '22222222-3333-4444-5555-666666666666';
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
      const filas = [
        {
          id: 'cita-aprobada',
          properties: {
            Estatus: { select: { name: 'Aprobado' } },
            'Contacto Match': { relation: [{ id: sponsorId }] },
          },
        },
      ];
      if (estatuses.includes('Sugerido')) {
        filas.push({
          id: 'cita-solo-sugerida',
          properties: {
            Estatus: { select: { name: 'Sugerido' } },
            'Contacto Match': { relation: [{ id: sponsorSugeridoId }] },
          },
        });
      }
      return { results: filas, has_more: false };
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
      if (id === sponsorSugeridoId) {
        return {
          id,
          nombre: 'Luis Test',
          empresa: 'Marca Sugerida',
          nivelPatrocinio: 'Oro',
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
  assert.strictEqual(porWhatsapp.sugeridas.length, 2);
  const aprobada = porWhatsapp.sugeridas.find((s) => s.estatus === 'Aprobado');
  const pendiente = porWhatsapp.sugeridas.find((s) => s.estatus === 'Sugerido');
  assert.strictEqual(aprobada.sponsor_empresa, 'Sponsor Test');
  assert.strictEqual(aprobada.sponsor_nombre, 'Daniela Test');
  assert.strictEqual(pendiente.sponsor_empresa, 'Marca Sugerida');
  assert.strictEqual(aprobada.sponsor_calendario_id, undefined);
  assert.ok(!JSON.stringify(porWhatsapp).includes('calendarioGoogleId'));
  assert.ok(!JSON.stringify(porWhatsapp).includes('sponsor_calendario_id'));
  assert.deepStrictEqual(porWhatsapp.citasConfirmadas, [
    {
      sponsorNombre: 'Sponsor Test',
      sponsor_notion_id: sponsorId,
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

  const nFiltrosAntesMcp = filtros.length;
  const paraAgente = await consultarSugeridasPorIdentificador({
    whatsapp: '525511111111',
    soloAprobado: true,
  });
  assert.deepStrictEqual(
    paraAgente.sugeridas.map((s) => s.estatus),
    ['Aprobado']
  );
  assert.strictEqual(paraAgente.sugeridas[0].cita_page_id, 'cita-aprobada');
  assert.deepStrictEqual(paraAgente.citasConfirmadas, porWhatsapp.citasConfirmadas);
  const filtrosMcp = filtros.slice(nFiltrosAntesMcp);
  assert.ok(filtrosMcp.some((f) => JSON.stringify(f).includes('"Aprobado"')));
  assert.ok(
    !filtrosMcp.some((f) => JSON.stringify(f).includes('"Sugerido"')),
    'el camino MCP no debe pedir Sugerido a Notion'
  );

  console.log('✅ sugeridas hidrata empresas por WhatsApp y page_id');
  console.log('✅ GET /citas/sugeridas (default) consulta Sugerido y Aprobado');
  console.log('✅ soloAprobado (MCP y WhatsApp Flow) deja fuera Sugerido y no toca citasConfirmadas');
  console.log('✅ incluye citasConfirmadas y ya no expone calendarioGoogleId');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
