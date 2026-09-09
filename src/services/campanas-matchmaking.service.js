// Disparo manual de campañas para filas Aprobado pendientes de procesar.
// Agrupa por asistente: varias sugerencias nuevas producen un solo mensaje.
// El default es simulación; habilitar envío real requiere un opt-in por env.
// soloMarcar escribe Notion sin WhatsApp: solo el script one-shot, nunca MCP/REST.

const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const platicaClient = require('./platica-client.service');
const {
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  ESTADO_ENVIO_PENDIENTE,
  MINUTOS_TIMEOUT_ENVIO_EN_CURSO,
  esCandidataEnvioCampana,
} = require('../utils/estado-envio-campana');
const { reintentarConBackoff, INTENTOS_MAXIMOS } = require('../utils/reintentar-con-backoff');

const OFERTA_INICIAL = 'Oferta inicial';
const PLANTILLAS_OFERTA = Object.freeze(
  Object.fromEntries(
    [1, 2, 3, 4].map((cantidad) => [
      cantidad,
      {
        env: `PLATICA_TEMPLATE_OFERTA_INICIAL_${cantidad}`,
        nombre: `agendar_cita_inicial_aprobado_${cantidad}`,
      },
    ])
  )
);
const TEMPLATE_ENV_FOLLOWUP_72H = 'PLATICA_TEMPLATE_FOLLOWUP_72H';
const TEMPLATE_SIMULACION_FOLLOWUP_72H = 'followup_72hrs';
const HORAS_FOLLOWUP = 72;
const HORA_LABORAL_INICIO = 9;
const HORA_LABORAL_FIN = 18;
const ESTADO_FOLLOWUP_EN_CURSO = 'En curso';
const ESTADO_FOLLOWUP_ENVIADO = 'Enviado';
const ESTADO_FOLLOWUP_FALLO = 'Falló';
const TEMPLATE_ENV_RECORDATORIO = 'PLATICA_TEMPLATE_RECORDATORIO_EVENTO';
const TEMPLATE_SIMULACION_RECORDATORIO = 'PENDIENTE_PLANTILLA_RECORDATORIO_EVENTO';
// Confirmado por Adler: 14 días antes del evento. El endpoint es seguro
// como cron diario: si la ventana no se ha cumplido, sale sin efecto.
const DIAS_ANTES_RECORDATORIO_EVENTO = 14;
// Primer día del evento. Se reusa CITAS_FECHAS_EVENTO si está definida;
// este fallback es el mismo valor documentado (7-oct-2026).
const FECHA_EVENTO = '2026-10-07';
const ZONA_EVENTO = 'America/Mexico_City';

const ESTATUS_YA_INTERACTUO = [
  'Confirmada',
  'Confirmada sin notificar',
  'Pendiente Calendar',
  'Completada',
];
const ESTATUS_SIN_INTERACTUAR = ['Sugerido', 'Aprobado', 'Rechazado'];
// Propuesta de Adler: elegibles = quien ya participó del matchmaking.
// Rechazado no estaba en la lista de elegibles del prompt, pero sí en
// "nunca interactuó". Lo incluimos para no dejar fuera a quien solo tiene
// filas rechazadas. Completada puede no existir aún en el select de Citas.
const ESTATUS_ELEGIBLES_RECORDATORIO = [
  ...new Set([...ESTATUS_SIN_INTERACTUAR, ...ESTATUS_YA_INTERACTUO]),
];

function agruparPorAsistente(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    if (!grupos.has(fila.asistentePageId)) grupos.set(fila.asistentePageId, []);
    grupos.get(fila.asistentePageId).push(fila);
  }
  return grupos;
}

async function persistirEnvioCampana({ contactoId, fechaEnvio }) {
  const campana = OFERTA_INICIAL;
  await contactosService.actualizarEstadoCampana({ contactoId, campana, fechaEnvio });
}

function plantillaPara(cantidadSponsors, modoSimulacion) {
  const contrato = PLANTILLAS_OFERTA[cantidadSponsors];
  if (!contrato) {
    throw new Error(`No existe plantilla de oferta inicial para ${cantidadSponsors} sponsors`);
  }
  const configurada = process.env[contrato.env];
  if (configurada) return configurada;
  if (modoSimulacion) return contrato.nombre;
  throw new Error(`Falta ${contrato.env}; no se puede enviar ${OFERTA_INICIAL}`);
}

