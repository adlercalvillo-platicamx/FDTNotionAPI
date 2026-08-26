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
const {
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  esCandidataEnvioCampana,
} = require('../utils/estado-envio-campana');

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
          {
            or: [
              { property: 'Estatus', select: { equals: 'Confirmada' } },
              { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
            ],
          },
          { property: 'Fecha y Hora', date: { equals: inicio } },
        ],
      },
    }),
  });
  return data.results.length;
}

/**
 * Verifica si un sponsor específico ya tiene una cita CONFIRMADA (o
 * Confirmada sin notificar) en ese mismo horario (regla: 1 cita por
 * sponsor por bloque, porque solo tiene un agente comercial disponible).
 * El sponsor vive en "Contacto Match".
 */
async function sponsorOcupadoEnBloque({ sponsorPageId, inicio }) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          {
            or: [
              { property: 'Estatus', select: { equals: 'Confirmada' } },
              { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
            ],
          },
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

function tituloDePaginaCita(pagina) {
  return (
    pagina?.properties?.Nombre?.title?.[0]?.plain_text ||
    pagina?.properties?.Nombre?.title?.[0]?.text?.content ||
    null
  );
}

function empresaOTituloFallback(empresa, nombre, fallback) {
  return String(empresa || nombre || fallback).trim();
}

function propiedadesReservaPendiente({ requestId, inicio, fin, titulo, mesa }) {
  return {
    Nombre: { title: [{ text: { content: titulo || `Cita — ${requestId}` } }] },
    'Idempotency Key': { rich_text: [{ text: { content: requestId } }] },
    Estatus: { select: { name: 'Pendiente Calendar' } },
    'Fecha y Hora': { date: { start: inicio, end: fin } },
    ...(mesa ? { 'Mesa / Ubicacion': { rich_text: [{ text: { content: `Mesa ${mesa}` } }] } } : {}),
  };
}

/**
 * Filas Sugerido/Aprobado del par (sponsor, asistente). Preferimos
 * Aprobado si hay ambas — es la que ya pasó decisión humana.
 */
async function buscarSugerenciasDelPar({ sponsorPageId, asistentePageId }) {
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
            ],
          },
        ],
      },
    }),
  });
  return data.results || [];
}

