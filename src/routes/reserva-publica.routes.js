const express = require('express');
const controller = require('../controllers/reserva-publica.controller');
const {
  corsReservaPublica,
  limitarReservaPublica,
  autenticarReservaPublica,
} = require('../middleware/reserva-publica.middleware');

const router = express.Router();

router.use(corsReservaPublica);
router.post('/identificar', limitarReservaPublica({ max: 20 }), controller.identificar);

router.use(autenticarReservaPublica);
router.get('/sponsors', limitarReservaPublica({ max: 60 }), controller.sponsors);
router.get(
  '/disponibilidad',
  limitarReservaPublica({ max: 120 }),
  controller.disponibilidad
);
router.post('/reservar', limitarReservaPublica({ max: 20 }), controller.reservar);
router.post(
  '/citas/:citaId/modificar',
  limitarReservaPublica({ max: 20 }),
  controller.modificar
);
router.post(
  '/citas/:citaId/cancelar',
  limitarReservaPublica({ max: 20 }),
  controller.cancelar
);

module.exports = router;
