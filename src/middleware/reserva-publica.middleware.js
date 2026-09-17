const {
  verificarTokenReserva,
} = require('../services/reserva-publica-token.service');

const ventanas = new Map();

function origenesPermitidos() {
  const configurados = String(process.env.PAGINA_RESERVA_ORIGEN || '')
    .split(',')
    .map((valor) => valor.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    configurados.push('http://localhost:5173');
  }
  return new Set(configurados);
}

function corsReservaPublica(req, res, next) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (origin) {
    if (!origenesPermitidos().has(origin)) {
      return res.status(403).json({
        error: 'ORIGEN_NO_PERMITIDO',
        message: 'El origen de la página no está autorizado.',
      });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}

function limitarReservaPublica({ max, ventanaMs = 15 * 60 * 1000 }) {
  return function rateLimit(req, res, next) {
    const ahora = Date.now();
    const clave = `${req.ip || req.socket?.remoteAddress || 'desconocida'}:${req.path}`;
    const estado = ventanas.get(clave);
    if (!estado || estado.hasta <= ahora) {
      ventanas.set(clave, { cantidad: 1, hasta: ahora + ventanaMs });
      return next();
    }
    if (estado.cantidad >= max) {
      res.setHeader('Retry-After', String(Math.ceil((estado.hasta - ahora) / 1000)));
      return res.status(429).json({
        error: 'DEMASIADAS_SOLICITUDES',
        message: 'Se alcanzó temporalmente el límite de solicitudes.',
      });
    }
    estado.cantidad += 1;
    return next();
  };
}

function autenticarReservaPublica(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: 'SESION_REQUERIDA',
      message: 'Primero identifica al asistente con su correo.',
    });
  }

  try {
    const payload = verificarTokenReserva(match[1]);
    if (!payload) {
      return res.status(401).json({
        error: 'SESION_INVALIDA',
        message: 'La sesión no es válida o ya venció.',
      });
    }
    req.reservaContactoId = payload.sub;
    return next();
  } catch (error) {
    if (error.code === 'RESERVA_PUBLICA_NO_CONFIGURADA') {
      return res.status(503).json({ error: error.code, message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  corsReservaPublica,
  limitarReservaPublica,
  autenticarReservaPublica,
};