// Cada sponsor ocupa una variable distinta. Los saltos están en el cuerpo fijo:
// Meta rechaza saltos, tabs y más de 4 espacios seguidos dentro de un parámetro.
// No hay tope de Meta por variable: el recorte es solo para el cuerpo de 1024.
// Primero se mandan todas las coincidencias; si no caben, 2 → 1 → nombres.
const RECORTE_SOLUCIONES_SI_NO_CABE = [2, 1, 0];
const TOPE_CUERPO_META = 1024;
const CUERPO_BASE_OFERTA = [
  '¡Hola, {{1}}! Qué gusto saludarte 😊',
  '',
  'Te escribo de parte del equipo de Fashion Digital Talks 2026.',
  '',
  '¡Estamos a tan solo unos días del evento! Y tu acceso incluye reuniones privadas de 20 minutos con expertos, pensadas para ayudarte a resolver retos actuales de tu empresa y conectar con soluciones relevantes para ti.',
  '',
  'Te comparto algunas opciones que encontramos de acuerdo a tu perfil:',
];
const CIERRE_CUERPO_OFERTA =
  '¿Te gustaría reunirte con alguno de ellos? O ¿deseas que te ayudemos a buscar otras opciones?';
// Emoji y diferencias de conteo de Meta. Mejor un cuerpo un poco más corto
// que un rechazo (#100) en silencio.
const COLCHON_CONTEO_META = 24;
// 'Otro' es el comodín del multi-select: no le dice nada al asistente.
const SOLUCION_COMODIN = 'Otro';

function limpiarParametroPlantilla(texto) {
  return String(texto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function capitalizarPalabra(palabra) {
  if (!palabra) return palabra;
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es');
}

// Ticketópolis vuelca el nombre completo y en mayúsculas ("ANA MARIA PEREZ"),
// así que el saludo salía gritado y con apellidos. Se manda solo el primer
// token: no se intenta adivinar nombres compuestos ("Ana María" → "Ana").
function primerNombreParaSaludo(nombreCompleto) {
  const [primero = ''] = limpiarParametroPlantilla(nombreCompleto).split(' ');
  return primero
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizarPalabra(parte)))
    .join('');
}

function capitalizarTokenNombre(token) {
  return token
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizarPalabra(parte)))
    .join('');
}

// Primer nombre + apellido paterno. 2 tokens se quedan. 3+ usa el primero y
// el penúltimo (Zuleyma Jessamine Chávez Coronado → Zuleyma Chávez;
// Rodrigo Cerda Somoza → Rodrigo Cerda). Pedido Adler 4-sep.
function nombreRepresentanteParaOferta(nombreCompleto) {
  const tokens = limpiarParametroPlantilla(nombreCompleto)
    .split(' ')
    .filter(Boolean)
    .map(capitalizarTokenNombre);
  if (tokens.length === 0) return '';
  if (tokens.length <= 2) return tokens.join(' ');
  return `${tokens[0]} ${tokens[tokens.length - 2]}`;
}

function cuerpoPlantillaOferta(cantidadSponsors) {
  const variables = Array.from({ length: cantidadSponsors }, (_, indice) => `{{${indice + 2}}}`);
  return [
    ...CUERPO_BASE_OFERTA,
    '',
    ...variables.flatMap((variable) => [variable, '']),
    CIERRE_CUERPO_OFERTA,
  ].join('\n');
}

function largoCuerpoOferta(params) {
  const valores = Array.isArray(params) ? params : [...arguments];
  const cantidadSponsors = Math.max(1, valores.length - 1);
  let cuerpo = cuerpoPlantillaOferta(cantidadSponsors);
  valores.forEach((valor, indice) => {
    cuerpo = cuerpo.replace(`{{${indice + 1}}}`, String(valor || ''));
  });
  return cuerpo.length;
}

function solucionesRelevantes(sponsor, solucionesBuscadas, maxSoluciones) {
  const ofrece = (Array.isArray(sponsor.solucion) ? sponsor.solucion : [sponsor.solucion])
    .map((solucion) => limpiarParametroPlantilla(solucion))
    .filter((solucion) => solucion && solucion !== SOLUCION_COMODIN);
  const busca = new Set(solucionesBuscadas || []);
  const coincidentes = ofrece.filter((solucion) => busca.has(solucion));
  // Registro legacy sin 'Soluciones Buscadas': no hay intersección posible, así
  // que se muestra lo que el sponsor ofrece en vez de dejar el nombre solo.
  const lista = coincidentes.length ? coincidentes : ofrece;
  if (!Number.isFinite(maxSoluciones)) return lista;
  return lista.slice(0, maxSoluciones);
}

