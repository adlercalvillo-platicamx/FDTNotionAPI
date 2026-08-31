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
// Notion puede devolver un title/rich_text repartido en varios fragmentos.
// Leer solo [0] truncaba silenciosamente nombres o empresas importados con
// más de una anotación. Se concatenan todos los fragmentos, en orden.
const texto = (prop) => {
  const fragmentos = prop?.rich_text || prop?.title || [];
  return fragmentos.map((fragmento) => fragmento?.plain_text || fragmento?.text?.content || '').join('');
};
const select = (prop) => prop?.select?.name || null;
const multiSelect = (prop) => (prop?.multi_select || []).map((o) => o.name);
const numero = (prop) => (typeof prop?.number === 'number' ? prop.number : null);
const checkbox = (prop) => prop?.checkbox === true;
const relacionIds = (prop) => (prop?.relation || []).map((r) => r.id);
const email = (prop) => prop?.email || '';
const telefono = (prop) => prop?.phone_number || '';
const url = (prop) => prop?.url || '';
const fecha = (prop) => prop?.date?.start || null;

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
    ultimaCampanaEnviada: select(p['Última Campaña Enviada']),
    fechaUltimaCampana: fecha(p['Fecha Última Campaña']),
    reactivacionesEnviadas: numero(p['Reactivaciones Enviadas']) || 0,
    recordatorioEventoEnviado: checkbox(p['Recordatorio Evento Enviado']),
    bio: texto(p['Bio']),
    fotoSpeaker: url(p['Foto Speaker']),
    sitioWebEmpresa: url(p['Sitio Web Empresa']),
    logoEmpresaSpeaker: url(p['Logo Empresa Speaker']),
    // ⚠️ LinkedIn/Instagram y Web/Redes son RICH_TEXT, no URL — la gente a
    // veces solo da su usuario ("@boutiquemarea") o un dominio sin protocolo
    // ("textilesdelbajio.mx"), no siempre una URL completa. No asumas que
    // siempre vas a poder abrir esto directo como link sin normalizar primero.
    //
    // Campo unificado el 17 de agosto — antes "Instagram" y "LinkedIn" eran
    // 2 columnas separadas en Notion. Se unificaron en una sola porque
    // Ticketópolis ya captura ambas redes en un solo campo de su formulario.
    // Si algo sigue esperando `instagram`/`linkedIn` por separado, hay que
    // actualizarlo también (ver checklist.service.js).
    linkedinInstagram: texto(p['LinkedIn/Instagram']),
    webRedes: texto(p['Web / Redes']),
    checklistCompletado: checkbox(p['Checklist Completado']),
    // Campos de enriquecimiento con Exa (ver contexto-luis-exa-enriquecimiento.md):
    giroDetectadoExa: texto(p['Giro Detectado (Exa)']),
    tamanoEmpresaExa: texto(p['Tamano Empresa (Exa)']),
    modeloNegocioExa: select(p['Modelo de Negocio (Exa)']),
    madurezEcommerceExa: texto(p['Madurez Ecommerce (Exa)']),
    // Madurez Negocio (Exa) — Select de 3 valores ("Temprano"/"PyME"/
    // "Consolidado"), DISTINTO de Madurez Ecommerce (Exa) de arriba (que es
    // texto libre). Existía en Notion pero no estaba mapeado aquí hasta el
    // 14 de agosto — agregado para el peso nuevo de matchmaking.service.js
    // (criterio de tamaño de empresa, pedido por Laura en la Demo 2, 13-ago).
    madurezNegocioExa: select(p['Madurez Negocio (Exa)']),
    // Tamaño de Negocio — select del registro (25-ago). Filtro duro en
    // matchmaking.service.js: Grande/Mediana entran; Micro/Pequeña no.
    // Vacío = asistente viejo → fallback a Madurez Negocio (Exa).
    // VIP salta ese filtro (31-ago); Giro/Industria no.
    tamanoNegocio: select(p['Tamaño de Negocio']),
    // ⚠️ ICP Moda/Ecommerce cambió de checkbox a SELECT (Sí/No/Ambiguo) —
    // ver 02-schema-notion-completo.md. Leerlo como checkbox daba siempre false.
    // Entra al ranking (Capa 2) desde 27-ago: Sí +30, No −30, Ambiguo/vacío 0.
    icpModaEcommerce: select(p['ICP Moda/Ecommerce']),
    // Select Con web / Sin web. Solo premia presencia (+10); Sin web y vacío
    // no restan. Independiente de Madurez Negocio (Exa).
    estadoWebExa: select(p['Estado Web (Exa)']),
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
 * ELEGIBILIDAD POR TIPO DE BOLETO:
 *   - "Presencial VIP" → SIEMPRE elegible (confirmado por Liz, 24 de julio).
 *     Las citas vienen incluidas en el boleto, por eso a los VIP ni siquiera
 *     se les hace la pregunta de opt-in.
 *   - "Presencial" → elegible SALVO que haya marcado explícitamente que no
 *     quiere citas (ver el post-filtro de `Quiere Citas 1a1` más abajo).
 *   - "Virtual" → ⚠️ CAMBIÓ el 13 de agosto: antes NUNCA entraba salvo con
 *     `incluirVirtual: true` (modo de excepción para sponsors sin cuota
 *     cubierta cerca del evento). Ahora entra por default, con la MISMA
 *     regla que Presencial. Motivo: Liz confirmó en la demo del 11 de agosto
 *     que el formulario de Virtual ya tiene la pregunta "¿Te gustaría tener
 *     reuniones...?" desde hace poco — cita textual: "justo Adler faltaría
 *     agregar el virtual, porque ya se agregó esa pregunta". Laura ya había
 *     confirmado en sesión previa (13 de julio) que VIP/Presencial/Virtual
 *     tienen derecho a citas — solo Expo queda fuera.
 *     Nota de calidad de match, sigue vigente: los virtuales NO tienen
 *     "Soluciones Buscadas" ni "Area" en su formulario (solo "Etapa de
 *     Negocio"), así que sus matches van a tener menos señales de forma
 *     natural — no hace falta ningún filtro adicional para reflejar esto,
 *     el ranking (Capa 2) ya los va a mostrar más abajo por tener menos
 *     puntos, sin necesidad de excluirlos.
 *   - "Expo" → NUNCA. Solo da acceso al piso de exhibición.
 *
 * `incluirVirtual` se conserva como parámetro por compatibilidad con las
 * tools MCP y el endpoint REST existentes, pero ya NO tiene efecto — ver
 * nota de deprecación en la firma de la función.
 *
 * También excluye "Dado de Baja" — no tiene sentido proponer una cita a
 * alguien que pidió no ser contactado.
 *
 * El resto de los filtros duros (exclusión de clientes actuales, cita ya
 * existente con ese sponsor) se aplican después en JS: necesitan comparar
 * texto libre o cruzar con la tabla Citas.
 *
 * @param {object} params
 * @param {string[]|null} [params.etapasValidas] - ⚠️ DEPRECADO el 28 de
 *   agosto. Ya no se filtra por `Etapa de Negocio` / `Etapa Cliente Buscada`
 *   (Adler: Ticketópolis dejó de capturar etapa en asistentes nuevos). El
 *   parámetro se conserva en la firma por compatibilidad con llamadas que
 *   todavía lo pasan; no tiene efecto. Mismo patrón que `incluirVirtual`.
 * @param {boolean} [params.incluirVirtual=false] - ⚠️ DEPRECADO el 13 de
 *   agosto. Virtual ahora es elegible por default (ver arriba), así que este
 *   parámetro ya no tiene ningún efecto — se conserva únicamente para no
 *   romper llamadas existentes (tools MCP, endpoint REST) que todavía lo
 *   pasan explícito. No usarlo en código nuevo. Candidato a eliminarse por
 *   completo en un cambio futuro, junto con su limpieza en matchmaking.service.js
 *   y en las descripciones de las tools MCP correspondientes.
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
  // Virtual entra por default desde el 13 de agosto — ver comentario de la
  // función arriba. `incluirVirtual` ya no se usa aquí, se ignora
  // intencionalmente (queda solo por compatibilidad de firma).
  // `etapasValidas` igual desde el 28 de agosto: Ticketópolis ya no llena
  // Etapa de Negocio; no se manda ese filtro a Notion.
  void etapasValidas;
  void incluirVirtual;
  const tiposBoletoElegibles = ['Presencial VIP', 'Presencial', 'Virtual'];

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

  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter: { and: condiciones }, page_size: 100 }),
  });

  // Post-filtrado en JS: "Presencial" y "Virtual" son elegibles salvo que
  // hayan marcado EXPLÍCITAMENTE 'No' a "Quiere Citas 1a1".
  //
  // ⚠️ CORREGIDO el 12 de agosto (Presencial) y AMPLIADO el 13 de agosto
  // (Virtual) — comportamiento anterior incorrecto: exigía
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
  // Virtual se agregó a esta misma regla el 13 de agosto: Liz confirmó que
  // el formulario de Virtual ya tiene la misma pregunta de opt-in que
  // Presencial (antes solo Presencial la tenía). "Presencial VIP" sigue
  // siempre elegible (las citas vienen incluidas en el boleto, ni siquiera
  // se le hace la pregunta).
  const candidatos = data.results.map(parsearContacto).filter((c) => {
    if (c.ticketTipo === 'Presencial' || c.ticketTipo === 'Virtual') {
      return c.quiereCitas1a1 !== 'No';
    }
    return true; // Presencial VIP ya viene filtrado por Notion, no requiere este campo
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

const CATEGORIAS_BUSQUEDA = new Set(['Asistente', 'Sponsor']);

function errorValidacionContacto(mensaje) {
  const err = new Error(mensaje);
  err.status = 400;
  return err;
}

function textoQuery(valor) {
  if (valor == null) return '';
  return String(valor).trim();
}

function filtrosCategoriaActiva(categoria) {
  return [
    { property: 'Categoria', select: { equals: categoria } },
    { property: 'Dado de Baja', checkbox: { equals: false } },
  ];
}

async function queryContactos(filter, pageSize = 10) {
  requireDataSourceId();
  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter, page_size: pageSize }),
  });
  return (data.results || []).map(parsearContacto);
}

