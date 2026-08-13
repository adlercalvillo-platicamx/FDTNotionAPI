// scripts/one-shots/verificar-casos-quiere-citas-giro.js
//
// Verifica los 5 casos del diff de contactos.service.js (12 ago 2026)
// contra Notion real vía buscarAsistentesCandidatos (sin filtro de etapa).

require('dotenv').config();

const { buscarAsistentesCandidatos } = require('../../src/services/contactos.service');

const CASOS = [
  {
    id: 1,
    nombre: 'Caso feliz — Sí explícito',
    // ROXANA TREJO: Presencial + Sí + Marca de moda
    buscar: (c) => c.nombre.toUpperCase().includes('ROXANA TREJO'),
    debeAparecer: true,
  },
  {
    id: 2,
    nombre: 'Caso límite 1 — vacío histórico + giro elegible',
    buscar: (c) => c.nombre.includes('Caso2 Vacío Histórico Giro Elegible (FICTICIO)'),
    debeAparecer: true,
  },
  {
    id: 3,
    nombre: 'Caso límite 2 — No explícito',
    // OSCAR IKER: Presencial + No + Marca de moda (giro elegible, pero No bloquea)
    buscar: (c) => c.nombre.toUpperCase().includes('OSCAR IKER'),
    debeAparecer: false,
  },
  {
    id: 4,
    nombre: 'Caso límite 3 — VIP + giro no elegible',
    // SHARON MEDINA: Presencial VIP + Agencia
    buscar: (c) => c.nombre.toUpperCase().includes('SHARON MEDINA'),
    debeAparecer: false,
  },
  {
    id: 5,
    nombre: 'Caso límite 4 — vacío + giro no elegible',
    buscar: (c) => c.nombre.includes('Caso5 Giro No Elegible Vacío Quiere (FICTICIO)'),
    debeAparecer: false,
  },
];

async function main() {
  console.log('Corriendo buscarAsistentesCandidatos (sin etapas, incluirVirtual=false)...\n');
  const candidatos = await buscarAsistentesCandidatos({ etapasValidas: null, incluirVirtual: false });
  console.log(`Total candidatos elegibles: ${candidatos.length}\n`);

  let fallos = 0;
  for (const caso of CASOS) {
    const encontrado = candidatos.find(caso.buscar);
    const aparece = Boolean(encontrado);
    const ok = aparece === caso.debeAparecer;
    if (!ok) fallos += 1;
    const marca = ok ? '✅' : '❌';
    console.log(`${marca} Caso ${caso.id}: ${caso.nombre}`);
    console.log(`   esperado aparecer=${caso.debeAparecer}, aparece=${aparece}${encontrado ? ` → ${encontrado.nombre} (quiere=${JSON.stringify(encontrado.quiereCitas1a1)}, giro=${JSON.stringify(encontrado.giroIndustria)}, ticket=${encontrado.ticketTipo})` : ''}`);
  }

  // Sanity: JAFETH también No
  const jafeth = candidatos.find((c) => c.nombre.toUpperCase().includes('JAFETH'));
  console.log(`\nSanity JAFETH (No): aparece=${Boolean(jafeth)} (esperado false)`);

  if (fallos > 0) {
    console.error(`\n${fallos} caso(s) fallaron`);
    process.exit(1);
  }
  console.log('\n=== Los 5 casos del diff pasaron ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