function elegirSugerenciaAPromover(filas) {
  if (!filas || filas.length === 0) return null;
  const aprobada = filas.find((f) => f.properties?.Estatus?.select?.name === 'Aprobado');
  return aprobada || filas[0];
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
 *
 * Si ya existe una fila Sugerido/Aprobado para el mismo par, la PROMUEVE
 * a Pendiente Calendar en vez de crear una segunda fila. Si no, el agente
 * sigue viendo "Aprobados sin agendar" y vuelve a ofrecer el mismo match
 * aunque la cita real ya esté Confirmada (bug visto 19-ago).
 */
async function crearCitaPendiente({ requestId, sponsorPageId, asistentePageId, inicio, fin, titulo, mesa }) {
  requireDataSourceId();
  const sugerencias = await buscarSugerenciasDelPar({ sponsorPageId, asistentePageId });
  const aPromover = elegirSugerenciaAPromover(sugerencias);

  if (aPromover) {
    const estatusPrevio = aPromover.properties?.Estatus?.select?.name || 'Aprobado';
    const nombrePrevio = tituloDePaginaCita(aPromover);
    const pagina = await notionFetch(`/pages/${aPromover.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: propiedadesReservaPendiente({ requestId, inicio, fin, titulo, mesa }),
      }),
    });
    return {
      ...pagina,
      reutilizoSugerencia: true,
      estatusPrevio,
      nombrePrevio,
    };
  }

  const pagina = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: CITAS_DATA_SOURCE_ID },
      properties: {
        ...propiedadesReservaPendiente({ requestId, inicio, fin, titulo, mesa }),
        'Contacto Match': { relation: [{ id: sponsorPageId }] },
        'Contacto Principal': { relation: [{ id: asistentePageId }] },
      },
    }),
  });
  return { ...pagina, reutilizoSugerencia: false };
}

/** Actualiza el título determinístico una vez resueltas ambas empresas. */
async function actualizarTituloCita({ notionPageId, titulo }) {
  requireDataSourceId();
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Nombre: { title: [{ text: { content: titulo } }] },
      },
    }),
  });
}

/**
 * Si Calendar o la resolución de contactos fallan DESPUÉS de promover una
 * fila Sugerido/Aprobado, no la marcamos Fallida: volvería a sugerirse el
 * par (Fallida no está en ESTATUS_ACTIVOS) y se pierde la aprobación humana.
 * Se restaura el match y se limpia horario / request_id para que un reintento
 * con el mismo request_id no se corte en buscarPorRequestId.
 */
async function revertirCitaPendienteAMatch({ notionPageId, estatusPrevio, nombrePrevio }) {
  requireDataSourceId();
  const estatus = estatusPrevio === 'Sugerido' ? 'Sugerido' : 'Aprobado';
  const properties = {
    Estatus: { select: { name: estatus } },
    'Idempotency Key': { rich_text: [] },
    'Fecha y Hora': { date: null },
    'Mesa / Ubicacion': { rich_text: [] },
  };
  if (nombrePrevio) {
    properties.Nombre = { title: [{ text: { content: nombrePrevio } }] };
  }
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
}

/**
 * Archiva filas Sugerido/Aprobado que hayan quedado huérfanas para el mismo
 * par (duplicados de matchmaking, o el caso viejo de reserva que creaba una
 * fila nueva y no tocaba la aprobada). No toca `exceptPageId` — esa es la
 * cita que se acaba de confirmar.
 */
async function archivarSugerenciasDelPar({ sponsorPageId, asistentePageId, exceptPageId }) {
  const filas = await buscarSugerenciasDelPar({ sponsorPageId, asistentePageId });
  const aArchivar = filas.filter((f) => f.id !== exceptPageId);
  for (const fila of aArchivar) {
    await notionFetch(`/pages/${fila.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
  }
  return { archivadas: aArchivar.length, ids: aArchivar.map((f) => f.id) };
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

/**
 * Degrada una cita ya Confirmada (Calendar + Notion OK) a "Confirmada sin
 * notificar" cuando el envío del correo/ICS falló tras los 3 reintentos
 * inmediatos de SMTP (o tras un reenvío a demanda que también falló).
 * La cita NUNCA se revierte — Calendar y Notion ya son ciertos.
 *
 * Escribe el motivo en "Notas Envio Email" (separado de "Notas", que ya
 * se usa para fallas de booking / match). No hay contador de intentos:
 * el reenvío es a demanda vía endpoint/MCP (Adler, 18-ago).
 */
async function marcarCitaConfirmadaSinNotificar({ notionPageId, motivoCategoria, motivoDetalle }) {
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Estatus: { select: { name: 'Confirmada sin notificar' } },
        'Notas Envio Email': {
          rich_text: [
            {
              text: {
                content: `[${motivoCategoria}] ${motivoDetalle}`.slice(0, 1900),
              },
            },
          ],
        },
      },
    }),
  });
}

/**
 * Marca la notificación como enviada exitosamente — pasa de "Confirmada sin
 * notificar" de vuelta a "Confirmada" y limpia "Notas Envio Email".
 */
async function confirmarNotificacionEnviada(notionPageId) {
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Estatus: { select: { name: 'Confirmada' } },
        'Notas Envio Email': { rich_text: [] },
        'Intentos Envio Email': { number: 0 },
      },
    }),
  });
}

/**
 * Todas las citas en "Confirmada sin notificar" — usado por
 * POST /citas/reintentar-notificaciones-pendientes (MCP a demanda).
 * Sin filtro por intentos: el reenvío no tiene tope.
 */
async function buscarCitasSinNotificarParaReintentar() {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
    }),
  });
  return data.results;
}

/** GET directo de una página de Citas por su notion_page_id. Usado por
 * reintentarNotificacion() para leer el estado actual antes de decidir. */
