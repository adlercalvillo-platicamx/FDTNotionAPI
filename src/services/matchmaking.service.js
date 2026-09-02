// src/services/matchmaking.service.js
//
// REDISEÑO 2026 — match directo, sin heurística de texto.
//
// Contexto de por qué cambió: hasta julio 2026, el formulario de registro de
// asistentes (Ticketópolis) y el formulario de sponsors (Google Forms) usaban
// vocabularios distintos, así que el matchmaking dependía de una tabla de
// traducción y de heurísticas de palabras clave sobre texto libre — frágil y
// con falsos negativos silenciosos. Liz Melchor rediseñó el registro de
// asistentes para que las respuestas caigan en LAS MISMAS listas controladas
// que ya usaba el sponsor. Este archivo implementa ese match directo.
//
// Ranking (Capa 2) — relaciones directas (Liz, 24 de julio):
//   sponsor "Puestos Buscados"  ↔  asistente "Area"
//   sponsor "Solucion"          ↔  asistente "Soluciones Buscadas"
// Más una relación de texto libre, débil:
//   sponsor "Clientes Potenciales Deseados" ↔ asistente "Otra Solucion Buscada"
//
// 28-ago — `Etapa Cliente Buscada` ↔ `Etapa de Negocio` ya NO es filtro de
// Capa 1 (Adler). Ticketópolis dejó de capturar etapa en asistentes nuevos;
// el pool se decide con Tamaño de Negocio / Madurez Exa, no con etapa.
// Los campos siguen en Notion (vistas de Laura/Liz); no se leen para
// elegibilidad. Ver documentación histórica en 09-matchmaking-directo-2026.md

const notionContactos = require('./contactos.service');
const notionCitas = require('./citas.service');

// ─────────────────────────────────────────────────────────────
// Prioridad de Nivel de Patrocinio — CONFIRMADO por Laura el 16 de julio.
// Cristal (6 citas) > Diamante (4) > Oro (2). Bronce no participa.
// "Principal" no existe como nivel.
//
// ⚠️ Liz aclaró el 24 de julio que la cuota real se NEGOCIA por sponsor
// (vio un caso donde el nivel daba 6 pero Laura le dio 4). Por eso
// "Citas Minimas Prometidas" es un campo editable por sponsor en Notion y
// NUNCA se deriva de este mapa. Este mapa es solo para el DESEMPATE.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Prioridad de Nivel de Patrocinio — CONFIRMADO por Laura el 16 de julio.
// Cristal (6 citas) > Diamante (4) > Oro (2). Bronce no participa.
// "Principal" no existe como nivel.
//
// ⚠️ Liz aclaró el 24 de julio que la cuota real se NEGOCIA por sponsor
// (vio un caso donde el nivel daba 6 pero Laura le dio 4). Por eso
// "Citas Minimas Prometidas" es un campo editable por sponsor en Notion y
// NUNCA se deriva de este mapa. Este mapa es solo para el DESEMPATE.
// ─────────────────────────────────────────────────────────────
const PRIORIDAD_NIVEL_PATROCINIO = { Cristal: 3, Diamante: 2, Oro: 1 };
const NIVELES_SIN_CITAS_1A1 = ['Bronce'];

// Cuántos candidatos sugerir por sponsor cuando no se especifica:
// su cuota + margen. Un número fijo no sirve — un Cristal necesita 6 citas,
// sugerirle menos de 6 candidatos hace imposible llenar su cuota.
const MARGEN_CANDIDATOS = 2;

