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
  etapaClienteBuscada: [],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
  puestosBuscados: [],
  solucion: [],
};

const asistentes = [
  { id: 'grande', nombre: 'Grande SA', empresa: 'Grande SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_GRANDE },
  { id: 'mediana', nombre: 'Mediana SA', empresa: 'Mediana SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MEDIANA },
  { id: 'micro', nombre: 'Micro SA', empresa: 'Micro SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_MICRO, madurezNegocioExa: 'Consolidado' },
  { id: 'pequena', nombre: 'Pequena SA', empresa: 'Pequena SA', ticketTipo: 'Virtual', tamanoNegocio: TAMANO_PEQUENA },
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
    async buscarAsistentesCandidatos() {
      return asistentes.map((a) => ({ categoria: 'Asistente', dadoDeBaja: false, ...a }));
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
const { sugerirMatchesParaSponsor } = require('../src/services/matchmaking.service');

async function main() {
  const r = await sugerirMatchesParaSponsor(sponsor.id, { topN: 20, escribirEnNotion: false });
  const ids = r.sugerencias.map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['exa-cons', 'exa-pyme', 'grande', 'mediana']);
  assert.strictEqual(r.totalCandidatosEvaluados, 4);
  assert.ok(!ids.includes('micro'));
  assert.ok(!ids.includes('pequena'));
  assert.ok(!ids.includes('exa-temp'));
  assert.ok(!ids.includes('vacio'));
  const scores = Object.fromEntries(r.sugerencias.map((s) => [s.id, s.score]));
  assert.strictEqual(scores.grande, 40);
  assert.strictEqual(scores.mediana, 15);
  assert.strictEqual(scores['exa-cons'], 40);
  assert.strictEqual(scores['exa-pyme'], 15);
  console.log('✅ Micro/Pequeña/Temprano/vacío no entran; Grande/Mediana/Exa sí, con pesos 40/15.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
