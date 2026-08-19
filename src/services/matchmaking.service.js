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
// Las 3 relaciones directas (confirmadas por Liz, sesión del 24 de julio):
//   sponsor "Etapa Cliente Buscada"  ↔  asistente "Etapa de Negocio"
//   sponsor "Puestos Buscados"       ↔  asistente "Area"
//   sponsor "Solucion"               ↔  asistente "Soluciones Buscadas"
// Más una relación de texto libre, débil:
//   sponsor "Clientes Potenciales Deseados" ↔ asistente "Otra Solucion Buscada"
//
// Ver documentación completa en 09-matchmaking-directo-2026.md

const notionContactos = require('./contactos.service');
const notionCitas = require('./citas.service');

// ─────────────────────────────────────────────────────────────
// ALIAS DE ETAPA — la única traducción que sigue haciendo falta.
//
// 4 de las 5 opciones son idénticas palabra por palabra entre los dos
// formularios. La quinta NO:
//   sponsor:   "Venta por redes sociales"
//   asistente: "Vendo principalmente por redes sociales"
// Sin este alias, ese caso se descartaría en silencio (sin error, solo
// perdiendo candidatos válidos). Verificado contra el schema real de Notion
// el 30 de julio 2026.
//
// Si algún día se homologan las dos listas al 100%, este mapa se puede
// vaciar y todo sigue funcionando.
// ─────────────────────────────────────────────────────────────
const ALIAS_ETAPA_SPONSOR_A_ASISTENTE = {
  'Venta por redes sociales': ['Vendo principalmente por redes sociales'],
};

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
  VIP: 500, // asistente con boleto Presencial VIP
  // Agregado 13 de agosto — Virtual pasó a ser elegible por default en
  // buscarAsistentesCandidatos (ver contactos.service.js), pero Laura pidió
  // seguir priorizando presencial sobre virtual. Mismo patrón de diseño que
  // VIP: impulso fuerte en el ranking, no exclusión — un Virtual con match
  // excelente (área+solución+oro molido) sigue pudiendo ganarle a un
  // Presencial sin señales específicas; entre dos candidatos con match
  // idéntico, el presencial gana. Deliberadamente menor que VIP (esto es
  // sobre canal, no sobre calidad de perfil) pero mayor que cualquier señal
  // individual de match (área/solución), para que el desempate sea claro.
  PRESENCIAL: 150, // aplica a "Presencial" y "Presencial VIP"; 0 para "Virtual"
  AREA: 60, // match directo de área/puesto
  SOLUCION: 60, // match directo por cada solución coincidente
  // Agregado 14 de agosto — pedido por Laura en la Demo 2: "el tamaño de la
  // empresa 100% es un criterio... es lo más importante". Esto NO es el
  // filtro duro de descarte que ella pidió formalmente (ese sigue bloqueado,
  // pendiente de que ella defina el criterio operativo) — es un adelanto
  // acotado usando la señal que ya existe hoy en Notion vía el
  // enriquecimiento de Luis (Madurez Negocio (Exa): Temprano/PyME/Consolidado).
  // Pesos por debajo de Área/Solución a propósito: es una inferencia
  // automática, no un match directo de catálogo ni un dato declarado por el
  // propio contacto — mismo criterio de cautela que ya distingue Declarado
  // (10) de Inferido (3) más abajo. "Temprano" no suma ni resta.
  MADUREZ_NEGOCIO_CONSOLIDADO: 40,
  MADUREZ_NEGOCIO_PYME: 15,
  OTRA_SOLUCION_TEXTO: 25, // señal débil de texto libre ↔ texto libre
  CUOTA_PENDIENTE_POR_CITA: 15,
  DATO_DECLARADO: 10,
  DATO_INFERIDO: 3,
};

// "Otro" existe como opción en ambos lados de área y solución, pero que un
// sponsor busque "Otro" y un asistente sea "Otro" NO es una señal real de
// afinidad — son dos "no sé" que coinciden por accidente. Se excluye del match.
const VALOR_COMODIN = 'Otro';

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

/**
 * Traduce las "Etapa Cliente Buscada" del sponsor a los valores válidos de
 * "Etapa de Negocio" del asistente, aplicando los alias donde hagan falta.
 * Regresa null si el sponsor no especificó ninguna (no se filtra por etapa).
 */
