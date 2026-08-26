// NO USADO POR PRODUCCIÓN.
// Archivo histórico del ejecutor A/B/C1/C2 retirado el 26-ago-2026.
// Se conserva únicamente para explicar valores existentes en Notion; no debe
// importarse desde services, controllers, rutas ni MCP.

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
  if (reactivaciones >= REACTIVACIONES_MAXIMAS) {
    return { motivo: 'TOPE_REACTIVACIONES_ALCANZADO' };
  }
  const ventana = evaluarVentanaReactivacion(contacto, ahora);
  if (!ventana.listo) return { motivo: ventana.motivo };
  const campana = varianteReactivacionPara(reactivaciones);
  return campana ? { campana } : { motivo: 'TOPE_REACTIVACIONES_ALCANZADO' };
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
  TEMPLATE_ENV,
  evaluarVentanaReactivacion,
  reactivacionesDe,
  varianteReactivacionPara,
  esVarianteReactivacion,
  elegirCampana,
};
