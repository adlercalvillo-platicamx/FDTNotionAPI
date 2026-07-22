// src/controllers/matchmaking.controller.js

const { sugerirMatchesParaSponsor, sugerirMatchesGlobal } = require('../services/matchmaking.service');

// ─────────────────────────────────────────────────────────────
// POST /sponsors/:sponsorId/sugerir-matches
// Body opcional: { "topN": 3, "escribirEnNotion": true }
// ─────────────────────────────────────────────────────────────
async function sugerirMatches(req, res) {
  const { sponsorId } = req.params;
  const { topN, escribirEnNotion } = req.body || {};

  if (!sponsorId) {
    return res.status(400).json({ error: 'Bad Request', message: 'Falta sponsorId en la ruta.' });
  }

  try {
    const resultado = await sugerirMatchesParaSponsor(sponsorId, {
      topN: typeof topN === 'number' ? topN : undefined,
      escribirEnNotion: escribirEnNotion !== false,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[MatchmakingController] Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error al calcular sugerencias de matchmaking.',
    });
  }
}

module.exports = { sugerirMatches, sugerirMatchesTodos };

// ─────────────────────────────────────────────────────────────
// POST /matchmaking/sugerir-todos
// Body opcional: { "topN": 3 }
// Corre matchmaking para todos los sponsors activos y regresa dónde se
// detectaron solapamientos entre sponsors por el mismo asistente.
// ─────────────────────────────────────────────────────────────
async function sugerirMatchesTodos(req, res) {
  const { topN } = req.body || {};
  try {
    const resultado = await sugerirMatchesGlobal({ topN: typeof topN === 'number' ? topN : undefined });
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[MatchmakingController] Error en corrida global:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error al calcular matchmaking global.',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Registro de rutas:
//   const matchmakingController = require('../controllers/matchmaking.controller');
//   router.post('/sponsors/:sponsorId/sugerir-matches', matchmakingController.sugerirMatches);
//   router.post('/sugerir-todos', matchmakingController.sugerirMatchesTodos);
// ─────────────────────────────────────────────────────────────
