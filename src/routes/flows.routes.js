const express = require('express');
const router = express.Router();
const { whatsappFlows } = require('../controllers/flows.controller');

router.post('/whatsapp-flows', whatsappFlows);

module.exports = router;
