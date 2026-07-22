// src/routes/citas.routes.js
const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citas.controller');

router.post('/reservar', citasController.reservar);

module.exports = router;