// ─────────────────────────────────────────────────────────────
// PESOS DEL RANKING (Capa 2)
//
// Decisión de diseño sobre VIP, tomada por Plática (NO confirmada por Laura,
// pendiente de validar en la demo):
// Liz confirmó que un asistente VIP tiene prioridad sobre un Presencial. Pero
// se implementa como un IMPULSO FUERTE, no como un override absoluto, porque:
//   - Liz también dijo que el VIP depende del perfil ("si nos llenaron que sí
//     pero no cumplen el perfil, pues no") — la calidad del match importa.
//   - Con override absoluto, un VIP con match mediocre le ganaría a un
//     Presencial que el sponsor pidió POR NOMBRE en su formulario. Eso sería
//     un mal resultado de negocio y Laura lo notaría.
// Con VIP=500 y ORO_MOLIDO=1000: el VIP gana todos los casos normales y
// cerrados, pero un candidato explícitamente pedido por el sponsor le gana.
// Ese es justamente el "caso cerrado" que Adler intuyó como excepción.
// ─────────────────────────────────────────────────────────────
const PESOS = {
  ORO_MOLIDO: 1000, // empresa nombrada explícitamente por el sponsor
  VIP: 500, // prioridad compartida por Presencial VIP y Speaker
  // Agregado 13 de agosto — Virtual pasó a ser elegible por default en
  // buscarAsistentesCandidatos (ver contactos.service.js), pero Laura pidió
  // seguir priorizando presencial sobre virtual. Mismo patrón de diseño que
  // VIP: impulso fuerte en el ranking, no exclusión — un Virtual con match
  // excelente (área+solución+oro molido) sigue pudiendo ganarle a un
  // Presencial sin señales específicas; entre dos candidatos con match
  // idéntico, el presencial gana. Deliberadamente menor que VIP (esto es
  // sobre canal, no sobre calidad de perfil) pero mayor que cualquier señal
  // individual de match (área/solución), para que el desempate sea claro.
  PRESENCIAL: 150, // desde 1-sep aplica solo a "Presencial"
  AREA: 60, // match directo de área/puesto
  SOLUCION: 60, // match directo por cada solución coincidente
  // Agregado 14 de agosto — pedido por Laura en la Demo 2: "el tamaño de la
  // empresa 100% es un criterio... es lo más importante". Desde 26-ago el
  // filtro duro vive en esCandidatoPorTamanoNegocio (Tamaño de Negocio del
  // registro; si vacío, Madurez Negocio Exa). Estos pesos de madurez solo
  // aplican al fallback de asistentes viejos sin el select nuevo.
  MADUREZ_NEGOCIO_CONSOLIDADO: 40,
  MADUREZ_NEGOCIO_PYME: 15,
  // 26-ago: filtro duro de tamaño (Laura 25-ago). Estos pesos SOLO aplican
  // si Tamaño de Negocio está poblado (Grande/Mediana). No se suman junto
  // con MADUREZ_NEGOCIO_* — si ambos existen, gana el dato declarado.
  TAMANO_GRANDE: 40,
  TAMANO_MEDIANA: 15,
  // 27-ago — Exa adicional, independiente de MADUREZ_NEGOCIO_* (40/15).
  // ICP Sí/No son dato real; vacío (nunca enriquecido) y Ambiguo no mueven.
  ICP_MODA_ECOMMERCE_SI: 30,
  ICP_MODA_ECOMMERCE_NO: -30,
  ESTADO_WEB_CON_WEB: 10, // Sin web / vacío: 0, no penaliza
  OTRA_SOLUCION_TEXTO: 25, // señal débil de texto libre ↔ texto libre
  // Conservado como referencia histórica (23-ago-2026), pero ya no se suma
  // al score: la cuota cambia con el tiempo y no mide la calidad del par.
  CUOTA_PENDIENTE_POR_CITA: 15,
  DATO_DECLARADO: 10,
  DATO_INFERIDO: 3,
};

// "Otro" existe como opción en ambos lados de área y solución, pero que un
// sponsor busque "Otro" y un asistente sea "Otro" NO es una señal real de
// afinidad — son dos "no sé" que coinciden por accidente. Se excluye del match.
const VALOR_COMODIN = 'Otro';

const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_MEDIANA = 'Mediana - 50 a 250 empleados';
const TAMANOS_QUE_ENTRAN = new Set([TAMANO_GRANDE, TAMANO_MEDIANA]);
const MADURECES_EXA_QUE_ENTRAN = new Set(['Consolidado', 'PyME']);

/**
 * Filtro duro de tamaño (Capa 1, antes de calcularScore).
 * Allowlist, no denylist: un valor raro o vacío no “se cuela”.
 * Con Tamaño poblado: solo Grande/Mediana. Vacío (registro viejo):
 * Consolidado/PyME de Exa. Vacío + vacío o Temprano → fuera.
 * Excepciones: Presencial VIP y Speaker entran aunque Tamaño y Madurez
 * Exa estén vacíos o sean Micro/Pequeña/Temprano (Adler, 1-sep-2026).
 * El filtro de Giro/Industria no tiene esa excepción.
 */
function esCandidatoPorTamanoNegocio(candidato) {
  // Presencial VIP y Speaker entran sin importar Tamaño / Madurez Exa:
  // ambos boletos incluyen citas (ver contactos.service.js).
  // Confirmado por Adler el 1-sep-2026: el
  // filtro duro de tamaño (Laura, 25-ago) no debe excluir VIP, aunque
  // el dato esté vacío. NO aplica lo mismo al filtro de Giro/Industria
  // — ese sigue sin excepción para VIP (confirmado 12-ago, sin cambio).
  //
  // CORREGIDO 1-sep-2026: usa Ticket / Tipo Asistencia = 'Presencial
  // VIP' (candidato.ticketTipo), NO el checkbox "Es VIP"
  // (candidato.esVip). Son dos campos de Notion distintos y no
  // equivalentes — "Es VIP" es un campo separado, sin relación
  // documentada con el boleto, y estaba en false para los 13
  // asistentes reales con boleto Presencial VIP en el Notion de
  // pruebas, así que la excepción nunca se activaba en la práctica.
  // Este es el mismo campo que ya usa correctamente el peso de
  // puntaje VIP más abajo en calcularScore:
  // `candidato.ticketTipo === 'Presencial VIP'`.
  if (candidato.ticketTipo === 'Presencial VIP' || candidato.ticketTipo === 'Speaker') return true;
  const tamano = candidato.tamanoNegocio;
  if (tamano) return TAMANOS_QUE_ENTRAN.has(tamano);
  return MADURECES_EXA_QUE_ENTRAN.has(candidato.madurezNegocioExa);
}

/**
 * Contactos de sistema (Comite/Team, el bloqueo de agenda, etc.) no son
 * asistentes. Notion ya filtra Categoria=Asistente; esto es la exclusión
 * explícita que Adler pidió, por si ese filtro se relaja o un mock se cuela.
 */
function esCandidatoAsistenteReal(candidato) {
  return candidato.categoria === 'Asistente';
}

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

