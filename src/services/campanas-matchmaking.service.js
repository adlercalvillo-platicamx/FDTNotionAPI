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
const TEMPLATE_ENV_OFERTA = 'PLATICA_TEMPLATE_OFERTA_INICIAL';
const TEMPLATE_SIMULACION = 'oferta_inicial_con_horarios';
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

function plantillaPara(modoSimulacion) {
  const configurada = process.env[TEMPLATE_ENV_OFERTA];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_SIMULACION;
  throw new Error(`Falta ${TEMPLATE_ENV_OFERTA}; no se puede enviar ${OFERTA_INICIAL}`);
}

function textoSugerencias(sugerencias) {
  return sugerencias
    .map((sponsor, indice) => {
      const nombre = sponsor.empresa || sponsor.nombre || 'Sponsor';
      const solucion = Array.isArray(sponsor.solucion)
        ? sponsor.solucion.join(', ')
        : sponsor.solucion || 'Solución por confirmar';
      return `${indice + 1}. ${nombre} — ${solucion || 'Solución por confirmar'}`;
    })
    .join('\n');
}

function payloadPara({ contacto, sugerencias, horarios, modoSimulacion }) {
  const horariosLegibles = horarios.map((bloque) =>
    citasService.formatearHorarioLegible(bloque.inicio)
  );
  return {
    phone: contacto.whatsapp,
    templateName: plantillaPara(modoSimulacion),
    params: [
      contacto.nombre || 'Asistente',
      textoSugerencias(sugerencias),
      horariosLegibles[0] || '',
      horariosLegibles[1] || '',
      horariosLegibles[2] || '',
    ],
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
  const indiceConfirmadas = soloMarcar
    ? null
    : await citasService.cargarIndiceCitasConfirmadas();
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
      // Un solo sponsor aporta horarios: el de mayor score con ≥1 bloque.
      // Si el top está lleno, se recorre el resto de las ofrecidas por score.
      const { horarios, sponsorHorarios } = elegirHorariosDeSugerencias(
        filasOfrecidas,
        indiceConfirmadas
      );
      const idsOfrecidas = filasOfrecidas.map((fila) => fila.id);
      const idsOmitidas = filas
        .filter((fila) => !idsOfrecidas.includes(fila.id))
        .map((fila) => fila.id);

      if (horarios.length === 0) {
        resumen.sinEnviar += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          ofrecidas: idsOfrecidas,
          omitidas: idsOmitidas,
          sponsorHorarios: null,
          motivo: 'SIN_HORARIOS_SUGERIDOS',
        });
        continue;
      }

      const payload = payloadPara({ contacto, sugerencias, horarios, modoSimulacion: simulando });
      if (simulando) {
        resumen.simuladosOfertaInicial += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          ofrecidas: idsOfrecidas,
          omitidas: idsOmitidas,
          sponsorHorarios,
          campana: OFERTA_INICIAL,
          payload,
          simulado: true,
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
        ofrecidas: idsOfrecidas,
        omitidas: idsOmitidas,
        sponsorHorarios,
        campana: OFERTA_INICIAL,
        simulado: false,
      });
    } catch (err) {
      resumen.errores.push({ asistentePageId, mensaje: err.message });
    }
  }

  return resumen;
}

function elegirHorariosDeSugerencias(filasOfrecidas, indiceConfirmadas) {
  for (const fila of filasOfrecidas || []) {
    const bloques = citasService.bloquesDisponiblesParaSponsor({
      sponsorPageId: fila.sponsorPageId,
      indiceConfirmadas,
    });
    const horarios = citasService.seleccionarHorariosParaOferta(bloques);
    if (horarios.length > 0) {
      return { horarios, sponsorHorarios: fila.sponsorPageId };
    }
  }
  return { horarios: [], sponsorHorarios: null };
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
    params: [contacto.nombre || 'Asistente'],
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
  textoSugerencias,
  payloadPara,
  elegirHorariosDeSugerencias,
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
