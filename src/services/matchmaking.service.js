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
  AREA: 60, // match directo de área/puesto
  SOLUCION: 60, // match directo por cada solución coincidente
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
    areaCoincidente: null,
    solucionesCoincidentes: [],
    coincidenciaTextoLibre: false,
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
 * Solo ESCRIBE en "Match Sugerido" — nunca toca "Match Aprobado" ni crea citas.
 *
 * @param {string} sponsorPageId
 * @param {object} [opciones]
 * @param {number} [opciones.topN] - default: cuota del sponsor + MARGEN_CANDIDATOS
 * @param {boolean} [opciones.escribirEnNotion=true]
 * @param {boolean} [opciones.incluirVirtual=false] - modo de excepción, ver
 *   contactos.service.js. Solo para sponsors que no lograron cubrir su cuota
 *   cerca de la fecha del evento.
 */
async function sugerirMatchesParaSponsor(
  sponsorPageId,
  { topN, escribirEnNotion = true, incluirVirtual = false } = {}
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
    const yaTieneCita = await notionCitas.existeCitaActivaEntre({
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

  if (escribirEnNotion && top.length > 0) {
    await notionContactos.sugerirMatches({
      sponsorPageId,
      asistentePageIds: top.map((r) => r.candidato.id),
    });
  }

  return {
    sponsor: { id: sponsor.id, nombre: sponsor.nombre, nivelPatrocinio: sponsor.nivelPatrocinio },
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
 */
async function sugerirMatchesGlobal({ topN, incluirVirtual = false } = {}) {
  const sponsors = await notionContactos.listarSponsorsActivos();
  const resultadosPorSponsor = [];
  const omitidos = [];

  for (const sponsor of sponsors) {
    try {
      const resultado = await sugerirMatchesParaSponsor(sponsor.id, {
        topN,
        escribirEnNotion: true,
        incluirVirtual,
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
    totalSolapamientosDetectados: solapamientos.length,
    solapamientos,
  };
}

module.exports = {
  sugerirMatchesParaSponsor,
  sugerirMatchesGlobal,
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