/**
 * ¿La empresa del candidato aparece en un texto libre del sponsor?
 *
 * Tolera que espacios, guiones o puntos varíen entre ambos lados
 * (ej. "Price Shoes" vs "Priceshoes") pero exige límite de palabra
 * para no matchear prefijos pegados ("Andrea" vs "AndreaMoto").
 *
 * Limitación conocida: no se recortan sufijos legales (SA de CV, S.A.,
 * SAPI). Si el candidato trae razón social completa y el sponsor escribió
 * solo el nombre comercial, no hay match. Hoy es raro (1 caso en pruebas);
 * no vale una lista de recortes frágil. Revisar si Ticketópolis empieza a
 * capturar razón social de forma consistente.
 *
 * No reusa un "solo quitar separadores": eso resuelve Price Shoes y
 * reintroduce Andrea/AndreaMoto. Ambas correcciones viven aquí.
 */
function empresaMencionadaEn(empresaCandidato, textoLibreSponsor) {
  if (!empresaCandidato || !textoLibreSponsor) return false;

  const soloAlfanum = (texto) =>
    normalizar(texto).replace(/&/g, 'y').replace(/[^a-z0-9]/g, '');

  const empresaNorm = soloAlfanum(empresaCandidato);
  if (empresaNorm.length < 3) return false;

  const textoConSeparadores = normalizar(textoLibreSponsor)
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const letras = empresaNorm.split('');
  const patronFlexible = letras
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^a-z0-9]*');
  const patronFinal = new RegExp(`(?<![a-z0-9])${patronFlexible}(?![a-z0-9])`);

  return patronFinal.test(textoConSeparadores);
}

/**
 * Señal débil de texto libre: lo que el asistente escribió en "¿Hay alguna otra
 * solución que estés buscando?" vs. lo que el sponsor escribió en "Nombres y/o
 * descripción de clientes potenciales".
 *
 * Liz señaló explícitamente que estos dos campos abiertos se relacionan, pero
 * también que son los más difíciles de automatizar. Aquí se implementa como una
 * coincidencia de palabras significativas — deliberadamente conservadora
 * (palabras de 5+ letras, mínimo 2 coincidencias) para no generar ruido.
 * Es un empujón al ranking, nunca un filtro duro.
 */
function coincidenciaTextoLibre(textoAsistente, textoSponsor) {
  if (!textoAsistente || !textoSponsor) return false;
  const palabrasAsistente = normalizar(textoAsistente)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 5);
  if (palabrasAsistente.length === 0) return false;
  const sponsorNorm = normalizar(textoSponsor);
  const coincidencias = palabrasAsistente.filter((p) => sponsorNorm.includes(p));
  return coincidencias.length >= 2;
}