async function buscarPorTelefonoYCategoria(telefonoEntrada, categoria) {
  const orTelefono = filtroWhatsAppPorTelefono(telefonoEntrada);
  if (orTelefono.length === 0) return [];
  const candidatos = await queryContactos({
    and: [...filtrosCategoriaActiva(categoria), { or: orTelefono }],
  });
  return candidatos.filter((c) => coincidenTelefonos(telefonoEntrada, c.whatsapp));
}

/**
 * Resuelve un contacto por teléfono, nombre o empresa para Liz/Laura.
 * Solo lectura. `categoria` es obligatorio (`Asistente` | `Sponsor`).
 * Para en el primer criterio que traiga resultados (teléfono → nombre →
 * empresa); no combina varios filtros a la vez.
 */
async function buscarContacto({ nombre, telefono, empresa, categoria } = {}) {
  const cat = textoQuery(categoria);
  if (!CATEGORIAS_BUSQUEDA.has(cat)) {
    throw errorValidacionContacto('categoria debe ser Asistente o Sponsor.');
  }
  const nom = textoQuery(nombre);
  const tel = textoQuery(telefono);
  const emp = textoQuery(empresa);
  if (!nom && !tel && !emp) {
    throw errorValidacionContacto('Falta nombre, telefono o empresa.');
  }

  if (tel) {
    const porTelefono = await buscarPorTelefonoYCategoria(tel, cat);
    if (porTelefono.length > 0) return porTelefono;
  }
  if (nom) {
    const porNombre = await queryContactos({
      and: [
        ...filtrosCategoriaActiva(cat),
        { property: 'Nombre', title: { contains: nom } },
      ],
    });
    if (porNombre.length > 0) return porNombre;
  }
  if (emp) {
    return queryContactos({
      and: [
        ...filtrosCategoriaActiva(cat),
        { property: 'Empresa', rich_text: { contains: emp } },
      ],
    });
  }
  return [];
}

