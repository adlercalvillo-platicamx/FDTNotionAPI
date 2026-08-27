// tests/matchmaking-2026.manual-test.js
//
// Prueba del rediseño de match directo (formato de registro 2026).
// Cubre a propósito los casos límite, no solo el caso feliz:
//   1. El alias "Venta por redes sociales" ↔ "Vendo principalmente por redes sociales"
//   2. VIP con match mediocre vs. Presencial nombrado explícitamente (oro molido)
//   3. El comodín "Otro" NO debe contar como coincidencia
//   4. Múltiples soluciones coincidiendo a la vez

const {
  getEtapasValidas,
  calcularScore,
  generarExplicacionNatural,
  coincidenciaTextoLibre,
  empresaMencionadaEn,
} = require('../src/services/matchmaking.service');

let fallos = 0;
function check(nombre, condicion, extra = '') {
  const estado = condicion ? '  OK  ' : ' FALLA';
  if (!condicion) fallos++;
  console.log(`[${estado}] ${nombre}${extra ? ' → ' + extra : ''}`);
}

console.log('\n=== 1. Alias de etapa (el desajuste real del schema) ===');
const sponsorRedes = { etapaClienteBuscada: ['Venta por redes sociales'] };
const etapas = getEtapasValidas(sponsorRedes);
console.log('   Sponsor pide:', sponsorRedes.etapaClienteBuscada);
console.log('   Se traduce a:', etapas);
check('"Venta por redes sociales" se traduce al valor real del asistente',
  etapas.includes('Vendo principalmente por redes sociales'));

const sponsorLiteral = { etapaClienteBuscada: ['Escalamiento de e-commerce', 'Estrategia omnicanal avanzada'] };
const etapasLit = getEtapasValidas(sponsorLiteral);
check('Las etapas idénticas pasan sin cambio',
  etapasLit.includes('Escalamiento de e-commerce') && etapasLit.includes('Estrategia omnicanal avanzada'),
  JSON.stringify(etapasLit));

check('Sponsor sin etapa especificada → null (no filtra)', getEtapasValidas({ etapaClienteBuscada: [] }) === null);

console.log('\n=== 2. VIP mediocre vs. Presencial nombrado por el sponsor ===');
const sponsorPagos = {
  clientesPotencialesDeseados: 'Boutique Marea',
  clientesActuales: '',
  puestosBuscados: ['Direccion General / Founder / CEO'],
  solucion: ['Pagos', 'Plataforma eCommerce'],
};
const vipMediocre = {
  nombre: 'Vip Generico', empresa: 'Empresa VIP', ticketTipo: 'Presencial VIP',
  area: 'Operaciones / Logistica / Supply Chain', solucionesBuscadas: [],
  otraSolucionBuscada: '', fuenteDato: 'Declarado',
};
const presencialNombrado = {
  nombre: 'Ana Torres', empresa: 'Boutique Marea', ticketTipo: 'Presencial',
  area: 'Direccion General / Founder / CEO', solucionesBuscadas: ['Pagos'],
  otraSolucionBuscada: '', fuenteDato: 'Declarado',
};
const rVip = calcularScore(sponsorPagos, vipMediocre, 2);
const rNombrado = calcularScore(sponsorPagos, presencialNombrado, 2);
console.log(`   VIP genérico:        ${rVip.score}`);
console.log(`   Presencial nombrado: ${rNombrado.score}`);
check('El candidato pedido POR NOMBRE le gana a un VIP genérico', rNombrado.score > rVip.score);

const presencialNormal = {
  nombre: 'Presencial Normal', empresa: 'Otra Empresa', ticketTipo: 'Presencial',
  area: 'Direccion General / Founder / CEO', solucionesBuscadas: ['Pagos'],
  otraSolucionBuscada: '', fuenteDato: 'Declarado',
};
const rNormal = calcularScore(sponsorPagos, presencialNormal, 2);
console.log(`   Presencial normal (mismo match, sin ser nombrado): ${rNormal.score}`);
check('El VIP le gana a un Presencial con match equivalente', rVip.score > rNormal.score);