async function obtenerCitaPorId(notionPageId) {
  return notionFetch(`/pages/${notionPageId}`, { method: 'GET' });
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
          {
            or: [
              { property: 'Estatus', select: { equals: 'Confirmada' } },
              { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
            ],
          },
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
 * de reservar_cita con un horario elegido, y reutiliza esta fila si existe),
 * esta fila todavía no tiene horario — el horario se decide después.
 * "Fecha y Hora" se deja sin escribir a propósito.
 */
async function crearCitaSugerida({
  sponsorPageId,
  asistentePageId,
  sponsorNombre,
  asistenteNombre,
  sponsorEmpresa,
  asistenteEmpresa,
  score,
  explicacion,
}) {
  requireDataSourceId();
  const empresaSponsor = empresaOTituloFallback(sponsorEmpresa, sponsorNombre, 'Sponsor sin empresa');
  const empresaAsistente = empresaOTituloFallback(asistenteEmpresa, asistenteNombre, 'Asistente sin empresa');
  return notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: CITAS_DATA_SOURCE_ID },
      properties: {
        Nombre: { title: [{ text: { content: `Sugerido: ${empresaAsistente} × ${empresaSponsor}` } }] },
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
  return queryCitasPaginado({
    and: [
      { property: 'Contacto Match', relation: { contains: sponsorPageId } },
      {
        or: [
          { property: 'Estatus', select: { equals: 'Sugerido' } },
          { property: 'Estatus', select: { equals: 'Aprobado' } },
        ],
      },
    ],
  });
}

const RANGO_SUGERIDA = { Aprobado: 2, Sugerido: 1 };

/**
 * Filas Sugerido/Aprobado del asistente (Contacto Principal), hidratadas
 * con empresa, nombre y calendario del sponsor. Dedup por sponsor (Aprobado gana).
 */
async function listarSugeridasPorAsistente(asistentePageId) {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    and: [
      { property: 'Contacto Principal', relation: { contains: asistentePageId } },
      {
        or: [
          { property: 'Estatus', select: { equals: 'Sugerido' } },
          { property: 'Estatus', select: { equals: 'Aprobado' } },
        ],
      },
    ],
  });

  const contactos = require('./contactos.service');
  const porSponsor = new Map();

  for (const fila of filas) {
    const estatus = fila.properties?.Estatus?.select?.name || null;
    const sponsorId = (fila.properties?.['Contacto Match']?.relation || [])[0]?.id;
    if (!sponsorId) continue;
    const previa = porSponsor.get(sponsorId);
    if (previa && (RANGO_SUGERIDA[previa.estatus] || 0) >= (RANGO_SUGERIDA[estatus] || 0)) {
      continue;
    }
    porSponsor.set(sponsorId, { cita_page_id: fila.id, estatus, sponsor_notion_id: sponsorId });
  }

  const sugeridas = [];
  for (const item of porSponsor.values()) {
    let sponsor;
    try {
      sponsor = await contactos.obtenerContacto(item.sponsor_notion_id);
    } catch (err) {
      console.warn(`[Citas] No se pudo hidratar sponsor ${item.sponsor_notion_id}:`, err.message);
      sugeridas.push({
        ...item,
        sponsor_nombre: null,
        sponsor_empresa: null,
        sponsor_calendario_id: null,
        nivel_patrocinio: null,
      });
      continue;
    }
    sugeridas.push({
      ...item,
      sponsor_nombre: sponsor.nombre || null,
      sponsor_empresa: sponsor.empresa || null,
      sponsor_calendario_id: sponsor.calendarioGoogleId || null,
      nivel_patrocinio: sponsor.nivelPatrocinio || null,
    });
  }

  return sugeridas;
}

/**
 * Consulta sugeridas por WhatsApp (identificador del agente) o page_id.
 * Si hay teléfono, Notion se resuelve aquí; el cliente no necesita el UUID.
 */
async function consultarSugeridasPorIdentificador({ whatsapp, asistentePageId } = {}) {
  const phone = String(whatsapp || '').trim();
  let id = String(asistentePageId || '').trim();
  let asistente = null;
  const contactos = require('./contactos.service');

  if (phone) {
    asistente = await contactos.buscarAsistentePorWhatsApp(phone);
    if (!asistente) {
      const err = new Error('No hay un asistente activo con ese número de WhatsApp.');
      err.code = 'CONTACTO_NO_RESUELTO';
      err.status = 404;
      throw err;
    }
    id = asistente.id;
  }

  if (!id) {
    const err = new Error('Se requiere whatsapp (teléfono) o asistente_notion_id.');
    err.code = 'INVALID_INPUT';
    err.status = 400;
    throw err;
  }

  if (!asistente) {
    asistente = await contactos.obtenerContacto(id);
  }

  const sugeridas = await listarSugeridasPorAsistente(id);
  return {
    asistente_notion_id: id,
    asistente_nombre: asistente?.nombre || null,
    asistente_empresa: asistente?.empresa || null,
    whatsapp: asistente?.whatsapp || phone || null,
    sugeridas,
  };
}

async function queryCitasPaginado(filter) {
  const resultados = [];
  let cursor = undefined;
  let paginasLeidas = 0;
  const MAX_PAGINAS = 50;

  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    resultados.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
    paginasLeidas += 1;
    if (paginasLeidas >= MAX_PAGINAS) {
      throw new Error(`queryCitasPaginado: límite de ${MAX_PAGINAS} páginas`);
    }
  } while (cursor);

  return resultados;
}