function parametrosSugerencias(sugerencias, solucionesBuscadas, maxSoluciones) {
  return (sugerencias || []).map((sponsor, indice) => {
    const empresa = limpiarParametroPlantilla(sponsor.empresa);
    const persona = nombreRepresentanteParaOferta(sponsor.nombre);
    const soluciones = solucionesRelevantes(sponsor, solucionesBuscadas, maxSoluciones);
    let quien;
    if (persona && empresa && persona.localeCompare(empresa, 'es', { sensitivity: 'accent' }) !== 0) {
      quien = `${persona} de la empresa ${empresa}`;
    } else if (empresa) {
      quien = `la empresa ${empresa}`;
    } else if (persona) {
      quien = persona;
    } else {
      quien = 'Sponsor';
    }
    const experiencia = soluciones.length ? `, expertos en ${soluciones.join(' · ')}` : '';
    return limpiarParametroPlantilla(`${indice + 1}. ${quien}${experiencia}`);
  });
}

function prepararOferta({ contacto, sugerencias, modoSimulacion }) {
  const param1 = primerNombreParaSaludo(contacto.nombre) || 'Asistente';
  let lista = [...(sugerencias || [])];
  while (lista.length > 0) {
    for (const maxSol of [Infinity, ...RECORTE_SOLUCIONES_SI_NO_CABE]) {
      const params = [
        param1,
        ...parametrosSugerencias(lista, contacto.solucionesBuscadas, maxSol),
      ];
      if (largoCuerpoOferta(params) + COLCHON_CONTEO_META <= TOPE_CUERPO_META) {
        return {
          payload: {
            phone: contacto.whatsapp,
            templateName: plantillaPara(lista.length, modoSimulacion),
            params,
          },
          cantidadSponsors: lista.length,
        };
      }
    }
    lista = lista.slice(0, -1);
  }
  throw new Error('No hay sponsors que quepan en la plantilla de oferta inicial');
}

// Salida legible para reportes auxiliares. Cada renglón representa una variable
// distinta; estos saltos no se mandan dentro de ningún parámetro de WhatsApp.
function textoSugerencias(sugerencias, solucionesBuscadas, maxSoluciones = Infinity) {
  return parametrosSugerencias(sugerencias, solucionesBuscadas, maxSoluciones).join('\n');
}

// {{1}} es el primer nombre y {{2}}..{{5}} son sponsors individuales.
// Se elige la plantilla de 1, 2, 3 o 4 según la cantidad real.
// Ya no manda horarios: los ofrece el agente en la conversación con
// consultar_disponibilidad_cita, que revalida contra Notion en ese momento.
function payloadPara({ contacto, sugerencias, modoSimulacion }) {
  return prepararOferta({ contacto, sugerencias, modoSimulacion }).payload;
}

/**
 * Reporte legible para Laura/Liz. Cada renglón corresponde exactamente a una
 * variable de sponsor enviada en la plantilla seleccionada.
 */
function detalleNominalOferta(contacto, payload) {
  return {
    destinatario: {
      nombre: contacto.nombre || null,
      empresa: contacto.empresa || null,
    },
    sugerenciasInformadas: (payload?.params || []).slice(1).join('\n'),
  };
}

function modoSimulacionCampanas(modoSimulacion) {
  return modoSimulacion !== undefined
    ? Boolean(modoSimulacion)
    : process.env.CAMPANAS_MATCHMAKING_MODO_SIMULACION !== 'false';
}

function exigirEnvioRealHabilitado(simulando) {
  if (!simulando && process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de campañas deshabilitado. Define CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true solo después de aprobar las plantillas.'
    );
  }
}

function modoSimulacionFollowup(modoSimulacion) {
  return modoSimulacion !== undefined
    ? Boolean(modoSimulacion)
    : process.env.FOLLOWUP_72H_MODO_SIMULACION !== 'false';
}

function exigirEnvioRealFollowupHabilitado(simulando) {
  if (!simulando && process.env.FOLLOWUP_72H_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de follow-up 72h deshabilitado. Define FOLLOWUP_72H_ENVIO_REAL_HABILITADO=true solo después de revisar la simulación.'
    );
  }
}

