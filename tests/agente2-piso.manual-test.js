const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'citas-test';
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';

const GIRO_MODA = 'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)';
const TAMANO_GRANDE = 'Grande - más de 250 empleados';

const asistente = {
  id: 'asistente-1',
  categoria: 'Asistente',
  dadoDeBaja: false,
  nombre: 'Ana Registro',
  empresa: 'Moda Uno',
  email: 'ana@example.com',
  whatsapp: '5215511111111',
  ticketTipo: 'Presencial',
  giroIndustria: GIRO_MODA,
  tamanoNegocio: TAMANO_GRANDE,
  quiereCitas1a1: 'No',
  solucionesBuscadas: [],
};

const sponsors = Array.from({ length: 4 }, (_, indice) => ({
  id: `sponsor-${indice + 1}`,
  categoria: 'Sponsor',
  dadoDeBaja: false,
  nombre: `Representante ${indice + 1}`,
  empresa: indice === 0 ? 'Mercado Libre' : `Sponsor ${indice + 1}`,
  nivelPatrocinio: 'Oro',
  etapaClienteBuscada: ['Mediana'],
  solucion: [],
}));

const contactosPath = require.resolve('../src/services/contactos.service');
require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    GIROS_ELEGIBLES_MATCHMAKING: [GIRO_MODA],
    buscarAsistentePorWhatsApp: async () => null,
    buscarAsistentesPorFolio: async (folio) => (folio === 'FOLIO-OK' ? [asistente] : []),
    obtenerContacto: async (id) => {
      if (id === asistente.id) return asistente;
      return sponsors.find((sponsor) => sponsor.id === id) || null;
    },
    listarSponsorsActivos: async () => sponsors,
    resolverSponsorPorEmpresa: async (empresa) =>
      /mercado/i.test(empresa)
        ? { estado: 'unico', sponsor: sponsors[0], puntaje: 100 }
        : { estado: 'no_encontrado', candidatos: [] },
  },
};

function cita(index) {
  const dia = index < 2 ? '07' : '08';
  const hora = String(11 + index).padStart(2, '0');
  return {
    id: `cita-${index + 1}`,
    properties: {
      Nombre: { title: [{ plain_text: `Cita ${index + 1}` }] },
      Estatus: { select: { name: 'Confirmada' } },
      'Fecha y Hora': {
        date: {
          start: `2026-10-${dia}T${hora}:00:00-06:00`,
          end: `2026-10-${dia}T${hora}:20:00-06:00`,
        },
      },
      'Mesa / Ubicacion': { rich_text: [{ plain_text: String(index + 1) }] },
      'Contacto Match': { relation: [{ id: sponsors[index].id }] },
      'Contacto Principal': { relation: [{ id: asistente.id }] },
      'Cita Origen Cancelada': { relation: [] },
      'Check-in Realizado': { checkbox: false },
      'Notas Envio Email': { rich_text: [] },
    },
  };
}

const notionPath = require.resolve('../src/utils/notion-client');
require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    notionFetch: async (_path, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      const filtro = JSON.stringify(body.filter || {});
      const results =
        filtro.includes('"Confirmada"') || filtro.includes('"Confirmada sin notificar"')
          ? [0, 1, 2, 3].map(cita)
          : [];
      return { results, has_more: false, next_cursor: null };
    },
  },
};

const citas = require('../src/services/citas.service');

async function main() {
  const resultado = await citas.consultarSugeridasPorIdentificador({
    whatsapp: '5215599999999',
    folio: 'FOLIO-OK',
    sponsorEmpresa: 'Mercado Libre',
    ahora: new Date('2026-09-20T12:00:00-06:00'),
    hidratarPerfilFn: async ({ asistentePageId, telefonoDestino }) => ({
      actualizado: true,
      contactoId: asistentePageId,
      whatsapp: telefonoDestino,
    }),
  });

  assert.strictEqual(resultado.identificado_por, 'folio');
  assert.strictEqual(resultado.asistente_nombre, 'Ana Registro');
  assert.strictEqual(resultado.sponsor_solicitado.estado, 'elegible');
  assert.strictEqual(resultado.sponsor_solicitado.sponsor_notion_id, 'sponsor-1');
  assert.strictEqual(resultado.fase_evento, 'antes');
  assert.strictEqual(resultado.hidratacion_platica.whatsapp, '5215599999999');
  assert.strictEqual(resultado.motivo_sin_opciones, 'OPCIONES_AGOTADAS');
  console.log('✅ folio identifica y QR resuelve el sponsor solicitado');

  assert.strictEqual(resultado.citas_para_ofrecer.length, 4);
  assert.strictEqual(resultado.hay_mas_citas, false);
  assert.ok(resultado.citas_para_ofrecer.every((item) => /octubre/.test(item.horario_legible)));
  assert.ok(resultado.citas_para_ofrecer.some((item) => /miércoles,? 7/.test(item.horario_legible)));
  assert.ok(resultado.citas_para_ofrecer.some((item) => /jueves,? 8/.test(item.horario_legible)));
  console.log('✅ devuelve todas las citas confirmadas con día y hora');

  assert.strictEqual(
    citas.obtenerFaseEvento({ ahora: new Date('2026-10-07T18:00:00-06:00') }),
    'durante'
  );
  assert.strictEqual(
    citas.obtenerFaseEvento({ ahora: new Date('2026-10-09T00:01:00-06:00') }),
    'despues'
  );
  assert.strictEqual(
    citas.obtenerFaseEvento({ simulada: 'durante', ahora: new Date('2026-09-01T00:00:00Z') }),
    'durante'
  );
  console.log('✅ fase del evento: antes/durante/después y override de prueba');

  const giroOriginal = asistente.giroIndustria;
  asistente.giroIndustria = 'Agencia de marketing / publicidad';
  const sinGiro = await citas.consultarSugeridasPorIdentificador({
    folio: 'FOLIO-OK',
    hidratarPerfilFn: async () => ({ actualizado: true }),
  });
  asistente.giroIndustria = giroOriginal;
  assert.strictEqual(sinGiro.giro_elegible, false);
  assert.strictEqual(sinGiro.motivo_sin_opciones, 'GIRO_NO_ELEGIBLE');
  console.log('✅ solicitud genérica distingue giro no elegible de opciones agotadas');

  await assert.rejects(
    citas.consultarSugeridasPorIdentificador({ whatsapp: '5215599999999' }),
    (error) => error.code === 'CONTACTO_NO_RESUELTO' && error.detalle.requiere_folio === true
  );
  await assert.rejects(
    citas.consultarSugeridasPorIdentificador({
      whatsapp: '5215599999999',
      folio: 'NO-EXISTE',
    }),
    (error) => error.code === 'FOLIO_NO_ENCONTRADO'
  );
  console.log('✅ WhatsApp desconocido pide folio y folio inválido falla explícitamente');

  console.log('\n=== Agente 2 piso OK ===');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