function textoRichText(prop) {
  return (prop?.rich_text || []).map((parte) => parte?.plain_text || parte?.text?.content || '').join('');
}

function scoreDeFilaCita(fila) {
  const formula = fila.properties?.['Score (de Notas)']?.formula;
  if (typeof formula?.number === 'number') return formula.number;
  const valorFormula = Number(formula?.string);
  if (Number.isFinite(valorFormula)) return valorFormula;
  const match = textoRichText(fila.properties?.Notas).match(/^\s*Score:\s*(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : 0;
}

async function buscarCitasAprobadasSinCampana() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    and: [
      { property: 'Estatus', select: { equals: 'Aprobado' } },
      { property: 'Campaña Enviada', checkbox: { equals: false } },
    ],
  });

  return filas
    .map((fila) => ({
      id: fila.id,
      asistentePageId: fila.properties?.['Contacto Principal']?.relation?.[0]?.id || null,
      sponsorPageId: fila.properties?.['Contacto Match']?.relation?.[0]?.id || null,
      score: scoreDeFilaCita(fila),
      estadoEnvioCampana: fila.properties?.['Estado Envío Campaña']?.select?.name || null,
      fechaInicioEnvio: fila.properties?.['Fecha Inicio Envío']?.date?.start || null,
    }))
    .filter((fila) => fila.asistentePageId && fila.sponsorPageId)
    .filter((fila) => esCandidataEnvioCampana(fila));
}

const ESTATUS_ELEGIBLES_RECORDATORIO = [
  'Sugerido',
  'Aprobado',
  'Rechazado',
  'Confirmada',
  'Confirmada sin notificar',
  'Pendiente Calendar',
  'Completada',
];

/**
 * Una foto paginada de Citas para el recordatorio-reactivación del evento.
 * Agrupa por asistente; omite filas sin Contacto Principal.
 */
async function cargarCitasPorAsistenteParaRecordatorio() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    or: ESTATUS_ELEGIBLES_RECORDATORIO.map((estatus) => ({
      property: 'Estatus',
      select: { equals: estatus },
    })),
  });
  const porAsistente = new Map();
  for (const fila of filas) {
    const asistentePageId = fila.properties?.['Contacto Principal']?.relation?.[0]?.id || null;
    const estatus = fila.properties?.Estatus?.select?.name || null;
    if (!asistentePageId || !estatus) continue;
    if (!porAsistente.has(asistentePageId)) porAsistente.set(asistentePageId, []);
    porAsistente.get(asistentePageId).push({ id: fila.id, estatus });
  }
  return porAsistente;
}

async function obtenerAsistentesConCitaConfirmada() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    or: [
      { property: 'Estatus', select: { equals: 'Confirmada' } },
      { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
    ],
  });
  const asistentes = new Set();
  for (const fila of filas) {
    for (const relacion of fila.properties?.['Contacto Principal']?.relation || []) {
      asistentes.add(relacion.id);
    }
  }
  return asistentes;
}

