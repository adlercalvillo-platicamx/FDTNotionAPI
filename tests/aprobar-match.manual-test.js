// tests/aprobar-match.manual-test.js
//
// Prueba manual del flujo de aprobación de matches (agregado 9 de agosto,
// ver matchmaking-service-extension.js). Mismo patrón que
// matchmaking.manual-test.js: inyecta mocks en require.cache antes de
// requerir matchmaking.service.js, para probar el archivo real.
//
// Cubre el caso feliz (aprobar un match que sí fue sugerido) y el caso
// límite explícito que Adler pidió: aprobar un match que NUNCA fue
// sugerido — debe fallar con mensaje claro, no crear nada.

const path = require('path');

const contactosRealPath = require.resolve('../src/services/contactos.service');
const citasRealPath = require.resolve('../src/services/citas.service');

require.cache[contactosRealPath] = {
  id: contactosRealPath,
  filename: contactosRealPath,
  loaded: true,
  exports: require(path.resolve(__dirname, 'mocks/contactos.service.js')),
};

// Mock específico de este test — necesita SIMULAR que sí existe una fila
// "Sugerido" para un par específico (carlos-medina × laura-espinoza, los
// mismos IDs de ejemplo que ya usa matchmaking.manual-test.js), a
// diferencia del mock genérico de tests/mocks/citas.service.js que
// siempre regresa [] a propósito.
const mockCitasConAprobacion = {
  async existeCitaActivaEntre() {
    return false;
  },
  async contarCitasConfirmadasPorSponsor() {
    return 0;
  },
  async crearCitaSugerida({ sponsorNombre, asistenteNombre, score }) {
    console.log(`  [mock] crearCitaSugerida: ${asistenteNombre} × ${sponsorNombre} (score ${score})`);
    return { id: 'mock-cita-sugerida-001' };
  },
  // Simula UNA fila "Sugerido" real para el par (carlos-medina, laura-espinoza).
  // La forma del objeto sigue el mismo shape que Notion regresaría: page con
  // .id y .properties['Contacto Principal'].relation[].id
  async buscarSugerenciasPendientesPorSponsor(sponsorPageId) {
    if (sponsorPageId !== 'carlos-medina') return [];
    return [
      {
        id: 'fila-cita-sugerida-carlos-laura',
        properties: {
          'Contacto Principal': { relation: [{ id: 'laura-espinoza' }] },
          Estatus: { select: { name: 'Sugerido' } },
        },
      },
    ];
  },
  async marcarCitaAprobada(notionPageId) {
    console.log(`  [mock] marcarCitaAprobada: ${notionPageId}`);
    return { id: notionPageId };
  },
};

require.cache[citasRealPath] = {
  id: citasRealPath,
  filename: citasRealPath,
  loaded: true,
  exports: mockCitasConAprobacion,
};

const { aprobarMatch } = require('../src/services/matchmaking.service');

async function main() {
  console.log('\n=== Caso feliz: aprobar un match que SÍ fue sugerido ===');
  try {
    const resultado = await aprobarMatch('carlos-medina', 'laura-espinoza');
    console.log('Resultado:', JSON.stringify(resultado, null, 2));
    if (resultado.yaEstabaAprobado) {
      throw new Error('FALLO DE PRUEBA: esperaba yaEstabaAprobado=false en la primera aprobación');
    }
    console.log('✅ Caso feliz OK');
  } catch (err) {
    console.error('❌ FALLO en el caso feliz:', err.message);
    process.exit(1);
  }

  console.log('\n=== Caso límite: aprobar un match que NUNCA fue sugerido ===');
  // Usa 'laura-espinoza' como sponsor (contacto real en el mock) pero
  // consultando por 'ana-sofia-torres' como asistente — ese par nunca fue
  // sugerido en el mock (buscarSugerenciasPendientesPorSponsor solo
  // devuelve una fila para 'carlos-medina'). Usar IDs que SÍ existen en
  // contactos.service.js mock es importante: si uso IDs inventados,
  // aprobarMatch truena antes en notionContactos.obtenerContacto con
  // "contacto no encontrado", que es un error DISTINTO al que quiero
  // probar aquí (ausencia de sugerencia, no ausencia de contacto).
  try {
    await aprobarMatch('laura-espinoza', 'ana-sofia-torres');
    // Si llega aquí, NO tronó — eso es el fallo, se esperaba que tronara.
    console.error('❌ FALLO: se esperaba que aprobarMatch lanzara un error, pero no lo hizo.');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('No existe una sugerencia pendiente')) {
      console.log('✅ Caso límite OK — falló con el mensaje esperado:');
      console.log(`   "${err.message}"`);
    } else {
      console.error('❌ FALLO: tronó, pero con un mensaje inesperado:', err.message);
      process.exit(1);
    }
  }

  console.log('\n=== Todas las pruebas de aprobarMatch pasaron ===');
}

main().catch((err) => {
  console.error('Error inesperado en la prueba:', err);
  process.exit(1);
});
