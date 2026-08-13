// src/services/contactos.service.js
//
// Queries y escrituras sobre `Contactos` (matchmaking + checklist). Cliente
// REST directo a Notion (mismo criterio que citas.service.js: código
// determinístico, no MCP).
//
// Requiere NOTION_CONTACTOS_DATA_SOURCE_ID en variables de entorno
// (usa a0bc0e2f-e795-4931-b647-8a311d855c07 para la tabla activa).

const { notionFetch } = require('../utils/notion-client');

const CONTACTOS_DATA_SOURCE_ID = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;

function requireDataSourceId() {
  if (!CONTACTOS_DATA_SOURCE_ID) throw new Error('Falta NOTION_CONTACTOS_DATA_SOURCE_ID en variables de entorno');
}

// Helpers de parseo — la API de Notion regresa cada propiedad envuelta en su
// tipo (rich_text[0].plain_text, select.name, multi_select[].name, etc.).
// Estos helpers lo aplanan a un objeto simple para trabajar cómodo.
const texto = (prop) => prop?.rich_text?.[0]?.plain_text || prop?.title?.[0]?.plain_text || '';
const select = (prop) => prop?.select?.name || null;
const multiSelect = (prop) => (prop?.multi_select || []).map((o) => o.name);
const numero = (prop) => (typeof prop?.number === 'number' ? prop.number : null);
const checkbox = (prop) => prop?.checkbox === true;
const relacionIds = (prop) => (prop?.relation || []).map((r) => r.id);
const email = (prop) => prop?.email || '';
const telefono = (prop) => prop?.phone_number || '';
const url = (prop) => prop?.url || '';

/** Convierte una página cruda de la API de Notion a un objeto plano para matchmaking. */
function parsearContacto(pagina) {
  const p = pagina.properties;
  return {
    id: pagina.id,
    nombre: texto(p['Nombre']),
    categoria: select(p['Categoria']),
    empresa: texto(p['Empresa']),
    rolPuesto: texto(p['Rol / Puesto']),
    servicios: texto(p['Servicios / Producto']),
    intencionComercial: texto(p['Intencion Comercial']),
    ticketTipo: select(p['Ticket / Tipo Asistencia']),
    etapaDeNegocio: select(p['Etapa de Negocio']),
    etapaClienteBuscada: multiSelect(p['Etapa Cliente Buscada']),
    solucion: multiSelect(p['Solucion']),
    puestosBuscados: multiSelect(p['Puestos Buscados']),
    clientesActuales: texto(p['Clientes Actuales']),
    clientesPotencialesDeseados: texto(p['Clientes Potenciales Deseados']),
    nivelPatrocinio: select(p['Nivel de Patrocinio']),
    citasMinimasPrometidas: numero(p['Citas Minimas Prometidas']) || 0,
    // Agregado 12 de agosto — soporte multi-calendario. Un ID por sponsor,
    // en vez de un solo sponsor_calendario_id fijo por .env. Vacío = sponsor
    // todavía sin calendario dedicado creado (ver 09-matchmaking-directo-2026.md).
    // No confundir con un campo obligatorio: solo se necesita al momento de
    // reservar_cita, no antes.
    calendarioGoogleId: texto(p['Calendario Google ID']),
    fuenteDato: select(p['Fuente del Dato ICP/Intencion']),
    esVip: checkbox(p['Es VIP']),
    matchSugerido: relacionIds(p['Match Sugerido']),
    dadoDeBaja: checkbox(p['Dado de Baja']),
    motivoBaja: select(p['Motivo Baja']),
    // ── Campos del REGISTRO 2026 (Ticketópolis rediseñado) ──────────────
    // Estos son los que hacen posible el matchmaking DIRECTO — ver
    // 09-matchmaking-directo-2026.md. Antes de julio 2026 no existían y
    // el match se hacía con heurística de palabras clave sobre texto libre.
    area: select(p['Area']),                              // ↔ Puestos Buscados del sponsor (mismas 11 opciones)
    solucionesBuscadas: multiSelect(p['Soluciones Buscadas']), // ↔ Solucion del sponsor (mismas 12 opciones)
    otraSolucionBuscada: texto(p['Otra Solucion Buscada']),    // campo abierto, NO se usa para el match automático
    // ⚠️ CAMBIÓ el 12 de agosto: de checkbox a select ("Sí" / "No" / vacío).
    // Motivo: un checkbox de Notion no distingue "nunca contestó" de
    // "contestó que no" — ambos llegan como false, y eso rompía la regla de
    // negocio de Laura (ver más abajo, en buscarAsistentesCandidatos). Con
    // select, quiereCitas1a1 vale exactamente 'Sí', 'No', o null — un tercer
    // estado real. Solo aplica a Presencial; VIP lo trae por default (nunca
    // se le pregunta, ver comentario de buscarAsistentesCandidatos).
    quiereCitas1a1: select(p['Quiere Citas 1a1']),
    formatoRegistro: select(p['Formato Registro']),       // '2026' | 'Legacy pre-2026'
    giroIndustria: select(p['Giro / Industria']),
    // Campos legacy — contactos de años anteriores, con el formato viejo.
    // No sirven para matchmaking directo (ver doc), son contexto histórico.
    etapaDeNegocioLegacy: select(p['Etapa de Negocio (Legacy)']),
    giroIndustriaLegacy: select(p['Giro / Industria (Legacy)']),
    // Campos de checklist (Sponsor + Speaker):
    esSpeaker: checkbox(p['Es Speaker']),
    email: email(p['Email']),
    whatsapp: telefono(p['WhatsApp']),
    bio: texto(p['Bio']),
    fotoSpeaker: url(p['Foto Speaker']),
    sitioWebEmpresa: url(p['Sitio Web Empresa']),
    logoEmpresaSpeaker: url(p['Logo Empresa Speaker']),
    // ⚠️ Instagram, LinkedIn y Web/Redes son RICH_TEXT, no URL — la gente a
    // veces solo da su usuario ("@boutiquemarea") o un dominio sin protocolo
    // ("textilesdelbajio.mx"), no siempre una URL completa. No asumas que
    // siempre vas a poder abrir esto directo como link sin normalizar primero.
    instagram: texto(p['Instagram']),
    linkedIn: texto(p['LinkedIn']),
    webRedes: texto(p['Web / Redes']),
    checklistCompletado: checkbox(p['Checklist Completado']),
    // Campos de enriquecimiento con Exa (ver contexto-luis-exa-enriquecimiento.md):
    giroDetectadoExa: texto(p['Giro Detectado (Exa)']),
    tamanoEmpresaExa: texto(p['Tamano Empresa (Exa)']),
    modeloNegocioExa: select(p['Modelo de Negocio (Exa)']),
    madurezEcommerceExa: texto(p['Madurez Ecommerce (Exa)']),
    // ⚠️ ICP Moda/Ecommerce cambió de checkbox a SELECT (Sí/No/Ambiguo) —
    // ver 02-schema-notion-completo.md. Leerlo como checkbox daba siempre false.
    icpModaEcommerce: select(p['ICP Moda/Ecommerce']),
    presenciaDigitalExa: texto(p['Presencia Digital (Exa)']),
  };
}

