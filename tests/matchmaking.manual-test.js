// tests/matchmaking.manual-test.js
//
// Prueba manual (no es test automatizado con Jest, es un script que se
// corre a mano: `node tests/matchmaking.manual-test.js`) contra datos reales
// de Notion capturados el 15-16 de julio 2026, con Calendar/Notion escritura
// simuladas vía mocks.
//
// IMPORTANTE: inyecta los mocks directo en require.cache ANTES de requerir
// matchmaking.service.js, para que se pruebe el archivo real que vive en
// src/services/ (con sus rutas de require reales) y no una copia aparte.

const path = require('path');

const contactosRealPath = require.resolve('../src/services/contactos.service');
const citasRealPath = require.resolve('../src/services/citas.service');

require.cache[contactosRealPath] = {
  id: contactosRealPath,
  filename: contactosRealPath,
  loaded: true,
  exports: require(path.resolve(__dirname, 'mocks/contactos.service.js')),
};
require.cache[citasRealPath] = {
  id: citasRealPath,
  filename: citasRealPath,
  loaded: true,
  exports: require(path.resolve(__dirname, 'mocks/citas.service.js')),
};

const { sugerirMatchesParaSponsor } = require('../src/services/matchmaking.service');

async function main() {
  for (const [nombre, id] of [
    ['Carlos Medina', 'carlos-medina'],
    ['Laura Espinoza Rentería', 'laura-espinoza'],
  ]) {
    console.log(`\n=== Matchmaking para sponsor: ${nombre} ===`);
    const resultado = await sugerirMatchesParaSponsor(id, { topN: 3, escribirEnNotion: true });
    console.log(`Cuota pendiente: ${resultado.cuotaPendiente}`);
    console.log(`Candidatos evaluados (Capa 1, antes de filtros de texto): ${resultado.totalCandidatosEvaluados}`);
    console.log(`Candidatos válidos (después de exclusión de clientes/citas): ${resultado.totalCandidatosValidos}`);
    if (resultado.sugerencias.length === 0) {
      console.log('Sin candidatos sugeridos.');
    }
    for (const s of resultado.sugerencias) {
      console.log(`  -> ${s.nombre} (${s.empresa}) — score: ${s.score}`);
      s.detalle.forEach((d) => console.log(`       · ${d}`));
    }
  }
}

main().catch((err) => {
  console.error('Error en la prueba:', err);
  process.exit(1);
});