async function actualizarEstadoEnvioCampana(notionPageIds, { estado, fechaInicioEnvio, campanaEnviada } = {}) {
  requireDataSourceId();
  for (const notionPageId of notionPageIds) {
    const properties = {
      'Estado Envío Campaña': { select: { name: estado } },
    };
    if (fechaInicioEnvio) {
      properties['Fecha Inicio Envío'] = { date: { start: fechaInicioEnvio } };
    }
    if (campanaEnviada === true) {
      properties['Campaña Enviada'] = { checkbox: true };
    }
    await notionFetch(`/pages/${notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }
}

async function marcarCampanaEnviada(notionPageIds) {
  return actualizarEstadoEnvioCampana(notionPageIds, {
    estado: ESTADO_ENVIO_ENVIADA,
    campanaEnviada: true,
  });
}

async function reabrirCitaParaReintento(notionPageId) {
  return notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: { Estatus: { select: { name: 'Pendiente Calendar' } } },
    }),
  });
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
 * CORRECCIÓN (17 de agosto): también "Confirmada sin notificar" — cita real
 * (Calendar + Notion) a la que solo le faltó el correo/ICS; sin esto el
 * matchmaking individual volvería a sugerir el mismo par.
 * DECISIÓN (23 de agosto): "Rechazado" también bloquea el par. Conserva el
 * historial y solo vuelve a evaluarse si un humano cambia el Estatus.
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
              { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
              { property: 'Estatus', select: { equals: 'Pendiente Calendar' } },
              { property: 'Estatus', select: { equals: 'Rechazado' } },
            ],
          },
        ],
      },
    }),
  });
  return data.results.length > 0;
}

// ═══════════════════════════════════════════════════════════════
// NUEVO (10 de agosto) — fix del timeout de sugerir_matches_global
//
// Diagnóstico confirmado: sugerirMatchesGlobal() llama a
// sugerirMatchesParaSponsor() por cada sponsor, y esa función llama a
// existeCitaActivaEntre() UNA VEZ POR CADA CANDIDATO evaluado. Con 8
// sponsors reales x ~15-20 candidatos elegibles cada uno, son ~130-150
// llamadas HTTP SECUENCIALES a Notion en una sola invocación del MCP —
// estimado en 40-100+ segundos incluso en el mejor caso, muy por encima de
// cualquier timeout razonable de un tool call. Esto explica por qué
// sugerir_matches_para_sponsor (1 sponsor) siempre funcionó bien pero
// sugerir_matches_global (8 sponsors) falla consistentemente.
//
// Fix: en vez de preguntarle a Notion "¿existe cita activa entre A y B?"
// una vez por cada par, se trae UNA SOLA VEZ la lista completa de citas
// activas (con paginación real, no asumiendo que caben en una página) y
// se guarda en un Set en memoria para lookup O(1). Esto baja el número de
// llamadas HTTP de ~130-150 a 1-2 (según cuántas páginas haga falta,
// prácticamente siempre 1 con el volumen actual del proyecto).
// ═══════════════════════════════════════════════════════════════

const ESTATUS_ACTIVOS = [
  'Sugerido',
  'Aprobado',
  'Confirmada',
  'Confirmada sin notificar',
  'Pendiente Calendar',
  'Rechazado',
];

/**
 * Trae TODAS las filas de Citas cuyo Estatus esté en ESTATUS_ACTIVOS, con
 * paginación explícita (nunca asume que caben en una sola página — la API
 * de Notion pagina en bloques de 100 por default).
 *
 * Regresa un Set de strings "sponsorId|asistenteId" para lookup O(1) por
 * par exacto, exactamente el mismo criterio de "activo" que ya usaba
 * existeCitaActivaEntre() por candidato individual.
 *
 * Si una fila no tiene sponsor o asistente resuelto (dato corrupto o
 * incompleto), se omite del Set en vez de tronar — más seguro fallar
 * "abierto" en la caché (no bloquea un match que sí debería sugerirse)
 * que tronar toda la corrida de sugerir_matches_global por una fila mal
 * formada.
 */
async function obtenerParesConCitaActiva() {
  requireDataSourceId();
  const pares = new Set();
  let cursor = undefined;
  let paginasLeidas = 0;
  const MAX_PAGINAS = 50; // salvaguarda — 50 páginas x 100 filas = 5000 filas, muy por encima de cualquier volumen real esperado; si se llega aquí, algo está mal y es mejor detenerse que loopear indefinidamente

  do {
    const body = {
      filter: {
        or: ESTATUS_ACTIVOS.map((estatus) => ({
          property: 'Estatus',
          select: { equals: estatus },
        })),
      },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const data = await notionFetch(`/data_sources/${CITAS_DATA_SOURCE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    for (const fila of data.results) {
      const sponsorIds = (fila.properties?.['Contacto Match']?.relation || []).map((r) => r.id);
      const asistenteIds = (fila.properties?.['Contacto Principal']?.relation || []).map((r) => r.id);
      // Normalmente es 1 sponsor y 1 asistente por fila, pero se itera por si
      // acaso — no asumir cardinalidad exacta que el schema no garantiza.
      for (const sponsorId of sponsorIds) {
        for (const asistenteId of asistenteIds) {
          pares.add(`${sponsorId}|${asistenteId}`);
        }
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    paginasLeidas += 1;
    if (paginasLeidas >= MAX_PAGINAS) {
      throw new Error(
        `obtenerParesConCitaActiva: se alcanzó el límite de seguridad de ${MAX_PAGINAS} páginas ` +
        `sin terminar de paginar Citas. Esto no debería pasar con el volumen actual del proyecto — ` +
        `revisar manualmente antes de confiar en el resultado.`
      );
    }
  } while (cursor);

  return pares;
}

/**
 * Versión de existeCitaActivaEntre que consulta un Set ya cargado en
 * memoria (ver obtenerParesConCitaActiva) en vez de hacer una llamada HTTP
 * nueva. Misma semántica exacta, mismo criterio de "activo" — la única
 * diferencia es de dónde saca el dato.
 *
 * NO reemplaza a existeCitaActivaEntre() — esa función se conserva tal
 * cual para sugerir_matches_para_sponsor (1 solo sponsor, el costo de una
 * llamada por candidato ahí es aceptable y no vale la pena la complejidad
 * extra de cachear para un solo caso). Esta versión es exclusiva para
 * sugerirMatchesGlobal, donde el volumen sí lo justifica.
 */
function existeCitaActivaEntreEnCache(paresActivos, { sponsorPageId, asistentePageId }) {
  return paresActivos.has(`${sponsorPageId}|${asistentePageId}`);
}

// ═══════════════════════════════════════════════════════════════
// GET /citas/disponibilidad — solo lectura para el formulario de
// horarios (WhatsApp Flow / botones / mini web app).
//
// Reusa sponsorOcupadoEnBloque y contarCitasEnBloque tal cual — no
// reimplementa la regla de negocio. POST /citas/reservar sigue siendo
// la única fuente de verdad al confirmar (esta es una foto del momento).
//
// Horario POR FECHA vía env (confirmado Laura 14-ago): miércoles y
// jueves NO comparten el mismo rango. Sin esas variables → 503, nunca
// inventar bloques de respaldo.
// ═══════════════════════════════════════════════════════════════

// Mismo valor que booking.service.js — duplicado a propósito para no
// acoplar este service de lectura al de escritura. Si cambia el límite
// de mesas, actualizar ambos.
const CAPACIDAD_MAXIMA_MESAS = 11;

/**
 * Coolify / Docker / shells POSIX no inyectan Names de env con guiones
 * (confirmado 14-ago: CITAS_HORA_*_2026-10-07 aparecían en la UI de
 * Coolify pero process.env las veía undefined; CITAS_FECHAS_EVENTO sí
 * llegaba). El query param sigue siendo "2026-10-07"; la clave de env
 * usa underscores: CITAS_HORA_INICIO_2026_10_07.
 */
function fechaEnvKey(fecha) {
  return String(fecha).replace(/-/g, '_');
}

function requireHorarioConfigurado(fecha) {
  const key = fechaEnvKey(fecha);
  const faltantes = ['CITAS_FECHAS_EVENTO', `CITAS_HORA_INICIO_${key}`, `CITAS_HORA_FIN_${key}`].filter(
    (variable) => !process.env[variable]
  );
  if (faltantes.length > 0) {
    const err = new Error(
      `Horario de citas 1-a-1 no configurado para "${fecha}". ` +
        `Faltan las variables de entorno: ${faltantes.join(', ')}. ` +
        `No se puede calcular disponibilidad sin esto — servir un horario de ejemplo daría ` +
        `una respuesta falsa, no una respuesta incompleta.`
    );
    err.status = 503; // Service Unavailable: precondición de configuración, no 500 genérico
    throw err;
  }
}

/**
 * Genera los bloques de 30 min (o CITAS_DURACION_BLOQUE_MINUTOS) para una
 * fecha, a partir de CITAS_HORA_INICIO_<fecha_con_underscores> /
 * CITAS_HORA_FIN_<fecha_con_underscores>. Timestamps ISO exactos
 * alineados — misma igualdad que espera contarCitasEnBloque /
 * sponsorOcupadoEnBloque / reservar_cita.
 */
function generarBloquesParaFecha(fecha) {
  const zona = process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';
  const duracionMin = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS || 30);
  const key = fechaEnvKey(fecha);

  const [horaInicioH, horaInicioM] = process.env[`CITAS_HORA_INICIO_${key}`].split(':').map(Number);
  const [horaFinH, horaFinM] = process.env[`CITAS_HORA_FIN_${key}`].split(':').map(Number);

  const minutosInicio = horaInicioH * 60 + horaInicioM;
  const minutosFin = horaFinH * 60 + horaFinM;

  const bloques = [];
  for (let m = minutosInicio; m < minutosFin; m += duracionMin) {
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const min = String(m % 60).padStart(2, '0');
    bloques.push(`${fecha}T${h}:${min}:00${zona}`);
  }
  return bloques;
}

function finDeBloque(inicioIso) {
  const duracionMin = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS || 30);
  const zona = process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';
  const m = String(inicioIso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    throw new Error(`inicio ISO no parseable: ${inicioIso}`);
  }
  const fecha = m[1];
  const minutos = Number(m[2]) * 60 + Number(m[3]) + duracionMin;
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const min = String(minutos % 60).padStart(2, '0');
  return `${fecha}T${h}:${min}:00${zona}`;
}

function armarBloqueDisponibilidad({ inicio, sponsorOcupado, citasEnBloque }) {
  const mesas_ocupadas = citasEnBloque;
  const mesas_libres = Math.max(0, CAPACIDAD_MAXIMA_MESAS - citasEnBloque);
  const fin = finDeBloque(inicio);
  if (sponsorOcupado) {
    return { inicio, fin, disponible: false, motivo: 'SPONSOR_YA_OCUPADO', mesas_ocupadas, mesas_libres };
  }
  if (citasEnBloque >= CAPACIDAD_MAXIMA_MESAS) {
    return { inicio, fin, disponible: false, motivo: 'CAPACIDAD_MESAS_LLENA', mesas_ocupadas, mesas_libres };
  }
  return { inicio, fin, disponible: true, motivo: null, mesas_ocupadas, mesas_libres };
}

async function listarCitasConfirmadasEnFecha(fecha) {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    or: [
      { property: 'Estatus', select: { equals: 'Confirmada' } },
      { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
    ],
  });
  return filas
    .map((fila) => {
      const inicio = fila.properties?.['Fecha y Hora']?.date?.start || '';
      const sponsorId = (fila.properties?.['Contacto Match']?.relation || [])[0]?.id || null;
      return { inicio, sponsorId };
    })
    .filter((r) => r.inicio.startsWith(fecha));
}

/**
 * Foto única de capacidad/ocupación para todo el disparo de ofertas.
 * Evita repetir el mismo query paginado por fecha × sponsor × contacto.
 */
async function cargarIndiceCitasConfirmadas() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    or: [
      { property: 'Estatus', select: { equals: 'Confirmada' } },
      { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
    ],
  });
  const indice = new Map();
  for (const fila of filas) {
    const inicio = fila.properties?.['Fecha y Hora']?.date?.start || '';
    if (!inicio) continue;
    const sponsorId = (fila.properties?.['Contacto Match']?.relation || [])[0]?.id || null;
    if (!indice.has(inicio)) indice.set(inicio, { count: 0, sponsorIds: new Set() });
    const entrada = indice.get(inicio);
    entrada.count += 1;
    if (sponsorId) entrada.sponsorIds.add(sponsorId);
  }
  return indice;
}