// ─────────────────────────────────────────────────────────────
// Capa 2 — scoring con match directo
// ─────────────────────────────────────────────────────────────
function calcularScore(sponsor, candidato, cuotaPendiente) {
  let score = 0;
  const detalle = [];
  const senales = {
    oroMolido: false,
    esVip: false,
    esSpeaker: false,
    esPresencial: false,
    areaCoincidente: null,
    solucionesCoincidentes: [],
    coincidenciaTextoLibre: false,
    madurezNegocio: null, // "Temprano" | "PyME" | "Consolidado" | null
    tamanoNegocio: null, // "Grande" | "Mediana" | null (Micro/Pequeña no llegan aquí)
    icpModaEcommerce: null, // "Sí" | "No" | "Ambiguo" | null
    estadoWebExa: null, // "Con web" | "Sin web" | null
    cuotaPendiente,
    // Distinguir "inferido" de "sin dato" importa: el reporte que lee Laura
    // afirma cosas sobre el candidato, y decir "esta info fue inferida" cuando
    // en realidad el campo está vacío es afirmarle algo falso. Solo se marca
    // como inferido si el dato lo dice explícitamente.
    fuenteInferida: candidato.fuenteDato === 'Inferido',
  };

  if (empresaMencionadaEn(candidato.empresa, sponsor.clientesPotencialesDeseados)) {
    score += PESOS.ORO_MOLIDO;
    detalle.push('oro_molido: empresa mencionada explícitamente por el sponsor');
    senales.oroMolido = true;
  }

  // Prioridad VIP — ver nota de diseño arriba.
  if (candidato.ticketTipo === 'Presencial VIP') {
    score += PESOS.VIP;
    detalle.push('vip: asistente con boleto Presencial VIP (citas incluidas)');
    senales.esVip = true;
  } else if (candidato.ticketTipo === 'Speaker') {
    score += PESOS.VIP;
    detalle.push('speaker: ponente del evento (mismo peso que VIP, sin bonus de presencial)');
    senales.esSpeaker = true;
  }

  // Desde 1-sep el bonus de modalidad se reserva al boleto Presencial.
  // Presencial VIP y Speaker ya reciben su prioridad de 500 y no acumulan
  // estos 150 puntos.
  if (candidato.ticketTipo === 'Presencial') {
    score += PESOS.PRESENCIAL;
    detalle.push('presencial: asistente con boleto presencial (prioridad sobre virtual)');
    senales.esPresencial = true;
  }

  // Madurez Negocio (Exa) — solo si NO hay Tamaño de Negocio declarado.
  // Si ambos existieran, gana el select del formulario (TAMANO_*), no se suman.
  const tamanoDeclarado = TAMANOS_QUE_ENTRAN.has(candidato.tamanoNegocio);
  if (tamanoDeclarado) {
    if (candidato.tamanoNegocio === TAMANO_GRANDE) {
      score += PESOS.TAMANO_GRANDE;
      detalle.push('tamano_negocio: empresa grande');
      senales.tamanoNegocio = 'Grande';
    } else if (candidato.tamanoNegocio === TAMANO_MEDIANA) {
      score += PESOS.TAMANO_MEDIANA;
      detalle.push('tamano_negocio: empresa mediana');
      senales.tamanoNegocio = 'Mediana';
    }
  } else if (candidato.madurezNegocioExa === 'Consolidado') {
    score += PESOS.MADUREZ_NEGOCIO_CONSOLIDADO;
    detalle.push('madurez_negocio: empresa consolidada (Exa)');
    senales.madurezNegocio = 'Consolidado';
  } else if (candidato.madurezNegocioExa === 'PyME') {
    score += PESOS.MADUREZ_NEGOCIO_PYME;
    detalle.push('madurez_negocio: PyME (Exa)');
    senales.madurezNegocio = 'PyME';
  } else if (candidato.madurezNegocioExa === 'Temprano') {
    senales.madurezNegocio = 'Temprano'; // no suma, pero se registra
  }

  // ICP Moda/Ecommerce (Exa) — Capa 2, no filtro duro. Vacío ≠ No.
  if (candidato.icpModaEcommerce === 'Sí') {
    score += PESOS.ICP_MODA_ECOMMERCE_SI;
    detalle.push('icp_moda_ecommerce: Exa confirmó encaje con moda/ecommerce');
    senales.icpModaEcommerce = 'Sí';
  } else if (candidato.icpModaEcommerce === 'No') {
    score += PESOS.ICP_MODA_ECOMMERCE_NO;
    detalle.push('icp_moda_ecommerce: Exa detectó que no encaja con moda/ecommerce');
    senales.icpModaEcommerce = 'No';
  } else if (candidato.icpModaEcommerce === 'Ambiguo') {
    senales.icpModaEcommerce = 'Ambiguo';
  }

  // Estado Web (Exa) — solo premia; Sin web y vacío no restan.
  if (candidato.estadoWebExa === 'Con web') {
    score += PESOS.ESTADO_WEB_CON_WEB;
    detalle.push('estado_web: presencia web activa (Exa)');
    senales.estadoWebExa = 'Con web';
  } else if (candidato.estadoWebExa === 'Sin web') {
    senales.estadoWebExa = 'Sin web';
  }

  // MATCH DIRECTO de área — el "Area" del asistente contra "Puestos Buscados"
  // del sponsor. Son listas idénticas, así que es comparación exacta, no
  // heurística. "Otro" no cuenta (ver VALOR_COMODIN).
  if (
    candidato.area &&
    candidato.area !== VALOR_COMODIN &&
    (sponsor.puestosBuscados || []).includes(candidato.area)
  ) {
    score += PESOS.AREA;
    detalle.push(`area: coincide con "${candidato.area}"`);
    senales.areaCoincidente = candidato.area;
  }

  // MATCH DIRECTO de soluciones — intersección de dos multi-select con las
  // mismas opciones. Cada coincidencia suma por separado (un sponsor puede
  // ofrecer hasta 3 soluciones y el asistente puede buscar varias).
  const solucionesSponsor = sponsor.solucion || [];
  for (const solucion of candidato.solucionesBuscadas || []) {
    if (solucion !== VALOR_COMODIN && solucionesSponsor.includes(solucion)) {
      score += PESOS.SOLUCION;
      detalle.push(`solucion: coincide con "${solucion}"`);
      senales.solucionesCoincidentes.push(solucion);
    }
  }

  // Señal débil de texto libre ↔ texto libre.
  if (coincidenciaTextoLibre(candidato.otraSolucionBuscada, sponsor.clientesPotencialesDeseados)) {
    score += PESOS.OTRA_SOLUCION_TEXTO;
    detalle.push('texto_libre: lo que el asistente escribió se parece a lo que describió el sponsor');
    senales.coincidenciaTextoLibre = true;
  }

  if (cuotaPendiente > 0) {
    detalle.push(`cuota_pendiente: ${cuotaPendiente} citas por cubrir`);
  }

  if (candidato.fuenteDato === 'Declarado') score += PESOS.DATO_DECLARADO;
  else if (candidato.fuenteDato === 'Inferido') score += PESOS.DATO_INFERIDO;

  return { score, detalle, senales };
}

