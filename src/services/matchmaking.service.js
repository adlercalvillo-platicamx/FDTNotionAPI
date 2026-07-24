// src/services/matchmaking.service.js
//
// Implementa la especificación de matchmaking-spec-fdt.md: Capa 1 (filtros
// duros, sin LLM) + Capa 2 (ranking ponderado). Solo ESCRIBE sugerencias en
// "Match Sugerido" — nunca toca "Match Aprobado" ni crea citas. Esa frontera
// es intencional: la aprobación es de Liz/Laura, no de este código.

const notionContactos = require('./contactos.service');
const notionCitas = require('./citas.service');

// ─────────────────────────────────────────────────────────────
// Tabla de equivalencia Etapa Cliente Buscada (sponsor) ↔ Etapa de Negocio
// (asistente). BORRADOR MÍO, sin confirmar con Laura — ver sección 4 de
// matchmaking-spec-fdt.md. Dos pares son débiles, marcados abajo.
// ─────────────────────────────────────────────────────────────
const EQUIVALENCIA_ETAPA = {
  'Exploracion de e-commerce': ['Por lanzar mi marca o negocio'],
  'Operacion basica de e-commerce': ['Ya vendo en redes sociales - por lanzar e-commerce'],
  'Escalamiento de e-commerce': ['Ya tengo mi e-commerce propio y quiero crecer ventas'],
  'Estrategia omnicanal avanzada': ['Ya tengo tienda en linea - quiero mas rentabilidad'],
  // Par débil — no hay equivalente claro, se aproxima al más cercano por texto.
  'Venta por redes sociales': ['Ya vendo en redes sociales - por lanzar e-commerce'],
};
// "Ninguna de las anteriores" del asistente nunca se traduce a nada — un
// asistente con esa respuesta solo pasa el filtro si el sponsor no
// especificó ninguna Etapa Cliente Buscada (ver getEtapasValidas).

// ─────────────────────────────────────────────────────────────
// Prioridad de Nivel de Patrocinio — CONFIRMADO por Laura el 16 de julio:
//   Cristal (Flow y Blip): 6 citas — el número más alto = mayor prioridad
//   Diamante (casi todos los sponsors): 4 citas
//   Oro: 2 citas
//   Bronce: NO participa en citas 1a1 — se bloquea explícitamente abajo.
//
// "Principal" no existe como nivel — Laura lo confirmó el 16 de julio.
// Los únicos niveles reales son los 4 de arriba.
//
// Laura dijo "casi todas" para Diamante — implica que puede haber
// excepciones negociadas por sponsor. Por eso "Citas Minimas Prometidas"
// se mantiene como campo editable por sponsor en Notion, NO se deriva
// automáticamente de este mapa — este mapa es solo para el DESEMPATE de
// prioridad entre sponsors, no para fijar la cuota.
// ─────────────────────────────────────────────────────────────
const PRIORIDAD_NIVEL_PATROCINIO = {
  Cristal: 3,
  Diamante: 2,
  Oro: 1,
};
const NIVELES_SIN_CITAS_1A1 = ['Bronce'];

// ─────────────────────────────────────────────────────────────
// Cuántos candidatos sugerir por sponsor, cuando no se especifica
// explícitamente. DEFINIDO POR PLÁTICA, no por Laura — ella misma dijo que
// ni su equipo lo tenía claro, así que se calcula:
//
//   topN = Citas Minimas Prometidas del sponsor + MARGEN_CANDIDATOS
//
// Un número fijo para todos los sponsors no funciona: un Cristal necesita
// 6 citas confirmadas, así que sugerirle menos de 6 candidatos hace
// matemáticamente imposible llenar su cuota aunque el 100% acepte.
//
// El margen de +2 es una estimación de que no todos los candidatos
// sugeridos van a aceptar/tener tiempo — es un supuesto nuestro, no un
// dato medido. Ajustar esta constante cuando haya una tasa de aceptación
// real del evento (después de correrlo una vez).
// ─────────────────────────────────────────────────────────────
const MARGEN_CANDIDATOS = 2;

