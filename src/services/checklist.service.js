// src/services/checklist.service.js
//
// Un solo "cerebro" (evaluarChecklist) compartido por dos entradas:
//   - consultarChecklist(nombre)      -> bajo demanda, cuando Liz/Laura preguntan
//   - revisarChecklistsPendientes()   -> barrido completo, para el cron
//
// Requisitos tomados directo de los formularios reales (Citas_1a1_forms.pdf,
// Aplicación_Speaker_2026.pdf) — solo se marcan como obligatorios los campos
// que el formulario marca con *. Los opcionales (Clientes Actuales, Clientes
// Potenciales Deseados, Título de la Charla, Tipo de Participación) NO
// cuentan para "completo".
//
// El checklist de "Experiencias" (logo/activación/regalo/video) del sponsor
// se deja fuera a propósito — Laura dijo explícitamente en sesión 4 que no
// es necesario para este trabajo. Si eso cambia, se agrega como un tercer
// bloque de requisitos, no se mete aquí sin confirmar.

const notionContactos = require('./contactos.service');

const CAMPOS_REQUERIDOS_SPONSOR = [
  { campo: 'empresa', etiqueta: 'Empresa' },
  { campo: 'rolPuesto', etiqueta: 'Nombre de la persona encargada de citas 1a1' },
  { campo: 'email', etiqueta: 'Correo corporativo' },
  { campo: 'whatsapp', etiqueta: 'Celular / WhatsApp' },
  { campo: 'solucion', etiqueta: 'Solución que ofrece', esArray: true },
  { campo: 'servicios', etiqueta: 'Descripción del servicio/producto' },
  { campo: 'etapaClienteBuscada', etiqueta: 'Etapa de desarrollo digital buscada', esArray: true },
  { campo: 'puestosBuscados', etiqueta: 'Puestos/áreas con los que quiere parearse', esArray: true },
];

const CAMPOS_REQUERIDOS_SPEAKER = [
  { campo: 'rolPuesto', etiqueta: 'Puesto o rol' },
  { campo: 'bio', etiqueta: 'Reseña de CV / Bio' },
  { campo: 'fotoSpeaker', etiqueta: 'Fotografía a color' },
  { campo: 'empresa', etiqueta: 'Nombre de la empresa' },
  { campo: 'sitioWebEmpresa', etiqueta: 'Sitio web de la empresa' },
  { campo: 'logoEmpresaSpeaker', etiqueta: 'Logotipo de la empresa' },
  { campo: 'whatsapp', etiqueta: 'WhatsApp' },
  { campo: 'email', etiqueta: 'Correo electrónico empresarial' },
  { campo: 'instagram', etiqueta: 'Instagram' },
  { campo: 'linkedIn', etiqueta: 'LinkedIn' },
];

function campoVacio(valor, esArray) {
  if (esArray) return !Array.isArray(valor) || valor.length === 0;
  return valor === null || valor === undefined || String(valor).trim() === '';
}

/**
 * Evalúa un contacto ya parseado (parsearContacto) contra los requisitos que
 * le apliquen. Un Sponsor que también Es Speaker se evalúa contra AMBOS
 * bloques — tiene que cumplir los dos.
 */
function evaluarChecklist(contacto) {
  const bloques = [];
  if (contacto.categoria === 'Sponsor') bloques.push({ nombre: 'Sponsor (citas 1a1)', campos: CAMPOS_REQUERIDOS_SPONSOR });
  if (contacto.esSpeaker) bloques.push({ nombre: 'Speaker', campos: CAMPOS_REQUERIDOS_SPEAKER });

  if (bloques.length === 0) {
    return { aplica: false, completo: null, faltantes: [] };
  }

  const faltantes = [];
  for (const bloque of bloques) {
    for (const { campo, etiqueta, esArray } of bloque.campos) {
      if (campoVacio(contacto[campo], esArray)) {
        faltantes.push({ bloque: bloque.nombre, etiqueta });
      }
    }
  }

  return { aplica: true, completo: faltantes.length === 0, faltantes };
}

/** Bajo demanda: Liz/Laura preguntan por nombre (aproximado), no por page_id. */
async function consultarChecklist(nombreAproximado) {
  const candidatos = await notionContactos.buscarContactoPorNombre(nombreAproximado);
  if (candidatos.length === 0) {
    return { encontrado: false, mensaje: `No encontré ningún contacto que coincida con "${nombreAproximado}".` };
  }
  if (candidatos.length > 1) {
    return {
      encontrado: false,
      ambiguo: true,
      mensaje: `Encontré ${candidatos.length} contactos que coinciden con "${nombreAproximado}", necesito más detalle.`,
      opciones: candidatos.map((c) => ({ id: c.id, nombre: c.nombre, empresa: c.empresa })),
    };
  }

  const contacto = candidatos[0];
  const resultado = evaluarChecklist(contacto);
  return { encontrado: true, contacto: { id: contacto.id, nombre: contacto.nombre, empresa: contacto.empresa }, ...resultado };
}

/**
 * Barrido completo para el cron: revisa todos los Sponsor + Speaker activos
 * (excluye dados de baja), actualiza Checklist Completado / Detalle
 * Checklist en Notion, y regresa la lista de incompletos para que la capa
 * de alertas (fuera de este archivo — todavía no existe el envío por
 * WhatsApp) decida a quién avisar.
 */
async function revisarChecklistsPendientes() {
  const contactos = await notionContactos.listarSponsorsYSpeakersActivos();
  const incompletos = [];

  for (const contacto of contactos) {
    const resultado = evaluarChecklist(contacto);
    if (!resultado.aplica) continue;

    const detalle = resultado.completo
      ? ''
      : resultado.faltantes.map((f) => `[${f.bloque}] ${f.etiqueta}`).join('; ');

    await notionContactos.actualizarChecklist({
      contactoId: contacto.id,
      completo: resultado.completo,
      detalle,
    });

    if (!resultado.completo) {
      incompletos.push({
        id: contacto.id,
        nombre: contacto.nombre,
        empresa: contacto.empresa,
        faltantes: resultado.faltantes,
      });
    }
  }

  return { totalRevisados: contactos.length, totalIncompletos: incompletos.length, incompletos };
}

module.exports = {
  evaluarChecklist,
  consultarChecklist,
  revisarChecklistsPendientes,
  CAMPOS_REQUERIDOS_SPONSOR,
  CAMPOS_REQUERIDOS_SPEAKER,
};