function plantillaFollowup72h(modoSimulacion) {
  const configurada = process.env[TEMPLATE_ENV_FOLLOWUP_72H];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_SIMULACION_FOLLOWUP_72H;
  throw new Error(`Falta ${TEMPLATE_ENV_FOLLOWUP_72H}; no se puede enviar follow-up 72h`);
}

function partesFechaHoraMexico(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_EVENTO,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  return Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
}

function esHorarioLaboralFollowup(fecha) {
  const partes = partesFechaHoraMexico(fecha);
  const diaLaboral = !['Sat', 'Sun'].includes(partes.weekday);
  const hora = Number(partes.hour);
  return diaLaboral && hora >= HORA_LABORAL_INICIO && hora < HORA_LABORAL_FIN;
}

function estadoFollowupProcesable(contacto, ahora) {
  if (contacto.estadoFollowup72h === ESTADO_FOLLOWUP_ENVIADO) return false;
  if (contacto.estadoFollowup72h !== ESTADO_FOLLOWUP_EN_CURSO) return true;
  const inicio = new Date(contacto.fechaFollowup72h);
  if (Number.isNaN(inicio.getTime())) return true;
  return ahora.getTime() - inicio.getTime() >= MINUTOS_TIMEOUT_ENVIO_EN_CURSO * 60 * 1000;
}