function obtenerFechasEvento() {
  return process.env.CITAS_FECHAS_EVENTO.split(',').map((f) => f.trim());
}

/**
 * Bloques libres de UN sponsor (capacidad de 11 mesas + ocupación propia).
 * La oferta inicial usa solo el sponsor de mayor score; no hay cruce entre varios.
 * La reserva real vuelve a validar bajo mutex; esto sigue siendo una foto.
 */
function bloquesDisponiblesParaSponsor({ sponsorPageId, indiceConfirmadas }) {
  if (!sponsorPageId) return [];
  const indice = indiceConfirmadas || new Map();
  const disponibles = [];
  for (const fecha of obtenerFechasEvento()) {
    requireHorarioConfigurado(fecha);
    for (const inicio of generarBloquesParaFecha(fecha)) {
      const entrada = indice.get(inicio) || { count: 0, sponsorIds: new Set() };
      const bloque = armarBloqueDisponibilidad({
        inicio,
        sponsorOcupado: entrada.sponsorIds.has(sponsorPageId),
        citasEnBloque: entrada.count,
      });
      if (bloque.disponible) disponibles.push(bloque);
    }
  }
  return disponibles;
}

function minutosCorteOferta() {
  const valor = process.env.CITAS_CORTE_MANANA_TARDE || '14:00';
  const match = String(valor).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`CITAS_CORTE_MANANA_TARDE inválido: "${valor}"`);
  const minutos = Number(match[1]) * 60 + Number(match[2]);
  if (minutos < 0 || minutos >= 24 * 60) {
    throw new Error(`CITAS_CORTE_MANANA_TARDE fuera de rango: "${valor}"`);
  }
  return minutos;
}

