// test-run/notion-citas.service.js — MOCK. No hay citas reales creadas
// todavía para estos contactos de ejemplo, así que se simula "sin citas".

async function existeCitaActivaEntre({ sponsorPageId, asistentePageId }) {
  return false;
}

async function contarCitasConfirmadasPorSponsor(sponsorPageId) {
  return 0;
}

module.exports = { existeCitaActivaEntre, contarCitasConfirmadasPorSponsor };