function fechaMensaje(message) {
  const fecha = new Date(message?.creationDate || message?.lastUpdate);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function mensajeEntrantePosterior(messages, desde) {
  const limite = new Date(desde);
  if (Number.isNaN(limite.getTime())) return null;
  return (
    messages.find((message) => {
      const fecha = fechaMensaje(message);
      return message?.direction === 'incoming' && fecha && fecha.getTime() > limite.getTime();
    }) || null
  );
}

function normalizarContenidoMensaje(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function followupSalientePosterior(messages, desde) {
  const limite = new Date(desde);
  if (Number.isNaN(limite.getTime())) return null;
  const frase = 'quiero darle seguimiento personalmente a tus citas 1 a 1';
  return (
    messages.find((message) => {
      const fecha = fechaMensaje(message);
      return (
        message?.direction === 'outgoing' &&
        fecha &&
        fecha.getTime() >= limite.getTime() &&
        normalizarContenidoMensaje(message.content).includes(frase)
      );
    }) || null
  );
}

function payloadFollowup72h(contacto, modoSimulacion) {
  return {
    phone: contacto.whatsapp,
    templateName: plantillaFollowup72h(modoSimulacion),
    params: [primerNombreParaSaludo(contacto.nombre) || 'Asistente'],
  };
}

async function dispararCampanasAprobadas({
  modoSimulacion,
  soloMarcar = false,
  ahora = new Date(),
} = {}) {
  if (soloMarcar && modoSimulacion === true) {
    throw new Error('soloMarcar y modoSimulacion no pueden usarse juntos.');
  }

  // soloMarcar: true ignora el default de simulación del env. Si no, un
  // script { soloMarcar: true } con CAMPANAS_MATCHMAKING_MODO_SIMULACION=true
  // quedaría ambiguo (¿escribe Notion o no?) y podría caer en enviarPlantilla.
  const simulando = soloMarcar ? false : modoSimulacionCampanas(modoSimulacion);
  if (!soloMarcar) exigirEnvioRealHabilitado(simulando);

  const candidatas = await citasService.buscarCitasAprobadasSinCampana();
  const grupos = agruparPorAsistente(candidatas);
  const resumen = {
    modoSimulacion: simulando,
    soloMarcar: Boolean(soloMarcar),
    contactosProcesados: grupos.size,
    enviadosOfertaInicial: 0,
    simuladosOfertaInicial: 0,
    marcadosSinEnviarOfertaInicial: 0,
    sinEnviar: 0,
    errores: [],
    detalle: [],
  };

  for (const [asistentePageId, filas] of grupos.entries()) {
    try {
      const contacto = await contactosService.obtenerContacto(asistentePageId);
      if (!soloMarcar && contacto.ultimaCampanaEnviada) {
        resumen.sinEnviar += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          motivo: 'CAMPANA_PREVIA',
          campanaPrevia: contacto.ultimaCampanaEnviada,
        });
        continue;
      }

      if (soloMarcar) {
        const fechaEnvio = ahora.toISOString();
        await persistirEnvioCampana({
          contactoId: asistentePageId,
          fechaEnvio,
        });
        await citasService.marcarCampanaEnviada(filas.map((f) => f.id));
        resumen.marcadosSinEnviarOfertaInicial += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          campana: OFERTA_INICIAL,
          marcadoSinEnviar: true,
        });
        continue;
      }

      if (!contacto.whatsapp) {
        throw new Error('El contacto no tiene WhatsApp');
      }

      const ordenadas = [...filas].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      const filasOfrecidas = [];
      const sponsorsVistos = new Set();
      for (const fila of ordenadas) {
        if (filasOfrecidas.length >= 4) break;
        if (!fila.sponsorPageId || sponsorsVistos.has(fila.sponsorPageId)) continue;
        sponsorsVistos.add(fila.sponsorPageId);
        filasOfrecidas.push(fila);
      }
      const sugerencias = [];
      for (const fila of filasOfrecidas) {
        sugerencias.push(await contactosService.obtenerContacto(fila.sponsorPageId));
      }
      const idsOfrecidas = filasOfrecidas.map((fila) => fila.id);
      // La oferta ya no lleva horarios, así que tener sponsors sugeridos basta
      // para enviarla. Antes se saltaba a quien no tuviera un bloque libre en
      // ese instante (SIN_HORARIOS_SUGERIDOS) y esa gente nunca recibía nada.
      const oferta = prepararOferta({ contacto, sugerencias, modoSimulacion: simulando });
      const payload = oferta.payload;
      const idsRealmenteOfrecidas = idsOfrecidas.slice(0, oferta.cantidadSponsors);
      const idsRealmenteOmitidas = filas
        .filter((fila) => !idsRealmenteOfrecidas.includes(fila.id))
        .map((fila) => fila.id);
      const detalleNominal = detalleNominalOferta(contacto, payload);
      if (simulando) {
        resumen.simuladosOfertaInicial += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          ofrecidas: idsRealmenteOfrecidas,
          omitidas: idsRealmenteOmitidas,
          campana: OFERTA_INICIAL,
          payload,
          simulado: true,
          ...detalleNominal,
        });
        continue;
      }

      const ids = filas.map((f) => f.id);
      await citasService.actualizarEstadoEnvioCampana(ids, {
        estado: ESTADO_ENVIO_EN_CURSO,
        fechaInicioEnvio: ahora.toISOString(),
      });

      try {
        await platicaClient.enviarPlantilla(payload);
      } catch (errEnvio) {
        try {
          await citasService.actualizarEstadoEnvioCampana(ids, { estado: ESTADO_ENVIO_FALLO });
        } catch (_) {
          /* el rastro queda en En curso; el timeout de 10 min permite reintento */
        }
        throw errEnvio;
      }

      const fechaEnvio = ahora.toISOString();
      // Mismo criterio que booking.service.js (SMTP / confirmación Notion):
      // 3 intentos, espera 300*intento ms. No aplica a En curso ni a WhatsApp.
      try {
        await reintentarConBackoff(async () => {
          await persistirEnvioCampana({
            contactoId: asistentePageId,
            fechaEnvio,
          });
          await citasService.marcarCampanaEnviada(ids);
        });
      } catch (errNotion) {
        const detalle = errNotion.message || String(errNotion);
        throw new Error(
          `Fallo de escritura Notion POST-envío tras ${INTENTOS_MAXIMOS} intentos: ${detalle}`
        );
      }

      resumen.enviadosOfertaInicial += 1;
      resumen.detalle.push({
        asistentePageId,
        filas: ids,
        ofrecidas: idsRealmenteOfrecidas,
        omitidas: idsRealmenteOmitidas,
        campana: OFERTA_INICIAL,
        simulado: false,
        ...detalleNominal,
      });
    } catch (err) {
      resumen.errores.push({ asistentePageId, mensaje: err.message });
    }
  }

  return resumen;
}

