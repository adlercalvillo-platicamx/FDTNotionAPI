// src/routes/matchmaking.routes.js
const express = require('express');
const router = express.Router();
const matchmakingController = require('../controllers/matchmaking.controller');

router.post('/sponsors/:sponsorId/sugerir-matches', matchmakingController.sugerirMatches);
router.post('/sugerir-todos', matchmakingController.sugerirMatchesTodos);
router.post('/enviar-recordatorio-evento', matchmakingController.enviarRecordatorioEventoHttp);
router.post('/enviar-followups-72h', matchmakingController.enviarFollowups72hHttp);
router.get('/sugerencias-asistente', matchmakingController.sugerenciasAsistente);

module.exports = router;