// ─────────────────────────────────────────────────────────────
// Heurística de palabras clave para el problema de vocabulario controlado
// (sponsor) vs. texto libre (asistente) — ver sección 4 del spec, opción
// puente mientras no exista una clasificación real en la captura de datos.
// Coincidencia parcial e imperfecta a propósito: es una señal de ranking,
// no un filtro duro, así que un falso negativo aquí solo baja el score,
// no elimina al candidato.
// ─────────────────────────────────────────────────────────────
const PALABRAS_CLAVE_PUESTO = {
  'Direccion General / Founder / CEO': ['director general', 'ceo', 'founder', 'fundador', 'dueñ', 'presidente'],
  'Comercial / Ventas / Business Development': ['comercial', 'ventas', 'business development', 'account manager'],
  'Marketing / Branding / Comunicacion / PR': ['marketing', 'branding', 'comunicaci', 'prensa', 'publicidad'],
  'eCommerce / Canal Digital / Omnicanal': ['ecommerce', 'e-commerce', 'canal digital', 'omnicanal', 'digital'],
  'Retail / Expansion de tiendas': ['retail', 'tiendas', 'expansion', 'sucursales'],
  'Compras / Merchandising / Planeacion de producto': ['compras', 'merchandising', 'buyer', 'planeacion de producto'],
  'Operaciones / Logistica / Supply Chain': ['operaciones', 'logistica', 'supply chain', 'cadena de suministro'],
  'Tecnologia / Innovacion / Transformacion Digital': ['tecnolog', 'cto', 'sistemas', 'innovaci', 'transformacion digital'],
  'Diseno / Desarrollo de Producto': ['diseñ', 'desarrollo de producto'],
  'Consultoria / Servicios para la industria': ['consultor', 'asesor'],
};

const PALABRAS_CLAVE_SOLUCION = {
  'Analitica / data': ['analitica', 'data', 'datos', 'bi ', 'business intelligence'],
  'CRM / automatizacion': ['crm', 'automatizacion', 'automation'],
  'Customer experience': ['customer experience', 'cx', 'experiencia del cliente', 'servicio al cliente'],
  'Estrategia de marketing digital': ['marketing digital', 'estrategia de marketing', 'performance', 'pauta'],
  'Inteligencia artificial': ['inteligencia artificial', ' ia ', 'ai ', 'machine learning'],
  Internacionalizacion: ['internacional', 'exportacion', 'cross border'],
  'Logistica / fulfillment': ['logistica', 'fulfillment', 'envios', 'ultima milla'],
  Marketplaces: ['marketplace', 'amazon', 'mercado libre', 'mercadolibre'],
  Omnichannel: ['omnicanal', 'omnichannel'],
  Pagos: ['pagos', 'payment', 'pasarela'],
  'Performance marketing': ['performance marketing', 'pauta digital', 'ads'],
  'Plataforma eCommerce': ['plataforma', 'shopify', 'vtex', 'magento', 'ecommerce', 'e-commerce'],
};

const PESOS = {
  ORO_MOLIDO: 1000, // cliente potencial deseado mencionado explícitamente — dominante
  PUESTO: 40,
  SOLUCION: 40,
  CUOTA_PENDIENTE_POR_CITA: 15, // se multiplica por el número de citas pendientes
  DATO_DECLARADO: 10,
  DATO_INFERIDO: 3,
};

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos para comparar
}

function contieneAlguna(textoNormalizado, palabrasClave) {
  return palabrasClave.some((p) => textoNormalizado.includes(normalizar(p)));
}

/** Traduce las Etapa Cliente Buscada del sponsor a la lista de valores válidos de Etapa de Negocio. */
function getEtapasValidas(sponsor) {
  if (!sponsor.etapaClienteBuscada || sponsor.etapaClienteBuscada.length === 0) {
    return null; // sponsor no especificó — no se filtra por esto
  }
  const set = new Set();
  for (const etapaSponsor of sponsor.etapaClienteBuscada) {
    (EQUIVALENCIA_ETAPA[etapaSponsor] || []).forEach((e) => set.add(e));
  }
  return Array.from(set);
}

/** Filtro difuso: ¿la Empresa del candidato aparece mencionada en el texto del sponsor? */
function empresaMencionadaEn(empresaCandidato, textoLibreSponsor) {
  if (!empresaCandidato || !textoLibreSponsor) return false;
  const empresaNorm = normalizar(empresaCandidato).trim();
  if (empresaNorm.length < 3) return false; // evita falsos positivos con nombres muy cortos
  return normalizar(textoLibreSponsor).includes(empresaNorm);
}

