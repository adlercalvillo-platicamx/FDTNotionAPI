// Contrato 1-sep-2026: Tamaño select/rich_text + boleto Speaker.
//
//   node tests/tamano-speaker.manual-test.js

const assert = require('assert');

const notionPath = require.resolve('../src/utils/notion-client');
const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const matchmakingPath = require.resolve('../src/services/matchmaking.service');

const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_PEQUENA = 'Pequeña - 10 a 50 empleados';
const GIRO_MODA = 'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)';
const GIRO_FINTECH = 'Pagos / fintech';

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'test-contactos';

function pagina({ tamano, ticketTipo = 'Speaker', giro = GIRO_MODA } = {}) {
  const propiedades = {
    Nombre: { title: [{ plain_text: 'Ponente Test' }] },
    Empresa: { rich_text: [{ plain_text: 'Empresa Test' }] },
    Categoria: { select: { name: 'Asistente' } },
    'Ticket / Tipo Asistencia': { select: { name: ticketTipo } },
    'Giro / Industria': { select: { name: giro } },
    'Dado de Baja': { checkbox: false },
    'Quiere Citas 1a1': { select: null },
    'Madurez Negocio (Exa)': { select: null },
  };
  if (tamano !== undefined) propiedades['Tamaño de Negocio'] = tamano;
  return { id: 'speaker-1', properties: propiedades };
}

let ultimoBody;
require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(_path, options) {
      ultimoBody = JSON.parse(options.body);
      return { results: [pagina({ tamano: { rich_text: [] } })] };
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
    async existeCitaActivaEntre() { return false; },
    async contarCitasConfirmadasPorSponsor() { return 0; },
  },
};
delete require.cache[matchmakingPath];
const {
  calcularScore,
  esCandidatoPorTamanoNegocio,
  generarExplicacionNatural,
  PESOS,
} = require('../src/services/matchmaking.service');

const sponsor = {
  puestosBuscados: [],
  solucion: [],
  clientesPotencialesDeseados: '',
};

function candidato(ticketTipo, extras = {}) {
  return {
    nombre: 'Ponente Test',
    empresa: 'Empresa Test',
    categoria: 'Asistente',
    ticketTipo,
    area: null,
    solucionesBuscadas: [],
    otraSolucionBuscada: '',
    fuenteDato: null,
    tamanoNegocio: null,
    madurezNegocioExa: null,
    ...extras,
  };
}

async function main() {
  let ok = 0;
  const caso = (nombre, fn) => {
    fn();
    ok += 1;
    console.log(`${ok}. ${nombre}`);
  };

  caso('rich_text Grande con acento se normaliza', () => {
    assert.strictEqual(
      contactos.parsearContacto(pagina({ tamano: { rich_text: [{ plain_text: TAMANO_GRANDE }] } })).tamanoNegocio,
      TAMANO_GRANDE
    );
  });
  caso('rich_text Grande sin acento se normaliza', () => {
    assert.strictEqual(
      contactos.parsearContacto(pagina({ tamano: { rich_text: [{ plain_text: 'Grande - mas de 250 empleados' }] } })).tamanoNegocio,
      TAMANO_GRANDE
    );
  });
  caso('select anterior sigue funcionando durante transición', () => {
    assert.strictEqual(
      contactos.parsearContacto(pagina({ tamano: { select: { name: TAMANO_GRANDE } } })).tamanoNegocio,
      TAMANO_GRANDE
    );
  });
  caso('Pequeña se clasifica sin volverla elegible', () => {
    const valor = contactos.parsearContacto(
      pagina({ tamano: { rich_text: [{ plain_text: TAMANO_PEQUENA }] } })
    ).tamanoNegocio;
    assert.strictEqual(valor, TAMANO_PEQUENA);
    assert.strictEqual(esCandidatoPorTamanoNegocio(candidato('Virtual', { tamanoNegocio: valor })), false);
  });
  caso('texto de Etapa se convierte en null', () => {
    assert.strictEqual(
      contactos.parsearContacto(
        pagina({ tamano: { rich_text: [{ plain_text: '1 Exploración de e-commerce' }] } })
      ).tamanoNegocio,
      null
    );
  });
  caso('campo vacío o ausente se convierte en null', () => {
    assert.strictEqual(contactos.parsearContacto(pagina({ tamano: { rich_text: [] } })).tamanoNegocio, null);
    assert.strictEqual(contactos.parsearContacto(pagina()).tamanoNegocio, null);
  });
  caso('Etapa clasificada null conserva fallback Exa Consolidado', () => {
    assert.strictEqual(
      esCandidatoPorTamanoNegocio(candidato('Virtual', { madurezNegocioExa: 'Consolidado' })),
      true
    );
  });

  const encontrados = await contactos.buscarAsistentesCandidatos({});
  caso('Speaker está en el allowlist enviado a Notion', () => {
    const filtroTipos = ultimoBody.filter.and.find((parte) =>
      parte.or?.some((condicion) => condicion.property === 'Ticket / Tipo Asistencia')
    );
    assert.ok(filtroTipos.or.some((condicion) => condicion.select.equals === 'Speaker'));
    assert.strictEqual(encontrados[0].ticketTipo, 'Speaker');
  });
  caso('Speaker conserva filtro de giro sin fintech', () => {
    const filtroGiros = ultimoBody.filter.and.find((parte) =>
      parte.or?.some((condicion) => condicion.property === 'Giro / Industria')
    );
    const giros = filtroGiros.or.map((condicion) => condicion.select.equals);
    assert.ok(giros.includes(GIRO_MODA));
    assert.ok(!giros.includes(GIRO_FINTECH));
  });
  caso('Speaker salta tamaño vacío', () => {
    assert.strictEqual(esCandidatoPorTamanoNegocio(candidato('Speaker')), true);
  });
  caso('Speaker suma 500 y no 150', () => {
    assert.strictEqual(calcularScore(sponsor, candidato('Speaker'), 0).score, PESOS.VIP);
  });
  caso('Presencial VIP ahora suma solo 500', () => {
    assert.strictEqual(calcularScore(sponsor, candidato('Presencial VIP'), 0).score, PESOS.VIP);
  });
  caso('Presencial normal conserva 150', () => {
    assert.strictEqual(calcularScore(sponsor, candidato('Presencial'), 0).score, PESOS.PRESENCIAL);
  });
  caso('Speaker usa señal propia, no VIP ni presencial', () => {
    const { senales } = calcularScore(sponsor, candidato('Speaker'), 0);
    assert.deepStrictEqual(
      { speaker: senales.esSpeaker, vip: senales.esVip, presencial: senales.esPresencial },
      { speaker: true, vip: false, presencial: false }
    );
  });
  caso('VIP usa señal propia y no Speaker', () => {
    const { senales } = calcularScore(sponsor, candidato('Presencial VIP'), 0);
    assert.deepStrictEqual(
      { speaker: senales.esSpeaker, vip: senales.esVip, presencial: senales.esPresencial },
      { speaker: false, vip: true, presencial: false }
    );
  });
  caso('explicación Speaker no dice VIP ni presencial', () => {
    const c = candidato('Speaker');
    const { senales } = calcularScore(sponsor, c, 0);
    const texto = generarExplicacionNatural(c, senales);
    assert.ok(texto.includes('Es ponente del evento'));
    assert.ok(!texto.includes('Es asistente VIP'));
    assert.ok(!texto.includes('Asistirá de forma presencial'));
  });

  assert.strictEqual(ok, 16);
  console.log('\n✅ tamaño-speaker 16/16');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
