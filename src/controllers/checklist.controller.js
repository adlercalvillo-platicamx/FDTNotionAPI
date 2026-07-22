// src/controllers/checklist.controller.js

const { consultarChecklist, revisarChecklistsPendientes } = require('../services/checklist.service');

// ─────────────────────────────────────────────────────────────
// GET /checklist/consultar?nombre=Carlos%20Medina
// Uso: cuando Liz/Laura preguntan "cómo va fulano" — pensado para que lo
// invoque el agente de WhatsApp (todavía no construido) traduciendo la
// pregunta en lenguaje natural a este query param.
// ─────────────────────────────────────────────────────────────
async function consultar(req, res) {
  const { nombre } = req.query;
  if (!nombre) {
    return res.status(400).json({ error: 'Bad Request', message: 'Falta el parámetro "nombre".' });
  }
  try {
    const resultado = await consultarChecklist(nombre);
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[ChecklistController] Error en consulta:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /checklist/revisar-pendientes
// Pensado para dispararse desde un Cron Job de Coolify (petición HTTP
// programada, mismo patrón que ya usa Plática para Meet -> Notion).
// Actualiza Notion y regresa la lista de incompletos — el envío de la
// alerta por WhatsApp es un paso posterior, no construido todavía.
// ─────────────────────────────────────────────────────────────
async function revisarPendientes(req, res) {
  try {
    const resultado = await revisarChecklistsPendientes();
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('[ChecklistController] Error en barrido:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

module.exports = { consultar, revisarPendientes };

// ─────────────────────────────────────────────────────────────
// Registro de rutas:
//   const checklistController = require('../controllers/checklist_controller');
//   router.get('/checklist/consultar', checklistController.consultar);
//   router.post('/checklist/revisar-pendientes', checklistController.revisarPendientes);
// ─────────────────────────────────────────────────────────────
