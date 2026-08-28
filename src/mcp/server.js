// src/mcp/server.js
//
// Servidor MCP de fdt-notion-api. Capa de presentación delgada: las
// herramientas NO reimplementan lógica de negocio, llaman a los mismos
// services/ ya probados por la API REST (checklist.service.js,
// matchmaking.service.js, booking.service.js).
//
// Estado (27 ago 2026): 12 herramientas MCP — incluye disponibilidad
// conversacional, modificar_cita y cancelar_cita. consultar_sugeridas_para_asistente
// también trae citasConfirmadas. El campo "Match Sugerido" del sponsor quedó
// en desuso el 9 de agosto.
// reservar_cita sigue sin exponerse aquí — ver nota abajo.
//
// reservar_cita NO se expone aquí ni se debe exponer sin decisión explícita
// aparte con Laura — cada cita necesita aprobación humana antes de
// ofrecerse, y el agente llamándola por una interpretación equivocada ya
// deja el daño hecho (cita real + correo). Modificar y cancelar SÍ se
// exponen (27-ago, pedido explícito): son más sensibles que aprobar_match
// y las descripciones exigen confirmación de cuál cita y qué cambio.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const checklistService = require('../services/checklist.service');
const matchmakingService = require('../services/matchmaking.service');
const citasService = require('../services/citas.service');
const contactosService = require('../services/contactos.service');
const { dispararCampanasAprobadas } = require('../services/campanas-matchmaking.service');
const { ejecutarReintentosPendientes } = require('../jobs/reintentar-notificaciones.job');
const { modificarCita, cancelarCita } = require('../services/booking.service');

const LIMITE_SUGERIDAS_PARA_OFRECER = 4;
const LIMITE_HORARIOS_PARA_OFRECER = 3;
const LIMITE_CITAS_PARA_OFRECER = 3;

function respuestaJson(payload, isError = false) {
  const result = {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
  if (isError) result.isError = true;
  return result;
}

function respuestaErrorBooking(err) {
  const payload = {
    error: err.code || 'ERROR',
    message: err.message,
  };
  if (err.detalle) Object.assign(payload, err.detalle);
  return respuestaJson(payload, true);
}

function conAvisoSiFalloElCorreo(resultado, accion) {
  if (!resultado?.notificacion_error) return resultado;
  const { categoria, mensaje } = resultado.notificacion_error;
  const aviso =
    accion === 'modificar'
      ? `El horario nuevo quedó guardado en Notion, pero el correo/.ics NO se envió (${categoria}): ${mensaje}. Dile a la persona que el cambio de horario sí está hecho y que el aviso por correo quedó pendiente.`
      : `La cita quedó cancelada en Notion y el horario ya está libre, pero el correo/.ics de baja NO se envió (${categoria}): ${mensaje}. Dile a la persona que la cancelación sí está hecha y que el aviso por correo quedó pendiente.`;
  return { ...resultado, exito_parcial: true, aviso };
}

function horarioLegible(iso) {
  if (!iso) return null;
  try {
    return citasService.formatearHorarioLegible(iso);
  } catch {
    return iso;
  }
}

async function ejecutarModificarCita({ telefono, whatsapp, citaId, sponsorEmpresa, nuevaFechaHora } = {}) {
  const telefonoResolvido = String(telefono || whatsapp || '').trim();
  const id = String(citaId || '').trim();
  if (!telefonoResolvido && !id) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'Se requiere "telefono" (WhatsApp del asistente) o "citaId".',
      },
      true
    );
  }
  if (!String(nuevaFechaHora || '').trim()) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'El campo "nuevaFechaHora" es requerido en formato ISO 8601 (ej. "2026-10-07T11:30:00-06:00").',
      },
      true
    );
  }
  try {
    const resultado = await modificarCita({
      telefono: telefonoResolvido,
      citaId: id,
      sponsorEmpresa,
      nuevaFechaHora,
    });
    const conAviso = conAvisoSiFalloElCorreo(resultado, 'modificar');
    return respuestaJson({
      ...conAviso,
      horario_nuevo_legible: horarioLegible(resultado.inicio),
      horario_anterior_legible: horarioLegible(resultado.horario_anterior),
    });
  } catch (err) {
    return respuestaErrorBooking(err);
  }
}

