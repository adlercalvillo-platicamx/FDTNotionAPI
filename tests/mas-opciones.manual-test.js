// Pool extra del Agente 2: giro + tamaño asimétrico. No es Capa 1.
//
//   node tests/mas-opciones.manual-test.js

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');

const GIRO_MODA = 'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)';
const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_MEDIANA = 'Mediana - 50 a 250 empleados';
const TAMANO_PEQUENA = 'Pequeña - 10 a 50 empleados';
const TAMANO_MICRO = 'Micro - menos de 10 empleados';

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    GIROS_ELEGIBLES_MATCHMAKING: [
      GIRO_MODA,
      'Retailer / tienda multimarca / Marketplace',
      'Manufactura / produccion / sourcing',
    ],
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {},
};

const matchmaking = require('../src/services/matchmaking.service');

const revie = {
  id: 'revie',
  categoria: 'Sponsor',
  empresa: 'Revie',
  nivelPatrocinio: 'Diamante',
  etapaClienteBuscada: ['Mediana', 'Pequeña'],
  solucion: ['CRM / Automatización', 'Customer experience'],
};
const soloGrande = {
  id: 'solo-grande',
  categoria: 'Sponsor',
  empresa: 'Solo Grande',
  nivelPatrocinio: 'Oro',
  etapaClienteBuscada: ['Grande'],
  solucion: ['Pagos'],
};
const soloMicro = {
  id: 'solo-micro',
  categoria: 'Sponsor',
  empresa: 'Solo Micro',
  nivelPatrocinio: 'Oro',
  etapaClienteBuscada: ['Micro'],
  solucion: ['Pagos'],
};
const conMediana = {
  id: 'con-mediana',
  categoria: 'Sponsor',
  empresa: 'Con Mediana',
  nivelPatrocinio: 'Cristal',
  etapaClienteBuscada: ['Grande', 'Mediana'],
  solucion: ['Pagos'],
};
const bronce = {
  id: 'bronce',
  categoria: 'Sponsor',
  empresa: 'Bronce Co',
  nivelPatrocinio: 'Bronce',
  etapaClienteBuscada: ['Grande', 'Mediana', 'Pequeña', 'Micro'],
  solucion: ['Pagos'],
};

function asistente(extra) {
  return {
    giroIndustria: GIRO_MODA,
    solucionesBuscadas: ['CRM / Automatización', 'Pagos'],
    ...extra,
  };
}

