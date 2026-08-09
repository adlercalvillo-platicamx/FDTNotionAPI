// src/mcp/server.js
//
// Servidor MCP de fdt-notion-api. Capa de presentación delgada: las
// herramientas NO reimplementan lógica de negocio, llaman a los mismos
// services/ ya probados por la API REST (checklist.service.js,
// matchmaking.service.js, booking.service.js).
//
// Estado (6 ago 2026): pasos 1, 2 y 3 del orden sugerido en
// 10-backend-como-mcp.md completos — consultar_checklist (lectura),
// revisar_checklists_pendientes (lectura + actualiza estado),
// sugerir_matches_para_sponsor y sugerir_matches_global (escritura acotada
// a "Match Sugerido", con dry-run por default en ambas). Falta: decidir con
// Laura si reservar_cita se expone.
//
// reservar_cita NO se expone aquí ni se debe exponer sin decisión explícita
// aparte con Laura — cada cita necesita aprobación humana antes de
// ofrecerse, y el agente llamándola por una interpretación equivocada ya
// deja el daño hecho (evento real en calendario de un sponsor real).

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const checklistService = require('../services/checklist.service');
const matchmakingService = require('../services/matchmaking.service');

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

  // ── Herramienta de ESCRITURA ACOTADA — solo escribe en "Match Sugerido",
  // nunca en "Match Aprobado" ni crea citas. Soporta dry-run (escribirEnNotion:
  // false) para que el agente pueda mostrar sugerencias sin comprometer datos
  // que Liz todavía no ha revisado — usar dry-run como default salvo que el
  // usuario pida explícitamente que se guarde en Notion.
  server.tool(
    'sugerir_matches_para_sponsor',
    'Calcula candidatos sugeridos de citas 1a1 para un sponsor específico de Fashion Digital Talks 2026 (Capa 1: filtros duros + Capa 2: ranking ponderado). Por default NO escribe en Notion (dry-run) — solo cuando escribirEnNotion=true guarda el resultado en el campo "Match Sugerido" para que Liz lo revise. NO crea citas ni aprueba nada.',
    {
      sponsorPageId: z.string().describe('page_id del sponsor en Notion'),
      topN: z.number().optional().describe('Cuántos candidatos sugerir; por default, su cuota pendiente + margen configurado'),
      escribirEnNotion: z.boolean().optional().default(false).describe('Si true, guarda las sugerencias en el campo "Match Sugerido" en Notion. Default false (dry-run) — solo calcula y regresa el resultado sin escribir.'),
      incluirVirtual: z.boolean().optional().default(false).describe('Modo de excepción: incluye candidatos virtuales. Solo para sponsors que no cubrieron su cuota cerca de la fecha del evento.'),
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
    'Corre matchmaking para TODOS los sponsors activos de Fashion Digital Talks 2026 a la vez y detecta cuándo el mismo asistente sale como candidato fuerte para más de un sponsor (solapamiento) — útil para que Liz sepa a quién ofrecerle primero si se vuelve un conflicto de horario real. Operación pesada. Por default NO escribe en Notion (dry-run) — solo cuando escribirEnNotion=true guarda las sugerencias de cada sponsor en su campo "Match Sugerido". NO crea citas ni aprueba nada. Un sponsor con error individual (ej. nivel Bronce) no detiene la corrida completa, se reporta en "omitidos".',
    {
      topN: z.number().optional().describe('Cuántos candidatos sugerir por sponsor; por default, su cuota pendiente + margen configurado'),
      escribirEnNotion: z.boolean().optional().default(false).describe('Si true, guarda las sugerencias de CADA sponsor en su campo "Match Sugerido" en Notion. Default false (dry-run) — solo calcula y regresa el resultado sin escribir en ningún sponsor.'),
      incluirVirtual: z.boolean().optional().default(false).describe('Modo de excepción: incluye candidatos virtuales. Solo para sponsors que no cubrieron su cuota cerca de la fecha del evento.'),
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

  return server;
}

module.exports = { crearServidorMcp };
