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
//   3. Patrón "reservar primero en estado intermedio → confirmar en
//      Calendar → confirmar en Notion", con rollback si el último paso
//      falla.
//   4. Calendar se toca por HTTP contra el servicio ya desplegado de
//      Plática (calendar-client.service.js) — este repo no duplica
//      google.service.js.
//   5. Tras confirmar en Notion, se envía correo/.ics al sponsor y
//      asistente. Si el correo falla, la cita NO se revierte — solo
//      pasa a "Confirmada sin notificar" (reintentable).
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
const calendarClient = require('./calendar-client.service');
const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const emailService = require('./email.service');

const CAPACIDAD_MAXIMA_MESAS = 11; // ver sesión 2/3: límite físico de mesas por hora
const MAX_INTENTOS_NOTIFICACION = Number(process.env.EMAIL_MAX_INTENTOS || 5);
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
  constructor(code, message) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
  }
}

/**
 * Resuelve destinatarios y descripción del correo de confirmación a partir
 * de los page_id de sponsor y asistente en Contactos — nunca depende de
 * que el llamador (agente vía Plática) haya llenado `descripcion` o
 * `asistentes_email` a mano. Esto es intencional (confirmado Adler,
 * 17-ago): Laura pidió desde la Segunda Sesión que el sponsor reciba el
 * dato de contacto de la persona con la que tiene la cita "en automático"
 * — no puede depender de que el agente lo arme bien cada vez.
 *
 * `emailsExtra` (de asistentes_email en el body, si vino) se agrega a los
 * dos resueltos de Contactos — no los reemplaza. Deduplicado.
 */
async function resolverNotificacionCita({ sponsorPageId, asistentePageId, emailsExtra }) {
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

  const destinatarios = [
    ...(emailsExtra || []),
    sponsor.email,
    asistente.email,
  ].filter(Boolean);
  const destinatariosUnicos = [...new Set(destinatarios)];

  // Descripción construida SIEMPRE desde Contactos — ver nota de cabecera.
  // No usa el "descripcion" que venga del body de reservar_cita; ese
  // parámetro queda disponible por si el agente quiere agregar contexto
  // extra en una iteración futura, pero HOY no es la fuente del dato de
  // contacto — eso es automático.
  const lineasAsistente = [
    '¡Tu cita 1 a 1 en Fashion Digital Talks 2026 está confirmada!',
    '',
    `${asistente.nombre || 'El asistente'} agendó un espacio con ${
      sponsor.nombre || 'el sponsor'
    }. Nos dará mucho gusto recibirlos.`,
    '',
    'Para guardar la cita, selecciona "Agregar al calendario" en la invitación adjunta (.ics). Ahí encontrarás el horario y la mesa asignada.',
    '',
    'Datos de contacto del asistente:',
    `Nombre: ${asistente.nombre || 'Asistente'}`,
    asistente.empresa ? `Empresa: ${asistente.empresa}` : null,
    asistente.rolPuesto ? `Puesto: ${asistente.rolPuesto}` : null,
    asistente.email ? `Correo: ${asistente.email}` : null,
    asistente.whatsapp ? `Teléfono: ${asistente.whatsapp}` : null,
    '',
    'Te recomendamos conservar estos datos para facilitar el encuentro.',
    '',
    '¡Te esperamos en Fashion Digital Talks 2026!',
    'Equipo Fashion Digital Talks',
  ].filter((linea) => linea !== null);

  const descripcion = lineasAsistente.join('\n');

  return { destinatarios: destinatariosUnicos, descripcion };
}

/**
 * Reserva una cita 1-a-1 entre un sponsor y un asistente.
 *
 * @param {object} params
 * @param {string} params.sponsor_calendario_id - ID del Google Calendar dedicado al sponsor
 * @param {string} params.sponsor_notion_id     - page_id en Notion del contacto sponsor
 * @param {string} params.asistente_notion_id   - page_id en Notion del contacto asistente
 * @param {string} params.inicio                - ISO 8601, ej. "2026-10-07T10:30:00-06:00"
 * @param {string} params.fin                   - ISO 8601
 * @param {string} [params.zona_horaria]        - default 'America/Mexico_City'
 * @param {string} params.request_id            - clave de idempotencia, generada por quien llama
 *                                                 (el mismo valor en un reintento debe ser el mismo string)
 * @param {string} [params.titulo]
 * @param {string} [params.descripcion]         - ya no alimenta Calendar/correo (descripción auto); se conserva en la firma por compatibilidad
 * @param {string[]} [params.asistentes_email]  - emails extra (se suman a Contactos); Calendar solo usa este array del body (sin duplicar invitaciones Google)
 */
