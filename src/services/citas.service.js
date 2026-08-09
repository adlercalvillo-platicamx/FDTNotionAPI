// src/services/citas.service.js
//
// Cliente REST directo a Notion (NO usa el MCP) — según la regla ya establecida
// en el proyecto: la escritura de citas debe ser código determinístico, no una
// decisión de agente/LLM invocando una herramienta MCP.
//
// Nombres de propiedad verificados contra el schema real de `Citas` en Notion
// (data_source_id e589d487-b3db-4d9b-8ec1-6d0119728aca) el 15 de julio 2026:
//   - "Estatus" (no "Estado") — ya trae las opciones Pendiente Calendar / Fallida
//   - "Contacto Match" = el SPONSOR (confirmado con el registro de ejemplo Ana×Carlos)
//   - "Contacto Principal" = el ASISTENTE
//   - "Idempotency Key" ya existía — se reusa en vez de crear "Request ID"
//   - "Notas" ya existía — se reusa para el motivo de falla en vez de "Nota Error"
//   - "Fecha y Hora" ya existía como date — se usa start/end para inicio/fin
//
// Requiere NOTION_CITAS_DATA_SOURCE_ID en variables de entorno
// (usa e589d487-b3db-4d9b-8ec1-6d0119728aca para la tabla activa).

const { notionFetch } = require('../utils/notion-client');

const CITAS_DATA_SOURCE_ID = process.env.NOTION_CITAS_DATA_SOURCE_ID;

function requireDataSourceId() {
  if (!CITAS_DATA_SOURCE_ID) throw new Error('Falta NOTION_CITAS_DATA_SOURCE_ID en variables de entorno');
}

/**
 * Cuenta cuántas citas ya están CONFIRMADAS con inicio exactamente en ese
 * horario — usado para la restricción de "máximo 11 mesas en paralelo".
 *
 * NOTA: compara por igualdad exacta de "Fecha y Hora". Si tus bloques no son
 * siempre de 30 min exactos alineados, hay que cambiar esto a un filtro de
 * rango (before/after) en vez de equals.
 */
async function contarCitasEnBloque({ inicio }) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Estatus', select: { equals: 'Confirmada' } },
          { property: 'Fecha y Hora', date: { equals: inicio } },
        ],
      },
    }),
  });
  return data.results.length;
}

/**
 * Verifica si un sponsor específico ya tiene una cita CONFIRMADA en ese
 * mismo horario (regla: 1 cita por sponsor por bloque, porque solo tiene
 * un agente comercial disponible). El sponsor vive en "Contacto Match".
 */
async function sponsorOcupadoEnBloque({ sponsorPageId, inicio }) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Estatus', select: { equals: 'Confirmada' } },
          { property: 'Contacto Match', relation: { contains: sponsorPageId } },
          { property: 'Fecha y Hora', date: { equals: inicio } },
        ],
      },
    }),
  });
  return data.results.length > 0;
}

/**
 * Idempotencia: busca si esta solicitud (por request_id) ya se procesó antes.
 * Evita crear una cita duplicada si el cliente (WhatsApp Flow / agente)
 * reintenta la misma solicitud lógica. Usa el campo "Idempotency Key" ya
 * existente en el schema.
 */
async function buscarPorRequestId(requestId) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Idempotency Key', rich_text: { equals: requestId } },
    }),
  });
  return data.results[0] || null;
}

/**
 * Crea el registro de cita en estado intermedio, ANTES de tocar Calendar.
 * Este registro es el que efectivamente "reserva el lugar" dentro del
 * bloqueo (ver booking.service.js) — aunque su Estatus no sea "Confirmada"
 * todavía, ya existe en Notion con el Idempotency Key, así que un reintento
 * con el mismo request_id lo va a encontrar y no va a duplicar.
 *
 * "Contacto Principal" = asistente, "Contacto Match" = sponsor (confirmado
 * contra el registro de ejemplo Ana Sofía Torres × Carlos Medina).
 */
