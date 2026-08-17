// Pensado para Cron Job de Coolify, mismo patrón que
// POST /checklist/revisar-pendientes. Corre cada 15 minutos (confirmado
// Adler 17-ago), busca todas las citas en "Confirmada sin notificar" con
// menos de MAX_INTENTOS ya registrados, y reintenta cada una. No falla el
// proceso completo si una falla — seguir con las demás y loggear cada
// resultado individual.

const citasService = require('../services/citas.service');
const { reintentarNotificacion } = require('../services/booking.service');

const MAX_INTENTOS_NOTIFICACION = Number(process.env.EMAIL_MAX_INTENTOS || 5);

async function ejecutarReintentosPendientes() {
  const candidatas = await citasService.buscarCitasSinNotificarParaReintentar(MAX_INTENTOS_NOTIFICACION);
  const resultados = { total: candidatas.length, exitosos: 0, fallidos: 0, detalle: [] };

  for (const cita of candidatas) {
    try {
      await reintentarNotificacion(cita.id);
      resultados.exitosos += 1;
      resultados.detalle.push({ id: cita.id, ok: true });
    } catch (err) {
      resultados.fallidos += 1;
      resultados.detalle.push({ id: cita.id, ok: false, error: err.message });
    }
  }

  console.log(`[CronNotificaciones] ${resultados.exitosos}/${resultados.total} reenviadas OK`);
  return resultados;
}

module.exports = { ejecutarReintentosPendientes };
