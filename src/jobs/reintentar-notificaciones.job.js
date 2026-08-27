// Handler del endpoint POST /citas/reintentar-notificaciones-pendientes
// (también tool MCP `reintentar_notificaciones_pendientes`). A demanda —
// NO es un cron y NO tiene tope de llamadas. Tras corregir un dato en
// Contactos/SMTP, el agente o un humano dispara este barrido. Si una cita
// falla, el detalle incluye el motivo (categoria + mensaje) y se sigue
// con las demás.

const citasService = require('../services/citas.service');
const { reintentarNotificacion } = require('../services/booking.service');

async function ejecutarReintentosPendientes() {
  // Dos pendientes distintos: la confirmación que nunca salió y el aviso
  // de cancelación que nunca salió. reintentarNotificacion() distingue
  // cuál .ics toca por el estatus de la fila.
  const [sinConfirmar, sinCancelar] = await Promise.all([
    citasService.buscarCitasSinNotificarParaReintentar(),
    citasService.buscarCancelacionesSinNotificar(),
  ]);
  const candidatas = [...sinConfirmar, ...sinCancelar];
  const resultados = { total: candidatas.length, exitosos: 0, fallidos: 0, detalle: [] };

  for (const cita of candidatas) {
    try {
      await reintentarNotificacion(cita.id);
      resultados.exitosos += 1;
      resultados.detalle.push({ id: cita.id, ok: true });
    } catch (err) {
      resultados.fallidos += 1;
      resultados.detalle.push({
        id: cita.id,
        ok: false,
        error: err.code || 'ERROR',
        mensaje: err.message,
      });
    }
  }

  console.log(`[ReintentosNotificaciones] ${resultados.exitosos}/${resultados.total} reenviadas OK`);
  return resultados;
}

module.exports = { ejecutarReintentosPendientes };
