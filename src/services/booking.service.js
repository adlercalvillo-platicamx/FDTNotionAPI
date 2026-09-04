// src/services/booking.service.js
//
// Orquesta la reserva de una cita 1-a-1: esto es lo que reemplaza la
// atomicidad que Wix te daría gratis (validación de recurso + rechazo
// server-side). Aquí la construimos a mano con:
//
//   1. Un mutex GLOBAL en memoria que serializa TODAS las reservas —
//      procesa una a la vez, sin excepción. Con el volumen esperado
//      (~80 citas en 2 días) esto no es un cuello de botella real.
//   2. Notion como única fuente de verdad para decidir si un slot está
//      libre (no se escanean N calendarios de Google por cada intento).
//   3. Patrón "reservar en estado intermedio → confirmar en Notion".
//      Google Calendar propio se retiró el 27-ago (Adler): nadie lo
//      consultaba, la sync con platica-google-docs-api estaba rota, y
//      el .ics por correo ya llega al calendario personal del sponsor.
//   4. Tras confirmar en Notion, se envía correo/.ics al sponsor y
//      asistente. Cada envío se reintenta hasta 3 veces de inmediato
//      (timeouts/SMTP). Si tras eso sigue fallando, la cita NO se
//      revierte — pasa a "Confirmada sin notificar" con el motivo
//      en Notas Envio Email. El reenvío es a demanda (endpoint/MCP).
//
// ⚠️ REQUISITO DE DEPLOY QUE NO ES OPCIONAL:
// Este mutex vive en la memoria de UN SOLO proceso. Si este servicio se
// despliega en Coolify con más de 1 réplica/instancia, cada instancia
// tiene su propio mutex y NO se coordinan entre sí — la protección se
// rompe en silencio. Fija este servicio a 1 réplica, o cambia el mutex
// por un lock distribuido antes de escalar.
//
// ⚠️ SUPUESTO QUE TIENE QUE SEGUIR SIENDO CIERTO:
// Esto solo protege contra colisiones si TODA escritura de citas
// "Confirmada" / "Confirmada sin notificar" en Notion pasa por este
// endpoint. Si en algún momento se permite editar el Estatus de una cita
// a mano desde Notion (o desde otro flujo del agente) sin pasar por aquí,
// el conteo de capacidad y el chequeo de sponsor-ocupado dejan de ser
// confiables.

const { Mutex } = require('async-mutex');
const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const emailService = require('./email.service');
const { UBICACION_ICS_EVENTO } = require('../utils/sede-evento');

const CAPACIDAD_MAXIMA_MESAS = 11; // ver sesión 2/3: límite físico de mesas por hora
// Tolerancia sobre qué tan "pasado" puede estar el horario DESTINO de una
// modificación (Adler, 27-ago). NO es un colchón de anticipación sobre la
// cita original: esa se puede mover o cancelar 5 minutos antes sin
// problema. Hace falta explícito porque un bloque que ya pasó aparece
// "libre" en disponibilidad (nada lo está ocupando) y sin esta regla se
// podría mover una cita a un horario que ya ocurrió.
const MARGEN_MODIFICACION_MINUTOS = citasService.MARGEN_MODIFICACION_MINUTOS;
// Texto pendiente de afinar con Sam. La limitación es real y no se oculta:
// Gmail/Outlook procesan bien el .ics de actualización/cancelación, otros
// clientes menos comunes pueden no reaccionar.
// Va en el cuerpo del correo de modificar/cancelar (clientes de correo
// que no aplican el .ics solos). No viaja en la respuesta HTTP: eso era
// la advertencia del Google Calendar propio, retirado el 27-ago.
const NOTA_CALENDARIO_ACTUALIZAR =
  'Abre el archivo .ics adjunto para actualizar el horario en tu calendario. Si no se actualiza solo, edita o elimina el evento a mano.';
const NOTA_CALENDARIO_CANCELAR =
  'Abre el archivo .ics adjunto para quitar la cita de tu calendario. Si no se elimina solo, bórralo a mano.';
// Alias histórico: tests/docs que aún nombran NOTA_CALENDARIO leen la de modificación.
const NOTA_CALENDARIO = NOTA_CALENDARIO_ACTUALIZAR;
// Cada envío SMTP se reintenta hasta 3 veces de inmediato (timeouts).
// No hay tope de reintentos del endpoint: se dispara a demanda (MCP/API)
// cuantas veces haga falta tras corregir el dato (Adler, 18-ago).
const REINTENTOS_INMEDIATOS_SMTP = 3;
const bookingMutex = new Mutex();

// ─────────────────────────────────────────────────────────────
// DURACIÓN + DÍA DEL EVENTO + HORARIO OPERATIVO (misma fuente que
// GET /citas/disponibilidad). Confirmado Laura: duración fija 30 min;
// miércoles/jueves con ventanas distintas vía env.
//
// Adler (14-ago, iteración): no basta con "cae en 7 u 8 de octubre" —
// reservar_cita debe rechazar cualquier inicio que no sea un bloque
// oficial (p.ej. cruce de medianoche 23:45→00:15, o 09:00 el miércoles).
// Se reusa generarBloquesParaFecha de citas.service.js para no tener dos
// listas de slots que puedan divergir.
// ─────────────────────────────────────────────────────────────
const DURACION_CITA_MINUTOS = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS || 30);

/**
 * Valida duración exacta, mismo día calendario, día en CITAS_FECHAS_EVENTO,
 * y que `inicio` sea exactamente uno de los bloques generados por las env
 * CITAS_HORA_INICIO_/FIN_<fecha> (misma grilla que /citas/disponibilidad).
 *
 * Lanza BookingError('INVALID_INPUT', ...) → 400, o
 * BookingError('HORARIO_NO_CONFIGURADO', ...) → 503 si faltan env.
 *
 * @param {string} inicio - ISO 8601
 * @param {string} fin - ISO 8601
 */
