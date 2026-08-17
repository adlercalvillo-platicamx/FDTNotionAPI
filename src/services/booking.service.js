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
// "Confirmada" en Notion pasa por este endpoint. Si en algún momento se
// permite editar el Estatus de una cita a mano desde Notion (o desde otro
// flujo del agente) sin pasar por aquí, el conteo de capacidad y el
// chequeo de sponsor-ocupado dejan de ser confiables.

const { Mutex } = require('async-mutex');
const calendarClient = require('./calendar-client.service');
const citasService = require('./citas.service');

const CAPACIDAD_MAXIMA_MESAS = 11; // ver sesión 2/3: límite físico de mesas por hora
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
 * @param {string} [params.descripcion]
 * @param {string[]} [params.asistentes_email]  - emails a invitar en el evento de Calendar
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
  descripcion,
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

    // Solo ahora tocamos Calendar (por HTTP, vía calendar-client.service.js).
    // Si falla, la cita queda "Fallida" en Notion (no "Confirmada"), así que
    // no cuenta para futuras verificaciones de capacidad.
    let evento;
    try {
      evento = await calendarClient.createEvent({
        calendario_id: sponsor_calendario_id,
        titulo: titulo || 'Cita 1 a 1 — Fashion Digital Talks',
        descripcion,
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

module.exports = { reservarCita, BookingError, validarDuracionYFecha };