// ─────────────────────────────────────────────────────────────
// Capa 2 — scoring
// ─────────────────────────────────────────────────────────────
function calcularScore(sponsor, candidato, cuotaPendiente) {
  let score = 0;
  const detalle = [];
  // Señales estructuradas — separadas del `detalle` (que es texto para depurar) para
  // que generarExplicacionNatural() no tenga que parsear strings, solo leer datos.
  // puestosCoincidentes/solucionesCoincidentes son ARREGLOS a propósito — un sponsor
  // puede elegir hasta 3 Solucion y varios Puestos Buscados, y cada coincidencia real
  // debe contar, no solo la primera que se encuentre.
  const senales = {
    oroMolido: false,
    puestosCoincidentes: [],
    solucionesCoincidentes: [],
    cuotaPendiente,
    fuenteDeclarada: candidato.fuenteDato === 'Declarado',
  };

  if (empresaMencionadaEn(candidato.empresa, sponsor.clientesPotencialesDeseados)) {
    score += PESOS.ORO_MOLIDO;
    detalle.push('oro_molido: empresa mencionada explícitamente por el sponsor');
    senales.oroMolido = true;
  }

  const rolNorm = normalizar(candidato.rolPuesto);
  for (const puesto of sponsor.puestosBuscados) {
    if (contieneAlguna(rolNorm, PALABRAS_CLAVE_PUESTO[puesto] || [])) {
      score += PESOS.PUESTO;
      detalle.push(`puesto: coincide con "${puesto}"`);
      senales.puestosCoincidentes.push(puesto);
      // sin "break" — el sponsor puede tener varios puestos buscados, cada
      // coincidencia real suma, no solo la primera que se encuentre.
    }
  }

  const solucionTexto = normalizar(`${candidato.servicios} ${candidato.intencionComercial}`);
  for (const solucion of sponsor.solucion) {
    if (contieneAlguna(solucionTexto, PALABRAS_CLAVE_SOLUCION[solucion] || [])) {
      score += PESOS.SOLUCION;
      detalle.push(`solucion: coincide con "${solucion}"`);
      senales.solucionesCoincidentes.push(solucion);
      // mismo criterio: un sponsor puede elegir hasta 3 Solucion, cada
      // coincidencia real cuenta.
    }
  }

  if (cuotaPendiente > 0) {
    score += cuotaPendiente * PESOS.CUOTA_PENDIENTE_POR_CITA;
    detalle.push(`cuota_pendiente: ${cuotaPendiente} citas por cubrir`);
  }

  if (candidato.fuenteDato === 'Declarado') {
    score += PESOS.DATO_DECLARADO;
  } else if (candidato.fuenteDato === 'Inferido') {
    score += PESOS.DATO_INFERIDO;
  }

  return { score, detalle, senales };
}

