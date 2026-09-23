const express = require('express');
const router = express.Router();
const { respaldar } = require('../controllers/notion-respaldo.controller');

router.post('/respaldar', respaldar);

module.exports = router;
