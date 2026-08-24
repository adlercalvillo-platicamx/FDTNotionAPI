const express = require('express');
const router = express.Router();
const { whatsappFlows } = require('../controllers/flows.controller');
const { enviarCampanasAprobadas } = require('../controllers/campanas.controller');

router.post('/whatsapp-flows', whatsappFlows);
router.post('/notion/enviar-campanas-aprobadas', enviarCampanasAprobadas);

module.exports = router;
