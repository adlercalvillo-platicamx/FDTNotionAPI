// src/mcp/server.js
//
// Servidor MCP de fdt-notion-api. Capa de presentación delgada: las
// herramientas NO reimplementan lógica de negocio, llaman a los mismos
// services/ ya probados por la API REST (checklist.service.js,
// matchmaking.service.js, booking.service.js).
//
// Estado (23 ago 2026): 9 herramientas MCP — consultar_checklist (lectura),
// revisar_checklists_pendientes (lectura + actualiza estado),
// sugerir_matches_para_sponsor y sugerir_matches_global (escritura acotada,
// crean filas en Citas con Estatus "Sugerido", dry-run por default en
// ambas), guardar_sugerencia_individual (crea solo el par elegido),
// aprobar_match (marca una fila de Citas como "Aprobado"),
// consultar_sugeridas_para_asistente (lectura por WhatsApp o page_id),
// reintentar_notificaciones_pendientes (reenvía correos/.ics de citas en
// "Confirmada sin notificar") y disparar_campanas_aprobadas (simulación por
// default; agrupada por asistente). El campo "Match Sugerido" del sponsor quedó
// en desuso el 9 de agosto — ver 03-reglas-negocio-y-matchmaking.md y
// 10-backend-como-mcp.md §9.
// reservar_cita sigue sin exponerse aquí — ver nota abajo.
//
// reservar_cita NO se expone aquí ni se debe exponer sin decisión explícita
// aparte con Laura — cada cita necesita aprobación humana antes de
// ofrecerse, y el agente llamándola por una interpretación equivocada ya
// deja el daño hecho (evento real en calendario de un sponsor real).

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const checklistService = require('../services/checklist.service');
const matchmakingService = require('../services/matchmaking.service');
const citasService = require('../services/citas.service');
const { dispararCampanasAprobadas } = require('../services/campanas-matchmaking.service');
const { ejecutarReintentosPendientes } = require('../jobs/reintentar-notificaciones.job');

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
    'consultar_sugeridas_para_asistente',
    'Lista las citas 1a1 ya persistidas en Notion como Sugerido o Aprobado para un asistente (no recalcula matchmaking). El identificador principal es el WhatsApp de la conversación. Incluye empresa y nombre del asistente, y por cada sugerencia page_id, empresa, nombre y calendarioGoogleId del sponsor, para presentar Empresa asistente × Empresa sponsor. No escribe nada.',
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
    async ({ whatsapp, asistentePageId }) => {
      if (!whatsapp && !asistentePageId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'INVALID_INPUT',
                message: 'Pasa whatsapp (preferido) o asistentePageId.',
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        const resultado = await citasService.consultarSugeridasPorIdentificador({
          whatsapp,
          asistentePageId: whatsapp ? undefined : asistentePageId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message, code: err.code }, null, 2) }],
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

  return server;
}

module.exports = { crearServidorMcp };