async function ejecutarFollowups72h({ modoSimulacion, ahora = new Date() } = {}) {
  const simulando = modoSimulacionFollowup(modoSimulacion);
  exigirEnvioRealFollowupHabilitado(simulando);

  const resumen = {
    modoSimulacion: simulando,
    horarioLaboral: esHorarioLaboralFollowup(ahora),
    candidatos: 0,
    simulados: 0,
    enviados: 0,
    omitidosRespondio: 0,
    omitidosConCita: 0,
    omitidosEstado: 0,
    reconciliados: 0,
    errores: [],
    detalle: [],
  };

  if (!resumen.horarioLaboral) {
    return { ...resumen, motivo: 'FUERA_DE_HORARIO_LABORAL' };
  }

  const fechaLimite = new Date(ahora.getTime() - HORAS_FOLLOWUP * 60 * 60 * 1000);
  const [contactos, citasPorAsistente] = await Promise.all([
    contactosService.listarContactosConOfertaInicialVencida(fechaLimite.toISOString()),
    citasService.cargarCitasPorAsistenteParaRecordatorio(),
  ]);
  resumen.candidatos = contactos.length;

  for (const contacto of contactos) {
    try {
      if (contacto.respondioOfertaInicial) {
        resumen.omitidosRespondio += 1;
        resumen.detalle.push({ contactoId: contacto.id, motivo: 'YA_RESPONDIO' });
        continue;
      }
      if (contactoYaInteractuo(citasPorAsistente.get(contacto.id) || [])) {
        resumen.omitidosConCita += 1;
        resumen.detalle.push({ contactoId: contacto.id, motivo: 'YA_TIENE_CITA' });
        continue;
      }
      if (!estadoFollowupProcesable(contacto, ahora)) {
        resumen.omitidosEstado += 1;
        resumen.detalle.push({
          contactoId: contacto.id,
          motivo: contacto.estadoFollowup72h === ESTADO_FOLLOWUP_ENVIADO ? 'YA_ENVIADO' : 'EN_CURSO_RECIENTE',
        });
        continue;
      }
      if (!contacto.whatsapp || !contacto.fechaUltimaCampana) {
        resumen.detalle.push({ contactoId: contacto.id, motivo: 'DATOS_INCOMPLETOS' });
        continue;
      }

      const messages = await platicaClient.cargarMensajesCliente(contacto.whatsapp);
      const respuesta = mensajeEntrantePosterior(messages, contacto.fechaUltimaCampana);
      if (respuesta) {
        if (!simulando) {
          await contactosService.marcarRespuestaOfertaInicial(
            contacto.id,
            fechaMensaje(respuesta).toISOString()
          );
        }
        resumen.omitidosRespondio += 1;
        resumen.detalle.push({
          contactoId: contacto.id,
          whatsapp: contacto.whatsapp,
          motivo: 'RESPUESTA_EN_PLATICA',
          fechaRespuesta: fechaMensaje(respuesta).toISOString(),
        });
        continue;
      }

      if (
        contacto.estadoFollowup72h === ESTADO_FOLLOWUP_EN_CURSO &&
        followupSalientePosterior(messages, contacto.fechaFollowup72h)
      ) {
        if (!simulando) {
          await contactosService.actualizarEstadoFollowup72h({
            contactoId: contacto.id,
            estado: ESTADO_FOLLOWUP_ENVIADO,
            fecha: contacto.fechaFollowup72h || ahora.toISOString(),
            reactivacionesEnviadas: (contacto.reactivacionesEnviadas || 0) + 1,
          });
        }
        resumen.reconciliados += 1;
        resumen.detalle.push({ contactoId: contacto.id, motivo: 'ENVIO_RECONCILIADO_EN_PLATICA' });
        continue;
      }

      const payload = payloadFollowup72h(contacto, simulando);
      if (simulando) {
        resumen.simulados += 1;
        resumen.detalle.push({
          contactoId: contacto.id,
          nombre: contacto.nombre,
          whatsapp: contacto.whatsapp,
          fechaOfertaInicial: contacto.fechaUltimaCampana,
          payload,
          simulado: true,
        });
        continue;
      }

      const inicioEnvio = ahora.toISOString();
      await contactosService.actualizarEstadoFollowup72h({
        contactoId: contacto.id,
        estado: ESTADO_FOLLOWUP_EN_CURSO,
        fecha: inicioEnvio,
      });

      // Cierra casi toda la carrera entre la primera lectura y el envío:
      // después de reclamar el contacto se consulta Plática una vez más.
      const messagesTrasClaim = await platicaClient.cargarMensajesCliente(contacto.whatsapp);
      const respuestaTrasClaim = mensajeEntrantePosterior(
        messagesTrasClaim,
        contacto.fechaUltimaCampana
      );
      if (respuestaTrasClaim) {
        await contactosService.marcarRespuestaOfertaInicial(
          contacto.id,
          fechaMensaje(respuestaTrasClaim).toISOString()
        );
        await contactosService.actualizarEstadoFollowup72h({
          contactoId: contacto.id,
          estado: null,
          fecha: null,
        });
        resumen.omitidosRespondio += 1;
        resumen.detalle.push({ contactoId: contacto.id, motivo: 'RESPONDIO_ANTES_DE_ENVIAR' });
        continue;
      }

      try {
        await platicaClient.enviarPlantilla(payload);
      } catch (errorEnvio) {
        try {
          await contactosService.actualizarEstadoFollowup72h({
            contactoId: contacto.id,
            estado: ESTADO_FOLLOWUP_FALLO,
            fecha: ahora.toISOString(),
          });
        } catch (_) {
          // En curso vence en 10 min; la reconciliación evita duplicar si sí salió.
        }
        throw errorEnvio;
      }

      await reintentarConBackoff(async () => {
        await contactosService.actualizarEstadoFollowup72h({
          contactoId: contacto.id,
          estado: ESTADO_FOLLOWUP_ENVIADO,
          fecha: ahora.toISOString(),
          reactivacionesEnviadas: (contacto.reactivacionesEnviadas || 0) + 1,
        });
      });
      resumen.enviados += 1;
      resumen.detalle.push({
        contactoId: contacto.id,
        nombre: contacto.nombre,
        whatsapp: contacto.whatsapp,
        fechaOfertaInicial: contacto.fechaUltimaCampana,
        fechaFollowup: ahora.toISOString(),
        simulado: false,
      });
    } catch (error) {
      resumen.errores.push({
        contactoId: contacto.id,
        nombre: contacto.nombre,
        mensaje: error.message || String(error),
      });
    }
  }

  return resumen;
}