function validarDuracionYFecha(inicio, fin) {
  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);

  if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) {
    throw new BookingError('INVALID_INPUT', '"inicio" o "fin" no son fechas ISO 8601 válidas.');
  }

  const duracionEsperada = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS || DURACION_CITA_MINUTOS);
  const duracionMinutos = (fechaFin.getTime() - fechaInicio.getTime()) / 60000;
  if (duracionMinutos !== duracionEsperada) {
    throw new BookingError(
      'INVALID_INPUT',
      `Las citas 1a1 duran exactamente ${duracionEsperada} minutos (confirmado por Laura). ` +
        `Esta solicitud tiene una duración de ${duracionMinutos} minutos.`
    );
  }

  // El "día" viene del prefijo del ISO que manda el llamador (con offset
  // ya resuelto, p.ej. -06:00). No se reconvierte a America/Mexico_City.
  const diaInicio = inicio.slice(0, 10); // 'YYYY-MM-DD'
  const diaFin = fin.slice(0, 10);

  if (diaInicio !== diaFin) {
    throw new BookingError(
      'INVALID_INPUT',
      `Las citas 1a1 no pueden cruzar de un día a otro. Inicio (${diaInicio}) y fin (${diaFin}) ` +
        `deben caer el mismo día del evento, dentro del horario operativo configurado.`
    );
  }

  if (!process.env.CITAS_FECHAS_EVENTO) {
    throw new BookingError(
      'HORARIO_NO_CONFIGURADO',
      'Horario de citas 1-a-1 no configurado: falta CITAS_FECHAS_EVENTO. ' +
        'No se puede validar una reserva sin la misma configuración que usa /citas/disponibilidad.'
    );
  }

  const fechasValidas = citasService.obtenerFechasEvento();
  if (!fechasValidas.includes(diaInicio)) {
    throw new BookingError(
      'INVALID_INPUT',
      `Las citas 1a1 solo se pueden agendar en las fechas del evento (${fechasValidas.join(', ')}). ` +
        `La fecha solicitada (${diaInicio}) está fuera de ese rango.`
    );
  }

  try {
    citasService.requireHorarioConfigurado(diaInicio);
  } catch (err) {
    if (err.status === 503) {
      throw new BookingError('HORARIO_NO_CONFIGURADO', err.message);
    }
    throw err;
  }

  const bloques = citasService.generarBloquesParaFecha(diaInicio);
  if (!bloques.includes(inicio)) {
    throw new BookingError(
      'INVALID_INPUT',
      `El horario de inicio "${inicio}" no es un bloque válido de citas 1a1 para ${diaInicio}. ` +
        `Solo se pueden agendar los bloques que expone GET /citas/disponibilidad ` +
        `(mismo horario de entorno: primer bloque ${bloques[0]}, último ${bloques[bloques.length - 1]}).`
    );
  }
}

class BookingError extends Error {
  constructor(code, message, detalle) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
    // Datos que el llamador necesita para actuar (ej. la lista de citas
    // activas cuando el teléfono no alcanza para saber cuál modificar).
    if (detalle !== undefined) this.detalle = detalle;
  }
}

function interpretarFilaIdempotente(existente) {
  const estado = existente.properties?.Estatus?.select?.name || null;
  if (estado === 'Fallida' || estado === 'Pendiente Calendar') {
    return { reanudar: true, estado, page: existente };
  }
  return {
    reanudar: false,
    resultado: {
      ya_existia: true,
      notion_page_id: existente.id,
      estado,
    },
  };
}

/**
 * Resuelve destinatarios y textos del correo de confirmación a partir de
 * Contactos en Notion (sponsor + asistente). Dos correos distintos:
 *   - Sponsor: texto cálido + datos de contacto del asistente (Laura,
 *     Segunda Sesión — el sponsor debe recibir el contacto "en automático").
 *   - Asistente: aviso de confirmación + empresa del sponsor + .ics.
 *     SIN datos de contacto del sponsor (pedido Adler, 18-ago).
 *
 * En el párrafo de apertura se usan las empresas (campo Empresa), no los
 * nombres de persona (pedido Adler, 18-ago). Si Empresa viene vacío, se
 * cae al nombre de la persona para no dejar el texto incompleto.
 *
 * Calendar reusa `descripcion` (= descripcionSponsor: calendario del sponsor).
 * LOCATION del .ics es siempre Club France; mesa y horario van en este texto.
 *
 * `emailsExtra` (de asistentes_email en el body) se suma al correo del
 * asistente — mismo tono corto, sin datos de contacto. No reemplaza a
 * Contactos. Deduplicado contra el email del sponsor/asistente.
 */
async function resolverNotificacionCita({ sponsorPageId, asistentePageId, emailsExtra, inicio, mesa }) {
  if (!sponsorPageId || !asistentePageId) {
    throw new BookingError(
      'CONTACTO_NO_RESUELTO',
      'No se pudo resolver el sponsor o el asistente de esta cita (falta Contacto Match o Contacto Principal) — no se puede construir la notificación.'
    );
  }

  const [sponsor, asistente] = await Promise.all([
    contactosService.obtenerContacto(sponsorPageId),
    contactosService.obtenerContacto(asistentePageId),
  ]);

  const emailSponsor = sponsor.email || null;
  const emailAsistente = asistente.email || null;
  const extrasUnicos = [...new Set((emailsExtra || []).filter(Boolean))].filter(
    (e) => e !== emailSponsor && e !== emailAsistente
  );

  const empresaAsistente = asistente.empresa || asistente.nombre || 'El asistente';
  const empresaSponsor = sponsor.empresa || sponsor.nombre || 'el sponsor';
  const datosContactoAsistente = lineasDatosContactoAsistente(asistente);
  const horario = inicio ? citasService.formatearHorarioLegible(inicio) : null;
  const lugar = parrafoMesaYSede(mesa);

  const descripcionSponsor = [
    '¡Tu cita 1 a 1 en Fashion Digital Talks 2026 está confirmada!',
    '',
    `${empresaAsistente} agendó un espacio con ${empresaSponsor}. Nos dará mucho gusto recibirlos.`,
    '',
    ...(horario ? [`Horario: ${horario}.`, lugar, ''] : [lugar, '']),
    'Para guardar la cita, selecciona "Agregar al calendario" en la invitación adjunta (.ics).',
    '',
    ...datosContactoAsistente,
    '',
    'Te recomendamos conservar estos datos para facilitar el encuentro.',
    '',
    '¡Te esperamos en Fashion Digital Talks 2026!',
    'Equipo Fashion Digital Talks',
  ].join('\n');

  // Solo empresa del sponsor — nada de persona, correo, teléfono ni WhatsApp.
  const descripcionAsistente = [
    '¡Tu cita 1 a 1 en Fashion Digital Talks 2026 está confirmada!',
    '',
    `Agendaste un espacio con ${empresaSponsor}. Nos dará mucho gusto recibirte.`,
    '',
    ...(horario ? [`Horario: ${horario}.`, lugar, ''] : [lugar, '']),
    'Para guardar la cita, selecciona "Agregar al calendario" en la invitación adjunta (.ics).',
    '',
    '¡Te esperamos en Fashion Digital Talks 2026!',
    'Equipo Fashion Digital Talks',
  ].join('\n');

  return {
    emailSponsor,
    emailAsistente,
    emailsExtra: extrasUnicos,
    descripcionSponsor,
    descripcionAsistente,
    // Alias para Calendar (calendario del sponsor → contacto del asistente).
    descripcion: descripcionSponsor,
    // Título único para Notion, Calendar y correos. Empresa primero; el
    // nombre de persona solo es fallback para registros sin Empresa.
    tituloCita: `Cita — ${empresaAsistente} - ${empresaSponsor}`,
    empresaAsistente,
    empresaSponsor,
    datosContactoAsistente,
  };
}