function periodoDeHorario(inicio) {
  const match = String(inicio).match(/T(\d{2}):(\d{2}):/);
  if (!match) throw new Error(`inicio ISO no parseable: ${inicio}`);
  const minutos = Number(match[1]) * 60 + Number(match[2]);
  return minutos < minutosCorteOferta() ? 'Mañana' : 'Tarde';
}

/**
 * Primero el más próximo; después alterna Mañana/Tarde si existe opción.
 * La alternancia es preferencia: si no existe, toma el siguiente cronológico.
 */
function seleccionarHorariosParaOferta(bloquesDisponibles, limite = 3) {
  const restantes = [...(bloquesDisponibles || [])]
    .filter((bloque) => bloque?.disponible !== false && bloque?.inicio)
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const elegidos = [];
  while (restantes.length > 0 && elegidos.length < limite) {
    let indice = 0;
    if (elegidos.length > 0) {
      const periodoAnterior = periodoDeHorario(elegidos[elegidos.length - 1].inicio);
      const alterno = restantes.findIndex((bloque) => periodoDeHorario(bloque.inicio) !== periodoAnterior);
      if (alterno >= 0) indice = alterno;
    }
    elegidos.push(restantes.splice(indice, 1)[0]);
  }
  return elegidos;
}

function formatearHorarioLegible(inicio) {
  const match = String(inicio).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):/);
  if (!match) throw new Error(`inicio ISO no parseable: ${inicio}`);
  const fecha = new Date(`${match[1]}T12:00:00Z`);
  const etiqueta = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(fecha);
  return `${etiqueta}, ${match[2]}:${match[3]} h`;
}