async function crearCitaPendiente({ requestId, sponsorPageId, asistentePageId, inicio, fin, titulo }) {
  requireDataSourceId();
  return notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: CITAS_DATA_SOURCE_ID },
      properties: {
        Nombre: { title: [{ text: { content: titulo || `Cita — ${requestId}` } }] },
        'Idempotency Key': { rich_text: [{ text: { content: requestId } }] },
        Estatus: { select: { name: 'Pendiente Calendar' } },
        'Contacto Match': { relation: [{ id: sponsorPageId }] },
        'Contacto Principal': { relation: [{ id: asistentePageId }] },
        'Fecha y Hora': { date: { start: inicio, end: fin } },
      },
    }),
  });
}

/** Marca la cita como Confirmada una vez que Calendar ya devolvió el evento creado. */
async function confirmarCita({ notionPageId, eventoId }) {
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Estatus: { select: { name: 'Confirmada' } },
        'Google Event ID': { rich_text: [{ text: { content: eventoId } }] },
      },
    }),
  });
}

/** Marca la cita como fallida (para auditoría / reconciliación posterior). Reusa "Notas". */
async function marcarCitaFallida({ notionPageId, motivo }) {
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Estatus: { select: { name: 'Fallida' } },
        Notas: { rich_text: [{ text: { content: String(motivo).slice(0, 1900) } }] },
      },
    }),
  });
}

/**
 * Cuenta cuántas citas CONFIRMADAS tiene un sponsor en total (no por bloque
 * de horario, sino en general) — es el componente "citas confirmadas" de la
 * cuota pendiente: cuota_pendiente = Citas Minimas Prometidas − este número.
 * Usado por matchmaking.service.js, no por el flujo de reserva.
 */
async function contarCitasConfirmadasPorSponsor(sponsorPageId) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Estatus', select: { equals: 'Confirmada' } },
          { property: 'Contacto Match', relation: { contains: sponsorPageId } },
        ],
      },
    }),
  });
  return data.results.length;
}

// ═══════════════════════════════════════════════════════════════
// NUEVO (9 de agosto) — flujo de aprobación conversacional de matches
//
// Contexto del rediseño: "Match Aprobado" era un checkbox único por
// SPONSOR — no distinguía CUÁL de varios candidatos sugeridos fue
// aprobado. Con "Citas Minimas Prometidas" confirmado como variable por
// sponsor (Laura negocia caso por caso), un sponsor puede tener varios
// candidatos sugeridos y varias citas a la vez — el checkbox no alcanza.
//
// La tabla `Citas` ya tenía la forma correcta para esto: una fila por par
// (sponsor, asistente). Se extendió `Estatus` con dos valores nuevos,
// AL FRENTE del ciclo de vida existente:
//   Sugerido → Aprobado → Pendiente Calendar → Confirmada
//                                             ↘ Fallida
//   (Cancelada / Completada / No-show sin cambios, aplican después de Confirmada)
//
// `Match Sugerido` (relation en el sponsor) queda EN DESUSO a partir de
// este cambio — la fuente de verdad de qué está sugerido/aprobado pasa a
// ser esta tabla. No se borra el campo del schema (por si hay que
// consultar el historial de antes del 9 de agosto), pero ningún código
// nuevo debe escribirlo.
// ═══════════════════════════════════════════════════════════════

/**
 * Crea una fila de cita en estado "Sugerido" — el resultado de
 * sugerir_matches_para_sponsor cuando escribirEnNotion=true. Una fila por
 * candidato, no una relación de varios en el sponsor.
 *
 * A diferencia de crearCitaPendiente (que ya tiene inicio/fin porque viene
 * de reservar_cita con un horario elegido), esta fila todavía no tiene
 * horario — el horario se decide después, en el flujo de reservar_cita.
 * "Fecha y Hora" se deja sin escribir a propósito.
 */
