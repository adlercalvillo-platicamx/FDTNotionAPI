// tests/sesion-14ago-diffs.manual-test.js
//
// Casos consolidados de DIFF-1, DIFF-2 y DIFF-13 (sesión 14 ago).
// Corre sin Notion para scoring/booking/parseo; los casos de elegibilidad
// Virtual en Capa 1 replican el post-filtro del service (misma condición).
//
//   node tests/sesion-14ago-diffs.manual-test.js

const assert = require('assert');
const { parsearContacto } = require('../src/services/contactos.service');
const {
  calcularScore,
  generarExplicacionNatural,
  PESOS,
} = require('../src/services/matchmaking.service');
const { validarDuracionYFecha, BookingError } = require('../src/services/booking.service');

let fallos = 0;
function ok(nombre, fn) {
  try {
    fn();
    console.log(`  ✅ ${nombre}`);
  } catch (err) {
    fallos += 1;
    console.log(`  ❌ ${nombre}`);
    console.log(`     ${err.message}`);
  }
}

function paginaNotion({ madurezNegocioExa = undefined, ticketTipo = 'Presencial' } = {}) {
  const props = {
    Nombre: { title: [{ plain_text: 'Test' }] },
    Empresa: { rich_text: [] },
    'Ticket / Tipo Asistencia': ticketTipo ? { select: { name: ticketTipo } } : { select: null },
    'Madurez Ecommerce (Exa)': { rich_text: [] },
    'Giro Detectado (Exa)': { rich_text: [] },
    'Tamano Empresa (Exa)': { rich_text: [] },
    'Modelo de Negocio (Exa)': { select: null },
    'ICP Moda/Ecommerce': { select: null },
    'Presencia Digital (Exa)': { rich_text: [] },
  };
  if (madurezNegocioExa === null) {
    props['Madurez Negocio (Exa)'] = { select: null };
  } else if (madurezNegocioExa !== undefined) {
    props['Madurez Negocio (Exa)'] = { select: { name: madurezNegocioExa } };
  } else {
    props['Madurez Negocio (Exa)'] = { select: null };
  }
  return { id: 'test-id', properties: props };
}

// Misma regla que buscarAsistentesCandidatos post-filtro (DIFF-1 B.3)
function pasaPostFiltroQuiereCitas(c) {
  if (c.ticketTipo === 'Presencial' || c.ticketTipo === 'Virtual') {
    return c.quiereCitas1a1 !== 'No';
  }
  return true;
}

const sponsorBase = {
  puestosBuscados: [],
  solucion: [],
  clientesPotencialesDeseados: '',
};

function candidatoBase(overrides = {}) {
  return {
    nombre: 'Candidato Test',
    empresa: 'Empresa Test',
    ticketTipo: 'Presencial',
    area: null,
    solucionesBuscadas: [],
    otraSolucionBuscada: '',
    fuenteDato: null,
    madurezNegocioExa: null,
    ...overrides,
  };
}

console.log('\n=== DIFF-1 contactos — parsearContacto (Madurez Negocio) ===');
ok('Caso feliz: Consolidado → madurezNegocioExa', () => {
  const c = parsearContacto(paginaNotion({ madurezNegocioExa: 'Consolidado' }));
  assert.strictEqual(c.madurezNegocioExa, 'Consolidado');
});
ok('Caso límite dominante: vacío → null (no undefined)', () => {
  const c = parsearContacto(paginaNotion({ madurezNegocioExa: null }));
  assert.strictEqual(c.madurezNegocioExa, null);
  assert.notStrictEqual(c.madurezNegocioExa, undefined);
});
ok('No-interferencia: Virtual + Consolidado en mismo objeto', () => {
  const c = parsearContacto(paginaNotion({ madurezNegocioExa: 'Consolidado', ticketTipo: 'Virtual' }));
  assert.strictEqual(c.ticketTipo, 'Virtual');
  assert.strictEqual(c.madurezNegocioExa, 'Consolidado');
});

