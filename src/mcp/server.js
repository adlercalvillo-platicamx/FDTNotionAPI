// src/mcp/server.js
//
// Servidor MCP de fdt-notion-api. Capa de presentación delgada: las
// herramientas NO reimplementan lógica de negocio, llaman a los mismos
// services/ ya probados por la API REST (checklist.service.js,
// matchmaking.service.js, booking.service.js).
//
// Estado (5 ago 2026): pasos 1 y 2 del orden sugerido en 10-backend-como-mcp.md
// completos — consultar_checklist (lectura), revisar_checklists_pendientes
// (lectura + actualiza estado), sugerir_matches_para_sponsor (escritura
// acotada a "Match Sugerido", con dry-run por default). Falta:
// sugerir_matches_global (paso siguiente) y decidir con Laura si
// reservar_cita se expone.
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

  return server;
}

module.exports = { crearServidorMcp };