// ─────────────────────────────────────────────────────────────
// Explicación en lenguaje natural para los reportes que ve Laura.
// Por plantillas, no por LLM: cada frase solo aparece si su señal
// estructurada es real, así que nunca inventa una razón.
// ─────────────────────────────────────────────────────────────
function generarExplicacionNatural(candidato, senales) {
  const frases = [];
  const empresaCandidato = candidato.empresa || candidato.nombre || 'la empresa candidata';

  if (senales.oroMolido) {
    frases.push(`el sponsor mencionó explícitamente que le gustaría reunirse con ${candidato.empresa}`);
  }
  if (senales.areaCoincidente) {
    frases.push(`trabaja en ${senales.areaCoincidente}, que es justo una de las áreas con las que el sponsor quiere reunirse`);
  }
  if (senales.solucionesCoincidentes.length === 1) {
    frases.push(`está buscando ${senales.solucionesCoincidentes[0]}, que es exactamente lo que el sponsor ofrece`);
  } else if (senales.solucionesCoincidentes.length > 1) {
    const lista = senales.solucionesCoincidentes.join(', ');
    frases.push(`está buscando ${senales.solucionesCoincidentes.length} de las soluciones que ofrece el sponsor (${lista})`);
  }
  if (senales.coincidenciaTextoLibre) {
    frases.push(`lo que describió que busca se parece al tipo de cliente que el sponsor está buscando`);
  }

  let texto;
  if (frases.length === 0) {
    texto = `Se sugiere a ${empresaCandidato} porque cumple el perfil de tamaño de empresa de las citas 1a1, aunque sin coincidencias específicas de área o solución.`;
  } else if (frases.length === 1) {
    texto = `Se sugiere a ${empresaCandidato} porque ${frases[0]}.`;
  } else {
    const ultima = frases.pop();
    texto = `Se sugiere a ${empresaCandidato} porque ${frases.join(', ')}, y además ${ultima}.`;
  }

  if (senales.esVip) {
    texto += ` Es asistente VIP, así que sus citas de negocio ya vienen incluidas en su boleto y tiene prioridad.`;
  } else if (senales.esSpeaker) {
    texto += ` Es ponente del evento, así que sus citas de negocio ya vienen incluidas y tiene prioridad.`;
  }
  if (senales.esPresencial && !senales.esVip) {
    texto += ` Asistirá de forma presencial, lo cual se prioriza sobre los asistentes virtuales.`;
  }
  if (senales.tamanoNegocio === 'Grande') {
    texto += ` Declaró un negocio de tamaño grande.`;
  } else if (senales.tamanoNegocio === 'Mediana') {
    texto += ` Declaró un negocio de tamaño mediano.`;
  }
  if (senales.madurezNegocio === 'Consolidado') {
    texto += ` El enriquecimiento automático identificó su negocio como consolidado.`;
  } else if (senales.madurezNegocio === 'PyME') {
    texto += ` El enriquecimiento automático identificó su negocio como una PyME establecida.`;
  }
  if (senales.icpModaEcommerce === 'Sí') {
    texto += ` Exa confirmó que el negocio encaja con el perfil de moda/ecommerce del evento.`;
  } else if (senales.icpModaEcommerce === 'No') {
    texto += ` Exa detectó que el negocio no tiene relación clara con moda/ecommerce — candidato con menor prioridad por esta señal.`;
  }
  if (senales.estadoWebExa === 'Con web') {
    texto += ` El negocio cuenta con presencia web activa.`;
  }
  if (senales.cuotaPendiente > 0) {
    texto += ` El sponsor todavía tiene ${senales.cuotaPendiente} cita${senales.cuotaPendiente === 1 ? '' : 's'} por cubrir de su cuota.`;
  }
  if (senales.fuenteInferida) {
    texto += ` (Nota: parte de la información de este candidato fue inferida automáticamente, no declarada directamente por la persona.)`;
  }

  return texto;
}

/**
 * Matchmaking para un sponsor: Capa 1 (filtros duros) + Capa 2 (ranking).
 * Con escribirEnNotion=true crea una fila en Citas por candidato (Estatus=
 * "Sugerido"). Ya NO escribe "Match Sugerido" (campo en desuso desde el 9
 * de agosto). Nunca toca Calendar ni crea citas con horario.
 *
 * @param {string} sponsorPageId
 * @param {object} [opciones]
 * @param {number} [opciones.topN] - default: cuota del sponsor + MARGEN_CANDIDATOS
 * @param {boolean} [opciones.escribirEnNotion=false] - default cambiado a false
 *   el 5 de agosto (hallazgo B): antes era true, lo que divergía del default
 *   de la herramienta MCP (false). El endpoint REST (matchmaking.controller.js)
 *   no se ve afectado por este cambio porque ya pasa el valor explícito
 *   (`escribirEnNotion: escribirEnNotion !== false`) — este default solo
 *   protege a consumidores futuros que llamen esta función sin especificar
 *   la opción.
 * @param {boolean} [opciones.incluirVirtual=false] - ⚠️ DEPRECADO el 13 de
 *   agosto. Virtual ahora es elegible por default (ver contactos.service.js,
 *   buscarAsistentesCandidatos) — este parámetro ya no tiene ningún efecto,
 *   se conserva solo por compatibilidad con llamadas existentes (tools MCP,
 *   endpoint REST) que todavía lo pasan explícito.
 * @param {Set<string>} [opciones._paresConCitaActivaCache] - USO INTERNO
 *   SOLAMENTE, llamado por sugerirMatchesGlobal para evitar el timeout (ver
 *   fix del 10 de agosto). Si se provee, se usa en vez de consultar Notion
 *   por cada candidato. NO documentar como parámetro público de la tool MCP
 *   ni del endpoint REST — es un detalle de implementación, no una opción
 *   que el agente o un cliente externo deba conocer o pasar.
 */