/**
 * Búsqueda por nombre aproximado — para cuando Liz/Laura preguntan "cómo va
 * fulano" y no tienen el page_id a la mano. Usa "contains", no igualdad
 * exacta, así que puede regresar varios candidatos (ambigüedad real: puede
 * haber dos personas con nombre parecido).
 *
 * No filtra Categoria. Para resolver un asistente o sponsor antes de
 * reservar, usar `buscarContacto` (filtra categoría y Dado de Baja).
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

async function actualizarEstadoCampana({ contactoId, campana, fechaEnvio }) {
  requireDataSourceId();
  return notionFetch(`/pages/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Última Campaña Enviada': { select: { name: campana } },
        'Fecha Última Campaña': { date: { start: fechaEnvio } },
      },
    }),
  });
}

async function marcarRecordatorioEventoEnviado(contactoId) {
  requireDataSourceId();
  return notionFetch(`/pages/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Recordatorio Evento Enviado': { checkbox: true },
      },
    }),
  });
}

async function incrementarReactivaciones(contactoId, valorActual) {
  requireDataSourceId();
  return notionFetch(`/pages/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Reactivaciones Enviadas': { number: (valorActual || 0) + 1 },
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

function digitosTelefono(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/** 10 dígitos nacionales MX (sin 52 / 521). WhatsApp a veces manda 521. */
function localMexico10(raw) {
  const d = digitosTelefono(raw);
  if (!d) return '';
  if (d.startsWith('521') && d.length >= 13) return d.slice(3, 13);
  if (d.startsWith('52') && d.length >= 12) return d.slice(2, 12);
  if (d.length === 10) return d;
  if (d.length > 10) return d.slice(-10);
  return d;
}