async function main() {
  let fallos = 0;
  const ok = (name, fn) => {
    try {
      fn();
      console.log('✅', name);
    } catch (e) {
      fallos += 1;
      console.log('❌', name, e.message);
    }
  };

  ok('Grande declarado entra a Revie (sin Grande pedido)', () => {
    assert.strictEqual(
      matchmaking.esSponsorElegibleParaMasOpciones(asistente({ tamanoNegocio: TAMANO_GRANDE }), revie),
      true
    );
  });

  ok('Consolidado Exa entra a cualquier sponsor no Bronce', () => {
    const a = asistente({ tamanoNegocio: null, madurezNegocioExa: 'Consolidado' });
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, revie), true);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, soloMicro), true);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, bronce), false);
  });

  ok('Micro declarado no entra si el sponsor no pidió Micro', () => {
    const a = asistente({ tamanoNegocio: TAMANO_MICRO });
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, revie), false);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, soloMicro), true);
  });

  ok('PyME = Mediana o Pequeña, no Micro ni solo-Grande', () => {
    const a = asistente({ tamanoNegocio: null, madurezNegocioExa: 'PyME' });
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, revie), true);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, conMediana), true);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, soloGrande), false);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, soloMicro), false);
  });

  ok('Temprano o vacío no auto-sugiere', () => {
    const temprano = asistente({ tamanoNegocio: null, madurezNegocioExa: 'Temprano' });
    const vacio = asistente({ tamanoNegocio: null, madurezNegocioExa: null });
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(temprano, revie), false);
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(vacio, revie), false);
  });

  ok('Presencial VIP y Speaker saltan tamaño también en opciones del Agente 2', () => {
    for (const ticketTipo of ['Presencial VIP', 'Speaker']) {
      const sinTamano = asistente({
        ticketTipo,
        tamanoNegocio: null,
        madurezNegocioExa: null,
      });
      const microNoPedido = asistente({
        ticketTipo,
        tamanoNegocio: TAMANO_MICRO,
      });
      assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(sinTamano, revie), true);
      assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(microNoPedido, revie), true);
      assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(sinTamano, bronce), false);
    }
  });

  ok('VIP/Speaker no saltan el filtro de giro en opciones del Agente 2', () => {
    for (const ticketTipo of ['Presencial VIP', 'Speaker']) {
      const giroNoElegible = asistente({
        ticketTipo,
        tamanoNegocio: null,
        giroIndustria: 'Agencia de marketing / publicidad',
      });
      assert.strictEqual(
        matchmaking.esSponsorElegibleParaMasOpciones(giroNoElegible, revie),
        false
      );
    }
  });

  ok('Giro fuera de los 3: sin capa 2', () => {
    const a = asistente({
      tamanoNegocio: TAMANO_GRANDE,
      giroIndustria: 'Agencia de marketing / publicidad',
    });
    assert.strictEqual(matchmaking.esSponsorElegibleParaMasOpciones(a, revie), false);
  });

  ok('Capa 1 de tamaño no cambia: Grande no entra a Revie en matchmaking', () => {
    assert.strictEqual(
      matchmaking.esCandidatoPorTamanoNegocio(
        { ticketTipo: 'Presencial', tamanoNegocio: TAMANO_GRANDE },
        revie.etapaClienteBuscada
      ),
      false
    );
  });

  ok('soluciones en común y otras', () => {
    const { soluciones_en_comun, otras_soluciones } = matchmaking.solucionesEnComunYOtras(
      asistente({}),
      revie
    );
    assert.deepStrictEqual(soluciones_en_comun, ['CRM / Automatización']);
    assert.deepStrictEqual(otras_soluciones, ['Customer experience']);
  });

  delete require.cache[citasPath];
  process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-citas';
  const { armarOpcionesAdicionales, armarSugeridasParaOfrecer } = require('../src/services/citas.service');

  ok('capa 2 no duplica Aprobado ni Confirmada; Sugerido primero', () => {
    const a = asistente({ tamanoNegocio: TAMANO_GRANDE });
    const sponsorsActivos = [revie, soloGrande, bronce, conMediana];
    const sponsorMap = new Map(sponsorsActivos.map((s) => [s.id.replace(/-/g, ''), s]));
    const capa1 = armarSugeridasParaOfrecer({
      sugeridas: [
        {
          estatus: 'Aprobado',
          sponsor_notion_id: conMediana.id,
          sponsor_empresa: conMediana.empresa,
        },
      ],
      citasCanceladas: [],
      citasConfirmadas: [{ sponsor_notion_id: soloGrande.id }],
    });
    const extra = armarOpcionesAdicionales({
      asistente: a,
      sugeridasSugerido: [
        {
          cita_page_id: 'sug-revie',
          sponsor_notion_id: revie.id,
          sponsor_nombre: 'Renata',
          sponsor_empresa: 'Revie',
          score: 10,
        },
      ],
      sponsorsParaAgendar: capa1,
      citasConfirmadas: [{ sponsor_notion_id: soloGrande.id }],
      sponsorsActivos,
      sponsorMap,
    });
    assert.deepStrictEqual(
      extra.map((s) => s.estatus_origen),
      ['sugerido']
    );
    assert.strictEqual(extra[0].citaId, 'sug-revie');
    assert.ok(!extra.some((s) => s.sponsor_notion_id === conMediana.id));
    assert.ok(!extra.some((s) => s.sponsor_notion_id === soloGrande.id));
    assert.ok(!extra.some((s) => s.sponsor_notion_id === bronce.id));
  });

  ok('unsugerido por tamaño entra después del Sugerido', () => {
    const a = asistente({ tamanoNegocio: TAMANO_MEDIANA });
    const sponsorsActivos = [revie, conMediana];
    const sponsorMap = new Map(sponsorsActivos.map((s) => [s.id.replace(/-/g, ''), s]));
    const extra = armarOpcionesAdicionales({
      asistente: a,
      sugeridasSugerido: [
        {
          cita_page_id: 'sug-revie',
          sponsor_notion_id: revie.id,
          sponsor_empresa: 'Revie',
          score: 1,
        },
      ],
      sponsorsParaAgendar: [],
      citasConfirmadas: [],
      sponsorsActivos,
      sponsorMap,
    });
    assert.strictEqual(extra[0].estatus_origen, 'sugerido');
    assert.strictEqual(extra[1].estatus_origen, 'tamano');
    assert.strictEqual(extra[1].sponsor_empresa, 'Con Mediana');
    assert.strictEqual(extra[1].citaId, null);
  });

  if (fallos) process.exit(1);
  console.log('\n=== mas-opciones OK ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
