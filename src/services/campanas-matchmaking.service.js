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

const CAMPANA_A = 'A - Primera oferta';
const CAMPANA_B = 'B - Más opciones';
const CAMPANA_C_LEGACY = 'C - Reactivación';
const REACTIVACION_1 = 'C1 - Reactivación';
const REACTIVACION_2 = 'C2 - Reactivación';
const VARIANTES_REACTIVACION = [REACTIVACION_1, REACTIVACION_2];
const DIAS_REACTIVACION = Number(process.env.CAMPANAS_MATCHMAKING_DIAS_REACTIVACION || 14);
const REACTIVACIONES_MAXIMAS = Number(process.env.CAMPANAS_MATCHMAKING_REACTIVACIONES_MAXIMAS || 2);

const TEMPLATE_ENV = {
  [CAMPANA_A]: 'PLATICA_TEMPLATE_MATCHMAKING_A',
  [CAMPANA_B]: 'PLATICA_TEMPLATE_MATCHMAKING_B',
  [REACTIVACION_1]: 'PLATICA_TEMPLATE_MATCHMAKING_C1',
  [REACTIVACION_2]: 'PLATICA_TEMPLATE_MATCHMAKING_C2',
};

const TEMPLATE_SIMULACION = {
  [CAMPANA_A]: 'seleccion_horarios',
  [CAMPANA_B]: 'PENDIENTE_PLANTILLA_B',
  [REACTIVACION_1]: 'PENDIENTE_PLANTILLA_C1',
  [REACTIVACION_2]: 'PENDIENTE_PLANTILLA_C2',
};

function agruparPorAsistente(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    if (!grupos.has(fila.asistentePageId)) grupos.set(fila.asistentePageId, []);
    grupos.get(fila.asistentePageId).push(fila);
  }
  return grupos;
}

function evaluarVentanaReactivacion(contacto, ahora) {
  if (!contacto.fechaUltimaCampana) {
    return { listo: false, motivo: 'FECHA_ULTIMA_CAMPANA_FALTANTE' };
  }
  const fechaAnterior = new Date(contacto.fechaUltimaCampana);
  if (Number.isNaN(fechaAnterior.getTime())) {
    return { listo: false, motivo: 'FECHA_ULTIMA_CAMPANA_INVALIDA' };
  }
  const limite = new Date(ahora.getTime() - DIAS_REACTIVACION * 24 * 60 * 60 * 1000);
  if (fechaAnterior < limite) return { listo: true };
  return { listo: false, motivo: 'VENTANA_REACTIVACION_NO_CUMPLIDA' };
}

function reactivacionesDe(contacto) {
  const n = Number(contacto.reactivacionesEnviadas);
  return Number.isFinite(n) ? n : 0;
}

function varianteReactivacionPara(reactivacionesEnviadas) {
  return VARIANTES_REACTIVACION[reactivacionesEnviadas] || null;
}

function esVarianteReactivacion(campana) {
  return VARIANTES_REACTIVACION.includes(campana);
}

function elegirCampana({ contacto, tieneCitaConfirmada, ahora }) {
  if (tieneCitaConfirmada) return { campana: CAMPANA_B };
  if (!contacto.ultimaCampanaEnviada) return { campana: CAMPANA_A };

  const reactivaciones = reactivacionesDe(contacto);

  if (contacto.ultimaCampanaEnviada === CAMPANA_A) {
    const ventana = evaluarVentanaReactivacion(contacto, ahora);
    if (!ventana.listo) return { motivo: ventana.motivo };
    return { campana: varianteReactivacionPara(0) };
  }

  // B perdida, C legado, o C1/C2: mismo camino. El tope solo bloquea reactivación.
  if (reactivaciones >= REACTIVACIONES_MAXIMAS) {
    return { motivo: 'TOPE_REACTIVACIONES_ALCANZADO' };
  }
  const ventana = evaluarVentanaReactivacion(contacto, ahora);
  if (!ventana.listo) return { motivo: ventana.motivo };
  const campana = varianteReactivacionPara(reactivaciones);
  if (!campana) return { motivo: 'TOPE_REACTIVACIONES_ALCANZADO' };
  return { campana };
}

async function persistirEnvioCampana({ contactoId, campana, fechaEnvio, reactivacionesEnviadas }) {
  await contactosService.actualizarEstadoCampana({ contactoId, campana, fechaEnvio });
  if (esVarianteReactivacion(campana)) {
    await contactosService.incrementarReactivaciones(contactoId, reactivacionesEnviadas);
  }
}

function plantillaPara(campana, modoSimulacion) {
  const nombreEnv = TEMPLATE_ENV[campana];
  const configurada = process.env[nombreEnv];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_SIMULACION[campana];
  throw new Error(`Falta ${nombreEnv}; no se puede enviar ${campana}`);
}

