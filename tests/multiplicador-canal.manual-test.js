// Ranking por multiplicador de canal (3-sep). Mocks explícitos; no lee Notion.
//
//   node tests/multiplicador-canal.manual-test.js

const {
  calcularScore,
  generarExplicacionNatural,
  MULTIPLICADOR_CANAL,
  PESOS,
} = require('../src/services/matchmaking.service');

let fallos = 0;
function check(nombre, condicion, extra = '') {
  const estado = condicion ? '  OK  ' : ' FALLA';
  if (!condicion) fallos++;
  console.log(`[${estado}] ${nombre}${extra ? ' → ' + extra : ''}`);
}

const AREA = 'Direccion General / Founder / CEO';
const SOLS = ['Pagos', 'Marketplaces', 'Plataforma eCommerce', 'Logistica / fulfillment', 'CRM / automatizacion'];

function sponsorCon(nSoluciones, extra = {}) {
  return {
    clientesPotencialesDeseados: '',
    clientesActuales: '',
    puestosBuscados: [AREA],
    solucion: SOLS.slice(0, nSoluciones),
    ...extra,
  };
}

function candidato({ ticketTipo, nSoluciones = 0, fuenteDato = 'Declarado', empresa = 'Empresa X', extra = {} }) {
  return {
    nombre: ticketTipo,
    empresa,
    ticketTipo,
    area: nSoluciones >= 0 && extra.area !== null ? AREA : null,
    solucionesBuscadas: extra.sinAreaSol ? [] : SOLS.slice(0, nSoluciones),
    otraSolucionBuscada: '',
    fuenteDato,
    tamanoNegocio: null,
    madurezNegocioExa: null,
    icpModaEcommerce: null,
    estadoWebExa: null,
    ...extra,
  };
}

console.log('\n=== A — VIP sin afinidad vs Presencial con área + 3 soluciones ===');
const sponsorA = sponsorCon(3);
const vipA = calcularScore(
  sponsorA,
  {
    nombre: 'VIP vacío',
    empresa: 'Sin Match SA',
    ticketTipo: 'Presencial VIP',
    area: null,
    solucionesBuscadas: [],
    otraSolucionBuscada: '',
    fuenteDato: 'Declarado',
    tamanoNegocio: null,
    madurezNegocioExa: null,
  },
  0
);
const presA = calcularScore(
  sponsorA,
  candidato({ ticketTipo: 'Presencial', nSoluciones: 3 }),
  0
);
console.log(`   VIP sin match: ${vipA.score}  Presencial con match: ${presA.score}`);
check('Gana el Presencial con afinidad real (el +500 ya no compra el ranking)', presA.score > vipA.score);
check('VIP vacío queda en ~14 (10 × 1.4), no en 510', vipA.score === 14);

console.log('\n=== B — Mismo match, VIP vs Presencial ===');
const sponsorB = sponsorCon(3);
const baseB = PESOS.AREA + 3 * PESOS.SOLUCION + PESOS.DATO_DECLARADO; // 250
const vipB = calcularScore(sponsorB, candidato({ ticketTipo: 'Presencial VIP', nSoluciones: 3 }), 0);
const presB = calcularScore(sponsorB, candidato({ ticketTipo: 'Presencial', nSoluciones: 3 }), 0);
check('VIP 250 × 1.4 = 350', vipB.score === 350);
check('Presencial 250 × 1.15 redondea a 288', presB.score === 288);
check('Con el mismo match, el VIP sigue ganando', vipB.score > presB.score);
check(
  'Ventaja ~22%, no el ~80% del bono +500',
  (vipB.score - presB.score) / presB.score < 0.25 && (vipB.score - presB.score) / presB.score > 0.18
);

console.log('\n=== C — Calibración ×1.4: Presencial 5 soluciones vs VIP 4 ===');
const sponsorC = sponsorCon(5);
const presC = calcularScore(sponsorC, candidato({ ticketTipo: 'Presencial', nSoluciones: 5 }), 0);
const vipC = calcularScore(sponsorC, candidato({ ticketTipo: 'Presencial VIP', nSoluciones: 4 }), 0);
check('Presencial 5 sol = 426', presC.score === 426);
check('VIP 4 sol = 434', vipC.score === 434);
check('Con ×1.4 el VIP gana por una sola solución de diferencia', vipC.score > presC.score);