async function sugerirMatchesParaSponsor(
  sponsorPageId,
  { topN, escribirEnNotion = false, incluirVirtual = false, _paresConCitaActivaCache = null } = {}
) {
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

  // Capa 1a — filtros que resuelve Notion (categoría, elegibilidad de boleto,
  // dado de baja). Etapa de negocio ya no se filtra (28-ago).
  const candidatosBrutos = (await notionContactos.buscarAsistentesCandidatos({ incluirVirtual })).filter(
    (c) => esCandidatoAsistenteReal(c) && esCandidatoPorTamanoNegocio(c)
  );

  // Capa 1b — filtros que necesitan texto libre o cruzar con la tabla Citas.
  const candidatosValidos = [];
  for (const candidato of candidatosBrutos) {
    if (empresaMencionadaEn(candidato.empresa, sponsor.clientesActuales)) continue; // ya es su cliente

    // Con caché (sugerirMatchesGlobal): lookup O(1) en memoria.
    // Sin caché (camino individual): una llamada HTTP a Notion por candidato.
    const yaTieneCita = _paresConCitaActivaCache
      ? notionCitas.existeCitaActivaEntreEnCache(_paresConCitaActivaCache, {
          sponsorPageId,
          asistentePageId: candidato.id,
        })
      : await notionCitas.existeCitaActivaEntre({
          sponsorPageId,
          asistentePageId: candidato.id,
        });
    if (yaTieneCita) continue;
    candidatosValidos.push(candidato);
  }

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

  // Ya NO escribe "Match Sugerido" (campo en desuso a partir del 9 de agosto)
  // — en su lugar crea una fila en Citas por cada candidato, en estado "Sugerido".
  if (escribirEnNotion && top.length > 0) {
    for (const r of top) {
      await notionCitas.crearCitaSugerida({
        sponsorPageId,
        asistentePageId: r.candidato.id,
        sponsorNombre: sponsor.nombre,
        asistenteNombre: r.candidato.nombre,
        sponsorEmpresa: sponsor.empresa,
        asistenteEmpresa: r.candidato.empresa,
        score: r.score,
        explicacion: generarExplicacionNatural(r.candidato, r.senales),
      });
    }
  }

  return {
    // calendarioGoogleId: se lee de Notion en parseContacto desde el 12-ago
    // (multi-calendario), pero no se exponía en este return — el agente no
    // podía resolver sponsor_calendario_id al reservar. Evidencia: Caso 5 de
    // bitacora-verificacion-12ago.md. Vacío/null = sponsor sin calendario
    // dedicado todavía; el agente debe reportarlo y no inventar un ID.
    sponsor: {
      id: sponsor.id,
      nombre: sponsor.nombre,
      empresa: sponsor.empresa,
      nivelPatrocinio: sponsor.nivelPatrocinio,
      calendarioGoogleId: sponsor.calendarioGoogleId || null,
    },
    cuotaPendiente,
    incluyoVirtuales: incluirVirtual,
    totalCandidatosEvaluados: candidatosBrutos.length,
    totalCandidatosValidos: candidatosValidos.length,
    sugerencias: top.map((r) => ({
      id: r.candidato.id,
      nombre: r.candidato.nombre,
      empresa: r.candidato.empresa,
      etiqueta: r.candidato.empresa || r.candidato.nombre,
      ticketTipo: r.candidato.ticketTipo,
      score: r.score,
      detalle: r.detalle,
      explicacion: generarExplicacionNatural(r.candidato, r.senales),
    })),
  };
}

/**
 * Guarda UNA sola sugerencia elegida de un resultado previo (individual o
 * global). Recalcula el matchmaking para no confiar en score/explicación
 * enviados por el agente, valida que el par siga siendo elegible y crea
 * únicamente esa fila en Citas con Estatus="Sugerido".
 *
 * La explicación siempre la genera el backend a partir de señales reales.
 */
async function guardarSugerenciaIndividual(sponsorPageId, asistentePageId) {
  if (!sponsorPageId || !asistentePageId) {
    throw new Error('sponsorPageId y asistentePageId son requeridos para guardar una sugerencia individual.');
  }

  // Traer todos los candidatos válidos del sponsor permite seleccionar uno
  // mostrado previamente por sugerir_matches_global aunque no estuviera en
  // el topN default de la corrida individual.
  const resultado = await sugerirMatchesParaSponsor(sponsorPageId, {
    topN: Number.MAX_SAFE_INTEGER,
    escribirEnNotion: false,
  });
  const sugerencia = resultado.sugerencias.find((s) => s.id === asistentePageId);

  if (!sugerencia) {
    throw new Error(
      `El asistente ${asistentePageId} no es una sugerencia válida actual para "${resultado.sponsor.nombre}". ` +
        'Puede haber dejado de ser elegible, ser cliente actual, o ya existir una cita/sugerencia activa para ese par.'
    );
  }

  const pagina = await notionCitas.crearCitaSugerida({
    sponsorPageId,
    asistentePageId,
    sponsorNombre: resultado.sponsor.nombre,
    asistenteNombre: sugerencia.nombre,
    sponsorEmpresa: resultado.sponsor.empresa,
    asistenteEmpresa: sugerencia.empresa,
    score: sugerencia.score,
    explicacion: sugerencia.explicacion,
  });

  return {
    guardada: true,
    notionPageId: pagina?.id || null,
    sponsor: resultado.sponsor,
    sugerencia,
    mensaje: `Sugerencia guardada: ${sugerencia.empresa || sugerencia.nombre} × ${resultado.sponsor.empresa || resultado.sponsor.nombre}.`,
  };
}

/**
 * Compara dos niveles de patrocinio para el desempate.
 * Un nivel desconocido cae al fondo (-1) en vez de tronar.
 */
