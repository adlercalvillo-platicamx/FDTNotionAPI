// src/routes/citas.routes.js
const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citas.controller');

router.post('/reservar', citasController.reservar);
router.get('/disponibilidad', citasController.disponibilidad);
// Ruta estática ANTES de /:id/... para que Express no la matchee contra :id
router.post('/reintentar-notificaciones-pendientes', citasController.reintentarNotificacionesPendientes);
router.post('/:id/reenviar-notificacion', citasController.reenviarNotificacion);

module.exports = router;