/** Obtiene un contacto por su page_id (usa la API de páginas, no la de query). */
async function obtenerContacto(pageId) {
  const pagina = await notionFetch(`/pages/${pageId}`);
  return parsearContacto(pagina);
}

/**
 * Capa 1 — filtros duros que Notion puede resolver en un solo query.
 *
 * ELEGIBILIDAD POR TIPO DE BOLETO (confirmado por Liz, sesión del 24 de julio):
 *   - "Presencial VIP" → SIEMPRE elegible. Las citas vienen incluidas en el
 *     boleto, por eso a los VIP ni siquiera se les hace la pregunta de opt-in.
 *   - "Presencial"     → elegible SOLO si marcó "Quiere Citas 1a1" = true
 *     (es el único tipo de boleto que trae la pregunta "¿Te gustaría tener
 *     reuniones con proveedores relevantes durante el evento?").
 *   - "Expo"           → NUNCA. Solo da acceso al piso de exhibición.
 *   - "Virtual"        → NUNCA por default. Solo entra si se pasa
 *     `incluirVirtual: true`, que es el escenario de excepción ya acordado
 *     con Laura: si a una semana del evento un sponsor no logró cubrir su
 *     cuota prometida, se amplía la búsqueda a virtuales. Liz confirmó que
 *     los virtuales SÍ tienen "Etapa de Negocio", pero NO tienen
 *     "Soluciones Buscadas" ni "Area" — así que sus matches siempre van a
 *     ser de menor calidad. No activarlo salvo en ese caso de excepción.
 *
 * También excluye "Dado de Baja" — no tiene sentido proponer una cita a
 * alguien que pidió no ser contactado.
 *
 * El resto de los filtros duros (exclusión de clientes actuales, cita ya
 * existente con ese sponsor) se aplican después en JS: necesitan comparar
 * texto libre o cruzar con la tabla Citas.
 *
 * @param {object} params
 * @param {string[]|null} params.etapasValidas - valores de "Etapa de Negocio"
 *   aceptados, ya expandidos con alias (ver matchmaking.service.js). null = no filtrar.
 * @param {boolean} [params.incluirVirtual=false] - modo de excepción, ver arriba.
 */