function compararPrioridadSponsor(nivelA, nivelB) {
  const a = PRIORIDAD_NIVEL_PATROCINIO[nivelA] ?? -1;
  const b = PRIORIDAD_NIVEL_PATROCINIO[nivelB] ?? -1;
  if (a === b) return 'empate';
  return a > b ? 'A' : 'B';
}

/**
 * Corre matchmaking para todos los sponsors activos y detecta cuándo el mismo
 * asistente sale como candidato para más de uno.
 *
 * NO excluye a nadie: como no hay tope de citas por asistente, esto es una capa
 * de visibilidad para Liz (a quién ofrecerle primero si de verdad se vuelve un
 * conflicto de horario). El conflicto real de horario lo resuelve
 * booking.service.js por separado.
 *
 * Un sponsor Bronce (o cualquier error individual) NO tumba la corrida
 * completa — se registra en "omitidos" y sigue con el resto.
 *
 * FIX DEL 10 DE AGOSTO — timeout por volumen de llamadas a Notion.
 * Diagnóstico: con 8 sponsors reales, el patrón anterior (una llamada HTTP
 * a existeCitaActivaEntre por cada candidato evaluado, dentro del loop de
 * cada sponsor) generaba ~130-150 llamadas secuenciales en una sola
 * invocación — muy por encima de cualquier timeout razonable de un tool
 * call MCP. Fix: se trae UNA sola vez (con paginación real) la lista
 * completa de pares con cita activa, ANTES del loop de sponsors, y se pasa
 * como caché interna a cada llamada de sugerirMatchesParaSponsor. Esto
 * baja el número de llamadas HTTP de ~130-150 a un puñado (1-2 para la
 * caché + 1 por sponsor para buscarAsistentesCandidatos + 1 por sponsor
 * para contarCitasConfirmadasPorSponsor — ninguna de estas dos últimas se
 * tocó, siguen igual que antes).
 *
 * sugerirMatchesParaSponsor() individual (fuera de este loop) NO cambia su
 * comportamiento — sigue consultando Notion por candidato, porque para un
 * solo sponsor el volumen nunca fue el problema.
 *
 * @param {object} [opciones]
 * @param {number} [opciones.topN]
 * @param {boolean} [opciones.escribirEnNotion=false] - antes venía hardcodeado
 *   en `true` sin opción de cambiarlo (encontrado el 6 de agosto al construir
 *   la herramienta MCP sugerir_matches_global) — cualquier llamada escribía
 *   sugerencias de TODOS los sponsors activos sin posibilidad de dry-run.
 *   Ahora default false, consistente con sugerirMatchesParaSponsor y con la
 *   capa MCP. El endpoint REST (matchmaking.controller.js, sugerirMatchesTodos)
 *   NO pasaba este valor — se corrigió ahí también para pasar `true` explícito
 *   y no cambiar su comportamiento existente. Desde el 9 de agosto la escritura
 *   va a filas Citas en "Sugerido", no a "Match Sugerido".
 * @param {boolean} [opciones.incluirVirtual=false] - ⚠️ DEPRECADO el 13 de
 *   agosto. Virtual ahora es elegible por default (ver contactos.service.js,
 *   buscarAsistentesCandidatos) — este parámetro ya no tiene ningún efecto,
 *   se conserva solo por compatibilidad con llamadas existentes (tools MCP,
 *   endpoint REST) que todavía lo pasan explícito.
 */
async function sugerirMatchesGlobal({ topN, escribirEnNotion = false, incluirVirtual = false } = {}) {
  const sponsors = await notionContactos.listarSponsorsActivos();

  // Cargar la caché UNA sola vez ANTES del loop — fix del timeout (10 ago).
  const paresConCitaActivaCache = await notionCitas.obtenerParesConCitaActiva();

  const resultadosPorSponsor = [];
  const omitidos = [];

  for (const sponsor of sponsors) {
    try {
      const resultado = await sugerirMatchesParaSponsor(sponsor.id, {
        topN,
        escribirEnNotion,
        incluirVirtual,
        _paresConCitaActivaCache: paresConCitaActivaCache,
      });
      resultadosPorSponsor.push({ sponsor, resultado });
    } catch (err) {
      omitidos.push({ sponsorId: sponsor.id, nombre: sponsor.nombre, motivo: err.message });
    }
  }

  const porAsistente = new Map();
  for (const { sponsor, resultado } of resultadosPorSponsor) {
    for (const sug of resultado.sugerencias) {
      if (!porAsistente.has(sug.id)) {
        porAsistente.set(sug.id, { nombre: sug.nombre, empresa: sug.empresa, ticketTipo: sug.ticketTipo, apariciones: [] });
      }
      porAsistente.get(sug.id).apariciones.push({
        sponsorId: sponsor.id,
        sponsorNombre: sponsor.nombre,
        nivelPatrocinio: sponsor.nivelPatrocinio,
        score: sug.score,
        explicacion: sug.explicacion,
        detalle: sug.detalle,
      });
    }
  }

  const solapamientos = [];
  for (const [asistenteId, info] of porAsistente.entries()) {
    if (info.apariciones.length < 2) continue;
    const ordenados = [...info.apariciones].sort((a, b) => {
      const pa = PRIORIDAD_NIVEL_PATROCINIO[a.nivelPatrocinio] ?? -1;
      const pb = PRIORIDAD_NIVEL_PATROCINIO[b.nivelPatrocinio] ?? -1;
      return pb - pa;
    });
    solapamientos.push({
      asistenteId,
      asistenteNombre: info.nombre,
      asistenteEmpresa: info.empresa,
      asistenteTicket: info.ticketTipo,
      ordenDePrioridad: ordenados,
    });
  }

  return {
    totalSponsorsEvaluados: sponsors.length,
    totalSponsorsOmitidos: omitidos.length,
    omitidos,
    // Se devuelve el ranking completo por sponsor (con explicacion/detalle)
    // para que el agente siempre pueda explicar por qué propuso cada match
    // y para que luego pueda guardar solo uno con
    // guardar_sugerencia_individual.
    resultadosPorSponsor: resultadosPorSponsor.map(({ sponsor, resultado }) => ({
      sponsor: {
        id: sponsor.id,
        nombre: sponsor.nombre,
        empresa: sponsor.empresa,
        nivelPatrocinio: sponsor.nivelPatrocinio,
      },
      cuotaPendiente: resultado.cuotaPendiente,
      sugerencias: resultado.sugerencias,
    })),
    totalSolapamientosDetectados: solapamientos.length,
    solapamientos,
  };
}