async function reservarCita({
  sponsor_calendario_id,
  sponsor_notion_id,
  asistente_notion_id,
  inicio,
  fin,
  zona_horaria,
  request_id,
  titulo,
  descripcion, // eslint-disable-line no-unused-vars -- firma pública; descripción real = auto desde Contactos
  asistentes_email,
}) {
  if (!request_id) {
    throw new BookingError('INVALID_INPUT', '"request_id" es requerido (clave de idempotencia)');
  }
  if (!sponsor_calendario_id || !sponsor_notion_id || !asistente_notion_id) {
    throw new BookingError('INVALID_INPUT', 'Faltan sponsor_calendario_id, sponsor_notion_id o asistente_notion_id');
  }
  if (!inicio || !fin) {
    throw new BookingError('INVALID_INPUT', '"inicio" y "fin" son requeridos en formato ISO 8601');
  }

  // Duración + día del evento + bloque operativo (mismas env que
  // /citas/disponibilidad). Antes del chequeo de idempotencia: no gastar
  // Notion en una reserva con horario inválido de entrada.
  validarDuracionYFecha(inicio, fin);

  // Chequeo de idempotencia fuera del lock: es solo lectura, no necesita
  // serializarse. Si ya existe, regresamos el resultado anterior tal cual.
  const existente = await citasService.buscarPorRequestId(request_id);
  if (existente) {
    return {
      ya_existia: true,
      notion_page_id: existente.id,
      estado: existente.properties?.Estatus?.select?.name || null,
    };
  }

  // A partir de aquí, todo corre serializado. Es la sección crítica completa:
  // verificar + reservar-en-Notion + crear-en-Calendar + confirmar — sin
  // que ninguna otra reserva pueda intercalarse en medio.
  return bookingMutex.runExclusive(async () => {
    // Re-chequeo dentro del lock: por si dos requests con el mismo
    // request_id llegaron a la vez y ambas pasaron el chequeo de arriba
    // antes de que cualquiera entrara al mutex.
    const existenteEnLock = await citasService.buscarPorRequestId(request_id);
    if (existenteEnLock) {
      return {
        ya_existia: true,
        notion_page_id: existenteEnLock.id,
        estado: existenteEnLock.properties?.Estatus?.select?.name || null,
      };
    }

    const [sponsorOcupado, citasEnBloque] = await Promise.all([
      citasService.sponsorOcupadoEnBloque({ sponsorPageId: sponsor_notion_id, inicio }),
      citasService.contarCitasEnBloque({ inicio }),
    ]);

    if (sponsorOcupado) {
      throw new BookingError('SPONSOR_YA_OCUPADO', 'Este sponsor ya tiene una cita confirmada en ese horario.');
    }
    if (citasEnBloque >= CAPACIDAD_MAXIMA_MESAS) {
      throw new BookingError(
        'CAPACIDAD_MESAS_LLENA',
        `Ya se alcanzó el máximo de ${CAPACIDAD_MAXIMA_MESAS} mesas simultáneas en ese horario.`
      );
    }

    // La mesa que le toca a esta cita es la siguiente disponible en el bloque.
    // Válido porque estamos dentro del mutex: nadie más puede colarse entre
    // este cálculo y la escritura de crearCitaPendiente() de abajo.
    const numeroMesa = citasEnBloque + 1;

    // Reservamos el lugar en Notion en estado intermedio ANTES de tocar
    // Calendar. Como estamos dentro del mutex, no hay forma de que otra
    // reserva se cuele entre este paso y la confirmación de abajo.
    const citaPendiente = await citasService.crearCitaPendiente({
      requestId: request_id,
      sponsorPageId: sponsor_notion_id,
      asistentePageId: asistente_notion_id,
      inicio,
      fin,
      titulo: titulo || `Cita — ${request_id}`,
      mesa: numeroMesa,
    });

    // Resuelto ANTES de tocar Calendar: Calendar y el correo deben
    // mostrar la misma descripción automática (confirmado Adler, 17-ago
    // tarde) — nunca depende de que el body haya llenado "descripcion" a
    // mano.
    //
    // crearCitaPendiente() YA escribió la fila como "Pendiente Calendar".
    // Si resolverNotificacionCita() truena, este catch la marca Fallida
    // (simétrico al catch de Calendar) — no queda huérfana.
    let destinatarios;
    let descripcionAuto;
    try {
      ({ destinatarios, descripcion: descripcionAuto } = await resolverNotificacionCita({
        sponsorPageId: sponsor_notion_id,
        asistentePageId: asistente_notion_id,
        emailsExtra: asistentes_email,
      }));
    } catch (resolucionError) {
      await citasService.marcarCitaFallida({
        notionPageId: citaPendiente.id,
        motivo: `No se pudo resolver sponsor/asistente para la notificación: ${resolucionError.message}`,
      });
      throw resolucionError instanceof BookingError
        ? resolucionError
        : new BookingError('CONTACTO_NO_RESUELTO', resolucionError.message);
    }

    // Calendar sigue invitando solo por asistentes_email del body
    // (confirmado Adler, 17-ago: la invitación real de personas vive en
    // el ICS/correo, no en Calendar — evita duplicar notificaciones si
    // Google también manda invitación propia por invitado agregado).
    let evento;
    try {
      evento = await calendarClient.createEvent({
        calendario_id: sponsor_calendario_id,
        titulo: titulo || 'Cita 1 a 1 — Fashion Digital Talks',
        descripcion: descripcionAuto,
        inicio,
        fin,
        zona_horaria: zona_horaria || 'America/Mexico_City',
        asistentes: asistentes_email,
        recordatorios: [
          { tipo: 'email', minutos: 24 * 60 }, // 1 día antes
          { tipo: 'popup', minutos: 60 }, // 1 hora antes
        ],
      });
    } catch (calendarError) {
      await citasService.marcarCitaFallida({
        notionPageId: citaPendiente.id,
        motivo: `Error al crear evento en Calendar: ${calendarError.message}`,
      });
      throw new BookingError('CALENDAR_FALLO', 'No se pudo registrar la cita en Google Calendar. Intenta de nuevo.');
    }

    // Confirmar en Notion con reintentos acotados.
    const REINTENTOS = 3;
    let ultimoError;
    for (let intento = 1; intento <= REINTENTOS; intento++) {
      try {
        await citasService.confirmarCita({
          notionPageId: citaPendiente.id,
          eventoId: evento.evento_id,
        });

        // Cita real en Calendar + Notion. A partir de aquí, cualquier falla
        // de correo NUNCA revierte la reserva — solo degrada el Estatus a
        // "Confirmada sin notificar" para que quede visible que falta
        // avisarle al sponsor.
        // destinatarios y descripcionAuto ya resueltos arriba, antes de
        // Calendar — se reusan aquí, no se vuelven a calcular.
        if (destinatarios.length > 0) {
          try {
            await emailService.enviarConfirmacionCita({
              notionPageId: citaPendiente.id,
              destinatarios,
              titulo: titulo || 'Cita 1 a 1 confirmada — Fashion Digital Talks',
              descripcion: descripcionAuto,
              inicio,
              fin,
              ubicacion: numeroMesa ? `Mesa ${numeroMesa}` : undefined,
            });
          } catch (emailError) {
            await citasService.marcarCitaConfirmadaSinNotificar({
              notionPageId: citaPendiente.id,
              motivoCategoria: emailError.categoria || 'DESCONOCIDO',
              motivoDetalle: emailError.message,
              intentosPrevios: 0,
            });
            return {
              ya_existia: false,
              notion_page_id: citaPendiente.id,
              evento_id: evento.evento_id,
              estado: 'Confirmada sin notificar',
              mesa: numeroMesa,
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
          evento_id: evento.evento_id,
          estado: 'Confirmada',
          mesa: numeroMesa,
        };
      } catch (notionError) {
        ultimoError = notionError;
        await new Promise((r) => setTimeout(r, 300 * intento));
      }
    }

    // Notion no confirmó tras agotar reintentos → compensar cancelando el
    // evento en Calendar. Nunca queda un "slot fantasma": o queda
    // confirmado en ambos lados, o en ninguno.
    try {
      await calendarClient.cancelEvent({
        calendario_id: sponsor_calendario_id,
        evento_id: evento.evento_id,
        enviar_notificaciones: false,
      });
    } catch (_) {
      // Si ni siquiera se puede cancelar, queda registrado como Fallida
      // para que el cron de reconciliación lo detecte y alerte.
    }

    await citasService.marcarCitaFallida({
      notionPageId: citaPendiente.id,
      motivo: `Calendar OK (evento ${evento.evento_id}) pero Notion no confirmó tras ${REINTENTOS} intentos: ${ultimoError?.message}`,
    });

    throw new BookingError(
      'NOTION_FALLO',
      'La cita se creó en Calendar pero no se pudo confirmar en la base de datos. Se canceló y hay que reintentar.'
    );
  });
}

/**
 * Reintenta enviar la notificación/.ics de una cita específica que quedó en
 * "Confirmada sin notificar". Usada por:
 *   - POST /citas/:id/reenviar-notificacion (manual)
 *   - el cron de Coolify (ver src/jobs/reintentar-notificaciones.job.js)
 *
 * No valida capacidad ni ocupación — la cita ya existe, esto solo reintenta
 * el paso de correo. Si la cita no está en "Confirmada sin notificar",
 * lanza BookingError('ESTADO_INVALIDO').
 *
 * NO entra al mutex — reenviar un correo no toca capacidad de mesas.
 */
async function reintentarNotificacion(notionPageId) {
  const cita = await citasService.obtenerCitaPorId(notionPageId);
  const estatusActual = cita.properties?.Estatus?.select?.name;

  if (estatusActual !== 'Confirmada sin notificar') {
    throw new BookingError(
      'ESTADO_INVALIDO',
      `Esta cita está en estatus "${estatusActual}", no en "Confirmada sin notificar". No se reenvía.`
    );
  }

  const intentosPrevios = cita.properties?.['Intentos Envio Email']?.number || 0;
  if (intentosPrevios >= MAX_INTENTOS_NOTIFICACION) {
    throw new BookingError(
      'LIMITE_INTENTOS_ALCANZADO',
      `Ya se alcanzó el límite de ${MAX_INTENTOS_NOTIFICACION} intentos. Revisa el correo del sponsor/asistente en Notion antes de forzar un reintento manual (fuera de este endpoint).`
    );
  }

  const sponsorId = cita.properties?.['Contacto Match']?.relation?.[0]?.id;
  const asistenteId = cita.properties?.['Contacto Principal']?.relation?.[0]?.id;
  const { destinatarios, descripcion } = await resolverNotificacionCita({
    sponsorPageId: sponsorId,
    asistentePageId: asistenteId,
    emailsExtra: [], // el reintento no tiene el body original de la reserva — solo Contactos
  });
  const fechaHora = cita.properties?.['Fecha y Hora']?.date;
  const mesa = cita.properties?.['Mesa / Ubicacion']?.rich_text?.[0]?.plain_text
    || cita.properties?.['Mesa / Ubicacion']?.rich_text?.[0]?.text?.content;

  if (destinatarios.length === 0) {
    throw new BookingError(
      'SIN_DESTINATARIOS',
      'Ni el sponsor ni el asistente tienen "Email" en Contactos — no hay a quién reenviar. Corrige el dato en Notion antes de reintentar.'
    );
  }

  try {
    await emailService.enviarConfirmacionCita({
      notionPageId,
      destinatarios,
      titulo: cita.properties?.Nombre?.title?.[0]?.plain_text
        || cita.properties?.Nombre?.title?.[0]?.text?.content
        || 'Cita 1 a 1 confirmada',
      descripcion,
      inicio: fechaHora?.start,
      fin: fechaHora?.end,
      ubicacion: mesa,
      secuencia: intentosPrevios + 1, // SEQUENCE del ICS sube en cada reintento
    });
    await citasService.confirmarNotificacionEnviada(notionPageId);
    return { notion_page_id: notionPageId, estado: 'Confirmada' };
  } catch (emailError) {
    await citasService.marcarCitaConfirmadaSinNotificar({
      notionPageId,
      motivoCategoria: emailError.categoria || 'DESCONOCIDO',
      motivoDetalle: emailError.message,
      intentosPrevios,
    });
    throw new BookingError(
      'NOTIFICACION_FALLO',
      `Reintento falló (${emailError.categoria}): ${emailError.message}`
    );
  }
}

module.exports = {
  reservarCita,
  reintentarNotificacion,
  resolverNotificacionCita,
  BookingError,
  validarDuracionYFecha,
};