let colaFollowup72h = Promise.resolve();
function enviarFollowups72h(opciones) {
  const ejecucion = colaFollowup72h.then(() => ejecutarFollowups72h(opciones));
  colaFollowup72h = ejecucion.catch(() => {});
  return ejecucion;
}

function plantillaRecordatorio(modoSimulacion) {
  const configurada = process.env[TEMPLATE_ENV_RECORDATORIO];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_SIMULACION_RECORDATORIO;
  throw new Error(
    `Falta ${TEMPLATE_ENV_RECORDATORIO}; no se puede enviar el recordatorio del evento`
  );
}

function fechaPrimerDiaEvento() {
  const desdeEnv = String(process.env.CITAS_FECHAS_EVENTO || '')
    .split(',')
    .map((f) => f.trim())
    .find((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));
  return desdeEnv || FECHA_EVENTO;
}

function ymdEnMexico(ahora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_EVENTO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora instanceof Date ? ahora : new Date(ahora));
}

function restarDiasYmd(ymd, dias) {
  const [anio, mes, dia] = ymd.split('-').map(Number);
  const utc = Date.UTC(anio, mes - 1, dia) - dias * 24 * 60 * 60 * 1000;
  return new Date(utc).toISOString().slice(0, 10);
}

function diffDiasYmd(desde, hasta) {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (24 * 60 * 60 * 1000));
}

/**
 * Ventana: hoy (México) >= primer día del evento − 14 días.
 * diasRestantes = días que faltan para que abra (0 si ya abrió).
 */
function evaluarVentanaRecordatorio(ahora = new Date()) {
  const fechaEvento = fechaPrimerDiaEvento();
  const abreEl = restarDiasYmd(fechaEvento, DIAS_ANTES_RECORDATORIO_EVENTO);
  const hoy = ymdEnMexico(ahora);
  const diasRestantes = Math.max(0, diffDiasYmd(hoy, abreEl));
  return {
    cumplida: hoy >= abreEl,
    fechaEvento,
    abreEl,
    hoy,
    diasRestantes,
    diasAntes: DIAS_ANTES_RECORDATORIO_EVENTO,
  };
}

function contactoYaInteractuo(filas) {
  return (filas || []).some((fila) => ESTATUS_YA_INTERACTUO.includes(fila.estatus));
}

function payloadRecordatorio({ contacto, modoSimulacion }) {
  return {
    phone: contacto.whatsapp,
    templateName: plantillaRecordatorio(modoSimulacion),
    params: [primerNombreParaSaludo(contacto.nombre) || 'Asistente'],
  };
}

/**
 * Recordatorio-reactivación del evento. Solo se manda a quien nunca
 * interactuó (todas sus filas en Sugerido/Aprobado/Rechazado).
 * Quien ya reservó se marca para no reevaluarlo, sin WhatsApp.
 * Seguro como cron diario: antes de la ventana responde sin tocar Notion
 * ni Plática. `ahora` es solo para pruebas; el HTTP no lo acepta.
 */