async function crearCitaSugerida({ sponsorPageId, asistentePageId, sponsorNombre, asistenteNombre, score, explicacion }) {
  requireDataSourceId();
  return notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: CITAS_DATA_SOURCE_ID },
      properties: {
        Nombre: { title: [{ text: { content: `Sugerido: ${asistenteNombre} × ${sponsorNombre}` } }] },
        Estatus: { select: { name: 'Sugerido' } },
        'Contacto Match': { relation: [{ id: sponsorPageId }] },
        'Contacto Principal': { relation: [{ id: asistentePageId }] },
        Notas: {
          rich_text: [
            { text: { content: `Score: ${score}. ${explicacion}`.slice(0, 1900) } },
          ],
        },
      },
    }),
  });
}

/**
 * Busca todas las filas "Sugerido" o "Aprobado" para un sponsor específico
 * — usado para mostrarle a Laura/Liz el reporte de candidatos pendientes de
 * decisión, y para que reservar_cita pueda encontrar la fila correcta a
 * partir del par (sponsor, asistente) sin que el agente tenga que rastrear
 * el page_id de la fila de Citas por su cuenta.
 */
async function buscarSugerenciasPendientesPorSponsor(sponsorPageId) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Contacto Match', relation: { contains: sponsorPageId } },
          {
            or: [
              { property: 'Estatus', select: { equals: 'Sugerido' } },
              { property: 'Estatus', select: { equals: 'Aprobado' } },
            ],
          },
        ],
      },
    }),
  });
  return data.results;
}

/**
 * Marca como "Aprobado" la fila de Citas que corresponde a un par
 * (sponsor, asistente) específico. Requiere que la fila ya exista en
 * estado "Sugerido" — no crea una fila nueva ni aprueba a ciegas un par
 * que nunca fue sugerido primero (ver verificación en el service que la
 * llama, matchmaking.service.js → aprobarMatch).
 *
 * Esta función es puramente de escritura determinística — la decisión de
 * SI se debe aprobar (confirmación explícita de identidad, repetir el
 * match antes de escribir) vive en el prompt del agente, no aquí. Esta
 * función solo ejecuta el cambio de estado una vez que esa decisión ya
 * se tomó.
 */
async function marcarCitaAprobada(notionPageId) {
  requireDataSourceId();
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Estatus: { select: { name: 'Aprobado' } },
      },
    }),
  });
}

/**
 * Verifica si ya existe una cita activa entre este sponsor y este asistente
 * específico — para no sugerir dos veces el mismo par. No filtra por horario,
 * es una verificación global del par.
 *
 * CORRECCIÓN (9 de agosto): además de "Confirmada" y "Pendiente Calendar",
 * un par ya en "Sugerido" o "Aprobado" también cuenta como activo — si no,
 * sugerir_matches_para_sponsor podría volver a sugerir (y crear una fila
 * duplicada para) un par que ya está esperando decisión o ya fue aprobado
 * pero aún no se convirtió en cita real.
 */
async function existeCitaActivaEntre({ sponsorPageId, asistentePageId }) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Contacto Match', relation: { contains: sponsorPageId } },
          { property: 'Contacto Principal', relation: { contains: asistentePageId } },
          {
            or: [
              { property: 'Estatus', select: { equals: 'Sugerido' } },
              { property: 'Estatus', select: { equals: 'Aprobado' } },
              { property: 'Estatus', select: { equals: 'Confirmada' } },
              { property: 'Estatus', select: { equals: 'Pendiente Calendar' } },
            ],
          },
        ],
      },
    }),
  });
  return data.results.length > 0;
}

module.exports = {
  contarCitasEnBloque,
  sponsorOcupadoEnBloque,
  buscarPorRequestId,
  crearCitaPendiente,
  confirmarCita,
  marcarCitaFallida,
  contarCitasConfirmadasPorSponsor,
  crearCitaSugerida,
  buscarSugerenciasPendientesPorSponsor,
  marcarCitaAprobada,
  existeCitaActivaEntre,
};