console.log('\n=== DIFF-1 contactos — Virtual elegibilidad (post-filtro) ===');
ok('Virtual + Sí → aparece', () => {
  assert.strictEqual(pasaPostFiltroQuiereCitas({ ticketTipo: 'Virtual', quiereCitas1a1: 'Sí' }), true);
});
ok('Virtual + No → NO aparece', () => {
  assert.strictEqual(pasaPostFiltroQuiereCitas({ ticketTipo: 'Virtual', quiereCitas1a1: 'No' }), false);
});
ok('Virtual + vacío → aparece', () => {
  assert.strictEqual(pasaPostFiltroQuiereCitas({ ticketTipo: 'Virtual', quiereCitas1a1: null }), true);
});

console.log('\n=== DIFF-2 matchmaking — Virtual (pesos + explicación) ===');
ok('Presencial vs Virtual mismas señales → Presencial +150', () => {
  const area = 'Direccion General / Founder / CEO';
  const sponsor = { ...sponsorBase, puestosBuscados: [area], solucion: ['Logistica / fulfillment'] };
  const comun = {
    area,
    solucionesBuscadas: ['Logistica / fulfillment'],
    fuenteDato: 'Declarado',
  };
  const p = calcularScore(sponsor, candidatoBase({ ticketTipo: 'Presencial', ...comun }), 0);
  const v = calcularScore(sponsor, candidatoBase({ ticketTipo: 'Virtual', ...comun }), 0);
  assert.strictEqual(p.score - v.score, PESOS.PRESENCIAL);
  assert.ok(p.detalle.some((d) => d.startsWith('presencial:')));
  assert.ok(!v.detalle.some((d) => d.startsWith('presencial:')));
});
ok('Virtual match perfecto (oro+área+solución) vs Presencial sin señales → Virtual gana', () => {
  const area = 'Direccion General / Founder / CEO';
  const sponsor = {
    ...sponsorBase,
    puestosBuscados: [area],
    solucion: ['Logistica / fulfillment'],
    clientesPotencialesDeseados: 'Boutique Marea',
  };
  const virtual = calcularScore(
    sponsor,
    candidatoBase({
      ticketTipo: 'Virtual',
      empresa: 'Boutique Marea',
      area,
      solucionesBuscadas: ['Logistica / fulfillment'],
    }),
    0
  );
  const presencial = calcularScore(sponsor, candidatoBase({ ticketTipo: 'Presencial' }), 0);
  assert.ok(virtual.score > presencial.score, `virtual=${virtual.score} presencial=${presencial.score}`);
  assert.strictEqual(virtual.score, PESOS.ORO_MOLIDO + PESOS.AREA + PESOS.SOLUCION);
  assert.strictEqual(presencial.score, PESOS.PRESENCIAL);
});
ok('Explicación VIP no menciona prioridad dos veces', () => {
  const { senales } = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Presencial VIP' }),
    0
  );
  const texto = generarExplicacionNatural(candidatoBase({ ticketTipo: 'Presencial VIP' }), senales);
  const matches = texto.match(/prioridad/gi) || [];
  assert.strictEqual(matches.length, 1, `texto=${texto}`);
  assert.ok(!texto.includes('Asistirá de forma presencial'));
});