/**
 * Lista de bloques con disponible/motivo para un sponsor y fecha.
 *
 * @param {object} params
 * @param {string} params.sponsorPageId
 * @param {string} params.fecha - "2026-10-07" o "2026-10-08"
 * @returns {Promise<Array<{inicio: string, disponible: boolean, motivo: string|null}>>}
 */
async function obtenerDisponibilidadSponsor({ sponsorPageId, fecha }) {
  requireDataSourceId();

  const fechasValidas = obtenerFechasEvento();
  if (!fechasValidas.includes(fecha)) {
    const err = new Error(`"${fecha}" no es una fecha del evento. Fechas válidas: ${fechasValidas.join(', ')}`);
    err.status = 400;
    throw err;
  }

  requireHorarioConfigurado(fecha);

  const bloques = generarBloquesParaFecha(fecha);
  const confirmadas = await listarCitasConfirmadasEnFecha(fecha);

  return bloques.map((inicio) => {
    const enBloque = confirmadas.filter((c) => c.inicio === inicio);
    return armarBloqueDisponibilidad({
      inicio,
      sponsorOcupado: enBloque.some((c) => c.sponsorId === sponsorPageId),
      citasEnBloque: enBloque.length,
    });
  });
}

module.exports = {
  contarCitasEnBloque,
  sponsorOcupadoEnBloque,
  buscarPorRequestId,
  crearCitaPendiente,
  actualizarTituloCita,
  revertirCitaPendienteAMatch,
  archivarSugerenciasDelPar,
  buscarSugerenciasDelPar,
  confirmarCita,
  marcarCitaFallida,
  marcarCitaConfirmadaSinNotificar,
  confirmarNotificacionEnviada,
  buscarCitasSinNotificarParaReintentar,
  obtenerCitaPorId,
  contarCitasConfirmadasPorSponsor,
  crearCitaSugerida,
  buscarSugerenciasPendientesPorSponsor,
  marcarCitaAprobada,
  existeCitaActivaEntre,
  obtenerParesConCitaActiva,
  existeCitaActivaEntreEnCache,
  obtenerDisponibilidadSponsor,
  listarSugeridasPorAsistente,
  consultarSugeridasPorIdentificador,
  buscarCitasAprobadasSinCampana,
  cargarCitasPorAsistenteParaRecordatorio,
  scoreDeFilaCita,
  obtenerAsistentesConCitaConfirmada,
  actualizarEstadoEnvioCampana,
  marcarCampanaEnviada,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  esCandidataEnvioCampana,
  reabrirCitaParaReintento,
  listarCitasConfirmadasEnFecha,
  cargarIndiceCitasConfirmadas,
  bloquesDisponiblesParaSponsor,
  seleccionarHorariosParaOferta,
  formatearHorarioLegible,
  periodoDeHorario,
  finDeBloque,
  armarBloqueDisponibilidad,
  CAPACIDAD_MAXIMA_MESAS,
  generarBloquesParaFecha,
  requireHorarioConfigurado,
  obtenerFechasEvento,
};
