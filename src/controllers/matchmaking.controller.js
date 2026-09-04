// src/controllers/matchmaking.controller.js

const { sugerirMatchesParaSponsor, sugerirMatchesGlobal } = require('../services/matchmaking.service');
const {
  enviarRecordatorioEvento,
  enviarFollowups72h,
} = require('../services/campanas-matchmaking.service');
const { consultarSugerenciasAprobadasPorAsistente } = require('../services/citas.service');
const { variantesTelefono } = require('../services/contactos.service');

const UUID_CANONICO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidCanonico(valor) {
  return UUID_CANONICO_RE.test(String(valor || ''));
}

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

async function sugerenciasAsistente(req, res) {
  const telefono = String(req.query.telefono || req.query.whatsapp || '').trim();
  const contactoId = String(req.query.contactoId || '').trim();

  if (!telefono && !contactoId) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Se requiere telefono o contactoId.',
    });
  }
  if (telefono && variantesTelefono(telefono).length === 0) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'telefono debe ser un número de teléfono (dígitos, con o sin +52).',
    });
  }
  if (!telefono && !esUuidCanonico(contactoId)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'contactoId debe ser un UUID válido',
    });
  }

  try {
    const resultado = await consultarSugerenciasAprobadasPorAsistente({
      telefono: telefono || undefined,
      contactoId: telefono ? undefined : contactoId,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.status === 404 || error.code === 'CONTACTO_NO_RESUELTO') {
      return res.status(404).json({ error: 'CONTACTO_NO_RESUELTO', message: error.message });
    }
    if (error.status === 400 || error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error.message });
    }
    console.error('[MatchmakingController] Error en sugerencias-asistente:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al consultar sugerencias del asistente.',
    });
  }
}

async function enviarRecordatorioEventoHttp(req, res) {
  try {
    const resultado = await enviarRecordatorioEvento({
      modoSimulacion: req.body?.modoSimulacion,
      // `ahora` no se toma del body: el cron no debe poder saltarse la ventana.
    });
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[MatchmakingController] Error en recordatorio de evento:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error al enviar el recordatorio del evento.',
    });
  }
}

async function enviarFollowups72hHttp(_req, res) {
  try {
    // Sin overrides por body: las dos barreras salen solo del env de Coolify.
    const resultado = await enviarFollowups72h();
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[MatchmakingController] Error en follow-up 72h:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error al procesar follow-ups de 72 horas.',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /matchmaking/sugerir-todos
// Body opcional: { "topN": 3 }
// Corre matchmaking para todos los sponsors activos y regresa dónde se
// detectaron solapamientos entre sponsors por el mismo asistente.
// ─────────────────────────────────────────────────────────────
async function sugerirMatchesTodos(req, res) {
  const { topN } = req.body || {};
  try {
    const resultado = await sugerirMatchesGlobal({
      topN: typeof topN === 'number' ? topN : undefined,
      // Explícito para preservar el comportamiento de siempre de este
      // endpoint (escribir en Notion) — el default de sugerirMatchesGlobal
      // cambió a false el 6 de agosto al agregar la herramienta MCP
      // sugerir_matches_global (ver comentario en matchmaking.service.js).
      escribirEnNotion: true,
    });
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
//   router.post('/enviar-recordatorio-evento', matchmakingController.enviarRecordatorioEventoHttp);
// ─────────────────────────────────────────────────────────────

module.exports = {
  sugerirMatches,
  sugerirMatchesTodos,
  enviarRecordatorioEventoHttp,
  enviarFollowups72hHttp,
  sugerenciasAsistente,
};
