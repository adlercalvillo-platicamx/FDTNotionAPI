// src/middleware/auth.middleware.js
//
// Mismo patrón de header X-API-Key en todos los endpoints salvo /health.
// La clave vive en API_SECRET_KEY — es propia de este repo.

const API_SECRET_KEY = process.env.API_SECRET_KEY;

function authMiddleware(req, res, next) {
  if (!API_SECRET_KEY) {
    console.error('[Auth] API_SECRET_KEY no está configurada — rechazando todas las solicitudes por seguridad.');
    return res.status(500).json({ error: 'Internal Server Error', message: 'Autenticación no configurada.' });
  }

  const key = req.headers['x-api-key'];
  if (!key || key !== API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized', message: 'X-API-Key inválido o faltante.' });
  }

  next();
}

module.exports = authMiddleware;
