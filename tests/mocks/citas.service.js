// test-run/notion-citas.service.js — MOCK. No hay citas reales creadas
// todavía para estos contactos de ejemplo, así que se simula "sin citas".

async function existeCitaActivaEntre({ sponsorPageId, asistentePageId }) {
  return false;
}

async function contarCitasConfirmadasPorSponsor(sponsorPageId) {
  return 0;
}

// ── NUEVO (9 de agosto) — mocks para el flujo de aprobación conversacional ──

// Simula la creación de una fila "Sugerido" en Citas. No necesita devolver
// nada específico — sugerirMatchesParaSponsor no usa el valor de retorno,
// solo espera que la promesa resuelva sin tronar.
async function crearCitaSugerida({ sponsorPageId, asistentePageId, sponsorNombre, asistenteNombre, score, explicacion }) {
  console.log(`  [mock] crearCitaSugerida: ${asistenteNombre} × ${sponsorNombre} (score ${score})`);
  return { id: `mock-cita-${sponsorPageId}-${asistentePageId}` };
}

// Sin filas simuladas por default — si un test necesita probar aprobarMatch
// contra un caso real, este mock debe extenderse (o reemplazarse por uno
// específico de ese test) para devolver una fila con Estatus "Sugerido"
// para el par que se va a aprobar. Devolver [] aquí a propósito, para que
// aprobarMatch() falle con su mensaje de error esperado ("no existe una
// sugerencia pendiente") en vez de que el mock invente datos.
async function buscarSugerenciasPendientesPorSponsor(sponsorPageId) {
  return [];
}

async function marcarCitaAprobada(notionPageId) {
  console.log(`  [mock] marcarCitaAprobada: ${notionPageId}`);
  return { id: notionPageId };
}

module.exports = {
  existeCitaActivaEntre,
  contarCitasConfirmadasPorSponsor,
  crearCitaSugerida,
  buscarSugerenciasPendientesPorSponsor,
  marcarCitaAprobada,
};