async function buscarAsistentesCandidatos({ etapasValidas, incluirVirtual = false }) {
  requireDataSourceId();

  // Elegibilidad de citas según tipo de boleto.
  //
  // ⚠️ Notion permite máximo 2 niveles de anidamiento en filtros compuestos
  // (confirmado en developers.notion.com/reference/post-database-query-filter,
  // "Nesting is supported up to two levels deep"). La condición real es
  // "Presencial VIP" OR ("Presencial" AND "Quiere Citas 1a1"), pero como el
  // filtro raíz { and: condiciones } ya es nivel 1, meter ese "and" interno
  // dentro del "or" de aquí llegaría a nivel 3 y Notion lo rechaza
  // (bug encontrado el 5 de agosto: bloqueaba sugerir_matches_para_sponsor
  // para CUALQUIER sponsor que llegara a esta función).
  //
  // Fix: bajamos "Quiere Citas 1a1" del filtro de Notion y lo aplicamos en
  // JS después de traer los resultados — mismo patrón que ya se usa abajo
  // para "empresa mencionada" y "cita ya existente" (ver comentario más
  // arriba: "El resto de los filtros duros... se aplican después en JS").
  // El filtro de Notion queda en solo 2 niveles: and (raíz) → or (tipo de
  // boleto elegible, sin el and interno).
  const tiposBoletoElegibles = ['Presencial VIP', 'Presencial'];
  if (incluirVirtual) {
    tiposBoletoElegibles.push('Virtual');
  }

  // Filtro de Giro/Industria — agregado 12 de agosto, confirmado por Laura
  // en la demo del 11 de agosto: "todo lo demás, no me interesa que tengan
  // citas". Aplica a TODOS los boletos elegibles, VIP incluido (confirmado
  // con Adler el 12 de agosto — no hay excepción para VIP).
  // Los proveedores de servicios (marketing, tecnología, logística, etc.)
  // no se sientan con otros proveedores de servicios (que es el perfil de
  // los sponsors) — se sientan con marcas de moda, retailers y manufactura.
  const GIROS_ELEGIBLES_MATCHMAKING = [
    'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)',
    'Retailer / tienda multimarca / Marketplace',
    'Manufactura / produccion / sourcing',
  ];

  const condiciones = [
    { property: 'Categoria', select: { equals: 'Asistente' } },
    { property: 'Dado de Baja', checkbox: { equals: false } },
    { or: tiposBoletoElegibles.map((tipo) => ({ property: 'Ticket / Tipo Asistencia', select: { equals: tipo } })) },
    { or: GIROS_ELEGIBLES_MATCHMAKING.map((giro) => ({ property: 'Giro / Industria', select: { equals: giro } })) },
  ];

  if (etapasValidas && etapasValidas.length > 0) {
    condiciones.push({
      or: etapasValidas.map((e) => ({ property: 'Etapa de Negocio', select: { equals: e } })),
    });
  }

  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter: { and: condiciones }, page_size: 100 }),
  });

  // Post-filtrado en JS: "Presencial" es elegible salvo que haya marcado
  // EXPLÍCITAMENTE 'No'.
  //
  // ⚠️ CORREGIDO el 12 de agosto — comportamiento anterior incorrecto: exigía
  // quiereCitas1a1 === true (cuando el campo aún era checkbox), lo que
  // excluía en silencio a los contactos con el campo vacío (28 de 55 en la
  // base real, registrados antes de que existiera la pregunta en el
  // formulario — confirmado contra el CSV original de Ticketópolis el 12 de
  // agosto). Decisión de Laura en la demo del 11 de agosto, cita textual:
  // "yo descartaría a los que expresamente te pusieron no" — se excluye
  // SOLO 'No' explícito, no la ausencia de dato.
  // El campo se convirtió de checkbox a select ('Sí'/'No') el mismo día para
  // que esta distinción fuera posible de representar en Notion (ver
  // parsearContacto arriba) — con checkbox, vacío y 'No' eran indistinguibles
  // y este fix no podía funcionar sin importar cómo se escribiera la
  // condición.
  // "Presencial VIP" sigue siempre elegible (las citas vienen incluidas en
  // el boleto, ni siquiera se le hace la pregunta) y "Virtual" (si
  // incluirVirtual=true) tampoco requiere este campo — confirmado por Liz,
  // sesión del 24 de julio, ver comentario arriba.
  const candidatos = data.results.map(parsearContacto).filter((c) => {
    if (c.ticketTipo === 'Presencial') return c.quiereCitas1a1 !== 'No';
    return true; // Presencial VIP y Virtual (si aplica) ya vienen filtrados por Notion
  });

  return candidatos;
}

