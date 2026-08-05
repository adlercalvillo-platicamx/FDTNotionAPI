// src/mcp/mount.js
//
// Monta POST /mcp sobre el Express existente, en modo STATELESS
// (sessionIdGenerator: undefined). Stateless es la elección correcta para
// este proyecto porque fdt-notion-api ya corre fijo a 1 sola réplica por el
// mutex de reservas (booking.service.js) — sesiones stateful en varias
// instancias necesitarían sticky routing, y aunque hoy no aplica (1
// réplica), stateless nos deja libres de esa preocupación por completo si
// algún día se toca esa configuración.
//
// IMPORTANTE: este módulo asume que ya se montó authMiddleware ANTES de
// llamar montarMcp(app) — igual que /citas, /matchmaking y /checklist. Ver
// nota en index.js. Si se monta /mcp antes del middleware por descuido, se
// expone Notion y la lógica de negocio sin ninguna credencial.

const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { crearServidorMcp } = require('./server');

function montarMcp(app) {
  app.post('/mcp', async (req, res) => {
    const server = crearServidorMcp();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[MCP] Error no controlado en /mcp:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error', message: 'Error interno del servidor MCP.' });
      }
    }
  });
}

module.exports = { montarMcp };
