// src/routes/matchmaking.routes.js
const express = require('express');
const router = express.Router();
const matchmakingController = require('../controllers/matchmaking.controller');

router.post('/sponsors/:sponsorId/sugerir-matches', matchmakingController.sugerirMatches);
router.post('/sugerir-todos', matchmakingController.sugerirMatchesTodos);
router.post('/enviar-recordatorio-evento', matchmakingController.enviarRecordatorioEventoHttp);

module.exports = router;
