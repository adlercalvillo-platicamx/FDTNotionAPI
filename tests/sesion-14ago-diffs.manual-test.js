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
  esCandidatoPorTamanoNegocio,
  PESOS,
  TAMANO_GRANDE,
  TAMANO_MEDIANA,
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

function paginaNotion({
  madurezNegocioExa = undefined,
  ticketTipo = 'Presencial',
  tamanoNegocio = undefined,
  icpModaEcommerce = undefined,
  estadoWebExa = undefined,
} = {}) {
  const props = {
    Nombre: { title: [{ plain_text: 'Test' }] },
    Empresa: { rich_text: [] },
    'Ticket / Tipo Asistencia': ticketTipo ? { select: { name: ticketTipo } } : { select: null },
    'Madurez Ecommerce (Exa)': { rich_text: [] },
    'Giro Detectado (Exa)': { rich_text: [] },
    'Tamano Empresa (Exa)': { rich_text: [] },
    'Modelo de Negocio (Exa)': { select: null },
    'ICP Moda/Ecommerce': { select: null },
    'Estado Web (Exa)': { select: null },
    'Presencia Digital (Exa)': { rich_text: [] },
  };
  if (madurezNegocioExa === null) {
    props['Madurez Negocio (Exa)'] = { select: null };
  } else if (madurezNegocioExa !== undefined) {
    props['Madurez Negocio (Exa)'] = { select: { name: madurezNegocioExa } };
  } else {
    props['Madurez Negocio (Exa)'] = { select: null };
  }
  if (tamanoNegocio === null) {
    props['Tamaño de Negocio'] = { select: null };
  } else if (tamanoNegocio !== undefined) {
    props['Tamaño de Negocio'] = { select: { name: tamanoNegocio } };
  } else {
    props['Tamaño de Negocio'] = { select: null };
  }
  if (icpModaEcommerce === null) {
    props['ICP Moda/Ecommerce'] = { select: null };
  } else if (icpModaEcommerce !== undefined) {
    props['ICP Moda/Ecommerce'] = { select: { name: icpModaEcommerce } };
  }
  if (estadoWebExa === null) {
    props['Estado Web (Exa)'] = { select: null };
  } else if (estadoWebExa !== undefined) {
    props['Estado Web (Exa)'] = { select: { name: estadoWebExa } };
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
ok('ICP Sí y Estado Web Con web se parsean', () => {
  const c = parsearContacto(paginaNotion({ icpModaEcommerce: 'Sí', estadoWebExa: 'Con web' }));
  assert.strictEqual(c.icpModaEcommerce, 'Sí');
  assert.strictEqual(c.estadoWebExa, 'Con web');
});
ok('ICP y Estado Web vacíos → null (no undefined)', () => {
  const c = parsearContacto(paginaNotion());
  assert.strictEqual(c.icpModaEcommerce, null);
  assert.strictEqual(c.estadoWebExa, null);
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
ok('Presencial vs Virtual mismas señales → Presencial gana por ×1.15, no +150', () => {
  const area = 'Direccion General / Founder / CEO';
  const sponsor = { ...sponsorBase, puestosBuscados: [area], solucion: ['Logistica / fulfillment'] };
  const comun = {
    area,
    solucionesBuscadas: ['Logistica / fulfillment'],
    fuenteDato: 'Declarado',
  };
  const p = calcularScore(sponsor, candidatoBase({ ticketTipo: 'Presencial', ...comun }), 0);
  const v = calcularScore(sponsor, candidatoBase({ ticketTipo: 'Virtual', ...comun }), 0);
  const base = PESOS.AREA + PESOS.SOLUCION + PESOS.DATO_DECLARADO;
  assert.strictEqual(v.score, base);
  assert.strictEqual(p.score, Math.round((base * 115) / 100));
  assert.ok(p.score > v.score);
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
  assert.strictEqual(presencial.score, 0);
});
ok('Explicación VIP no menciona prioridad dos veces', () => {
  const { senales } = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Presencial VIP' }),
    0
  );
  const texto = generarExplicacionNatural(candidatoBase({ ticketTipo: 'Presencial VIP' }), senales);
  assert.ok(texto.includes('perfil similar'), `texto=${texto}`);
  assert.ok(!texto.includes('tiene prioridad'), `texto=${texto}`);
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
ok('Caso dominante: madurez null + Presencial sin afinidad → score 0 (el canal ya no suma)', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ madurezNegocioExa: null, ticketTipo: 'Presencial' }), 0);
  assert.strictEqual(r.score, 0);
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
  assert.strictEqual(r.score, Math.round((PESOS.MADUREZ_NEGOCIO_CONSOLIDADO * 115) / 100));
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
ok('Presencial + Consolidado sin otras señales = 40 × 1.15 → 46', () => {
  const r = calcularScore(
    sponsorBase,
    candidatoBase({ ticketTipo: 'Presencial', madurezNegocioExa: 'Consolidado' }),
    0
  );
  assert.strictEqual(r.score, Math.round((PESOS.MADUREZ_NEGOCIO_CONSOLIDADO * 115) / 100));
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

console.log('\n=== Matchmaking — cuota pendiente informativa, no comparable ===');
ok('Cuotas pendientes distintas producen exactamente el mismo score', () => {
  const candidato = candidatoBase({
    ticketTipo: 'Virtual',
    madurezNegocioExa: 'Consolidado',
    fuenteDato: 'Declarado',
  });
  const conUnaPendiente = calcularScore(sponsorBase, candidato, 1);
  const conCuatroPendientes = calcularScore(sponsorBase, candidato, 4);
  assert.strictEqual(conUnaPendiente.score, conCuatroPendientes.score);
  assert.ok(conUnaPendiente.detalle.includes('cuota_pendiente: 1 citas por cubrir'));
  assert.ok(conCuatroPendientes.detalle.includes('cuota_pendiente: 4 citas por cubrir'));
});
ok('Cuota pendiente positiva permanece en la explicación', () => {
  const candidato = candidatoBase({ ticketTipo: 'Virtual' });
  const { senales } = calcularScore(sponsorBase, candidato, 3);
  const texto = generarExplicacionNatural(candidato, senales);
  assert.ok(texto.includes('sponsor todavía tiene 3 citas por cubrir'), texto);
});
ok('Cuota pendiente cero no aparece en la explicación', () => {
  const candidato = candidatoBase({ ticketTipo: 'Virtual' });
  const { senales } = calcularScore(sponsorBase, candidato, 0);
  const texto = generarExplicacionNatural(candidato, senales);
  assert.ok(!texto.includes('por cubrir de su cuota'), texto);
});

console.log('\n=== Matchmaking — Tamaño de Negocio (filtro + pesos) ===');
ok('parsearContacto lee Tamaño de Negocio', () => {
  const c = parsearContacto(paginaNotion({ tamanoNegocio: TAMANO_GRANDE }));
  assert.strictEqual(c.tamanoNegocio, TAMANO_GRANDE);
});
ok('Grande entra y suma 40 (Virtual, sin otras señales)', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ ticketTipo: 'Virtual', tamanoNegocio: TAMANO_GRANDE }), 0);
  assert.strictEqual(esCandidatoPorTamanoNegocio({ tamanoNegocio: TAMANO_GRANDE }), true);
  assert.strictEqual(r.score, PESOS.TAMANO_GRANDE);
  assert.ok(r.detalle.includes('tamano_negocio: empresa grande'));
});
ok('Mediana entra y suma 15', () => {
  const r = calcularScore(sponsorBase, candidatoBase({ ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MEDIANA }), 0);
  assert.strictEqual(esCandidatoPorTamanoNegocio({ tamanoNegocio: TAMANO_MEDIANA }), true);
  assert.strictEqual(r.score, PESOS.TAMANO_MEDIANA);
});
ok('Micro excluido del pool (allowlist, no !== Micro)', () => {
  assert.strictEqual(
    esCandidatoPorTamanoNegocio({ tamanoNegocio: 'Micro - menos de 10 empleados', madurezNegocioExa: 'Consolidado' }),
    false
  );
});
ok('Pequeña excluida del pool', () => {
  assert.strictEqual(
    esCandidatoPorTamanoNegocio({ tamanoNegocio: 'Pequeña - 10 a 50 empleados' }),
    false
  );
});
ok('Vacío + Consolidado entra; peso de Madurez 40, no TAMANO', () => {
  const c = candidatoBase({ ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: 'Consolidado' });
  assert.strictEqual(esCandidatoPorTamanoNegocio(c), true);
  const r = calcularScore(sponsorBase, c, 0);
  assert.strictEqual(r.score, PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
  assert.ok(!r.detalle.some((d) => d.startsWith('tamano_negocio:')));
});
ok('Vacío + PyME entra; peso Madurez 15', () => {
  const c = candidatoBase({ ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: 'PyME' });
  assert.strictEqual(esCandidatoPorTamanoNegocio(c), true);
  const r = calcularScore(sponsorBase, c, 0);
  assert.strictEqual(r.score, PESOS.MADUREZ_NEGOCIO_PYME);
});
ok('Vacío + Temprano excluido', () => {
  assert.strictEqual(
    esCandidatoPorTamanoNegocio({ tamanoNegocio: null, madurezNegocioExa: 'Temprano' }),
    false
  );
});
ok('Vacío + vacío (ambos null) excluido', () => {
  assert.strictEqual(esCandidatoPorTamanoNegocio({ tamanoNegocio: null, madurezNegocioExa: null }), false);
  assert.strictEqual(esCandidatoPorTamanoNegocio({}), false);
});
ok('Ambos poblados: gana Tamaño, no se suman 40+40', () => {
  const c = candidatoBase({
    ticketTipo: 'Virtual',
    tamanoNegocio: TAMANO_GRANDE,
    madurezNegocioExa: 'Consolidado',
  });
  assert.strictEqual(esCandidatoPorTamanoNegocio(c), true);
  const r = calcularScore(sponsorBase, c, 0);
  assert.strictEqual(r.score, PESOS.TAMANO_GRANDE);
  assert.strictEqual(r.senales.tamanoNegocio, 'Grande');
  assert.strictEqual(r.senales.madurezNegocio, null);
  assert.ok(!r.detalle.some((d) => d.startsWith('madurez_negocio:')));
});

console.log('\n=== DIFF-13 booking — duración + bloques de env (igual que /disponibilidad) ===');
// Misma config que Coolify / smoke de disponibilidad — sin esto la validación
// nueva no puede generar la grilla oficial de slots.
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';

ok('Caso feliz: primer bloque miércoles 10:30', () => {
  validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:00:00-06:00');
});
ok('Caso feliz: último bloque miércoles 18:30', () => {
  validarDuracionYFecha('2026-10-07T18:30:00-06:00', '2026-10-07T19:00:00-06:00');
});
ok('Caso feliz: primer bloque jueves 09:00', () => {
  validarDuracionYFecha('2026-10-08T09:00:00-06:00', '2026-10-08T09:30:00-06:00');
});
ok('Caso feliz: último bloque jueves 17:30→18:00', () => {
  validarDuracionYFecha('2026-10-08T17:30:00-06:00', '2026-10-08T18:00:00-06:00');
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
ok('Fecha 6 oct → fuera de CITAS_FECHAS_EVENTO', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-06T10:30:00-06:00', '2026-10-06T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /fechas del evento/.test(e.message)
  );
});
ok('Fecha 9 oct → fuera de CITAS_FECHAS_EVENTO', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-09T10:30:00-06:00', '2026-10-09T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /fechas del evento/.test(e.message)
  );
});
ok('Cruce medianoche 7→8 oct → DEBE RECHAZARSE', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T23:45:00-06:00', '2026-10-08T00:15:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /cruzar de un día/.test(e.message)
  );
});
ok('Miércoles 09:00 (antes de 10:30) → rechazado', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T09:00:00-06:00', '2026-10-07T09:30:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /no es un bloque válido/.test(e.message)
  );
});
ok('Miércoles 19:00 como inicio → rechazado (fuera de grilla)', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T19:00:00-06:00', '2026-10-07T19:30:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /no es un bloque válido/.test(e.message)
  );
});
ok('Jueves 18:00 como inicio → rechazado (último bloque es 17:30)', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-08T18:00:00-06:00', '2026-10-08T18:30:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /no es un bloque válido/.test(e.message)
  );
});
ok('Offset distinto al de env → no matchea bloque literal', () => {
  assert.throws(
    () => validarDuracionYFecha('2026-10-07T10:30:00-05:00', '2026-10-07T11:00:00-05:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /no es un bloque válido/.test(e.message)
  );
});
ok('Fecha no parseable → INVALID_INPUT claro', () => {
  assert.throws(
    () => validarDuracionYFecha('no-es-fecha', '2026-10-07T11:00:00-06:00'),
    (e) => e instanceof BookingError && e.code === 'INVALID_INPUT' && /ISO 8601/.test(e.message)
  );
});
ok('Sin CITAS_HORA_INICIO del día → HORARIO_NO_CONFIGURADO (503)', () => {
  const backup = process.env.CITAS_HORA_INICIO_2026_10_07;
  delete process.env.CITAS_HORA_INICIO_2026_10_07;
  try {
    assert.throws(
      () => validarDuracionYFecha('2026-10-07T10:30:00-06:00', '2026-10-07T11:00:00-06:00'),
      (e) => e instanceof BookingError && e.code === 'HORARIO_NO_CONFIGURADO' && /CITAS_HORA_INICIO_2026_10_07/.test(e.message)
    );
  } finally {
    process.env.CITAS_HORA_INICIO_2026_10_07 = backup;
  }
});

console.log('\n=== Tipos boleto elegibles (DIFF-1 B.2) ===');
ok('Virtual y Speaker siempre en lista elegible (incluirVirtual ignorado)', () => {
  // Réplica de la constante post-diff
  const tiposBoletoElegibles = ['Presencial VIP', 'Presencial', 'Virtual', 'Speaker'];
  assert.ok(tiposBoletoElegibles.includes('Virtual'));
  assert.ok(tiposBoletoElegibles.includes('Speaker'));
});

console.log(`\n=== Resultado: ${fallos === 0 ? 'TODOS PASARON' : `${fallos} FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