async function ejecutarCancelarCita({ telefono, whatsapp, citaId, sponsorEmpresa } = {}) {
  const telefonoResolvido = String(telefono || whatsapp || '').trim();
  const id = String(citaId || '').trim();
  if (!telefonoResolvido && !id) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'Se requiere "telefono" (WhatsApp del asistente) o "citaId".',
      },
      true
    );
  }
  try {
    const resultado = await cancelarCita({
      telefono: telefonoResolvido,
      citaId: id,
      sponsorEmpresa,
    });
    return respuestaJson(conAvisoSiFalloElCorreo(resultado, 'cancelar'));
  } catch (err) {
    return respuestaErrorBooking(err);
  }
}

async function ejecutarConsultarSugeridasParaAsistente({ whatsapp, asistentePageId } = {}) {
  if (!whatsapp && !asistentePageId) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'Pasa whatsapp (preferido) o asistentePageId.',
      },
      true
    );
  }
  try {
    const resultado = await citasService.consultarSugeridasPorIdentificador({
      whatsapp,
      asistentePageId: whatsapp ? undefined : asistentePageId,
      soloAprobado: true,
    });
    const sugeridas = resultado.sugeridas || [];
    const citasConfirmadas = resultado.citasConfirmadas || [];
    return respuestaJson({
      ...resultado,
      sugeridas_para_ofrecer: sugeridas.slice(0, LIMITE_SUGERIDAS_PARA_OFRECER),
      hay_mas_sugeridas: sugeridas.length > LIMITE_SUGERIDAS_PARA_OFRECER,
      citas_para_ofrecer: citasConfirmadas.slice(0, LIMITE_CITAS_PARA_OFRECER),
      hay_mas_citas: citasConfirmadas.length > LIMITE_CITAS_PARA_OFRECER,
      aviso:
        'En el chat ofrece máximo 4 sponsors (sugeridas_para_ofrecer). Citas ya confirmadas: máximo 3 (citas_para_ofrecer). Si hay_mas_* y pide más, usa las siguientes de la lista completa. No leas IDs en voz alta.',
    });
  } catch (err) {
    return respuestaJson({ error: err.message, code: err.code }, true);
  }
}

async function ejecutarConsultarDisponibilidadCita(
  {
    sponsorPageId,
    fecha,
    excluirInicios,
    whatsapp,
    asistentePageId,
    hora,
  } = {},
  { ahora = new Date() } = {}
) {
  const sponsorId = String(sponsorPageId || '').trim();
  const fechaSolicitada = String(fecha || '').trim();
  const tel = String(whatsapp || '').trim();
  const asistenteDirecto = String(asistentePageId || '').trim();
  if (!sponsorId) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'El campo "sponsorPageId" es requerido.',
      },
      true
    );
  }
  if (!tel && !asistenteDirecto) {
    return respuestaJson(
      {
        error: 'INVALID_INPUT',
        message: 'Pasa whatsapp (preferido) o asistentePageId para no ofrecer un horario que el asistente ya tiene ocupado.',
      },
      true
    );
  }

  try {
    let asistenteId = asistenteDirecto;
    if (!asistenteId) {
      const contacto = await contactosService.buscarAsistentePorWhatsApp(tel);
      if (!contacto?.id) {
        const err = new Error('No se encontró un asistente con ese WhatsApp.');
        err.code = 'CONTACTO_NO_RESUELTO';
        throw err;
      }
      asistenteId = contacto.id;
    }

    const fechas = fechaSolicitada ? [fechaSolicitada] : citasService.obtenerFechasEvento();
    const excluidos = new Set(
      (Array.isArray(excluirInicios) ? excluirInicios : []).map((v) => String(v || '').trim()).filter(Boolean)
    );
    const horaPedida = citasService.normalizarHoraPedido(hora);
    const libres = [];
    const horarioSolicitado = [];
    for (const dia of fechas) {
      const bloques = await citasService.obtenerDisponibilidadSponsor({
        sponsorPageId: sponsorId,
        fecha: dia,
        asistentePageId: asistenteId,
      });
      for (const bloque of bloques) {
        if (horaPedida && citasService.horaDeInicio(bloque.inicio) === horaPedida) {
          horarioSolicitado.push({
            inicio: bloque.inicio,
            fin: bloque.fin,
            disponible:
              Boolean(bloque.disponible) &&
              !excluidos.has(bloque.inicio) &&
              citasService.esHorarioOfrecible(bloque.inicio, ahora),
            motivo: bloque.motivo,
            horario_legible: horarioLegible(bloque.inicio),
          });
        }
        if (
          !bloque.disponible ||
          excluidos.has(bloque.inicio) ||
          !citasService.esHorarioOfrecible(bloque.inicio, ahora)
        ) {
          continue;
        }
        libres.push({
          inicio: bloque.inicio,
          fin: bloque.fin,
          horario_legible: horarioLegible(bloque.inicio),
        });
      }
    }

    const opciones = citasService
      .seleccionarHorariosParaOferta(libres, LIMITE_HORARIOS_PARA_OFRECER, {
        ahora,
        priorizarHora: horaPedida,
      })
      .map((bloque) => ({
        inicio: bloque.inicio,
        fin: bloque.fin,
        horario_legible: bloque.horario_legible,
      }));

    const pedidoLibre = horarioSolicitado.some((s) => s.disponible);
    return respuestaJson({
      sponsor_notion_id: sponsorId,
      opciones_para_ofrecer: opciones,
      horario_solicitado: horaPedida ? horarioSolicitado : undefined,
      hay_mas: libres.length > opciones.length,
      total_libres: libres.length,
      aviso: horaPedida
        ? pedidoLibre
          ? `El usuario pidió las ${horaPedida}. Esa hora SÍ está libre (horario_solicitado.disponible=true) y ya va en opciones_para_ofrecer. Dilo explícitamente; no la niegues porque no salía en las casillas. Ofrece como máximo estas 3.`
          : `El usuario pidió las ${horaPedida}. Esa hora NO está libre (mira horario_solicitado). Dilo así y ofrece SOLO las alternativas de opciones_para_ofrecer. No inventes otra hora.`
        : 'Ofrece SOLO estas 3 opciones en el chat, en el mismo orden. Si pide una hora concreta (ej. las 15:00), vuelve a llamar con hora=15:00 (y fecha si dijo el día). Si pide otras horas, excluirInicios = los inicio ya ofrecidos. Foto del momento: reservar_cita / modificar_cita revalidan el bloque (sponsor y asistente).',
    });
  } catch (err) {
    return respuestaJson(
      {
        error: err.code || (err.status === 503 ? 'HORARIO_NO_CONFIGURADO' : 'ERROR'),
        message: err.message,
      },
      true
    );
  }
}

