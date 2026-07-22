// src/index.js
require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/auth.middleware');
const citasRoutes = require('./routes/citas.routes');
const matchmakingRoutes = require('./routes/matchmaking.routes');
const checklistRoutes = require('./routes/checklist.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares globales ────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check (sin autenticación, primero para no quedar detrás del auth) ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fdt-notion-api', timestamp: new Date().toISOString() });
});

// ── Todo lo que sigue requiere X-API-Key ────────────────────
app.use(authMiddleware);

app.use('/citas', citasRoutes);
app.use('/matchmaking', matchmakingRoutes);
app.use('/checklist', checklistRoutes);

// ── 404 catch-all ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Endpoint no encontrado' });
});

// ── Error handler global ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[App] Error no controlado:', err);
  res.status(500).json({ error: 'Internal Server Error', message: 'Error interno del servidor' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[App] fdt-notion-api iniciado en puerto ${PORT}`);
    console.log(`[App] Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