/** Mismos campos que el correo de confirmación al sponsor. El asistente no los ve. */
function lineasDatosContactoAsistente(asistente) {
  return [
    'Datos de contacto del asistente:',
    `Nombre: ${asistente.nombre || 'Asistente'}`,
    asistente.empresa ? `Empresa: ${asistente.empresa}` : null,
    asistente.rolPuesto ? `Puesto: ${asistente.rolPuesto}` : null,
    asistente.email ? `Correo: ${asistente.email}` : null,
    asistente.whatsapp ? `Teléfono: ${asistente.whatsapp}` : null,
  ].filter((linea) => linea !== null);
}

function numeroDeMesa(mesa) {
  if (mesa == null || mesa === '') return null;
  if (typeof mesa === 'number' && Number.isFinite(mesa)) return String(mesa);
  const m = String(mesa).match(/(\d+)/);
  return m ? m[1] : null;
}

function parrafoMesaYSede(mesa) {
  const n = numeroDeMesa(mesa);
  const lineaMesa = n
    ? `Tu cita será en la mesa ${n}. En los días previos al evento te enviaremos más detalle para ubicarla en piso.`
    : 'En los días previos al evento te enviaremos más detalle para ubicar tu mesa en piso.';
  return [lineaMesa, `Recuerda que el evento se llevará a cabo en ${UBICACION_ICS_EVENTO}.`].join('\n');
}

/**
 * Un envío SMTP con hasta REINTENTOS_INMEDIATOS_SMTP intentos seguidos.
 * No toca Notion — es solo resiliencia a timeouts/red. Si los 3 fallan,
 * propaga el último EmailError.
 */
async function enviarUnCorreoConReintentosInmediatos({ cancelacion, ...args }) {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS_INMEDIATOS_SMTP; intento++) {
    try {
      if (cancelacion) {
        await emailService.enviarCancelacionCita(args);
      } else {
        await emailService.enviarConfirmacionCita(args);
      }
      return;
    } catch (err) {
      ultimoError = err;
      if (intento < REINTENTOS_INMEDIATOS_SMTP) {
        await new Promise((r) => setTimeout(r, 300 * intento));
      }
    }
  }
  throw ultimoError;
}

/**
 * Envía hasta 2 correos (sponsor y/o asistente) con el mismo .ics (mismo
 * UID = notionPageId). Cada correo se reintenta hasta 3 veces de
 * inmediato. Si alguno agota esos 3, propaga el EmailError — el llamador
 * decide si cuenta como intento Notion o no.
 *
 * Con `cancelacion: true` el .ics va como METHOD:CANCEL / STATUS:CANCELLED
 * sobre el mismo UID; los destinatarios son exactamente los mismos que
 * recibieron la confirmación original (sponsor + asistente + emailsExtra).
 */
async function enviarCorreosDeCita({
  notionPageId,
  notificacion,
  titulo,
  asunto,
  inicio,
  fin,
  secuencia,
  cancelacion,
}) {
  const envios = [];

  if (notificacion.emailSponsor) {
    envios.push({
      destinatarios: [notificacion.emailSponsor],
      descripcion: notificacion.descripcionSponsor,
    });
  }

  const destinatariosAsistente = [
    notificacion.emailAsistente,
    ...(notificacion.emailsExtra || []),
  ].filter(Boolean);
  const destinatariosAsistenteUnicos = [...new Set(destinatariosAsistente)];
  if (destinatariosAsistenteUnicos.length > 0) {
    envios.push({
      destinatarios: destinatariosAsistenteUnicos,
      descripcion: notificacion.descripcionAsistente,
    });
  }

  for (const envio of envios) {
    await enviarUnCorreoConReintentosInmediatos({
      notionPageId,
      destinatarios: envio.destinatarios,
      titulo,
      asunto,
      descripcion: envio.descripcion,
      inicio,
      fin,
      secuencia,
      cancelacion,
    });
  }

  return envios.length;
}

/**
 * Traduce el 404 de Notion al crear la relación en un código de negocio que
 * nombra el campo culpable.
 *
 * Notion contesta "Could not find page with ID" y eso salía al cliente como
 * un 500 "Revisa los logs". El 2-sep el Agente 2 mandó un
 * sponsor_notion_id inventado y reintentó con el mismo valor varias veces
 * porque nada en la respuesta decía cuál de los dos ids estaba mal.
 * Devuelve null si el 404 no menciona a ninguno de los dos: en ese caso el
 * error original sigue su camino (puede ser la data source, no el contacto).
 */
function errorDeContactoInexistente(error, { sponsorPageId, asistentePageId }) {
  if (error?.status !== 404) return null;

  const sinGuiones = (valor) => String(valor || '').replace(/-/g, '').toLowerCase();
  const mensaje = sinGuiones(error?.notion?.message || error?.message);
  const mencionado = (id) => {
    const limpio = sinGuiones(id);
    return limpio.length > 0 && mensaje.includes(limpio);
  };

  let campo = null;
  if (mencionado(sponsorPageId)) {
    campo = { nombre: 'sponsor_notion_id', valor: sponsorPageId, code: 'SPONSOR_NO_ENCONTRADO' };
  } else if (mencionado(asistentePageId)) {
    campo = { nombre: 'asistente_notion_id', valor: asistentePageId, code: 'ASISTENTE_NO_ENCONTRADO' };
  }
  if (!campo) return null;

  return new BookingError(
    campo.code,
    `${campo.nombre} "${campo.valor}" no existe en Contactos de Notion, así que la cita no se creó. Copia el page_id tal cual de la herramienta que te dio la sugerencia; no lo derives de otro id ni reintentes con el mismo valor.`
  );
}

