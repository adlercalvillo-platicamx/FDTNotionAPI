const crypto = require('crypto');
const contactos = require('./contactos.service');
const citas = require('./citas.service');
const { encolarReservaFlow, COPY } = require('../jobs/reservar-desde-flow.job');

const TIMEOUT_MS = Number(process.env.FLOW_NOTION_TIMEOUT_MS || 500);
const MAX_DROPDOWN = 10;

const MSG = {
  SIN_REGISTRO: 'No encontramos tu registro. Cierra e intenta de nuevo más tarde.',
  SIN_SUGERIDAS: 'No hay sponsors disponibles para agendar ahora.',
  SIN_HORARIOS: 'No hay horarios libres ese día. Elige otra fecha.',
  TIMEOUT: 'No pudimos cargar los datos. Cierra e intenta de nuevo.',
  INVALIDO: 'Faltan datos para continuar. Cierra e intenta de nuevo.',
  YA_CITAS: 'Ya tienes una cita confirmada con estos sponsors. Si necesitas otra, escribe al equipo.',
};

function conTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const t = setTimeout(() => {
        const err = new Error('timeout_flow');
        err.code = 'TIMEOUT';
        reject(err);
      }, ms);
      promise.finally(() => clearTimeout(t)).catch(() => {});
    }),
  ]);
}

/** Solo campos declarados en flows/reserva-asistente.json (Meta rechaza extras). */
const DATA_KEYS = {
  SPONSOR: ['sponsors', 'asistente_notion_id', 'error_message'],
  FECHA: ['fechas', 'sponsor_id', 'asistente_notion_id', 'error_message'],
  HORARIO: ['horarios', 'sponsor_id', 'asistente_notion_id', 'fecha', 'error_message'],
  RESUMEN: ['resumen_texto', 'sponsor_id', 'asistente_notion_id', 'fecha', 'inicio', 'error_message'],
  RESULTADO_PENDIENTE: ['mensaje_pendiente', 'sponsor_id', 'asistente_notion_id', 'fecha', 'inicio'],
};

function datosPantalla(screen, data) {
  const keys = DATA_KEYS[screen];
  if (!keys) return { data };
  const out = {};
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null) out[k] = data[k];
  }
  return { screen, data: out };
}

function errorPantalla(mensaje) {
  return { data: { error_message: mensaje } };
}

function requestIdEstable(flowToken, sponsorId, inicio) {
  return crypto.createHash('sha256').update(`${flowToken}|${sponsorId}|${inicio}`).digest('hex');
}

function tituloFecha(fecha) {
  const nombres = {
    '2026-10-07': 'Miércoles 7 oct',
    '2026-10-08': 'Jueves 8 oct',
  };
  return nombres[fecha] || fecha;
}

function tituloHora(inicioIso) {
  const m = String(inicioIso).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : inicioIso;
}

async function sponsorsParaFlow(asistenteId) {
  const sugeridas = await citas.listarSugeridasPorAsistente(asistenteId);
  return sugeridas
    .filter((s) => s.sponsor_calendario_id)
    .slice(0, MAX_DROPDOWN)
    .map((s) => ({
      id: s.sponsor_notion_id,
      title: s.sponsor_nombre || s.sponsor_notion_id,
    }));
}

function datosFecha() {
  const fechas = citas.obtenerFechasEvento();
  return fechas.map((id) => ({ id, title: tituloFecha(id) }));
}

async function datosHorario(sponsorId, fecha) {
  const bloques = await citas.obtenerDisponibilidadSponsor({ sponsorPageId: sponsorId, fecha });
  return bloques
    .filter((b) => b.disponible)
    .map((b) => ({ id: b.inicio, title: tituloHora(b.inicio) }));
}

async function manejarInit(envelope) {
  const phone =
    envelope?.data?.client?.phoneNumber || envelope?.data?.conversation?.phoneNumber || null;
  if (!phone) return errorPantalla(MSG.SIN_REGISTRO);

  const asistente = await conTimeout(contactos.buscarAsistentePorWhatsApp(phone));
  if (!asistente) return errorPantalla(MSG.SIN_REGISTRO);

  const sponsors = await conTimeout(sponsorsParaFlow(asistente.id));
  if (!sponsors.length) return errorPantalla(MSG.SIN_SUGERIDAS);

  return datosPantalla('SPONSOR', {
    asistente_notion_id: asistente.id,
    sponsors,
  });
}

