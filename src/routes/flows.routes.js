const express = require('express');
const router = express.Router();
const { whatsappFlows } = require('../controllers/flows.controller');
const { enviarCampanasAprobadas } = require('../controllers/campanas.controller');
const { mensajesPlatica } = require('../controllers/platica-webhook.controller');

router.post('/whatsapp-flows', whatsappFlows);
router.post('/notion/enviar-campanas-aprobadas', enviarCampanasAprobadas);
router.post('/platica/mensajes', mensajesPlatica);

module.exports = router;