/**
 * Marca como aprobado el match entre un sponsor y un asistente específico.
 * Requiere que exista una fila en Citas con Estatus="Sugerido" para ese
 * par exacto — si no existe, lanza error explícito en vez de crear una
 * fila nueva o aprobar algo que nunca se sugirió.
 *
 * La decisión de SI aprobar (confirmación humana, verificación de
 * identidad) es responsabilidad del agente/prompt que llama esta
 * función — aquí solo se ejecuta el cambio de estado ya decidido.
 *
 * @param {string} sponsorPageId
 * @param {string} asistentePageId
 * @returns {object} el resultado de la escritura en Notion, más los
 * nombres resueltos para que el agente pueda confirmar en su respuesta
 * qué exactamente quedó aprobado.
 */
async function aprobarMatch(sponsorPageId, asistentePageId) {
  const sponsor = await notionContactos.obtenerContacto(sponsorPageId);
  const asistente = await notionContactos.obtenerContacto(asistentePageId);

  const filas = await notionCitas.buscarSugerenciasPendientesPorSponsor(sponsorPageId);
  // Filtra TODAS las filas del par, no solo la primera — un find() aquí
  // dejaría en silencio una segunda fila huérfana si por alguna razón
  // (carrera entre dos corridas de sugerir_matches, dato viejo antes de
  // esta corrección) llegaran a existir dos filas activas para el mismo
  // par. Ese escenario no debería pasar gracias a la corrección de
  // existeCitaActivaEntre, pero si pasa, es mejor bloquear con un mensaje
  // claro que aprobar arbitrariamente "la primera que encontró".
  const filasDelPar = filas.filter((f) => {
    const principales = (f.properties['Contacto Principal']?.relation || []).map((r) => r.id);
    return principales.includes(asistentePageId);
  });

  if (filasDelPar.length === 0) {
    throw new Error(
      `No existe una sugerencia pendiente entre "${sponsor.nombre}" y "${asistente.nombre}". ` +
      `Solo se puede aprobar un match que ya fue sugerido con sugerir_matches_para_sponsor ` +
      `(escribirEnNotion=true). Verifica los IDs o vuelve a correr la sugerencia primero.`
    );
  }

  if (filasDelPar.length > 1) {
    throw new Error(
      `Se encontraron ${filasDelPar.length} filas de sugerencia activas entre "${sponsor.nombre}" ` +
      `y "${asistente.nombre}" — esto no debería pasar y necesita revisión manual en la tabla Citas ` +
      `antes de aprobar nada, para no aprobar la fila equivocada. IDs: ${filasDelPar.map((f) => f.id).join(', ')}`
    );
  }

  const filaDelPar = filasDelPar[0];

  const estatusActual = filaDelPar.properties['Estatus']?.select?.name;
  if (estatusActual === 'Aprobado') {
    return {
      yaEstabaAprobado: true,
      sponsor: sponsor.nombre,
      asistente: asistente.nombre,
      mensaje: `Este match ya estaba aprobado — no se hizo ningún cambio.`,
    };
  }

  await notionCitas.marcarCitaAprobada(filaDelPar.id);

  return {
    yaEstabaAprobado: false,
    sponsor: sponsor.nombre,
    asistente: asistente.nombre,
    citaPageId: filaDelPar.id,
    mensaje: `Match aprobado: ${asistente.nombre} (${asistente.empresa}) × ${sponsor.nombre} (${sponsor.empresa}).`,
  };
}

module.exports = {
  sugerirMatchesParaSponsor,
  guardarSugerenciaIndividual,
  sugerirMatchesGlobal,
  aprobarMatch,
  compararPrioridadSponsor,
  // exportados para pruebas / depuración:
  calcularScore,
  esCandidatoPorTamanoNegocio,
  esCandidatoAsistenteReal,
  generarExplicacionNatural,
  empresaMencionadaEn,
  coincidenciaTextoLibre,
  PRIORIDAD_NIVEL_PATROCINIO,
  TAMANO_GRANDE,
  TAMANO_MEDIANA,
  PESOS,
};
