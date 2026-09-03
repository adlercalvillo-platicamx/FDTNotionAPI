// src/routes/citas.routes.js
const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citas.controller');
const { programarRecordatorio15min } = require('../controllers/recordatorio-cita-15min.controller');

router.post('/reservar', citasController.reservar);
router.post('/programar-recordatorio-15min', programarRecordatorio15min);
router.post('/modificar-cita', citasController.modificar);
router.post('/cancelar-cita', citasController.cancelar);
router.get('/disponibilidad', citasController.disponibilidad);
router.get('/sugeridas', citasController.sugeridas);
// Ruta estática ANTES de /:id/... para que Express no la matchee contra :id
router.post('/reintentar-notificaciones-pendientes', citasController.reintentarNotificacionesPendientes);
router.post('/:id/reenviar-notificacion', citasController.reenviarNotificacion);

module.exports = router;
