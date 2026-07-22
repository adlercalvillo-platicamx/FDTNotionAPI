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
    fuenteDato: select(p['Fuente del Dato ICP/Intencion']),
    esVip: checkbox(p['Es VIP']),
    matchSugerido: relacionIds(p['Match Sugerido']),
    dadoDeBaja: checkbox(p['Dado de Baja']),
    motivoBaja: select(p['Motivo Baja']),
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
    icpModaEcommerce: checkbox(p['ICP Moda/Ecommerce']),
    presenciaDigitalExa: texto(p['Presencia Digital (Exa)']),
  };
}

/** Obtiene un contacto por su page_id (usa la API de páginas, no la de query). */
async function obtenerContacto(pageId) {
  const pagina = await notionFetch(`/pages/${pageId}`);
  return parsearContacto(pagina);
}

/**
 * Capa 1 — filtro duro por Categoria=Asistente, acceso a citas (≠ Expo), y
 * Etapa de Negocio dentro de la lista ya traducida por la tabla de
 * equivalencia (ver matchmaking.service.js). El resto de los filtros duros
 * (exclusión de clientes actuales, cita ya existente) se aplican después en
 * JS porque necesitan texto libre / cruzar con la tabla Citas.
 */
async function buscarAsistentesCandidatos({ etapasValidas }) {
  requireDataSourceId();
  const filtroEtapas =
    etapasValidas && etapasValidas.length > 0
      ? { or: etapasValidas.map((e) => ({ property: 'Etapa de Negocio', select: { equals: e } })) }
      : null;

  const condiciones = [
    { property: 'Categoria', select: { equals: 'Asistente' } },
    { property: 'Ticket / Tipo Asistencia', select: { does_not_equal: 'Expo' } },
  ];
  if (filtroEtapas) condiciones.push(filtroEtapas);

  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter: { and: condiciones }, page_size: 100 }),
  });
  return data.results.map(parsearContacto);
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