function coincidenTelefonos(a, b) {
  const la = localMexico10(a);
  const lb = localMexico10(b);
  return Boolean(la) && la.length === 10 && la === lb;
}

function variantesTelefono(raw) {
  const digits = digitosTelefono(raw);
  if (!digits) return [];
  const set = new Set([digits]);
  const local = localMexico10(digits);
  if (local) set.add(local);
  if (digits.startsWith('521') && digits.length >= 13) {
    set.add(digits.slice(1));
    set.add(digits.slice(3));
  }
  if (digits.startsWith('52') && digits.length >= 12) {
    set.add(digits.slice(2));
  }
  if (local.length === 10) {
    set.add(`52${local}`);
    set.add(`521${local}`);
  }
  return [...set];
}

/**
 * Strings que Notion suele guardar en phone_number (equals es exacto).
 * Caso real FDT: `+52 3339521391` vs consulta WhatsApp `523339521391`.
 */
function formatosTelefonoParaNotion(raw) {
  const digits = digitosTelefono(raw);
  const local = localMexico10(raw);
  if (!digits) return [];
  const set = new Set();
  const bases = [digits, local, local && `52${local}`, local && `521${local}`].filter(Boolean);
  for (const b of bases) {
    set.add(b);
    set.add(`+${b}`);
  }
  if (local.length === 10) {
    set.add(`+52 ${local}`);
    set.add(`+52${local}`);
    set.add(`52 ${local}`);
    set.add(`+521 ${local}`);
    set.add(`+521${local}`);
    set.add(`521 ${local}`);
    set.add(`+52 1 ${local}`);
    set.add(`+52 1${local}`);
    set.add(`+52 ${local.slice(0, 2)} ${local.slice(2)}`);
    set.add(`+52 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`);
  }
  return [...set];
}

function filtroWhatsAppPorTelefono(telefonoEntrada) {
  const formatos = formatosTelefonoParaNotion(telefonoEntrada);
  const local = localMexico10(telefonoEntrada);
  const or = formatos.map((v) => ({ property: 'WhatsApp', phone_number: { equals: v } }));
  if (local.length === 10) {
    or.push({ property: 'WhatsApp', phone_number: { contains: local } });
  }
  return or;
}

/**
 * Asistente (Categoria=Asistente, no dado de baja) cuyo WhatsApp coincide
 * ignorando +, espacios, 52 y 521.
 */
async function buscarAsistentePorWhatsApp(telefonoEntrada) {
  requireDataSourceId();
  const orTelefono = filtroWhatsAppPorTelefono(telefonoEntrada);
  if (orTelefono.length === 0) return null;

  const data = await notionFetch(`/data_sources/${CONTACTOS_DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Categoria', select: { equals: 'Asistente' } },
          { property: 'Dado de Baja', checkbox: { equals: false } },
          { or: orTelefono },
        ],
      },
      page_size: 10,
    }),
  });

  const candidatos = (data.results || []).map(parsearContacto);
  const match = candidatos.find((c) => coincidenTelefonos(telefonoEntrada, c.whatsapp));
  return match || null;
}

module.exports = {
  parsearContacto,
  obtenerContacto,
  buscarAsistentesCandidatos,
  sugerirMatches,
  buscarDadoDeBajaPorEmailOTelefono,
  buscarContactoPorNombre,
  buscarContacto,
  buscarAsistentePorWhatsApp,
  variantesTelefono,
  formatosTelefonoParaNotion,
  coincidenTelefonos,
  localMexico10,
  listarSponsorsYSpeakersActivos,
  actualizarChecklist,
  actualizarEstadoCampana,
  marcarRecordatorioEventoEnviado,
  incrementarReactivaciones,
  listarSponsorsActivos,
};