async function enviarRecordatorioEvento({ modoSimulacion, ahora = new Date() } = {}) {
  const ventana = evaluarVentanaRecordatorio(ahora);
  if (!ventana.cumplida) {
    return {
      disparado: false,
      motivo: 'VENTANA_NO_CUMPLIDA',
      diasRestantes: ventana.diasRestantes,
      fechaEvento: ventana.fechaEvento,
      abreEl: ventana.abreEl,
      hoy: ventana.hoy,
      diasAntes: ventana.diasAntes,
    };
  }

  const simulando = modoSimulacionCampanas(modoSimulacion);
  exigirEnvioRealHabilitado(simulando);

  const porAsistente = await citasService.cargarCitasPorAsistenteParaRecordatorio();
  const resumen = {
    disparado: true,
    motivo: null,
    diasRestantes: 0,
    fechaEvento: ventana.fechaEvento,
    abreEl: ventana.abreEl,
    hoy: ventana.hoy,
    modoSimulacion: simulando,
    diasAntesReferencia: DIAS_ANTES_RECORDATORIO_EVENTO,
    contactosEvaluados: porAsistente.size,
    enviados: 0,
    simulados: 0,
    marcadosSinEnviarPorInteraccion: 0,
    omitidosYaMarcado: 0,
    sinEnviar: 0,
    errores: [],
    detalle: [],
  };

  for (const [asistentePageId, filas] of porAsistente.entries()) {
    try {
      const contacto = await contactosService.obtenerContacto(asistentePageId);
      if (contacto.recordatorioEventoEnviado) {
        resumen.omitidosYaMarcado += 1;
        resumen.detalle.push({
          asistentePageId,
          motivo: 'RECORDATORIO_YA_ENVIADO',
        });
        continue;
      }

      if (contactoYaInteractuo(filas)) {
        if (simulando) {
          resumen.sinEnviar += 1;
          resumen.detalle.push({
            asistentePageId,
            motivo: 'YA_INTERACTUO',
            simulado: true,
          });
          continue;
        }
        await contactosService.marcarRecordatorioEventoEnviado(asistentePageId);
        resumen.marcadosSinEnviarPorInteraccion += 1;
        resumen.detalle.push({
          asistentePageId,
          motivo: 'YA_INTERACTUO',
          marcadoSinEnviar: true,
        });
        continue;
      }

      if (!contacto.whatsapp) {
        throw new Error('El contacto no tiene WhatsApp');
      }

      const payload = payloadRecordatorio({ contacto, modoSimulacion: simulando });
      if (simulando) {
        resumen.simulados += 1;
        resumen.detalle.push({
          asistentePageId,
          campana: 'Recordatorio evento',
          payload,
          simulado: true,
        });
        continue;
      }

      await platicaClient.enviarPlantilla(payload);
      try {
        await reintentarConBackoff(async () => {
          await contactosService.marcarRecordatorioEventoEnviado(asistentePageId);
        });
      } catch (errNotion) {
        throw new Error(
          `Fallo de escritura Notion POST-envío tras ${INTENTOS_MAXIMOS} intentos: ${errNotion.message || String(errNotion)}`
        );
      }

      resumen.enviados += 1;
      resumen.detalle.push({
        asistentePageId,
        campana: 'Recordatorio evento',
        simulado: false,
      });
    } catch (err) {
      resumen.errores.push({ asistentePageId, mensaje: err.message });
    }
  }

  return resumen;
}

module.exports = {
  OFERTA_INICIAL,
  DIAS_ANTES_RECORDATORIO_EVENTO,
  FECHA_EVENTO,
  evaluarVentanaRecordatorio,
  ESTATUS_YA_INTERACTUO,
  agruparPorAsistente,
  primerNombreParaSaludo,
  nombreRepresentanteParaOferta,
  parametrosSugerencias,
  textoSugerencias,
  prepararOferta,
  payloadPara,
  payloadFollowup72h,
  enviarFollowups72h,
  esHorarioLaboralFollowup,
  estadoFollowupProcesable,
  mensajeEntrantePosterior,
  followupSalientePosterior,
  HORAS_FOLLOWUP,
  largoCuerpoOferta,
  TOPE_CUERPO_META,
  contactoYaInteractuo,
  dispararCampanasAprobadas,
  enviarRecordatorioEvento,
  esCandidataEnvioCampana,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  ESTADO_ENVIO_PENDIENTE,
  MINUTOS_TIMEOUT_ENVIO_EN_CURSO,
};