console.log('\n=== D — Oro molido fijo; el canal no lo amplifica ===');
const sponsorD = {
  ...sponsorCon(1),
  clientesPotencialesDeseados: 'Boutique Marea',
};
const comunD = {
  area: AREA,
  solucionesBuscadas: ['Pagos'],
  otraSolucionBuscada: '',
  fuenteDato: 'Declarado',
  tamanoNegocio: null,
  madurezNegocioExa: null,
};
const baseAfinidadD = PESOS.AREA + PESOS.SOLUCION + PESOS.DATO_DECLARADO; // 130
const oroVip = calcularScore(sponsorD, { nombre: 'VIP', empresa: 'Boutique Marea', ticketTipo: 'Presencial VIP', ...comunD }, 0);
const oroVirtual = calcularScore(sponsorD, { nombre: 'Virtual', empresa: 'Boutique Marea', ticketTipo: 'Virtual', ...comunD }, 0);
const sinOro = calcularScore(sponsorD, { nombre: 'Otro', empresa: 'Otra SA', ticketTipo: 'Presencial VIP', ...comunD }, 0);
const deltaEsperado = Math.round((baseAfinidadD * 140) / 100) - Math.round((baseAfinidadD * 100) / 100);
check('Oro molido le gana a VIP sin oro, cualquier canal', oroVirtual.score > sinOro.score);
check(
  'Delta VIP−Virtual = solo la afinidad multiplicada, no una fracción de 1000',
  oroVip.score - oroVirtual.score === deltaEsperado && Math.abs(oroVip.score - oroVirtual.score) < 200
);

console.log('\n=== E — Speaker = VIP en ranking ===');
const sponsorE = sponsorCon(2);
const speakerE = calcularScore(sponsorE, candidato({ ticketTipo: 'Speaker', nSoluciones: 2 }), 0);
const vipE = calcularScore(sponsorE, candidato({ ticketTipo: 'Presencial VIP', nSoluciones: 2 }), 0);
check('Speaker y VIP con el mismo match dan el mismo score', speakerE.score === vipE.score);
check('Ambos usan ×1.4', speakerE.senales.multiplicadorCanal === 1.4 && vipE.senales.multiplicadorCanal === 1.4);
check('Speaker no marca esPresencial', speakerE.senales.esSpeaker === true && speakerE.senales.esPresencial === false);

console.log('\n=== F — Sin afinidad, ningún canal compra un score alto ===');
const sponsorF = sponsorCon(0);
sponsorF.puestosBuscados = [];
const vacio = (ticketTipo) =>
  calcularScore(
    sponsorF,
    {
      nombre: ticketTipo,
      empresa: 'X',
      ticketTipo,
      area: null,
      solucionesBuscadas: [],
      otraSolucionBuscada: '',
      fuenteDato: 'Declarado',
      tamanoNegocio: null,
      madurezNegocioExa: null,
    },
    0
  );
const sVirtual = vacio('Virtual');
const sPres = vacio('Presencial');
const sVip = vacio('Presencial VIP');
const sSpeaker = vacio('Speaker');
check('Virtual 10 × 1.0 = 10', sVirtual.score === 10);
check('Presencial 10 × 1.15 → 12', sPres.score === 12);
check('VIP/Speaker 10 × 1.4 = 14', sVip.score === 14 && sSpeaker.score === 14);
check('Ninguno supera 14', [sVirtual, sPres, sVip, sSpeaker].every((r) => r.score <= 14));

console.log('\n=== G — ICP No no se amplifica por canal ===');
const sponsorG = sponsorCon(0);
sponsorG.puestosBuscados = [];
const icpNo = (ticketTipo) =>
  calcularScore(
    sponsorG,
    {
      nombre: ticketTipo,
      empresa: 'X',
      ticketTipo,
      area: null,
      solucionesBuscadas: [],
      otraSolucionBuscada: '',
      fuenteDato: 'Declarado',
      tamanoNegocio: null,
      madurezNegocioExa: null,
      icpModaEcommerce: 'No',
    },
    0
  );
const icpVip = icpNo('Presencial VIP');
const icpVirtual = icpNo('Virtual');
check('scoreBase −20 ≤ 0: VIP y Virtual quedan iguales', icpVip.score === icpVirtual.score);
check('calcularScore no piso en 0; ambos dan −20', icpVip.score === -20);

console.log('\n=== Señales / explicación ===');
check('MULTIPLICADOR_CANAL exportado', MULTIPLICADOR_CANAL['Presencial VIP'] === 1.4);
const { senales } = vipA;
const textoVip = generarExplicacionNatural({ empresa: 'Sin Match SA' }, senales);
check('Explicación VIP habla de perfil similar, no de prioridad absoluta', textoVip.includes('perfil similar'));
check('Explicación VIP no dice Asistirá de forma presencial', !textoVip.includes('Asistirá de forma presencial'));

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'todas las verificaciones pasaron' : fallos + ' FALLARON'} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