// ─────────────────────────────────────────────────────────────
// Explicación en lenguaje natural para los reportes que ve Laura —
// separada a propósito de `detalle` (que es para depurar el código, no
// para leérselo a un cliente). Basada en plantillas, no en un LLM: cada
// frase solo aparece si la señal estructurada correspondiente es real,
// así que nunca puede "inventar" una razón que no esté respaldada por el
// cálculo. Si algún día se prefiere una redacción más variada con un LLM,
// esta función es el único lugar que habría que reemplazar — el resto del
// motor no cambia.
// ─────────────────────────────────────────────────────────────
function generarExplicacionNatural(candidato, senales) {
  const frases = [];

  if (senales.oroMolido) {
    frases.push(`el sponsor mencionó explícitamente que le gustaría reunirse con ${candidato.empresa}`);
  }
  if (senales.puestosCoincidentes.length === 1) {
    frases.push(`el puesto de ${candidato.nombre} coincide con el tipo de contacto que el sponsor está buscando`);
  } else if (senales.puestosCoincidentes.length > 1) {
    frases.push(`el puesto de ${candidato.nombre} coincide con ${senales.puestosCoincidentes.length} de los perfiles que el sponsor está buscando`);
  }
  if (senales.solucionesCoincidentes.length === 1) {
    frases.push(`lo que el sponsor ofrece coincide con lo que ${candidato.nombre} declaró que está buscando`);
  } else if (senales.solucionesCoincidentes.length > 1) {
    frases.push(`${senales.solucionesCoincidentes.length} de las soluciones que ofrece el sponsor coinciden con lo que ${candidato.nombre} declaró que está buscando`);
  }

  let texto;
  if (frases.length === 0) {
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) por su etapa de negocio y disponibilidad, aunque sin una coincidencia específica adicional detectada.`;
  } else if (frases.length === 1) {
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) porque ${frases[0]}.`;
  } else {
    const ultima = frases.pop();
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) porque ${frases.join(', ')}, y además ${ultima}.`;
  }

  if (senales.cuotaPendiente > 0) {
    texto += ` El sponsor todavía tiene ${senales.cuotaPendiente} cita${senales.cuotaPendiente === 1 ? '' : 's'} por cubrir de su cuota, así que es buen momento para ofrecer esta reunión.`;
  }

  if (!senales.fuenteDeclarada) {
    texto += ` (Nota: parte de la información de este candidato fue inferida, no declarada directamente por la persona.)`;
  }

  return texto;
}

/**
 * Orquesta el matchmaking completo para un sponsor: Capa 1 (filtrar) + Capa 2
 * (rankear) + escritura de sugerencias. No crea citas ni aprueba nada — eso
 * sigue siendo trabajo humano (Liz) y del endpoint de reservas por separado.
 *
 * @param {string} sponsorPageId
 * @param {object} [opciones]
 * @param {number} [opciones.topN] - cuántos candidatos sugerir. Si se omite,
 *   se calcula como (Citas Minimas Prometidas del sponsor + MARGEN_CANDIDATOS)
 *   — definido por Plática, no por Laura (ella misma dijo que ni su equipo
 *   lo tenía definido). Un topN fijo para todos los sponsors no funciona:
 *   un Cristal necesita 6 citas confirmadas, así que sugerirle menos de 6
 *   candidatos hace matemáticamente imposible llenar su cuota aunque el
 *   100% acepte.
 * @param {boolean} [opciones.escribirEnNotion=true] - si es false, solo
 *   calcula y regresa el resultado sin escribir (útil para probar sin
 *   modificar datos reales).
 */
async function sugerirMatchesParaSponsor(sponsorPageId, { topN, escribirEnNotion = true } = {}) {
  const sponsor = await notionContactos.obtenerContacto(sponsorPageId);
  if (sponsor.categoria !== 'Sponsor') {
    throw new Error(`El contacto ${sponsorPageId} no tiene Categoria = Sponsor (tiene: ${sponsor.categoria})`);
  }
  if (NIVELES_SIN_CITAS_1A1.includes(sponsor.nivelPatrocinio)) {
    throw new Error(
      `El sponsor "${sponsor.nombre}" es nivel ${sponsor.nivelPatrocinio}, que no participa en citas 1a1 (confirmado por Laura el 16 de julio). No se debe correr matchmaking para este sponsor.`
    );
  }

  const topNEfectivo = typeof topN === 'number' ? topN : (sponsor.citasMinimasPrometidas || 0) + MARGEN_CANDIDATOS;

  // Capa 1a — filtro duro vía query de Notion (categoría, boleto, etapa)
  const etapasValidas = getEtapasValidas(sponsor);
  const candidatosBrutos = await notionContactos.buscarAsistentesCandidatos({ etapasValidas });

  // Capa 1b — filtros que necesitan texto libre o cruzar con Citas, se
  // aplican en JS porque Notion no los puede resolver en un solo query.
  const candidatosValidos = [];
  for (const candidato of candidatosBrutos) {
    if (empresaMencionadaEn(candidato.empresa, sponsor.clientesActuales)) continue; // ya es cliente
    const yaTieneCita = await notionCitas.existeCitaActivaEntre({
      sponsorPageId,
      asistentePageId: candidato.id,
    });
    if (yaTieneCita) continue; // ya matcheado con este sponsor
    candidatosValidos.push(candidato);
  }

  // Cuota pendiente del sponsor — se calcula una sola vez, es la misma para
  // todos los candidatos de esta corrida.
  const citasConfirmadas = await notionCitas.contarCitasConfirmadasPorSponsor(sponsorPageId);
  const cuotaPendiente = Math.max(0, (sponsor.citasMinimasPrometidas || 0) - citasConfirmadas);

  // Capa 2 — ranking
  const rankeados = candidatosValidos
    .map((candidato) => {
      const { score, detalle, senales } = calcularScore(sponsor, candidato, cuotaPendiente);
      return { candidato, score, detalle, senales };
    })
    .sort((a, b) => b.score - a.score);

  const top = rankeados.slice(0, topNEfectivo);

  if (escribirEnNotion && top.length > 0) {
    await notionContactos.sugerirMatches({
      sponsorPageId,
      asistentePageIds: top.map((r) => r.candidato.id),
    });
  }

  return {
    sponsor: { id: sponsor.id, nombre: sponsor.nombre },
    cuotaPendiente,
    totalCandidatosEvaluados: candidatosBrutos.length,
    totalCandidatosValidos: candidatosValidos.length,
    sugerencias: top.map((r) => ({
      id: r.candidato.id,
      nombre: r.candidato.nombre,
      empresa: r.candidato.empresa,
      score: r.score,
      detalle: r.detalle,
      explicacion: generarExplicacionNatural(r.candidato, r.senales),
    })),
  };
}

/**
 * Compara dos niveles de patrocinio y regresa cuál gana el desempate.
 * Todavía no hay ningún código que la use en producción — la orquestación
 * de "correr matchmaking para TODOS los sponsors y resolver cuando dos
 * compiten por el mismo asistente" no está construida. Se deja exportada
 * y lista para cuando se construya esa pieza.
 */
function compararPrioridadSponsor(nivelA, nivelB) {
  const prioridadA = PRIORIDAD_NIVEL_PATROCINIO[nivelA] ?? -1;
  const prioridadB = PRIORIDAD_NIVEL_PATROCINIO[nivelB] ?? -1;
  if (prioridadA === prioridadB) return 'empate';
  return prioridadA > prioridadB ? 'A' : 'B';
}

/**
 * Corre matchmaking para TODOS los sponsors activos (excluye Bronce
 * automáticamente, vía el mismo guard de sugerirMatchesParaSponsor — un
 * Bronce no tumba la corrida completa, se registra en "omitidos") y
 * detecta cuándo el mismo asistente aparece como candidato sugerido para
 * más de un sponsor a la vez.
 *
 * IMPORTANTE — interpretación mía, no texto literal de sesión 3: como NO
 * hay tope de citas por asistente, esto no excluye a nadie de ningún
 * sponsor. Lo que hace es ORDENAR por prioridad (Cristal > Diamante > Oro)
 * los casos donde hay solapamiento, para que Liz sepa a quién ofrecerle
 * primero si de verdad se vuelve un conflicto de horario — el conflicto de
 * horario en sí ya lo resuelve booking.service.js por separado (mutex +
 * capacidad de mesas), esto no lo reemplaza, es una capa de visibilidad.
 *
 * "Principal" no existe como nivel (confirmado por Laura) — no aparece en
 * PRIORIDAD_NIVEL_PATROCINIO ni necesita manejo especial.
 *
 * Si no se pasa topN explícito, cada sponsor usa el suyo propio (su cuota
 * + MARGEN_CANDIDATOS) — no se fuerza un número fijo para todos.
 */
async function sugerirMatchesGlobal({ topN } = {}) {
  const sponsors = await notionContactos.listarSponsorsActivos();
  const resultadosPorSponsor = [];
  const omitidos = [];

  for (const sponsor of sponsors) {
    try {
      const resultado = await sugerirMatchesParaSponsor(sponsor.id, { topN, escribirEnNotion: true });
      resultadosPorSponsor.push({ sponsor, resultado });
    } catch (err) {
      omitidos.push({ sponsorId: sponsor.id, nombre: sponsor.nombre, motivo: err.message });
    }
  }

  // Agrupar por asistente candidato para detectar solapamientos entre sponsors
  const porAsistente = new Map();
  for (const { sponsor, resultado } of resultadosPorSponsor) {
    for (const sug of resultado.sugerencias) {
      if (!porAsistente.has(sug.id)) porAsistente.set(sug.id, { nombre: sug.nombre, empresa: sug.empresa, apariciones: [] });
      porAsistente.get(sug.id).apariciones.push({
        sponsorId: sponsor.id,
        sponsorNombre: sponsor.nombre,
        nivelPatrocinio: sponsor.nivelPatrocinio,
        score: sug.score,
      });
    }
  }

  const solapamientos = [];
  for (const [asistenteId, info] of porAsistente.entries()) {
    if (info.apariciones.length < 2) continue;
    const ordenados = [...info.apariciones].sort((a, b) => {
      const prioridadA = PRIORIDAD_NIVEL_PATROCINIO[a.nivelPatrocinio] ?? -1;
      const prioridadB = PRIORIDAD_NIVEL_PATROCINIO[b.nivelPatrocinio] ?? -1;
      return prioridadB - prioridadA;
    });
    solapamientos.push({
      asistenteId,
      asistenteNombre: info.nombre,
      asistenteEmpresa: info.empresa,
      ordenDePrioridad: ordenados,
    });
  }

  return {
    totalSponsorsEvaluados: sponsors.length,
    totalSponsorsOmitidos: omitidos.length,
    omitidos,
    totalSolapamientosDetectados: solapamientos.length,
    solapamientos,
  };
}

module.exports = {
  sugerirMatchesParaSponsor,
  sugerirMatchesGlobal,
  compararPrioridadSponsor,
  // exportados para pruebas unitarias / depuración:
  getEtapasValidas,
  calcularScore,
  generarExplicacionNatural,
  empresaMencionadaEn,
  EQUIVALENCIA_ETAPA,
  PRIORIDAD_NIVEL_PATROCINIO,
};
