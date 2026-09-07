// src/controllers/contactos.controller.js

const { buscarContacto } = require('../services/contactos.service');
const { hidratarPerfilPlatica } = require('../services/perfil-platica.service');

// ─────────────────────────────────────────────────────────────
// GET /contactos/buscar?categoria=Asistente&telefono=...
//     /contactos/buscar?categoria=Asistente&nombre=...
//     /contactos/buscar?categoria=Sponsor&empresa=...
// Solo lectura. Resuelve page_id para Liz/Laura antes de reservar_cita.
// ─────────────────────────────────────────────────────────────
async function buscar(req, res) {
  const { nombre, telefono, empresa, categoria } = req.query;
  try {
    const resultados = await buscarContacto({ nombre, telefono, empresa, categoria });
    return res.status(200).json({ resultados });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    console.error('[ContactosController] Error en búsqueda:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

async function hidratarPerfil(req, res) {
  const { whatsapp, asistente_notion_id: asistentePageId } = req.body || {};
  if (!whatsapp && !asistentePageId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Se requiere whatsapp o asistente_notion_id.',
    });
  }
  try {
    const resultado = await hidratarPerfilPlatica({ whatsapp, asistentePageId });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({
        error: error.code || 'CONTACTO_NO_RESUELTO',
        message: error.message,
      });
    }
    console.error('[ContactosController] Error hidratando perfil:', error);
    return res.status(502).json({
      error: 'HIDRATACION_FALLO',
      message: error.message || 'No se pudo hidratar el perfil en Plática.',
    });
  }
}

module.exports = { buscar, hidratarPerfil };