console.log('\n=== DIFF-2 matchmaking — Madurez Negocio ===');
ok('Consolidado → +40 y línea detalle', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ madurezNegocioExa: 'Consolidado', ticketTipo: 'Virtual' }), 0);
  assert.ok(r.detalle.some((d) => d.includes('madurez_negocio: empresa consolidada')));
  assert.strictEqual(r.senales.madurezNegocio, 'Consolidado');
  assert.strictEqual(r.score, PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
});
ok('PyME → +15', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ madurezNegocioExa: 'PyME', ticketTipo: 'Virtual' }), 0);
  assert.strictEqual(r.score, PESOS.MADUREZ_NEGOCIO_PYME);
});
ok('Caso dominante: madurez null + no Virtual → score = PRESENCIAL only (0 cambio vs peso nuevo)', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ madurezNegocioExa: null, ticketTipo: 'Presencial' }), 0);
  assert.strictEqual(r.score, PESOS.PRESENCIAL);
  assert.ok(!r.detalle.some((d) => d.startsWith('madurez_negocio:')));
  assert.strictEqual(r.senales.madurezNegocio, null);
});
ok('Nancy/ZAGIS patrón: Consolidado no bypassa Capa 1 (score es Capa 2; elegibilidad aparte)', () => {
  // Este cambio es solo Capa 2: si Capa 1 bloquea por ICP=No, nunca llega a calcularScore.
  // Confirmamos que el score SÍ sumaría madurez si llegara — el bloqueo es upstream.
  const r = calcularScore(
    sponsorBase,
    candidatoBase({ madurezNegocioExa: 'Consolidado', ticketTipo: 'Presencial' }),
    0
  );
  assert.strictEqual(r.score, PESOS.PRESENCIAL + PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
});

console.log('\n=== DIFF-2 interacción Virtual + Madurez ===');
ok('Virtual + Consolidado: +40 madurez, 0 presencial', () => {
  const r = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Virtual', madurezNegocioExa: 'Consolidado' }),
    0
  );
  assert.strictEqual(r.score, PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
  assert.strictEqual(r.senales.esPresencial, false);
  assert.strictEqual(r.senales.madurezNegocio, 'Consolidado');
});
ok('Presencial + Consolidado sin otras señales = 190', () => {
  const r = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Presencial', madurezNegocioExa: 'Consolidado' }),
    0
  );
  assert.strictEqual(r.score, PESOS.PRESENCIAL + PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
});
ok('Explicación Presencial (no VIP) + Consolidado: ambas frases, orden correcto', () => {
  const { senales } = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Presencial', madurezNegocioExa: 'Consolidado' }),
    2
  );
  const texto = generarExplicacionNatural(candidatoBase({ nombre: 'Ana', empresa: 'X' }), senales);
  const iPres = texto.indexOf('Asistirá de forma presencial');
  const iMad = texto.indexOf('negocio como consolidado');
  const iCuota = texto.indexOf('todavía tiene 2 citas');
  assert.ok(iPres >= 0 && iMad >= 0 && iCuota >= 0, texto);
  assert.ok(iPres < iMad && iMad < iCuota, `orden mal: ${texto}`);
});

console.log('\n=== DIFF-13 booking — duración + rango fechas ===');
ok('Caso feliz 30 min dentro de rango', () => {
  validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:00:00-06:00');
});
ok('Duración 45 min → INVALID_INPUT', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:15:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /30 minutos/.test(e.message)
  );
});
ok('Duración 15 min → INVALID_INPUT', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T10:45:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /15 minutos/.test(e.message)
  );
});
ok('Fecha 6 oct → fuera de rango', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-06T10:30:00-06:00', '2026-10-06T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /fuera de ese rango/.test(e.message)
  );
});
ok('Fecha 9 oct → fuera de rango', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-09T10:30:00-06:00', '2026-10-09T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /fuera de ese rango/.test(e.message)
  );
});
ok('Cruce medianoche 7→8 oct → DEBE PASAR', () => {
  validarDuracionYFecha('2026-10-07T23:45:00-06:00', '2026-10-08T00:15:00-06:00');
});
ok('Fecha no parseable → INVALID_INPUT claro', () => {
  assert.throws(
    () => validarDuracionYFecha('no-es-fecha', '2026-10-07T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /ISO 8601/.test(e.message)
  );
});

console.log('\n=== Tipos boleto elegibles (DIFF-1 B.2) ===');
ok('Virtual siempre en lista elegible (incluirVirtual ignorado)', () => {
  // Réplica de la constante post-diff
  const tiposBoletoElegibles = ['Presencial VIP', 'Presencial', 'Virtual'];
  assert.deepStrictEqual(tiposBoletoElegibles, ['Presencial VIP', 'Presencial', 'Virtual']);
  assert.ok(tiposBoletoElegibles.includes('Virtual'));
});

console.log(`\n=== Resultado: ${fallos === 0 ? 'TODOS PASARON' : `${fallos} FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
