// Filtro duro de Tamaño de Negocio en sugerirMatchesParaSponsor.
//
//   node tests/tamano-negocio.manual-test.js

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const servicePath = require.resolve('../src/services/matchmaking.service');

const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_MEDIANA = 'Mediana - 50 a 250 empleados';
const TAMANO_MICRO = 'Micro - menos de 10 empleados';
const TAMANO_PEQUENA = 'Pequeña - 10 a 50 empleados';

const sponsor = {
  id: 'sponsor-1',
  nombre: 'Sponsor Test',
  categoria: 'Sponsor',
  empresa: 'Acme',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 2,
  // El nombre técnico quedó legacy: desde 2-sep guarda tamaños buscados.
  etapaClienteBuscada: ['Grande', 'Mediana'],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
  puestosBuscados: [],
  solucion: [],
};

const asistentes = [
  { id: 'grande', nombre: 'Grande SA', empresa: 'Grande SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_GRANDE },
  { id: 'sin-etapa', nombre: 'Sin Etapa SA', empresa: 'Sin Etapa SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_GRANDE, etapaDeNegocio: null },
  { id: 'mediana', nombre: 'Mediana SA', empresa: 'Mediana SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MEDIANA },
  { id: 'micro', nombre: 'Micro SA', empresa: 'Micro SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MICRO },
  { id: 'pequena', nombre: 'Pequena SA', empresa: 'Pequena SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_PEQUENA, madurezNegocioExa: 'Consolidado' },
  { id: 'exa-cons', nombre: 'Viejo Consolidado', empresa: 'Viejo C', ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: 'Consolidado' },
  { id: 'exa-pyme', nombre: 'Viejo PyME', empresa: 'Viejo P', ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: 'PyME' },
  { id: 'exa-temp', nombre: 'Viejo Temprano', empresa: 'Viejo T', ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: 'Temprano' },
  { id: 'vacio', nombre: 'Sin dato', empresa: 'Vacio SA', ticketTipo: 'Virtual', tamanoNegocio: null, madurezNegocioExa: null },
];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      if (id === sponsor.id) return sponsor;
      return asistentes.find((a) => a.id === id);
    },
    async buscarAsistentesCandidatos({ etapasValidas }) {
      // Si matchmaking volviera a pasar etapasValidas, `sin-etapa` quedaría
      // fuera (como Blip + Adler/Sam antes del 28-ago). El service real ya
      // no las pasa; este mock las honraría si llegaran.
      return asistentes
        .map((a) => ({ categoria: 'Asistente', dadoDeBaja: false, ...a }))
        .filter((c) => {
          if (etapasValidas && etapasValidas.length > 0 && !etapasValidas.includes(c.etapaDeNegocio)) {
            return false;
          }
          return true;
        });
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
  esCandidatoPorTamanoNegocio,
  calcularScore,
  PESOS,
} = require('../src/services/matchmaking.service');

async function main() {
  // Sponsor que solo acepta Grande/Mediana: conserva el resultado anterior.
  const r = await sugerirMatchesParaSponsor(sponsor.id, { topN: 20, escribirEnNotion: false });
  const ids = r.sugerencias.map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['exa-cons', 'exa-pyme', 'grande', 'mediana', 'sin-etapa']);
  assert.strictEqual(r.totalCandidatosEvaluados, 5);
  assert.ok(ids.includes('sin-etapa'), 'Grande sin Etapa de Negocio entra aunque el sponsor tenga Etapa Cliente Buscada');
  assert.ok(!ids.includes('micro'));
  assert.ok(!ids.includes('pequena'));
  assert.ok(!ids.includes('exa-temp'));
  assert.ok(!ids.includes('vacio'));
  const scores = Object.fromEntries(r.sugerencias.map((s) => [s.id, s.score]));
  assert.strictEqual(scores.grande, 40);
  assert.strictEqual(scores['sin-etapa'], 40);
  assert.strictEqual(scores.mediana, 15);
  assert.strictEqual(scores['exa-cons'], 40);
  assert.strictEqual(scores['exa-pyme'], 15);

  // El mismo pool para un sponsor que declaró Pequeña/Micro.
  sponsor.etapaClienteBuscada = ['Pequeña', 'Micro'];
  const rPequenas = await sugerirMatchesParaSponsor(sponsor.id, {
    topN: 20,
    escribirEnNotion: false,
  });
  const idsPequenas = rPequenas.sugerencias.map((s) => s.id).sort();
  assert.deepStrictEqual(idsPequenas, ['exa-cons', 'exa-pyme', 'micro', 'pequena']);
  assert.strictEqual(rPequenas.totalCandidatosEvaluados, 4);
  assert.ok(!idsPequenas.includes('grande'));
  assert.ok(!idsPequenas.includes('mediana'));

  // Pequeña/Micro no tienen bono de tamaño; si Exa está poblado, sí caen
  // al fallback de madurez (Capa 2 independiente de Capa 1).
  const scoresPequenas = Object.fromEntries(
    rPequenas.sugerencias.map((s) => [s.id, s.score])
  );
  assert.strictEqual(scoresPequenas.pequena, PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
  assert.strictEqual(scoresPequenas.micro, 0);
  const explicacionPequena = rPequenas.sugerencias.find((s) => s.id === 'pequena');
  assert.ok(explicacionPequena.explicacion.includes('dentro de los tamaños que este sponsor indicó buscar'));
  assert.ok(explicacionPequena.explicacion.includes('consolidado'));
  assert.ok(explicacionPequena.detalle.some((d) => d.includes('madurez_negocio')));

  // Mock A: Pequeña + Exa Consolidado → entra y suma 40 de madurez.
  const mockA = calcularScore(
    { etapaClienteBuscada: ['Pequeña'] },
    { ticketTipo: 'Virtual', tamanoNegocio: TAMANO_PEQUENA, madurezNegocioExa: 'Consolidado' },
    0
  );
  assert.strictEqual(mockA.score, PESOS.MADUREZ_NEGOCIO_CONSOLIDADO);
  assert.strictEqual(mockA.senales.madurezNegocio, 'Consolidado');
  assert.strictEqual(mockA.senales.tamanoNegocio, 'Pequeña');
  assert.ok(mockA.detalle.some((d) => d.includes('madurez_negocio')));

  // Mock B: Micro sin Exa → 0 de tamaño/madurez, sin error.
  const mockB = calcularScore(
    { etapaClienteBuscada: ['Micro'] },
    { ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MICRO },
    0
  );
  assert.strictEqual(mockB.score, 0);
  assert.strictEqual(mockB.senales.madurezNegocio, null);
  assert.strictEqual(mockB.senales.tamanoNegocio, 'Micro');

  // Registros legacy siguen independientes de la selección del sponsor.
  assert.ok(idsPequenas.includes('exa-cons'));
  assert.ok(idsPequenas.includes('exa-pyme'));

  // Decisión Adler 4-sep: VIP/Speaker conservan bypass de tamaño.
  assert.strictEqual(
    esCandidatoPorTamanoNegocio(
      { ticketTipo: 'Presencial VIP', tamanoNegocio: TAMANO_MICRO },
      ['Grande']
    ),
    true
  );
  assert.strictEqual(
    esCandidatoPorTamanoNegocio(
      { ticketTipo: 'Presencial', tamanoNegocio: TAMANO_PEQUENA },
      ['Pequena']
    ),
    true,
    'tolera selección del sponsor sin acento'
  );
  assert.strictEqual(
    esCandidatoPorTamanoNegocio(
      { ticketTipo: 'Presencial', tamanoNegocio: TAMANO_GRANDE },
      []
    ),
    false,
    'selección vacía del sponsor no deja pasar tamaños nuevos por accidente'
  );

  console.log(
    '✅ Tamaño nuevo respeta al sponsor; legacy conserva Exa; VIP mantiene bypass.'
  );
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
