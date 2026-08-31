// src/routes/contactos.routes.js
const express = require('express');
const router = express.Router();
const contactosController = require('../controllers/contactos.controller');

router.get('/buscar', contactosController.buscar);

module.exports = router;
