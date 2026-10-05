// src/services/recordatorio-cita-24h.service.js
//
// Un WhatsApp por asistente y por día, 24 h antes de la primera cita de
// ese día. El texto lista solo las citas de ese día. Quien tiene el 7 y el
// 8 recibe dos mensajes: el 6 las del 7, y el 7 las del 8. Quien solo tiene
// el 7 recibe uno, el 6.
//
// Misma razón que el de 15 min y el de 2 h: Plática no deja cancelar un
// mensaje con scheduleTime. Un cron lee Notion y manda ya. El estado vive
// en el contacto (Estado / Fecha / Notas Recordatorio 24h), no en cada cita
// y no en Plática. Una cancelación posterior no corrige el mensaje ya enviado.
// No incluye el link de Meet: esa sala se crea ~15 min antes.

const contactosService = require('./contactos.service');
const citasService = require('./citas.service');
const {
  ventanaRecordatorio,
  primerNombreParaSaludo,
  limpiarParametroPlantilla,
  telefonoConversacion,
  enviarPlantillaRecordatorio,
} = require('./recordatorio-cita-15min.service');
const { horaCitaParaPlantilla, encargadoDeEmpresa } = require('./recordatorio-cita-2h.service');

const MINUTOS_ANTES = 24 * 60;
const TEMPLATE_ENV = 'PLATICA_TEMPLATE_CITA_24H';
// Aprobada 5-oct. Mismo name que la de 1 día antes; el cuerpo ahora lista
// varias reuniones en {{2}}. Coolify: PLATICA_TEMPLATE_CITA_24H=este valor.
const TEMPLATE_NAME = 'confirmacion_cita_1_dia_antes';
const MAX_AGENDA = 800;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function idCanonico(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}

function fechaCorta(inicio) {
  const match = String(inicio || '').match(/^\d{4}-(\d{2})-(\d{2})T/);
  if (!match) return '';
  const mes = MESES[Number(match[1]) - 1];
  if (!mes) return '';
  return `${Number(match[2])} ${mes}`;
}

function lineaDeCita(cita, sponsor) {
  const dia = fechaCorta(cita.inicio);
  const hora = horaCitaParaPlantilla(cita.inicio);
  const con = encargadoDeEmpresa(sponsor || {});
  const cuando = [dia, hora ? `a las ${hora}` : ''].filter(Boolean).join(' ');
  return limpiarParametroPlantilla(`${cuando} con ${con}`);
}

/**
 * {{2}} va en un solo parámetro. Meta no acepta saltos dentro del valor,
 * así que las citas se separan con "; ". Si no caben, se corta por el
 * final y se dice cuántas quedaron fuera.
 */
function unirAgenda(partes) {
  return partes.join('; ');
}

function agendaParaPlantilla(lineas) {
  const partes = [];
  for (let i = 0; i < lineas.length; i += 1) {
    const candidato = unirAgenda(partes.concat(lineas[i]));
    if (candidato.length <= MAX_AGENDA) {
      partes.push(lineas[i]);
      continue;
    }
    if (!partes.length) {
      return {
        texto: limpiarParametroPlantilla(String(lineas[0]).slice(0, MAX_AGENDA)),
        recortada: true,
      };
    }
    let texto = `${unirAgenda(partes)}; y ${lineas.length - partes.length} más`;
    while (texto.length > MAX_AGENDA && partes.length > 1) {
      partes.pop();
      texto = `${unirAgenda(partes)}; y ${lineas.length - partes.length} más`;
    }
    if (texto.length > MAX_AGENDA) texto = limpiarParametroPlantilla(texto.slice(0, MAX_AGENDA));
    return { texto, recortada: true };
  }
  return { texto: unirAgenda(partes), recortada: false };
}

function diaDeCita(inicio) {
  const match = String(inicio || '').match(/^(\d{4}-\d{2}-\d{2})T/);
  return match ? match[1] : '';
}

function diasYaEnviados(notas) {
  return new Set(String(notas || '').match(/\d{4}-\d{2}-\d{2}/g) || []);
}

function notasConservandoDias(notasPrevias, extra) {
  const lista = [...diasYaEnviados(notasPrevias)].sort().join(' ');
  return [lista, extra].filter(Boolean).join(' ');
}

function notasConDia(notasPrevias, dia, extra) {
  const dias = diasYaEnviados(notasPrevias);
  if (dia) dias.add(dia);
  return notasConservandoDias([...dias].join(' '), extra);
}

function recordatorioSePuedeTomar(estado, fechaIso, ahoraMs, dia, notas) {
  if (estado === citasService.ESTADO_RECORDATORIO_OMITIDO) return false;
  if (diasYaEnviados(notas).has(dia)) return false;
  if (estado !== citasService.ESTADO_RECORDATORIO_EN_CURSO) return true;
  const reclamadoMs = Date.parse(fechaIso || '');
  if (!Number.isFinite(reclamadoMs)) return true;
  return ahoraMs - reclamadoMs >= citasService.RECLAMO_RECORDATORIO_VENCIDO_MINUTOS * 60 * 1000;
}

