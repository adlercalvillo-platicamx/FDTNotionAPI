// Cola en proceso (1 réplica). El webhook responde RESULTADO_PENDIENTE
// y esto corre reservarCita + WhatsApp 2.2/2.3.

const { reservarCita, BookingError } = require('../services/booking.service');
const contactos = require('../services/contactos.service');
const { finDeBloque } = require('../services/citas.service');
const platica = require('../services/platica-client.service');

const enVuelo = new Set();

const COPY = {
  SPONSOR_YA_OCUPADO:
    'Ese horario con ese sponsor ya no está disponible. Elige otro horario o otro sponsor.',
  ASISTENTE_YA_OCUPADO: 'Ya tienes una cita en ese horario. Elige otra hora.',
  CAPACIDAD_MESAS_LLENA: 'Ya no hay lugar en ese horario. Elige otra hora.',
  DEFAULT: 'Hubo un error técnico al agendar. Inténtalo de nuevo.',
};

function copyExito({ sponsorNombre, inicio }) {
  return `Tu cita con ${sponsorNombre} quedó agendada el ${formatearInicio(inicio)}. Te enviamos también la invitación por correo.`;
}

function formatearInicio(inicioIso) {
  const m = String(inicioIso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return inicioIso;
  return `${m[3] === undefined ? inicioIso : `${m[1]} ${m[2]}:${m[3]}`}`;
}

function encolarReservaFlow(params) {
  const key = params.request_id;
  if (!key || enVuelo.has(key)) return;
  enVuelo.add(key);
  setImmediate(() => ejecutarReservaFlow(params).finally(() => enVuelo.delete(key)));
}

async function ejecutarReservaFlow(params) {
  const { sponsor_notion_id, asistente_notion_id, inicio } = params;
  let sponsor;
  let asistente;
  try {
    [sponsor, asistente] = await Promise.all([
      contactos.obtenerContacto(sponsor_notion_id),
      contactos.obtenerContacto(asistente_notion_id),
    ]);
  } catch (err) {
    console.error('[FlowJob] No se pudieron leer contactos:', err.message);
  }

  try {
    const resultado = await reservarCita({
      ...params,
      fin: params.fin || finDeBloque(inicio),
    });
    const estadoOk = resultado.estado === 'Confirmada' || resultado.estado === 'Confirmada sin notificar';
    if (!estadoOk && resultado.ya_existia && resultado.estado !== 'Confirmada' && resultado.estado !== 'Confirmada sin notificar') {
      return resultado;
    }
    const textoAsistente = copyExito({
      sponsorNombre: sponsor?.nombre || 'el sponsor',
      inicio,
    });
    const textoSponsor = `${asistente?.empresa || asistente?.nombre || 'Un asistente'} agendó un espacio contigo el ${formatearInicio(inicio)}.`;
    await Promise.allSettled([
      asistente?.whatsapp
        ? platica.enviarAvisoCita({
            phone: asistente.whatsapp,
            text: textoAsistente,
            templateName: process.env.PLATICA_TEMPLATE_CITA_ASISTENTE,
            templateParams: [sponsor?.nombre || '', formatearInicio(inicio)],
          })
        : Promise.resolve(),
      sponsor?.whatsapp
        ? platica.enviarAvisoCita({
            phone: sponsor.whatsapp,
            text: textoSponsor,
            templateName: process.env.PLATICA_TEMPLATE_CITA_SPONSOR,
            templateParams: [asistente?.empresa || asistente?.nombre || '', formatearInicio(inicio)],
          })
        : Promise.resolve(),
    ]);
    return resultado;
  } catch (err) {
    const code = err instanceof BookingError ? err.code : 'ERROR';
    const texto = COPY[code] || COPY.DEFAULT;
    console.error('[FlowJob] Reserva falló:', code, err.message);
    try {
      if (asistente?.whatsapp) {
        await platica.enviarAvisoCita({
          phone: asistente.whatsapp,
          text: texto,
          templateName: process.env.PLATICA_TEMPLATE_CITA_ASISTENTE,
          templateParams: [sponsor?.nombre || '', formatearInicio(inicio)],
        });
      }
    } catch (waErr) {
      console.error('[FlowJob] WhatsApp de error también falló:', waErr.message);
    }
    return { error: code, message: err.message };
  }
}

module.exports = { encolarReservaFlow, ejecutarReservaFlow, COPY, formatearInicio, enVuelo };