function getEtapasValidas(sponsor) {
  if (!sponsor.etapaClienteBuscada || sponsor.etapaClienteBuscada.length === 0) return null;
  const set = new Set();
  for (const etapaSponsor of sponsor.etapaClienteBuscada) {
    const alias = ALIAS_ETAPA_SPONSOR_A_ASISTENTE[etapaSponsor];
    if (alias) {
      alias.forEach((a) => set.add(a));
    } else {
      set.add(etapaSponsor); // match literal — el caso de 4 de las 5 opciones
    }
  }
  return Array.from(set);
}

/** ¿La empresa del candidato aparece mencionada dentro de un texto libre del sponsor? */
function empresaMencionadaEn(empresaCandidato, textoLibreSponsor) {
  if (!empresaCandidato || !textoLibreSponsor) return false;
  const empresaNorm = normalizar(empresaCandidato).trim();
  if (empresaNorm.length < 3) return false; // evita falsos positivos con nombres muy cortos
  return normalizar(textoLibreSponsor).includes(empresaNorm);
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
    esPresencial: false,
    areaCoincidente: null,
    solucionesCoincidentes: [],
    coincidenciaTextoLibre: false,
    madurezNegocio: null, // "Temprano" | "PyME" | "Consolidado" | null
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
  }

  // Prioridad de modalidad presencial sobre virtual — agregado 13 de agosto,
  // ver nota de diseño en PESOS.PRESENCIAL arriba. Cualquier modalidad
  // presencial (con o sin VIP) recibe el mismo empujón; Virtual no recibe
  // nada aquí (0 puntos, no se resta nada tampoco).
  if (candidato.ticketTipo === 'Presencial VIP' || candidato.ticketTipo === 'Presencial') {
    score += PESOS.PRESENCIAL;
    detalle.push('presencial: asistente con boleto presencial (prioridad sobre virtual)');
    senales.esPresencial = true;
  }

  // Madurez Negocio (Exa) — agregado 14 de agosto, ver nota de diseño en
  // PESOS.MADUREZ_NEGOCIO_* arriba. Solo suma si el campo está poblado;
  // "Temprano" y vacío se tratan igual (ninguno suma), pero se distinguen en
  // `senales.madurezNegocio` para que la explicación en lenguaje natural
  // pueda diferenciar "no se sabe" de "se sabe que es una empresa temprana"
  // si algún día hace falta.
  if (candidato.madurezNegocioExa === 'Consolidado') {
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
    score += cuotaPendiente * PESOS.CUOTA_PENDIENTE_POR_CITA;
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
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) porque su etapa de negocio es la que el sponsor busca, aunque sin más coincidencias específicas.`;
  } else if (frases.length === 1) {
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) porque ${frases[0]}.`;
  } else {
    const ultima = frases.pop();
    texto = `Se sugiere a ${candidato.nombre} (${candidato.empresa}) porque ${frases.join(', ')}, y además ${ultima}.`;
  }

  if (senales.esVip) {
    texto += ` Es asistente VIP, así que sus citas de negocio ya vienen incluidas en su boleto y tiene prioridad.`;
  }
  if (senales.esPresencial && !senales.esVip) {
    texto += ` Asistirá de forma presencial, lo cual se prioriza sobre los asistentes virtuales.`;
  }
  if (senales.madurezNegocio === 'Consolidado') {
    texto += ` El enriquecimiento automático identificó su negocio como consolidado.`;
  } else if (senales.madurezNegocio === 'PyME') {
    texto += ` El enriquecimiento automático identificó su negocio como una PyME establecida.`;
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
  // dado de baja, etapa de negocio).
  const etapasValidas = getEtapasValidas(sponsor);
  const candidatosBrutos = await notionContactos.buscarAsistentesCandidatos({ etapasValidas, incluirVirtual });

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
    score: sugerencia.score,
    explicacion: sugerencia.explicacion,
  });

  return {
    guardada: true,
    notionPageId: pagina?.id || null,
    sponsor: resultado.sponsor,
    sugerencia,
    mensaje: `Sugerencia guardada: ${sugerencia.nombre} (${sugerencia.empresa}) × ${resultado.sponsor.nombre}.`,
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
  getEtapasValidas,
  calcularScore,
  generarExplicacionNatural,
  empresaMencionadaEn,
  coincidenciaTextoLibre,
  ALIAS_ETAPA_SPONSOR_A_ASISTENTE,
  PRIORIDAD_NIVEL_PATROCINIO,
  PESOS,
};
