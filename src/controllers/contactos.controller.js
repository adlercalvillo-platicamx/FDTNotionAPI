// src/controllers/contactos.controller.js

const { buscarContacto } = require('../services/contactos.service');

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

module.exports = { buscar };