/**
 * Escribe la lista de candidatos sugeridos EN EL SPONSOR (no en cada
 * asistente) — así Liz revisa un sponsor y ve de una vez sus top candidatos.
 * Esto es una decisión de diseño mía, no algo confirmado por Laura; si el
 * flujo real de revisión de Liz es al revés (por asistente), hay que
 * invertir el lado en el que se escribe.
 *
 * Sobrescribe la lista completa en cada corrida — no hace merge con
 * sugerencias previas. Nunca toca "Match Aprobado": esa casilla es de
 * aprobación humana y este código no la puede marcar.
 */
async function sugerirMatches({ sponsorPageId, asistentePageIds }) {
  return notionFetch(`/pages/${sponsorPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Match Sugerido': { relation: asistentePageIds.map((id) => ({ id })) },
      },
    }),
  });
}

/**
 * Verifica si un email o teléfono ya pertenece a un contacto marcado como
 * "Dado de Baja" — DEBE llamarse en dos momentos, sin excepción:
 *   1. Antes de crear un contacto nuevo durante una importación (si la
 *      persona ya estaba dada de baja, no se reactiva sola solo porque
 *      reapareció en un archivo nuevo).
 *   2. Antes de que Agente 3 envíe cualquier mensaje de prospección.
 *
 * No es responsabilidad de esta función decidir qué hacer con el
 * resultado — solo informa. El proceso que la llama es quien debe
 * bloquear el envío/la reactivación.
 */
async function buscarDadoDeBajaPorEmailOTelefono({ email, telefono }) {
  requireDataSourceId();
  const condicionesContacto = [];
  if (email) condicionesContacto.push({ property: 'Email', email: { equals: email } });
  if (telefono) condicionesContacto.push({ property: 'WhatsApp', phone_number: { equals: telefono } });
  if (condicionesContacto.length === 0) return null;

  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [{ property: 'Dado de Baja', checkbox: { equals: true } }, { or: condicionesContacto }],
      },
    }),
  });
  return data.results[0] ? parsearContacto(data.results[0]) : null;
}

/**
 * Búsqueda por nombre aproximado — para cuando Liz/Laura preguntan "cómo va
 * fulano" y no tienen el page_id a la mano. Usa "contains", no igualdad
 * exacta, así que puede regresar varios candidatos (ambigüedad real: puede
 * haber dos personas con nombre parecido).
 */
async function buscarContactoPorNombre(nombreAproximado) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Nombre', title: { contains: nombreAproximado } },
      page_size: 10,
    }),
  });
  return data.results.map(parsearContacto);
}

/**
 * Todos los Sponsor + Speaker activos (excluye Dado de Baja) — universo que
 * recorre el cron de checklist en cada corrida.
 */
async function listarSponsorsYSpeakersActivos() {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Dado de Baja', checkbox: { equals: false } },
          {
            or: [
              { property: 'Categoria', select: { equals: 'Sponsor' } },
              { property: 'Es Speaker', checkbox: { equals: true } },
            ],
          },
        ],
      },
      page_size: 100,
    }),
  });
  return data.results.map(parsearContacto);
}

/** Escribe el resultado de evaluarChecklist() de vuelta en Notion. */
async function actualizarChecklist({ contactoId, completo, detalle }) {
  return notionFetch(`/pages/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Checklist Completado': { checkbox: completo },
        'Detalle Checklist': { rich_text: [{ text: { content: detalle.slice(0, 1900) } }] },
      },
    }),
  });
}

/**
 * Todos los Sponsor activos (excluye Dado de Baja) — universo que recorre
 * la orquestación global de matchmaking (sugerirMatchesGlobal). No excluye
 * Bronce aquí; eso lo hace matchmaking.service.js por sponsor individual,
 * para que quede registrado en "omitidos" en vez de desaparecer en silencio.
 */
async function listarSponsorsActivos() {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Categoria', select: { equals: 'Sponsor' } },
          { property: 'Dado de Baja', checkbox: { equals: false } },
        ],
      },
      page_size: 100,
    }),
  });
  return data.results.map(parsearContacto);
}

module.exports = {
  parsearContacto,
  obtenerContacto,
  buscarAsistentesCandidatos,
  sugerirMatches,
  buscarDadoDeBajaPorEmailOTelefono,
  buscarContactoPorNombre,
  listarSponsorsYSpeakersActivos,
  actualizarChecklist,
  listarSponsorsActivos,
};
