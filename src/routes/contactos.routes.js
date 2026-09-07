// src/routes/contactos.routes.js
const express = require('express');
const router = express.Router();
const contactosController = require('../controllers/contactos.controller');

router.get('/buscar', contactosController.buscar);
router.post('/hidratar-perfil-platica', contactosController.hidratarPerfil);

module.exports = router;
