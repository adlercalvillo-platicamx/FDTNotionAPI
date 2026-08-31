// src/index.js
require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/auth.middleware');
const citasRoutes = require('./routes/citas.routes');
const matchmakingRoutes = require('./routes/matchmaking.routes');
const checklistRoutes = require('./routes/checklist.routes');
const contactosRoutes = require('./routes/contactos.routes');
const { montarMcp } = require('./mcp/mount');
const flowsRoutes = require('./routes/flows.routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check (sin autenticación, primero para no quedar detrás del auth) ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fdt-notion-api', timestamp: new Date().toISOString() });
});

app.use('/webhooks', flowsRoutes);

// ── Todo lo que sigue requiere X-API-Key ────────────────────
app.use(authMiddleware);

app.use('/citas', citasRoutes);
app.use('/matchmaking', matchmakingRoutes);
app.use('/checklist', checklistRoutes);
app.use('/contactos', contactosRoutes);

// ── MCP — mismo nivel de protección que las rutas de arriba (X-API-Key) ──
// Expone consultar_checklist, revisar_checklists_pendientes y
// sugerir_matches_para_sponsor. Ver src/mcp/server.js para el detalle.
montarMcp(app);

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
  // Contra el workspace de Laura, el default de pruebas del contacto de
  // bloqueo apagaría la exclusión de mesas en silencio. Se cae aquí, en el
  // deploy, no en la primera consulta de disponibilidad del evento.
  require('./services/citas.service').requireContactoBloqueoAgenda();

  app.listen(PORT, () => {
    console.log(`[App] fdt-notion-api iniciado en puerto ${PORT}`);
    console.log(`[App] Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