function lotesPorDia(citas) {
  const grupos = new Map();
  for (const cita of citas) {
    const asistente = idCanonico(cita.asistentePageId);
    const dia = diaDeCita(cita.inicio);
    if (!asistente || !dia) continue;
    const clave = `${asistente}|${dia}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { asistentePageId: cita.asistentePageId, dia, citas: [] });
    }
    grupos.get(clave).citas.push(cita);
  }
  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      citas: grupo.citas.slice().sort((a, b) => String(a.inicio).localeCompare(String(b.inicio))),
    }))
    .sort((a, b) => String(a.citas[0].inicio).localeCompare(String(b.citas[0].inicio)));
}

function diaEnVentana(lote, desdeMs, hastaMs) {
  const inicioMs = Date.parse(lote.citas[0]?.inicio || '');
  return Number.isFinite(inicioMs) && inicioMs > desdeMs && inicioMs <= hastaMs;
}

async function sponsorDe(cache, sponsorPageId) {
  const clave = idCanonico(sponsorPageId);
  if (!clave) return null;
  if (cache.has(clave)) return cache.get(clave);
  const sponsor = await contactosService.obtenerContacto(sponsorPageId);
  cache.set(clave, sponsor);
  return sponsor;
}

/**
 * confirmacion_cita_1_dia_antes (aprobada):
 *
 *   ¡Hola {{1}}! ¿Cómo estás? Te escribo para recordarte y confirmar
 *   las reuniones que tienes agendadas:
 *   {{2}}
 *   ¿Me confirmas tu asistencia?
 *
 * {{1}} primer nombre del asistente (Title Case). Fuente: Contactos.Nombre.
 * {{2}} las reuniones de un solo día, en orden, un solo parámetro sin saltos:
 *   7 oct a las 10:30 am con Marco Trujillo, de Plática.mx; 7 oct a las 4:00 pm con Rodrigo Cerda, de Tiendanube
 * Fecha = día/mes del ISO de la cita. Hora = 12 h del mismo ISO.
 * Encargado = nombre + apellido paterno del sponsor + ", de " + Empresa.
 * Sin mesa y sin URL de Meet.
 */
async function paramsDeRecordatorio24h({ asistente, citas, sponsors }) {
  const lineas = [];
  for (const cita of citas) {
    const sponsor = await sponsorDe(sponsors, cita.sponsorPageId);
    lineas.push(lineaDeCita(cita, sponsor));
  }
  const agenda = agendaParaPlantilla(lineas);
  return {
    whatsapp: asistente?.whatsapp || '',
    recortada: agenda.recortada,
    params: [
      primerNombreParaSaludo(asistente?.nombre) || 'Asistente',
      agenda.texto || 'tus reuniones confirmadas',
    ],
  };
}

async function marcar({ contactoId, estado, fecha, notas }) {
  await contactosService.actualizarEstadoRecordatorio24h({ contactoId, estado, fecha, notas });
}

async function enviarRecordatorios24hPendientes({
  ahora,
  minutos = MINUTOS_ANTES,
  simulacion = false,
} = {}) {
  const momento = ahora || new Date().toISOString();
  const desdeEnv = process.env[TEMPLATE_ENV];
  const templateName = desdeEnv === '' ? '' : (desdeEnv || TEMPLATE_NAME);
  if (!templateName) {
    console.warn('[Recordatorio24h] Falta PLATICA_TEMPLATE_CITA_24H; se omite la corrida');
    return { omitido: true, motivo: 'SIN_PLANTILLA', ahora: momento };
  }

  const { desde, hasta } = ventanaRecordatorio({ ahora: momento, minutos });
  const citas = await citasService.buscarCitasRealesDesde({ desde });
  const desdeMs = Date.parse(desde);
  const hastaMs = Date.parse(hasta);
  const ahoraMs = Date.parse(momento);
  const candidatos = lotesPorDia(citas).filter((lote) => diaEnVentana(lote, desdeMs, hastaMs));
  const sponsors = new Map();

  const resultado = {
    ahora: momento,
    simulacion: simulacion === true,
    ventana: { desde, hasta, minutos },
    plantilla: templateName,
    revisados: candidatos.length,
    enviados: 0,
    omitidos: 0,
    fallidos: 0,
    detalle: [],
  };

  for (const lote of candidatos) {
    const marca = new Date().toISOString();
    let asistente;
    try {
      asistente = await contactosService.obtenerContacto(lote.asistentePageId);
    } catch (error) {
      resultado.fallidos += 1;
      resultado.detalle.push({
        asistentePageId: lote.asistentePageId,
        dia: lote.dia,
        citas: lote.citas.length,
        estado: 'Falló',
        motivo: error.message,
      });
      continue;
    }

    if (!recordatorioSePuedeTomar(
      asistente?.estadoRecordatorio24h,
      asistente?.fechaRecordatorio24h,
      ahoraMs,
      lote.dia,
      asistente?.notasRecordatorio24h,
    )) {
      continue;
    }

    if (simulacion) {
      try {
        const { whatsapp, params, recortada } = await paramsDeRecordatorio24h({
          asistente,
          citas: lote.citas,
          sponsors,
        });
        const sinTelefono = !telefonoConversacion(whatsapp);
        resultado[sinTelefono ? 'omitidos' : 'enviados'] += 1;
        resultado.detalle.push({
          asistentePageId: lote.asistentePageId,
          nombre: asistente?.nombre || null,
          dia: lote.dia,
          citas: lote.citas.length,
          estado: sinTelefono ? 'Omitido' : 'Simulado',
          motivo: sinTelefono ? 'SIN_WHATSAPP' : undefined,
          recortada,
          params,
        });
      } catch (error) {
        resultado.fallidos += 1;
        resultado.detalle.push({
          asistentePageId: lote.asistentePageId,
          nombre: asistente?.nombre || null,
          dia: lote.dia,
          citas: lote.citas.length,
          estado: 'Falló',
          motivo: error.message,
        });
      }
      continue;
    }

    try {
      await marcar({
        contactoId: lote.asistentePageId,
        estado: citasService.ESTADO_RECORDATORIO_EN_CURSO,
        fecha: marca,
      });
    } catch (error) {
      resultado.fallidos += 1;
      resultado.detalle.push({
        asistentePageId: lote.asistentePageId,
        dia: lote.dia,
        citas: lote.citas.length,
        estado: 'Falló',
        motivo: `RECLAMO: ${error.message}`,
      });
      continue;
    }

    try {
      const { whatsapp, params, recortada } = await paramsDeRecordatorio24h({
        asistente,
        citas: lote.citas,
        sponsors,
      });

      if (!telefonoConversacion(whatsapp)) {
        await marcar({
          contactoId: lote.asistentePageId,
          estado: citasService.ESTADO_RECORDATORIO_OMITIDO,
          fecha: marca,
          notas: notasConservandoDias(asistente?.notasRecordatorio24h, 'SIN_WHATSAPP: el asistente no tiene teléfono en Contactos.'),
        });
        resultado.omitidos += 1;
        resultado.detalle.push({
          asistentePageId: lote.asistentePageId,
          dia: lote.dia,
          citas: lote.citas.length,
          estado: 'Omitido',
          motivo: 'SIN_WHATSAPP',
        });
        continue;
      }

      const respuesta = await enviarPlantillaRecordatorio({ phone: whatsapp, templateName, params });
      const notas = notasConDia(asistente?.notasRecordatorio24h, lote.dia, recortada ? 'AGENDA_RECORTADA' : '');
      await marcar({
        contactoId: lote.asistentePageId,
        estado: citasService.ESTADO_RECORDATORIO_ENVIADO,
        fecha: marca,
        notas,
      });
      if (asistente) asistente.notasRecordatorio24h = notas;
      resultado.enviados += 1;
      resultado.detalle.push({
        asistentePageId: lote.asistentePageId,
        dia: lote.dia,
        citas: lote.citas.length,
        estado: 'Enviado',
        messageId: respuesta?.messageId || null,
        params,
      });
      console.log(
        '[Recordatorio24h] Enviado',
        JSON.stringify({
          asistentePageId: lote.asistentePageId,
          dia: lote.dia,
          citas: lote.citas.length,
          messageId: respuesta?.messageId || null,
        })
      );
    } catch (error) {
      console.error(
        '[Recordatorio24h] Falló',
        JSON.stringify({ asistentePageId: lote.asistentePageId, dia: lote.dia, error: error.message })
      );
      try {
        await marcar({
          contactoId: lote.asistentePageId,
          estado: citasService.ESTADO_RECORDATORIO_FALLO,
          fecha: marca,
          notas: notasConservandoDias(asistente?.notasRecordatorio24h, error.message),
        });
      } catch (errorAlMarcar) {
        console.error('[Recordatorio24h] Tampoco se pudo marcar el fallo:', errorAlMarcar.message);
      }
      resultado.fallidos += 1;
      resultado.detalle.push({
        asistentePageId: lote.asistentePageId,
        dia: lote.dia,
        citas: lote.citas.length,
        estado: 'Falló',
        motivo: error.message,
      });
    }
  }

  console.log('[Recordatorio24h] Corrida', JSON.stringify({ ...resultado, detalle: undefined }));
  return resultado;
}

module.exports = {
  enviarRecordatorios24hPendientes,
  fechaCorta,
  lineaDeCita,
  agendaParaPlantilla,
  diaDeCita,
  lotesPorDia,
  TEMPLATE_ENV,
  TEMPLATE_NAME,
  MINUTOS_ANTES,
  MAX_AGENDA,
};