/**
 * Reserva una cita 1-a-1 entre un sponsor y un asistente.
 *
 * @param {object} params
 * @param {string} [params.sponsor_calendario_id] - legado (Google Calendar propio
 *   retirado 27-ago). Se ignora si llega, para no romper clientes que aún lo mandan.
 * @param {string} params.sponsor_notion_id     - page_id en Notion del contacto sponsor
 * @param {string} params.asistente_notion_id   - page_id en Notion del contacto asistente
 * @param {string} params.inicio                - ISO 8601, ej. "2026-10-07T10:30:00-06:00"
 * @param {string} params.fin                   - ISO 8601
 * @param {string} [params.zona_horaria]        - legado; ya no se usa
 * @param {string} params.request_id            - clave de idempotencia, generada por quien llama
 *                                                 (el mismo valor en un reintento debe ser el mismo string)
 * @param {string} [params.titulo]
 * @param {string} [params.descripcion]         - ya no alimenta el correo (descripción auto); se conserva en la firma por compatibilidad
 * @param {string[]} [params.asistentes_email]  - emails extra (se suman a Contactos)
 */
async function reservarCita({
  sponsor_calendario_id: _sponsorCalendarioId, // eslint-disable-line no-unused-vars -- legado 27-ago
  sponsor_notion_id,
  asistente_notion_id,
  inicio,
  fin,
  zona_horaria, // eslint-disable-line no-unused-vars -- legado 27-ago
  request_id,
  titulo,
  descripcion, // eslint-disable-line no-unused-vars -- firma pública; descripción real = auto desde Contactos
  asistentes_email,
}) {
  if (!request_id) {
    throw new BookingError('INVALID_INPUT', '"request_id" es requerido (clave de idempotencia)');
  }
  if (!sponsor_notion_id || !asistente_notion_id) {
    throw new BookingError('INVALID_INPUT', 'Faltan sponsor_notion_id o asistente_notion_id');
  }
  if (!inicio || !fin) {
    throw new BookingError('INVALID_INPUT', '"inicio" y "fin" son requeridos en formato ISO 8601');
  }

  // Duración + día del evento + bloque operativo (mismas env que
  // /citas/disponibilidad). Antes del chequeo de idempotencia: no gastar
  // Notion en una reserva con horario inválido de entrada.
  validarDuracionYFecha(inicio, fin);

  const existenteFuera = await citasService.buscarPorRequestId(request_id);
  if (existenteFuera) {
    const interp = interpretarFilaIdempotente(existenteFuera);
    if (!interp.reanudar) return interp.resultado;
  }

  // A partir de aquí, todo corre serializado. Es la sección crítica completa:
  // verificar + reservar-en-Notion + confirmar — sin que ninguna otra
  // reserva pueda intercalarse en medio.
  return bookingMutex.runExclusive(async () => {
    const existenteEnLock = await citasService.buscarPorRequestId(request_id);
    let citaPendiente = null;
    if (existenteEnLock) {
      const interp = interpretarFilaIdempotente(existenteEnLock);
      if (!interp.reanudar) {
        return interp.resultado;
      }
      await citasService.reabrirCitaParaReintento(existenteEnLock.id);
      citaPendiente = existenteEnLock;
    }

    const [sponsorOcupado, asistenteOcupado, citasEnBloque] = await Promise.all([
      citasService.sponsorOcupadoEnBloque({ sponsorPageId: sponsor_notion_id, inicio }),
      citasService.asistenteOcupadoEnBloque({ asistentePageId: asistente_notion_id, inicio }),
      citasService.contarCitasEnBloque({ inicio }),
    ]);

    if (sponsorOcupado) {
      throw new BookingError('SPONSOR_YA_OCUPADO', 'Este sponsor ya tiene una cita confirmada en ese horario.');
    }
    if (asistenteOcupado) {
      throw new BookingError(
        'ASISTENTE_YA_OCUPADO',
        'Ese asistente ya tiene una cita confirmada en ese mismo horario.'
      );
    }
    if (citasEnBloque >= CAPACIDAD_MAXIMA_MESAS) {
      throw new BookingError(
        'CAPACIDAD_MESAS_LLENA',
        `Ya se alcanzó el máximo de ${CAPACIDAD_MAXIMA_MESAS} mesas simultáneas en ese horario.`
      );
    }

    const numeroMesa = citasEnBloque + 1;

    if (!citaPendiente) {
      try {
        citaPendiente = await citasService.crearCitaPendiente({
          requestId: request_id,
          sponsorPageId: sponsor_notion_id,
          asistentePageId: asistente_notion_id,
          inicio,
          fin,
          titulo: titulo || `Cita — ${request_id}`,
          mesa: numeroMesa,
        });
      } catch (error) {
        throw errorDeContactoInexistente(error, {
          sponsorPageId: sponsor_notion_id,
          asistentePageId: asistente_notion_id,
        }) || error;
      }
    }

    // Si reutilizamos Sugerido/Aprobado, un fallo al confirmar no debe
    // pasar esa fila a Fallida (se perdería la aprobación). Si la fila
    // es nueva, Fallida queda para auditoría como siempre.
    const compensarReservaFallida = async (motivo) => {
      if (citaPendiente.reutilizoSugerencia) {
        await citasService.revertirCitaPendienteAMatch({
          notionPageId: citaPendiente.id,
          estatusPrevio: citaPendiente.estatusPrevio,
          nombrePrevio: citaPendiente.nombrePrevio,
        });
        return;
      }
      await citasService.marcarCitaFallida({
        notionPageId: citaPendiente.id,
        motivo,
      });
    };

    const archivarSugerenciasHermanas = async () => {
      try {
        await citasService.archivarSugerenciasDelPar({
          sponsorPageId: sponsor_notion_id,
          asistentePageId: asistente_notion_id,
          exceptPageId: citaPendiente.id,
        });
      } catch (_) {
        // La cita ya es real (Confirmada). No revertir ni bloquear el
        // correo si el archivo de una fila hermana falla.
      }
    };

    // crearCitaPendiente() YA escribió la fila como "Pendiente Calendar"
    // (nombre histórico del select; ya no hay paso de Google Calendar).
    // Si resolverNotificacionCita() truena, compensarReservaFallida
    // (Fallida o revertir a Aprobado/Sugerido) — no queda huérfana.
    let notificacion;
    try {
      notificacion = await resolverNotificacionCita({
        sponsorPageId: sponsor_notion_id,
        asistentePageId: asistente_notion_id,
        emailsExtra: asistentes_email,
        inicio,
        mesa: numeroMesa,
      });
    } catch (resolucionError) {
      await compensarReservaFallida(
        `No se pudo resolver sponsor/asistente para la notificación: ${resolucionError.message}`
      );
      throw resolucionError instanceof BookingError
        ? resolucionError
        : new BookingError('CONTACTO_NO_RESUELTO', resolucionError.message);
    }

    try {
      await citasService.actualizarTituloCita({
        notionPageId: citaPendiente.id,
        titulo: notificacion.tituloCita,
      });
    } catch (tituloError) {
      await compensarReservaFallida(`No se pudo escribir el título de la cita: ${tituloError.message}`);
      throw new BookingError(
        'NOTION_FALLO',
        'No se pudo guardar el título de la cita en Notion.'
      );
    }

    // Confirmar en Notion con reintentos acotados.
    const REINTENTOS = 3;
    let ultimoError;
    for (let intento = 1; intento <= REINTENTOS; intento++) {
      try {
        await citasService.confirmarCita({ notionPageId: citaPendiente.id });
        await archivarSugerenciasHermanas();

        // Cita real en Notion. A partir de aquí, cualquier falla de correo
        // NUNCA revierte la reserva — solo degrada el Estatus a
        // "Confirmada sin notificar" para que quede visible que falta avisar.
        const hayDestinatarios =
          Boolean(notificacion.emailSponsor) ||
          Boolean(notificacion.emailAsistente) ||
          (notificacion.emailsExtra && notificacion.emailsExtra.length > 0);
        if (hayDestinatarios) {
          try {
            await enviarCorreosDeCita({
              notionPageId: citaPendiente.id,
              notificacion,
              titulo: notificacion.tituloCita,
              inicio,
              fin,
            });
          } catch (emailError) {
            await citasService.marcarCitaConfirmadaSinNotificar({
              notionPageId: citaPendiente.id,
              motivoCategoria: emailError.categoria || 'DESCONOCIDO',
              motivoDetalle: emailError.message,
            });
            return {
              ya_existia: false,
              notion_page_id: citaPendiente.id,
              estado: 'Confirmada sin notificar',
              mesa: numeroMesa,
              titulo: notificacion.tituloCita,
              notificacion_error: {
                categoria: emailError.categoria || 'DESCONOCIDO',
                mensaje: emailError.message,
              },
            };
          }
        }

        return {
          ya_existia: false,
          notion_page_id: citaPendiente.id,
          estado: 'Confirmada',
          mesa: numeroMesa,
          titulo: notificacion.tituloCita,
        };
      } catch (notionError) {
        ultimoError = notionError;
        await new Promise((r) => setTimeout(r, 300 * intento));
      }
    }

    await compensarReservaFallida(
      `Notion no confirmó la cita tras ${REINTENTOS} intentos: ${ultimoError?.message}`
    );

    throw new BookingError(
      'NOTION_FALLO',
      'No se pudo confirmar la cita en la base de datos. Hay que reintentar.'
    );
  });
}