console.log('\n=== 3. El comodín "Otro" no debe contar como coincidencia ===');
const sponsorOtro = {
  clientesPotencialesDeseados: '', clientesActuales: '',
  puestosBuscados: ['Otro'], solucion: ['Otro'],
};
const candidatoOtro = {
  nombre: 'Candidato Otro', empresa: 'Empresa X', ticketTipo: 'Presencial',
  area: 'Otro', solucionesBuscadas: [], otraSolucionBuscada: '', fuenteDato: 'Declarado',
};
const rOtro = calcularScore(sponsorOtro, candidatoOtro, 0);
check('"Otro" ↔ "Otro" NO suma puntos de área', rOtro.senales.areaCoincidente === null,
  `score=${rOtro.score} (solo debería traer el bono de dato declarado)`);

console.log('\n=== 4. Múltiples soluciones coincidiendo ===');
const sponsorMulti = {
  clientesPotencialesDeseados: '', clientesActuales: '',
  puestosBuscados: ['Comercial / Ventas / Business Development'],
  solucion: ['Pagos', 'Marketplaces', 'Plataforma eCommerce'],
};
const candidatoMulti = {
  nombre: 'Multi Match', empresa: 'Empresa Multi', ticketTipo: 'Presencial',
  area: 'Comercial / Ventas / Business Development',
  solucionesBuscadas: ['Pagos', 'Marketplaces', 'Plataforma eCommerce'],
  otraSolucionBuscada: '', fuenteDato: 'Declarado',
};
const rMulti = calcularScore(sponsorMulti, candidatoMulti, 1);
check('Las 3 soluciones coincidentes se cuentan por separado',
  rMulti.senales.solucionesCoincidentes.length === 3,
  JSON.stringify(rMulti.senales.solucionesCoincidentes));
console.log('   Explicación generada:');
console.log('   ' + generarExplicacionNatural(candidatoMulti, rMulti.senales));

console.log('\n=== 5. Señal de texto libre (conservadora a propósito) ===');
check('Texto sin relación NO coincide',
  coincidenciaTextoLibre('busco proveedor de cajas', 'marcas de ropa infantil') === false);
check('Texto con 2+ palabras significativas SÍ coincide',
  coincidenciaTextoLibre('busco marcas de calzado deportivo', 'marcas de calzado para retail') === true);

console.log('\n=== 6. Oro molido: separadores flexibles con límite de palabra ===');
check('Price Shoes encuentra Priceshoes (caso real Reversso)',
  empresaMencionadaEn('Price Shoes', 'nos interesa Priceshoes y otras marcas') === true);
check('FLEXI exacto sigue matcheando',
  empresaMencionadaEn('FLEXI', 'trabajamos con FLEXI en retail') === true);
check('C&A encuentra C&A',
  empresaMencionadaEn('C&A', 'trabajamos con C&A') === true);
check('C&A encuentra "C y A Moda"',
  empresaMencionadaEn('C&A', 'trabajamos con C y A Moda') === true);
check('Andrea NO matchea AndreaMoto (prefijo pegado)',
  empresaMencionadaEn('Andrea', 'buscamos AndreaMoto Refacciones') === false);
check('Andrea sí matchea como palabra en una lista',
  empresaMencionadaEn('Andrea', 'buscamos: Andrea, Old Navy') === true);
check('Coca-Cola encuentra Coca Cola',
  empresaMencionadaEn('Coca-Cola', 'trabajamos con Coca Cola') === true);
check('AS corto sigue protegido por mínimo de 3',
  empresaMencionadaEn('AS', 'trabajamos con as camisas') === false);
check('Cempasúchil encuentra el nombre dentro de razón social del sponsor',
  empresaMencionadaEn('Cempasúchil', 'nos interesa Cempasúchil SA de CV') === true);

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'todas las verificaciones pasaron' : fallos + ' FALLARON'} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