function payloadPara({ contacto, campana, modoSimulacion }) {
  return {
    phone: contacto.whatsapp,
    templateName: plantillaPara(campana, modoSimulacion),
    // Las plantillas agrupadas son genéricas y solo usan el nombre.
    // Confirmar copy/variables en Meta antes de habilitar el envío real.
    params: [contacto.nombre || 'Asistente'],
  };
}

function letraCampana(campana) {
  if (campana === CAMPANA_A) return 'A';
  if (campana === CAMPANA_B) return 'B';
  if (campana === REACTIVACION_1) return 'C1';
  if (campana === REACTIVACION_2) return 'C2';
  return 'C';
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
  const simulando = soloMarcar
    ? false
    : modoSimulacion !== undefined
      ? Boolean(modoSimulacion)
      : process.env.CAMPANAS_MATCHMAKING_MODO_SIMULACION !== 'false';

  if (!soloMarcar && !simulando && process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de campañas deshabilitado. Define CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true solo después de aprobar las plantillas.'
    );
  }

  const candidatas = await citasService.buscarCitasAprobadasSinCampana();
  const confirmados = await citasService.obtenerAsistentesConCitaConfirmada();
  const grupos = agruparPorAsistente(candidatas);
  const resumen = {
    modoSimulacion: simulando,
    soloMarcar: Boolean(soloMarcar),
    contactosProcesados: grupos.size,
    enviadosA: 0,
    enviadosB: 0,
    enviadosC1: 0,
    enviadosC2: 0,
    simuladosA: 0,
    simuladosB: 0,
    simuladosC1: 0,
    simuladosC2: 0,
    marcadosSinEnviarA: 0,
    marcadosSinEnviarB: 0,
    marcadosSinEnviarC1: 0,
    marcadosSinEnviarC2: 0,
    sinEnviar: 0,
    errores: [],
    detalle: [],
  };

  for (const [asistentePageId, filas] of grupos.entries()) {
    try {
      const contacto = await contactosService.obtenerContacto(asistentePageId);
      const decision = elegirCampana({
        contacto,
        tieneCitaConfirmada: confirmados.has(asistentePageId),
        ahora,
      });

      if (!decision.campana) {
        resumen.sinEnviar += 1;
        resumen.detalle.push({ asistentePageId, filas: filas.map((f) => f.id), motivo: decision.motivo });
        continue;
      }

      if (soloMarcar) {
        const fechaEnvio = ahora.toISOString();
        await persistirEnvioCampana({
          contactoId: asistentePageId,
          campana: decision.campana,
          fechaEnvio,
          reactivacionesEnviadas: contacto.reactivacionesEnviadas,
        });
        await citasService.marcarCampanaEnviada(filas.map((f) => f.id));
        resumen[`marcadosSinEnviar${letraCampana(decision.campana)}`] += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          campana: decision.campana,
          marcadoSinEnviar: true,
        });
        continue;
      }

      if (!contacto.whatsapp) {
        throw new Error('El contacto no tiene WhatsApp');
      }

      const payload = payloadPara({ contacto, campana: decision.campana, modoSimulacion: simulando });
      if (simulando) {
        resumen[`simulados${letraCampana(decision.campana)}`] += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          campana: decision.campana,
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
            campana: decision.campana,
            fechaEnvio,
            reactivacionesEnviadas: contacto.reactivacionesEnviadas,
          });
          await citasService.marcarCampanaEnviada(ids);
        });
      } catch (errNotion) {
        const detalle = errNotion.message || String(errNotion);
        throw new Error(
          `Fallo de escritura Notion POST-envío tras ${INTENTOS_MAXIMOS} intentos: ${detalle}`
        );
      }

      resumen[`enviados${letraCampana(decision.campana)}`] += 1;
      resumen.detalle.push({
        asistentePageId,
        filas: ids,
        campana: decision.campana,
        simulado: false,
      });
    } catch (err) {
      resumen.errores.push({ asistentePageId, mensaje: err.message });
    }
  }

  return resumen;
}

module.exports = {
  CAMPANA_A,
  CAMPANA_B,
  CAMPANA_C_LEGACY,
  REACTIVACION_1,
  REACTIVACION_2,
  VARIANTES_REACTIVACION,
  DIAS_REACTIVACION,
  REACTIVACIONES_MAXIMAS,
  agruparPorAsistente,
  elegirCampana,
  dispararCampanasAprobadas,
  esCandidataEnvioCampana,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  ESTADO_ENVIO_PENDIENTE,
  MINUTOS_TIMEOUT_ENVIO_EN_CURSO,
};
