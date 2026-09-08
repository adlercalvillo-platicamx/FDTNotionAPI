// Filtro duro de soluciones, oro molido en Capa 1 y pesos 8-sep.
//
//   node tests/solucion-oro-molido.manual-test.js

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const servicePath = require.resolve('../src/services/matchmaking.service');

const AREA_CEO = 'Direccion General / Founder / CEO';
const AREA_OPS = 'Operaciones / Logistica / Supply Chain';
const SOL_PAGOS = 'Pagos';
const SOL_ECOM = 'Plataforma eCommerce';
const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_PEQUENA = 'Pequeña - 10 a 50 empleados';
const TAMANO_MICRO = 'Micro - menos de 10 empleados';

const sponsorBase = {
  id: 'sponsor-sol',
  nombre: 'Sponsor Sol',
  empresa: 'Sponsor Sol',
  categoria: 'Sponsor',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 10,
  etapaClienteBuscada: ['Grande', 'Pequeña', 'Micro'],
  puestosBuscados: [AREA_CEO],
  solucion: [SOL_PAGOS, SOL_ECOM],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
};

function candidato(id, extra = {}) {
  return {
    id,
    nombre: id,
    empresa: extra.empresa || id,
    categoria: 'Asistente',
    ticketTipo: extra.ticketTipo || 'Virtual',
    tamanoNegocio: extra.tamanoNegocio === undefined ? TAMANO_GRANDE : extra.tamanoNegocio,
    madurezNegocioExa: extra.madurezNegocioExa || null,
    area: extra.area === undefined ? AREA_CEO : extra.area,
    solucionesBuscadas: extra.solucionesBuscadas === undefined ? [SOL_PAGOS] : extra.solucionesBuscadas,
    otraSolucionBuscada: '',
    fuenteDato: extra.fuenteDato || null,
  };
}

let pool = [];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      if (id === sponsorBase.id) return sponsorBase;
      return pool.find((c) => c.id === id);
    },
    async buscarAsistentesCandidatos() {
      return pool;
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async existeCitaActivaEntre() {
      return false;
    },
    async contarCitasConfirmadasPorSponsor() {
      return 0;
    },
  },
};

delete require.cache[servicePath];
const {
  sugerirMatchesParaSponsor,
  calcularScore,
  esCandidatoPorSolucion,
  generarExplicacionNatural,
  PESOS,
} = require('../src/services/matchmaking.service');

async function idsDe(extraSponsor = {}) {
  Object.assign(sponsorBase, extraSponsor);
  const r = await sugerirMatchesParaSponsor(sponsorBase.id, { topN: 50, escribirEnNotion: false });
  return r.sugerencias.map((s) => s.id).sort();
}

