// src/routes/checklist.routes.js
const express = require('express');
const router = express.Router();
const checklistController = require('../controllers/checklist.controller');

router.get('/consultar', checklistController.consultar);
router.post('/revisar-pendientes', checklistController.revisarPendientes);

module.exports = router;