function crearServidorMcp() {
  const server = new McpServer({ name: 'fdt-notion-api', version: '1.0.0' });

  // ── Herramienta de LECTURA — segura, el agente la puede llamar libremente
  server.tool(
    'consultar_checklist',
    'Consulta qué le falta a un sponsor o speaker de Fashion Digital Talks 2026 para tener su información completa. Recibe el nombre aproximado de la persona o empresa y regresa si está completo y, si no, qué campos faltan.',
    {
      nombre: z.string().describe('Nombre aproximado del contacto o de su empresa'),
    },
    async ({ nombre }) => {
      const resultado = await checklistService.consultarChecklist(nombre);
      return {
        content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
      };
    }
  );

  // ── Herramienta de LECTURA + actualiza un campo de estado — bajo riesgo
  server.tool(
    'revisar_checklists_pendientes',
    'Corre un barrido completo sobre todos los Sponsor y Speaker activos de Fashion Digital Talks 2026, actualiza su estado de checklist en Notion, y regresa la lista de quiénes quedaron incompletos y qué les falta. Es una operación pesada — avisa antes de correrla si no es evidente que el usuario la pidió explícitamente.',
    {},
    async () => {
      const resultado = await checklistService.revisarChecklistsPendientes();
      return {
        content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
      };
    }
  );

  // ── Herramienta de ESCRITURA ACOTADA — crea filas en Citas con Estatus
  // "Sugerido" (nunca las mueve a "Aprobado" — eso es aprobar_match — ni
  // crea citas reales). Soporta dry-run (escribirEnNotion: false) para que
  // el agente pueda mostrar sugerencias sin comprometer datos que Liz
  // todavía no ha revisado — usar dry-run como default salvo que el
  // usuario pida explícitamente que se guarde en Notion.
  server.tool(
    'sugerir_matches_para_sponsor',
    'Calcula candidatos sugeridos de citas 1a1 para un sponsor específico de Fashion Digital Talks 2026 (Capa 1: filtros duros + Capa 2: ranking ponderado). Presenta cada match por empresa (empresa del asistente × empresa del sponsor); los nombres de persona son solo fallback si falta Empresa. Por default NO escribe en Notion (dry-run) — solo cuando escribirEnNotion=true crea una fila nueva en la tabla Citas por cada candidato, con Estatus "Sugerido", para que Liz lo revise y decida con aprobar_match. NO crea citas reales ni aprueba nada.',
    {
      sponsorPageId: z.string().describe('page_id del sponsor en Notion'),
      topN: z.number().optional().describe('Cuántos candidatos sugerir; por default, su cuota pendiente + margen configurado'),
      escribirEnNotion: z.boolean().optional().default(false).describe('Si true, crea una fila en Citas por cada candidato con Estatus "Sugerido". Default false (dry-run) — solo calcula y regresa el resultado sin escribir.'),
      incluirVirtual: z.boolean().optional().default(false).describe('DEPRECADO: Virtual ya entra por default y este parámetro no cambia la elegibilidad; se conserva solo por compatibilidad.'),
    },
    async ({ sponsorPageId, topN, escribirEnNotion, incluirVirtual }) => {
      try {
        const resultado = await matchmakingService.sugerirMatchesParaSponsor(sponsorPageId, {
          topN,
          escribirEnNotion,
          incluirVirtual,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        // Errores esperados del servicio (categoría incorrecta, nivel sin citas
        // 1a1, etc.) se regresan como mensaje, no como excepción sin contexto.
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // Guarda solo el par elegido de un dry-run previo. La tool recalcula y
  // valida el match; el agente nunca manda score ni explicación inventados.
  server.tool(
    'guardar_sugerencia_individual',
    'Guarda en Notion UNA sola sugerencia de matchmaking previamente mostrada, creando únicamente la fila de Citas de ese par con Estatus "Sugerido" y título por empresas. Recalcula y valida que el par siga siendo elegible, y devuelve siempre la explicación del match generada por el backend. Usar cuando el usuario elija una sugerencia específica de un resultado individual o global y pida guardar solo esa; no vuelve a guardar el bloque completo.',
    {
      sponsorPageId: z.string().describe('page_id exacto del sponsor en Notion'),
      asistentePageId: z.string().describe('page_id exacto del asistente elegido en Notion'),
    },
    async ({ sponsorPageId, asistentePageId }) => {
      try {
        const resultado = await matchmakingService.guardarSugerenciaIndividual(
          sponsorPageId,
          asistentePageId
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // ── Herramienta de ESCRITURA ACOTADA, versión masiva — corre
  // sugerir_matches_para_sponsor para TODOS los sponsors activos y detecta
  // solapamientos (mismo asistente sugerido para más de un sponsor). Es
  // pesada (recorre todos los sponsors) y con más superficie de escritura
  // si escribirEnNotion=true (potencialmente todos a la vez, no solo uno)
  // — avisar antes de correrla si no es evidente que el usuario la pidió
  // explícitamente, con más razón que revisar_checklists_pendientes.
  // Dry-run por default, mismo patrón que sugerir_matches_para_sponsor.
  server.tool(
    'sugerir_matches_global',
    'Corre matchmaking para TODOS los sponsors activos de Fashion Digital Talks 2026 a la vez y detecta cuándo el mismo asistente sale como candidato fuerte para más de un sponsor (solapamiento). Presenta los matches por empresa; los nombres de persona son solo fallback. Operación pesada. Por default NO escribe en Notion (dry-run) — solo cuando escribirEnNotion=true crea filas en Citas con Estatus "Sugerido" para los candidatos de cada sponsor. NO crea citas reales ni aprueba nada. Un sponsor con error individual (ej. nivel Bronce) no detiene la corrida completa, se reporta en "omitidos".',
    {
      topN: z.number().optional().describe('Cuántos candidatos sugerir por sponsor; por default, su cuota pendiente + margen configurado'),
      escribirEnNotion: z.boolean().optional().default(false).describe('Si true, crea filas en Citas con Estatus "Sugerido" para los candidatos de CADA sponsor. Default false (dry-run) — solo calcula y regresa el resultado sin escribir en ningún sponsor.'),
      incluirVirtual: z.boolean().optional().default(false).describe('DEPRECADO: Virtual ya entra por default y este parámetro no cambia la elegibilidad; se conserva solo por compatibilidad.'),
    },
    async ({ topN, escribirEnNotion, incluirVirtual }) => {
      try {
        const resultado = await matchmakingService.sugerirMatchesGlobal({
          topN,
          escribirEnNotion,
          incluirVirtual,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // HERRAMIENTA NUEVA — aprobar_match (9 de agosto)
  //
  // Primera herramienta MCP que escribe fuera del campo "Match Sugerido" —
  // marca una fila de Citas como "Aprobado". Sigue existiendo la misma
  // regla de fondo del proyecto: NUNCA crea una cita real ni toca Calendar.
  // Eso lo sigue haciendo exclusivamente reservar_cita (fuera del MCP, API
  // REST separada, con su propia exigencia de aprobación humana previa a
  // ESE paso).
  // ═══════════════════════════════════════════════════════════════
  server.tool(
    'aprobar_match',
    'Marca como aprobado un match específico entre un sponsor y un asistente de Fashion Digital Talks 2026, previamente calculado por sugerir_matches_para_sponsor o sugerir_matches_global con escribirEnNotion=true. SOLO usar cuando el usuario ya confirmó explícitamente, en la conversación, que quiere aprobar ESE match específico — nunca inferirlo de un comentario ambiguo como "se ve bien" o de simplemente haber mostrado las sugerencias. No crea ninguna cita ni toca Google Calendar — solo marca la decisión de negocio en Notion. Reservar la cita real es un paso posterior y separado (reservar_cita), que además requiere su propia aprobación explícita.',
    {
      sponsorPageId: z.string().describe('page_id del sponsor en Notion'),
      asistentePageId: z.string().describe('page_id del asistente en Notion'),
    },
    async ({ sponsorPageId, asistentePageId }) => {
      try {
        const resultado = await matchmakingService.aprobarMatch(sponsorPageId, asistentePageId);
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // reintentar_notificaciones_pendientes (18 de agosto)
  //
  // A demanda — NO es un cron y NO tiene tope de llamadas. Tras corregir
  // un email en Contactos o un problema de SMTP, el agente dispara este
  // barrido. Si alguna falla, el detalle trae categoria + mensaje.
  // ═══════════════════════════════════════════════════════════════
  server.tool(
    'reintentar_notificaciones_pendientes',
    'Reenvía el correo de confirmación (.ics) de todas las citas 1a1 de Fashion Digital Talks 2026 que quedaron en estatus "Confirmada sin notificar". Usar cuando ya se corrigió un dato (email en Contactos, credenciales SMTP, etc.) o cuando el usuario pide explícitamente reenviar los avisos pendientes. No crea ni cancela citas — solo reenvía notificaciones. Sin tope de llamadas. Si alguna falla, el resultado incluye el motivo (categoria y mensaje) por cita.',
    {},
    async () => {
      try {
        const resultado = await ejecutarReintentosPendientes();
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'disparar_campanas_aprobadas',
    'Procesa manualmente todas las filas Aprobado pendientes de campaña, agrupadas por asistente para enviar como máximo un mensaje por persona. Por default corre en simulación: devuelve payloads y decisiones sin llamar WhatsApp ni marcar Notion. El envío real solo se habilita mediante configuración explícita del backend, nunca por parámetros del agente.',
    {},
    async () => {
      try {
        const resultado = await dispararCampanasAprobadas();
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'consultar_sugeridas_para_asistente',
    'Lista las citas 1a1 YA APROBADAS de un asistente (sugeridas: solo Aprobado) y las ya reales (citasConfirmadas). En el chat ofrece máximo 4 sponsors a la vez: usa sugeridas_para_ofrecer; si hay_mas_sugeridas y pide más, nombra las siguientes de la lista completa. Citas confirmadas: máximo 3 (citas_para_ofrecer). Una fila Sugerido no se ofrece. Úsala también para reagendar o cancelar (citaId y sponsor_notion_id de citasConfirmadas). No recalcula matchmaking. Identificador: WhatsApp de la conversación. No escribe nada.',
    {
      whatsapp: z
        .string()
        .optional()
        .describe('Teléfono WhatsApp del asistente (identificador principal). Con o sin +52.'),
      asistentePageId: z
        .string()
        .optional()
        .describe('page_id del asistente en Notion. Solo si no hay teléfono.'),
    },
    async ({ whatsapp, asistentePageId }) =>
      ejecutarConsultarSugeridasParaAsistente({ whatsapp, asistentePageId })
  );

  server.tool(
    'consultar_disponibilidad_cita',
    'Consulta horarios REALES libres para un sponsor de cita 1a1, excluyendo bloques donde el asistente ya tiene cita confirmada. Devuelve como máximo 3 opciones (opciones_para_ofrecer) en el mismo orden; nunca listes más ni reordenes. Sin fecha: casillas Día 1 Mañana / Día 1 Tarde / Día 2. Con fecha: solo ese día. Si el usuario pide una hora concreta (ej. las 15:00), PASA hora=15:00 y fecha si dijo el día — no niegues esa hora solo porque no salía en las 3 casillas; mira horario_solicitado. Si hay_mas=true y pide otras horas, excluirInicios. Pasa whatsapp (o asistentePageId). Nunca inventes una hora. Foto: reservar_cita / modificar_cita revalidan. También al reagendar.',
    {
      sponsorPageId: z
        .string()
        .describe('page_id exacto del sponsor, copiado de consultar_sugeridas_para_asistente o de citasConfirmadas.'),
      whatsapp: z
        .string()
        .optional()
        .describe('WhatsApp del asistente de esta conversación. Obligatorio si no pasas asistentePageId.'),
      asistentePageId: z
        .string()
        .optional()
        .describe('page_id del asistente. Solo si no hay teléfono.'),
      fecha: z
        .string()
        .optional()
        .describe('Día YYYY-MM-DD. Si se omite, consulta todos los días del evento.'),
      hora: z
        .string()
        .optional()
        .describe('Hora concreta que pidió (HH:MM, ej. "15:00"). Si está libre, entra en las 3 opciones. Si no, horario_solicitado.disponible=false.'),
      excluirInicios: z
        .array(z.string())
        .optional()
        .describe('ISO de horarios que ya ofreciste, para pedir las siguientes 3 opciones.'),
    },
    async (args) => ejecutarConsultarDisponibilidadCita(args)
  );

  server.tool(
    'modificar_cita',
    'Cambia el horario de una cita 1a1 YA CONFIRMADA. Antes consulta consultar_disponibilidad_cita con el sponsor_notion_id de esa cita y ofrece SOLO las 3 opciones_para_ofrecer. Identifica la cita con citaId o telefono; si hay varias, VARIAS_CITAS_ACTIVAS — pregunta cuál (máximo 3 nombres) y vuelve con citaId o sponsorEmpresa. nuevaFechaHora = el inicio ISO de la opción elegida, nunca inventado. SOLO cuando confirmó explícitamente mover ESA cita a ESE horario. El .ics se envía por correo.',
    {
      telefono: z
        .string()
        .optional()
        .describe('WhatsApp del asistente. El servidor valida que la cita sea de esa persona.'),
      whatsapp: z.string().optional().describe('Alias de telefono.'),
      citaId: z
        .string()
        .optional()
        .describe('page_id de la fila en Citas. Laura/Liz pueden usarlo solo, sin teléfono.'),
      sponsorEmpresa: z
        .string()
        .optional()
        .describe('Desambigua cuando el teléfono tiene varias citas activas (ej. "Platica").'),
      nuevaFechaHora: z
        .string()
        .describe('Horario nuevo en ISO 8601 con offset (ej. "2026-10-07T12:00:00-06:00").'),
    },
    async (args) => ejecutarModificarCita(args)
  );

  server.tool(
    'cancelar_cita',
    'Cancela una cita 1a1 YA CONFIRMADA. Identifica con citaId o telefono; si hay varias, VARIAS_CITAS_ACTIVAS — ofrece máximo 3 en el chat, pregunta cuál y vuelve con citaId o sponsorEmpresa. SOLO cuando confirmó explícitamente cancelar ESA cita. No inferirlo de "ya no va a poder" sin un sí claro. Envía el .ics de baja por correo y libera el horario.',
    {
      telefono: z
        .string()
        .optional()
        .describe('WhatsApp del asistente. El servidor valida que la cita sea de esa persona.'),
      whatsapp: z.string().optional().describe('Alias de telefono.'),
      citaId: z
        .string()
        .optional()
        .describe('page_id de la fila en Citas. Laura/Liz pueden usarlo solo, sin teléfono.'),
      sponsorEmpresa: z
        .string()
        .optional()
        .describe('Desambigua cuando el teléfono tiene varias citas activas (ej. "Platica").'),
    },
    async (args) => ejecutarCancelarCita(args)
  );

  return server;
}

module.exports = {
  crearServidorMcp,
  ejecutarModificarCita,
  ejecutarCancelarCita,
  ejecutarConsultarSugeridasParaAsistente,
  ejecutarConsultarDisponibilidadCita,
};