/**
 * Reenvía el .ics pendiente de una cita. Dos casos, distintos a propósito:
 *   - "Confirmada sin notificar" → reenvía el .ics de alta/actualización
 *     (mismo UID, SEQUENCE nuevo, CONFIRMED). Si la cita se movió de
 *     horario, "Fecha y Hora" en Notion ya trae el horario nuevo, así que
 *     el reenvío avisa del cambio sin lógica extra.
 *   - "Cancelada" + marca de cancelación pendiente en "Notas Envio Email"
 *     → reenvía el .ics de baja (CANCELLED). Nunca se toca el Estatus:
 *     pasarla a "Confirmada sin notificar" volvería a ocupar mesa.
 *
 * Usada por:
 *   - POST /citas/:id/reenviar-notificacion (una cita)
 *   - POST /citas/reintentar-notificaciones-pendientes (batch, vía MCP)
 *
 * A demanda, sin tope de llamadas. No valida capacidad ni ocupación.
 * NO entra al mutex. Las filas de bloqueo de conferencia (Contacto
 * Principal = contacto ficticio) se rechazan con FILA_BLOQUEO_AGENDA;
 * el barrido masivo ni las incluye.
 */
async function reintentarNotificacion(notionPageId) {
  const cita = await citasService.obtenerCitaPorId(notionPageId);
  const datos = citasService.datosDeCita(cita);
  const esCancelacion = citasService.tieneCancelacionPendienteDeAviso(cita);

  if (citasService.esFilaBloqueoAgenda(datos.asistentePageId)) {
    throw new BookingError(
      'FILA_BLOQUEO_AGENDA',
      'Esta fila es un bloqueo de conferencia del programa, no una cita real. No se envía correo.'
    );
  }

  if (!esCancelacion && datos.estatus !== 'Confirmada sin notificar') {
    throw new BookingError(
      'ESTADO_INVALIDO',
      `Esta cita está en estatus "${datos.estatus}", no en "Confirmada sin notificar" ni cancelada con aviso pendiente. No se reenvía.`
    );
  }

  const notificacion = await resolverNotificacionCita({
    sponsorPageId: datos.sponsorPageId,
    asistentePageId: datos.asistentePageId,
    emailsExtra: [], // el reintento no tiene el body original de la reserva — solo Contactos
    inicio: datos.inicio,
    mesa: datos.mesa,
  });

  if (!tieneDestinatarios(notificacion)) {
    throw new BookingError(
      'SIN_DESTINATARIOS',
      'Ni el sponsor ni el asistente tienen "Email" en Contactos — no hay a quién reenviar. Corrige el dato en Notion antes de reintentar.'
    );
  }

  // SEQUENCE creciente para que cada reenvío actualice el evento en el
  // calendario del destinatario (mismo UID = notionPageId).
  const secuencia = siguienteSecuenciaIcs();
  const titulo = datos.titulo || (esCancelacion ? 'Cita 1 a 1 cancelada' : 'Cita 1 a 1 confirmada');

  if (esCancelacion) {
    try {
      await enviarCorreosDeCita({
        notionPageId,
        notificacion: conTextosDeCancelacion(notificacion, datos.inicio),
        titulo,
        asunto: `Cita cancelada — ${titulo}`,
        inicio: datos.inicio,
        fin: datos.fin,
        secuencia,
        cancelacion: true,
      });
      await citasService.marcarCancelacionNotificada(notionPageId);
      return { notion_page_id: notionPageId, estado: 'Cancelada', tipo: 'cancelacion' };
    } catch (emailError) {
      const { categoria, mensaje } = detalleErrorEmail(emailError);
      await citasService.marcarCancelacionSinNotificar({
        notionPageId,
        motivoCategoria: categoria,
        motivoDetalle: mensaje,
      });
      throw new BookingError(
        'NOTIFICACION_FALLO',
        `No se pudo enviar el aviso de cancelación (${categoria}): ${mensaje}`
      );
    }
  }

  const esReprogramacion = Boolean(datos.horarioOriginal);
  const notificacionEnvio = esReprogramacion
    ? conTextosDeModificacion(notificacion, {
        horarioAnterior: datos.horarioOriginal,
        horarioNuevo: datos.inicio,
        mesa: datos.mesa,
      })
    : notificacion;

  try {
    await enviarCorreosDeCita({
      notionPageId,
      notificacion: notificacionEnvio,
      titulo,
      asunto: esReprogramacion ? `Cambio de horario — ${titulo}` : undefined,
      inicio: datos.inicio,
      fin: datos.fin,
      secuencia,
    });
    await citasService.confirmarNotificacionEnviada(notionPageId);
    return { notion_page_id: notionPageId, estado: 'Confirmada', tipo: 'confirmacion' };
  } catch (emailError) {
    const { categoria, mensaje } = detalleErrorEmail(emailError);
    await citasService.marcarCitaConfirmadaSinNotificar({
      notionPageId,
      motivoCategoria: categoria,
      motivoDetalle: mensaje,
    });
    throw new BookingError(
      'NOTIFICACION_FALLO',
      `No se pudo enviar el correo de confirmación (${categoria}): ${mensaje}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// MODIFICAR / CANCELAR una cita ya real (27-ago)
//
// Dos endpoints separados a propósito (pedido explícito de Adler), pero
// comparten la resolución de CUÁL cita y la validación de que quien pide
// el cambio sea dueño de esa cita.
//
// Notion + el .ics del correo son la única verdad (Google Calendar
// propio retirado el 27-ago). La nota de "si tu calendario no se
// actualiza solo" va en el cuerpo del correo, no en la respuesta HTTP.
// ─────────────────────────────────────────────────────────────

// SEQUENCE del ICS. No hay campo en Notion que lo guarde y no hace falta:
// el timestamp en segundos siempre es mayor que el 0 del envío original.
// El Math.max evita el único hueco real de esa idea — dos cambios de la
// misma cita dentro del mismo segundo (modificar y cancelar seguidos)
// darían el mismo SEQUENCE y el cliente de calendario ignoraría el
// segundo. Vive en memoria del proceso, igual que el mutex: este servicio
// corre en 1 sola réplica.
let ultimaSecuenciaIcs = 0;
function siguienteSecuenciaIcs() {
  ultimaSecuenciaIcs = Math.max(Math.floor(Date.now() / 1000), ultimaSecuenciaIcs + 1);
  return ultimaSecuenciaIcs;
}

function tieneDestinatarios(notificacion) {
  return (
    Boolean(notificacion.emailSponsor) ||
    Boolean(notificacion.emailAsistente) ||
    (notificacion.emailsExtra && notificacion.emailsExtra.length > 0)
  );
}

function detalleErrorEmail(emailError) {
  return {
    categoria: emailError.categoria || 'DESCONOCIDO',
    mensaje: emailError.message || 'Error desconocido al enviar el correo',
  };
}

function normalizarEmpresa(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function citaResumida(cita) {
  return {
    citaId: cita.id,
    sponsor_empresa: cita.sponsorEmpresa || cita.sponsorNombre || null,
    inicio: cita.inicio,
    estatus: cita.estatus,
  };
}

/**
 * Resuelve la cita sobre la que se va a operar y valida que quien pide el
 * cambio pueda tocarla.
 *
 * - Con `telefono`: el asistente se resuelve con buscarAsistentePorWhatsApp
 *   y la cita DEBE tener a ese contacto en "Contacto Principal". Si además
 *   viene un `citaId` que es de otra persona, se rechaza — la validación
 *   real es del servidor, nunca se confía en que el agente ya la hizo.
 * - Sin `citaId`, con teléfono: si el asistente tiene una sola cita real se
 *   usa esa; `sponsorEmpresa` desambigua ("la de Platica"); si aun así
 *   quedan varias, se devuelve la lista para que el agente elija.
 * - Solo con `citaId` (Laura/Liz, acceso administrativo): sin validación
 *   cruzada.
 */
async function resolverCitaObjetivo({ telefono, citaId, sponsorEmpresa }) {
  const phone = String(telefono || '').trim();
  const id = String(citaId || '').trim();

  if (!phone && !id) {
    throw new BookingError('INVALID_INPUT', 'Se requiere "telefono" (asistente) o "citaId".');
  }

  let asistente = null;
  if (phone) {
    asistente = await contactosService.buscarAsistentePorWhatsApp(phone);
    if (!asistente) {
      throw new BookingError(
        'ASISTENTE_NO_ENCONTRADO',
        'No hay un asistente activo con ese número de WhatsApp.'
      );
    }
  }

  if (id) {
    let pagina;
    try {
      pagina = await citasService.obtenerCitaPorId(id);
    } catch (err) {
      if (err.status === 404 || err.status === 400) {
        throw new BookingError('CITA_NO_ENCONTRADA', `No existe una cita con el id "${id}".`);
      }
      throw err;
    }
    const cita = citasService.datosDeCita(pagina);
    if (asistente && !sonElMismoContacto(cita.asistentePageId, asistente.id)) {
      throw new BookingError(
        'CITA_NO_PERTENECE',
        'Esa cita no es de la persona que corresponde a ese número de WhatsApp. No se modifica ni se cancela.'
      );
    }
    return { cita, asistente };
  }

  const citas = await citasService.listarCitasRealesPorAsistente(asistente.id);
  if (citas.length === 0) {
    throw new BookingError(
      'SIN_CITAS_ACTIVAS',
      `${asistente.nombre || 'Ese asistente'} no tiene ninguna cita confirmada que se pueda modificar o cancelar.`
    );
  }

  const filtro = normalizarEmpresa(sponsorEmpresa);
  const candidatas = filtro
    ? citas.filter((c) => {
        const empresa = normalizarEmpresa(c.sponsorEmpresa || c.sponsorNombre);
        return empresa && (empresa.includes(filtro) || filtro.includes(empresa));
      })
    : citas;

  if (candidatas.length === 0) {
    throw new BookingError(
      'SIN_CITAS_ACTIVAS',
      `${asistente.nombre || 'Ese asistente'} no tiene una cita confirmada con "${sponsorEmpresa}".`,
      { citas: citas.map(citaResumida) }
    );
  }
  if (candidatas.length > 1) {
    throw new BookingError(
      'VARIAS_CITAS_ACTIVAS',
      'Ese asistente tiene más de una cita confirmada. Vuelve a llamar con el "citaId" de la que se va a cambiar (o con "sponsorEmpresa").',
      { citas: candidatas.map(citaResumida) }
    );
  }

  return { cita: candidatas[0], asistente };
}

function sonElMismoContacto(a, b) {
  const canonico = (v) => String(v || '').replace(/-/g, '').toLowerCase();
  return Boolean(a) && Boolean(b) && canonico(a) === canonico(b);
}

function requerirCitaReal(cita, accion) {
  if (!citasService.ESTATUS_CITA_REAL.includes(cita.estatus)) {
    throw new BookingError(
      'ESTADO_INVALIDO',
      `Esta cita está en estatus "${cita.estatus}". Solo se puede ${accion} una cita confirmada.`
    );
  }
}

/**
 * Regla 2 (Adler, 27-ago): una cita cuya hora ya pasó SÍ se puede mover si
 * nadie marcó "Check-in Realizado" — es recuperar una cita que no se
 * aprovechó. Si sí hubo check-in, la cita ya ocurrió de verdad y moverla
 * sería reescribir historia.
 */
function requerirQueNoHayaOcurrido(cita, ahoraMs) {
  const inicioMs = Date.parse(cita.inicio || '');
  if (!Number.isFinite(inicioMs) || inicioMs >= ahoraMs) return;
  if (!cita.checkInRealizado) return;
  throw new BookingError(
    'CITA_YA_OCURRIO',
    'Esta cita ya ocurrió y tiene el check-in marcado (la persona sí llegó). No se puede mover a otro horario; si hace falta, agenda una cita nueva.'
  );
}

/** Regla 1: el horario destino no puede estar más de MARGEN_MODIFICACION_MINUTOS en el pasado. */
function requerirHorarioNoPasado(nuevoInicioMs, ahoraMs) {
  const minutosEnPasado = (ahoraMs - nuevoInicioMs) / 60000;
  if (minutosEnPasado > MARGEN_MODIFICACION_MINUTOS) {
    throw new BookingError(
      'HORARIO_EN_PASADO',
      `El horario nuevo ya pasó hace ${Math.round(minutosEnPasado)} minutos. ` +
        `Solo se acepta un margen de ${MARGEN_MODIFICACION_MINUTOS} minutos hacia atrás; elige un horario posterior.`
    );
  }
}

function conTextosDeModificacion(notificacion, { horarioAnterior, horarioNuevo, mesa }) {
  const horarioNuevoLegible = citasService.formatearHorarioLegible(horarioNuevo);
  const horarioAnteriorLegible = citasService.formatearHorarioLegible(horarioAnterior);
  const empresaAsistente = notificacion.empresaAsistente || 'el asistente';
  const empresaSponsor = notificacion.empresaSponsor || 'el sponsor';
  const datosAsistente = (notificacion.datosContactoAsistente || []).join('\n');
  const lugar = parrafoMesaYSede(mesa);

  return {
    ...notificacion,
    descripcionSponsor: [
      'Tu cita 1 a 1 en Fashion Digital Talks 2026 cambió de horario.',
      '',
      `El espacio con ${empresaAsistente} ahora es: ${horarioNuevoLegible}`,
      `Horario anterior: ${horarioAnteriorLegible}`,
      '',
      lugar,
      '',
      NOTA_CALENDARIO_ACTUALIZAR,
      '',
      datosAsistente,
      '',
      'Te recomendamos conservar estos datos para facilitar el encuentro.',
      '',
      '¡Te esperamos en Fashion Digital Talks 2026!',
      'Equipo Fashion Digital Talks',
    ].join('\n'),
    descripcionAsistente: [
      'Tu cita 1 a 1 en Fashion Digital Talks 2026 cambió de horario.',
      '',
      `El espacio con ${empresaSponsor} ahora es: ${horarioNuevoLegible}`,
      `Horario anterior: ${horarioAnteriorLegible}`,
      '',
      lugar,
      '',
      NOTA_CALENDARIO_ACTUALIZAR,
      '',
      '¡Te esperamos en Fashion Digital Talks 2026!',
      'Equipo Fashion Digital Talks',
    ].join('\n'),
  };
}

function conTextosDeCancelacion(notificacion, inicio) {
  const horario = inicio ? citasService.formatearHorarioLegible(inicio) : 'el horario agendado';
  const empresaAsistente = notificacion.empresaAsistente || 'el asistente';
  const empresaSponsor = notificacion.empresaSponsor || 'el sponsor';
  const datosAsistente = (notificacion.datosContactoAsistente || []).join('\n');

  return {
    ...notificacion,
    descripcionSponsor: [
      `Tu cita 1 a 1 en Fashion Digital Talks 2026 con ${empresaAsistente} fue cancelada.`,
      '',
      `Horario cancelado: ${horario}`,
      '',
      NOTA_CALENDARIO_CANCELAR,
      '',
      datosAsistente,
      '',
      '¡Nos vemos en Fashion Digital Talks 2026!',
      'Equipo Fashion Digital Talks',
    ].join('\n'),
    descripcionAsistente: [
      `Tu cita 1 a 1 en Fashion Digital Talks 2026 con ${empresaSponsor} fue cancelada.`,
      '',
      `Horario cancelado: ${horario}`,
      '',
      NOTA_CALENDARIO_CANCELAR,
      '',
      '¡Nos vemos en Fashion Digital Talks 2026!',
      'Equipo Fashion Digital Talks',
    ].join('\n'),
  };
}

/**
 * Mueve una cita real a otro horario.
 *
 * Orden confirmado por Adler: primero se valida el horario NUEVO, y solo
 * si está disponible se toca Notion. Si el horario nuevo no sirve, la cita
 * original se queda exactamente como estaba.
 *
 * Entra al mismo mutex que reservarCita: mover una cita cambia la
 * ocupación de un bloque igual que crearla.
 *
 * @param {object} params
 * @param {string} [params.telefono]       - WhatsApp del asistente (camino del agente de Carlos)
 * @param {string} [params.citaId]         - page_id de la cita (camino de Laura/Liz)
 * @param {string} [params.sponsorEmpresa] - desambigua cuando el asistente tiene varias citas
 * @param {string} params.nuevaFechaHora   - ISO 8601 del bloque destino
 * @param {string|number|Date} [params.ahora] - solo para tests; default Date.now()
 */
async function modificarCita({ telefono, citaId, sponsorEmpresa, nuevaFechaHora, ahora }) {
  if (!nuevaFechaHora) {
    throw new BookingError('INVALID_INPUT', '"nuevaFechaHora" es requerida en formato ISO 8601.');
  }

  const inicio = citasService.normalizarInicioIso(nuevaFechaHora);
  const nuevoInicioMs = Date.parse(inicio);
  if (!Number.isFinite(nuevoInicioMs)) {
    throw new BookingError('INVALID_INPUT', `"nuevaFechaHora" no es una fecha ISO 8601 válida: "${nuevaFechaHora}".`);
  }

  const ahoraMs = ahora ? new Date(ahora).getTime() : Date.now();
  const { cita } = await resolverCitaObjetivo({ telefono, citaId, sponsorEmpresa });
  requerirCitaReal(cita, 'modificar');
  requerirQueNoHayaOcurrido(cita, ahoraMs);
  requerirHorarioNoPasado(nuevoInicioMs, ahoraMs);

  const fin = citasService.finDeBloque(inicio);
  validarDuracionYFecha(inicio, fin);

  return bookingMutex.runExclusive(async () => {
    const [sponsorOcupado, asistenteOcupado, citasEnBloque] = await Promise.all([
      citasService.sponsorOcupadoEnBloque({
        sponsorPageId: cita.sponsorPageId,
        inicio,
        exceptPageId: cita.id,
      }),
      citasService.asistenteOcupadoEnBloque({
        asistentePageId: cita.asistentePageId,
        inicio,
        exceptPageId: cita.id,
      }),
      citasService.contarCitasEnBloque({ inicio, exceptPageId: cita.id }),
    ]);

    if (sponsorOcupado) {
      throw new BookingError('SPONSOR_YA_OCUPADO', 'Ese sponsor ya tiene una cita confirmada en el horario nuevo.');
    }
    if (asistenteOcupado) {
      throw new BookingError(
        'ASISTENTE_YA_OCUPADO',
        'Ese asistente ya tiene otra cita confirmada en el horario nuevo.'
      );
    }
    if (citasEnBloque >= CAPACIDAD_MAXIMA_MESAS) {
      throw new BookingError(
        'CAPACIDAD_MESAS_LLENA',
        `Ya se alcanzó el máximo de ${CAPACIDAD_MAXIMA_MESAS} mesas simultáneas en el horario nuevo.`
      );
    }

    // Resuelto ANTES de escribir: si sponsor/asistente no se pueden leer,
    // la cita se queda con su horario original en vez de quedar movida y
    // sin forma de avisar.
    const notificacion = await resolverNotificacionCita({
      sponsorPageId: cita.sponsorPageId,
      asistentePageId: cita.asistentePageId,
      emailsExtra: [],
    });

    const mesa = citasEnBloque + 1;
    const horarioAnterior = cita.inicio;
    await citasService.reprogramarCita({
      notionPageId: cita.id,
      inicio,
      fin,
      mesa,
      horarioOriginal: horarioAnterior,
      horarioOriginalYaGuardado: Boolean(cita.horarioOriginal),
    });

    const respuesta = {
      notion_page_id: cita.id,
      estado: 'Confirmada',
      inicio,
      fin,
      mesa,
      horario_anterior: horarioAnterior,
    };

    if (!tieneDestinatarios(notificacion)) {
      return respuesta;
    }

    try {
      await enviarCorreosDeCita({
        notionPageId: cita.id,
        notificacion: conTextosDeModificacion(notificacion, {
          horarioAnterior,
          horarioNuevo: inicio,
          mesa,
        }),
        titulo: cita.titulo || notificacion.tituloCita,
        asunto: `Cambio de horario — ${cita.titulo || notificacion.tituloCita}`,
        inicio,
        fin,
        secuencia: siguienteSecuenciaIcs(),
      });
      return respuesta;
    } catch (emailError) {
      // El cambio de horario ya es real y NO se revierte. Se degrada el
      // estatus para que el reenvío a demanda lo levante — y como el
      // reenvío lee "Fecha y Hora" de Notion, va a mandar el horario nuevo.
      const { categoria, mensaje } = detalleErrorEmail(emailError);
      await citasService.marcarCitaConfirmadaSinNotificar({
        notionPageId: cita.id,
        motivoCategoria: categoria,
        motivoDetalle: `Modificación de horario sin avisar: ${mensaje}`,
      });
      return {
        ...respuesta,
        estado: 'Confirmada sin notificar',
        notificacion_error: { categoria, mensaje },
      };
    }
  });
}

/**
 * Cancela una cita real. El bloque queda libre en cuanto el Estatus pasa a
 * "Cancelada" — ese valor no entra en ningún conteo de capacidad ni de
 * sponsor ocupado, así que no hace falta liberar nada a mano.
 *
 * La cancelación NO depende del correo: si el aviso falla, la cita sigue
 * cancelada y queda marcada para reintento del .ics de baja.
 */
async function cancelarCita({ telefono, citaId, sponsorEmpresa }) {
  const { cita } = await resolverCitaObjetivo({ telefono, citaId, sponsorEmpresa });

  if (cita.estatus === 'Cancelada') {
    return {
      notion_page_id: cita.id,
      estado: 'Cancelada',
      ya_estaba_cancelada: true,
    };
  }
  requerirCitaReal(cita, 'cancelar');

  return bookingMutex.runExclusive(async () => {
    const notificacion = await resolverNotificacionCita({
      sponsorPageId: cita.sponsorPageId,
      asistentePageId: cita.asistentePageId,
      emailsExtra: [],
    });

    await citasService.marcarCitaCancelada({ notionPageId: cita.id });

    const respuesta = {
      notion_page_id: cita.id,
      estado: 'Cancelada',
      ya_estaba_cancelada: false,
      horario_cancelado: cita.inicio,
    };

    if (!tieneDestinatarios(notificacion)) {
      return respuesta;
    }

    const titulo = cita.titulo || notificacion.tituloCita;
    try {
      await enviarCorreosDeCita({
        notionPageId: cita.id,
        notificacion: conTextosDeCancelacion(notificacion, cita.inicio),
        titulo,
        asunto: `Cita cancelada — ${titulo}`,
        inicio: cita.inicio,
        fin: cita.fin,
        secuencia: siguienteSecuenciaIcs(),
        cancelacion: true,
      });
      return respuesta;
    } catch (emailError) {
      const { categoria, mensaje } = detalleErrorEmail(emailError);
      await citasService.marcarCancelacionSinNotificar({
        notionPageId: cita.id,
        motivoCategoria: categoria,
        motivoDetalle: mensaje,
      });
      return {
        ...respuesta,
        aviso_pendiente: true,
        notificacion_error: { categoria, mensaje },
      };
    }
  });
}

module.exports = {
  reservarCita,
  modificarCita,
  cancelarCita,
  reintentarNotificacion,
  resolverCitaObjetivo,
  resolverNotificacionCita,
  BookingError,
  validarDuracionYFecha,
  MARGEN_MODIFICACION_MINUTOS,
  NOTA_CALENDARIO,
  NOTA_CALENDARIO_ACTUALIZAR,
  NOTA_CALENDARIO_CANCELAR,
};