async function manejarAdvance(envelope) {
  const payload = { ...(envelope?.data?.flowExchange?.payload || {}) };
  const screen = envelope?.data?.flowExchange?.screen;
  const flowToken =
    envelope?.resourceId || envelope?.data?.flowResponse?.flowToken || 'sin-token';

  if (!payload.asistente_notion_id) {
    const phone =
      envelope?.data?.client?.phoneNumber || envelope?.data?.conversation?.phoneNumber;
    if (phone) {
      const asistente = await contactos.buscarAsistentePorWhatsApp(phone);
      if (asistente) payload.asistente_notion_id = asistente.id;
    }
  }

  const sponsorId = payload.sponsor_id;
  const fecha = payload.fecha;
  const inicio = payload.inicio;
  const asistenteId = payload.asistente_notion_id;

  if (screen === 'SPONSOR' || !screen) {
    if (!sponsorId) return errorPantalla(MSG.INVALIDO);
    let fechas;
    try {
      fechas = datosFecha();
    } catch (err) {
      return errorPantalla(MSG.TIMEOUT);
    }
    return datosPantalla('FECHA', {
      ...payload,
      asistente_notion_id: asistenteId || payload.asistente_notion_id,
      sponsor_id: sponsorId,
      fechas,
    });
  }

  if (screen === 'FECHA') {
    if (!sponsorId || !fecha) return errorPantalla(MSG.INVALIDO);
    const horarios = await conTimeout(datosHorario(sponsorId, fecha));
    if (!horarios.length) return errorPantalla(MSG.SIN_HORARIOS);
    return datosPantalla('HORARIO', {
      ...payload,
      sponsor_id: sponsorId,
      fecha,
      horarios,
    });
  }

  if (screen === 'HORARIO') {
    if (!sponsorId || !fecha || !inicio) return errorPantalla(MSG.INVALIDO);
    const bloques = await conTimeout(
      citas.obtenerDisponibilidadSponsor({ sponsorPageId: sponsorId, fecha })
    );
    const slot = bloques.find((b) => b.inicio === inicio);
    if (!slot || !slot.disponible) {
      const msg =
        slot?.motivo === 'CAPACIDAD_MESAS_LLENA' ? COPY.CAPACIDAD_MESAS_LLENA : COPY.SPONSOR_YA_OCUPADO;
      return errorPantalla(msg);
    }
    const lista = await citas.listarSugeridasPorAsistente(asistenteId || '');
    const sug = lista.find((s) => s.sponsor_notion_id === sponsorId);
    return datosPantalla('RESUMEN', {
      ...payload,
      resumen_texto: `${sug?.sponsor_nombre || 'Sponsor'} — ${tituloFecha(fecha)} ${tituloHora(inicio)}`,
    });
  }

  if (screen === 'RESUMEN') {
    if (!sponsorId || !inicio || !asistenteId) return errorPantalla(MSG.INVALIDO);
    const lista = await citas.listarSugeridasPorAsistente(asistenteId);
    const sug = lista.find((s) => s.sponsor_notion_id === sponsorId);
    if (!sug?.sponsor_calendario_id) return errorPantalla(MSG.SIN_SUGERIDAS);

    const request_id = requestIdEstable(flowToken, sponsorId, inicio);
    encolarReservaFlow({
      request_id,
      sponsor_notion_id: sponsorId,
      sponsor_calendario_id: sug.sponsor_calendario_id,
      asistente_notion_id: asistenteId,
      inicio,
      fin: citas.finDeBloque(inicio),
    });

    return datosPantalla('RESULTADO_PENDIENTE', {
      ...payload,
      mensaje_pendiente:
        'Estamos agendando tu cita. Te escribimos por WhatsApp para confirmar. No cierres hasta ver este mensaje.',
    });
  }

  return errorPantalla(MSG.INVALIDO);
}

async function manejarBack(envelope) {
  const payload = envelope?.data?.flowExchange?.payload || {};
  const screen = envelope?.data?.flowExchange?.screen;
  const asistenteId = payload.asistente_notion_id;

  if (screen === 'FECHA' || screen === 'SPONSOR') {
    if (!asistenteId) return errorPantalla(MSG.SIN_REGISTRO);
    const sponsors = await conTimeout(sponsorsParaFlow(asistenteId));
    return datosPantalla('SPONSOR', { ...payload, sponsors });
  }
  if (screen === 'HORARIO') {
    try {
      const fechas = datosFecha();
      return datosPantalla('FECHA', { ...payload, fechas });
    } catch {
      return errorPantalla(MSG.TIMEOUT);
    }
  }
  if (screen === 'RESUMEN') {
    if (!payload.sponsor_id || !payload.fecha) return errorPantalla(MSG.INVALIDO);
    const horarios = await conTimeout(datosHorario(payload.sponsor_id, payload.fecha));
    return datosPantalla('HORARIO', { ...payload, horarios });
  }
  return { data: payload };
}

async function procesarExchange(envelope) {
  const action = String(envelope?.data?.flowExchange?.action || '').toLowerCase();
  const event = String(envelope?.event || '');

  if (action === 'init' || event === 'whatsapp.flows.init') {
    return manejarInit(envelope);
  }
  if (action === 'back' || event === 'whatsapp.flows.back') {
    return manejarBack(envelope);
  }
  // Footer "Finalizar" de RESULTADO_PENDIENTE (action complete). La reserva
  // ya se encoló en RESUMEN; no volver a reservar.
  if (action === 'complete') {
    return { data: { acknowledged: true } };
  }
  return manejarAdvance(envelope);
}

module.exports = {
  procesarExchange,
  requestIdEstable,
  errorPantalla,
  MSG,
  conTimeout,
  tituloFecha,
  tituloHora,
};