async function main() {
  // A
  pool = [
    candidato('con-sol'),
    candidato('sin-sol', { solucionesBuscadas: [] }),
    candidato('sol-otra', { solucionesBuscadas: ['Marketplaces'] }),
  ];
  assert.deepStrictEqual(await idsDe(), ['con-sol']);
  assert.strictEqual(esCandidatoPorSolucion(pool[1], sponsorBase.solucion), false);

  // B — VIP y Speaker sin solución coincidente fuera
  pool = [
    candidato('vip-sin', { ticketTipo: 'Presencial VIP', solucionesBuscadas: [] }),
    candidato('spk-sin', { ticketTipo: 'Speaker', solucionesBuscadas: ['Marketplaces'] }),
    candidato('vip-con', { ticketTipo: 'Presencial VIP' }),
  ];
  assert.deepStrictEqual(await idsDe(), ['vip-con']);

  // C — oro molido salta tamaño, área y soluciones
  pool = [
    candidato('oro-sin-nada', {
      empresa: 'FLEXI',
      ticketTipo: 'Virtual',
      tamanoNegocio: TAMANO_MICRO,
      area: AREA_OPS,
      solucionesBuscadas: [],
    }),
  ];
  sponsorBase.etapaClienteBuscada = ['Grande'];
  sponsorBase.clientesPotencialesDeseados = 'nos interesa FLEXI y Panam';
  const rOro = await sugerirMatchesParaSponsor(sponsorBase.id, { topN: 5, escribirEnNotion: false });
  assert.strictEqual(rOro.sugerencias.length, 1);
  assert.ok(rOro.sugerencias[0].score >= PESOS.ORO_MOLIDO);
  assert.ok(
    rOro.sugerencias[0].explicacion.includes('no coincide ni en área ni en ninguna solución buscada'),
    rOro.sugerencias[0].explicacion
  );

  // E — cliente actual gana aunque sea oro molido
  sponsorBase.clientesActuales = 'FLEXI es cliente de hace años';
  assert.deepStrictEqual(await idsDe({ clientesPotencialesDeseados: 'FLEXI' }), []);
  sponsorBase.clientesActuales = '';
  sponsorBase.clientesPotencialesDeseados = '';
  sponsorBase.etapaClienteBuscada = ['Grande', 'Pequeña', 'Micro'];

  // F — sponsor vacío o solo Otro: no hay coincidencia real → fuera
  pool = [candidato('vacio-sols', { solucionesBuscadas: [] }), candidato('con-sol')];
  assert.deepStrictEqual(await idsDe({ solucion: [] }), []);
  assert.deepStrictEqual(await idsDe({ solucion: ['Otro'] }), []);
  sponsorBase.solucion = [SOL_PAGOS, SOL_ECOM];

  // G — escala de puntos
  const sols = [SOL_PAGOS, SOL_ECOM, 'Marketplaces', 'CRM / automatizacion', 'Analitica / data'];
  const sponsorG = { solucion: sols, puestosBuscados: [], etapaClienteBuscada: [] };
  const scores = [1, 2, 3, 4, 5].map((n) =>
    calcularScore(sponsorG, { ticketTipo: 'Virtual', solucionesBuscadas: sols.slice(0, n) }, 0).score
  );
  assert.deepStrictEqual(scores, [20, 40, 60, 80, 80]);

  // H — Pequeña con match máximo gana a Grande flojo; pierde contra Grande + 2 sols
  const sponsorH = {
    etapaClienteBuscada: ['Grande', 'Pequeña'],
    puestosBuscados: [AREA_CEO],
    solucion: sols,
  };
  const pequenaMax = calcularScore(
    sponsorH,
    {
      ticketTipo: 'Virtual',
      tamanoNegocio: TAMANO_PEQUENA,
      area: AREA_CEO,
      solucionesBuscadas: sols.slice(0, 4),
    },
    0
  );
  const grandeFlojo = calcularScore(
    sponsorH,
    {
      ticketTipo: 'Virtual',
      tamanoNegocio: TAMANO_GRANDE,
      area: AREA_CEO,
      solucionesBuscadas: [SOL_PAGOS],
    },
    0
  );
  const grandeDos = calcularScore(
    sponsorH,
    {
      ticketTipo: 'Virtual',
      tamanoNegocio: TAMANO_GRANDE,
      area: AREA_CEO,
      solucionesBuscadas: [SOL_PAGOS, SOL_ECOM],
    },
    0
  );
  assert.strictEqual(pequenaMax.score, 58 + 40 + 80);
  assert.strictEqual(grandeFlojo.score, 100 + 40 + 20);
  assert.strictEqual(grandeDos.score, 100 + 40 + 40);
  assert.ok(pequenaMax.score > grandeFlojo.score);
  assert.ok(pequenaMax.score < grandeDos.score);

  // D — Giro lo filtra Notion en buscarAsistentesCandidatos, no este .filter().
  // Un oro molido con giro no elegible nunca llega a Capa 1 JS. El filtro de
  // Giro se cubre en vip-tamano-negocio / contactos (los 3 giros allowlist).

  console.log('✅ A–H filtro soluciones, oro molido y pesos 8-sep');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
