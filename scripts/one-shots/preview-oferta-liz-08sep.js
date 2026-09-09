#!/usr/bin/env node
/**
 * Vista previa (SOLO LECTURA) de la oferta inicial de un asistente.
 * Reproduce el mismo camino que dispararCampanasAprobadas: filas Aprobado,
 * orden por score, dedupe de sponsor, tope 4, y payloadPara() real.
 *
 *   node scripts/one-shots/preview-oferta-liz-08sep.js "Liz"
 *
 * No escribe Notion ni llama Plática.
 */
require('dotenv').config();

const contactos = require('../../src/services/contactos.service');
const citas = require('../../src/services/citas.service');
const campanas = require('../../src/services/campanas-matchmaking.service');
const { notionFetch } = require('../../src/utils/notion-client');

const NOMBRE = process.argv[2] || 'Liz';
const CITAS_DS = process.env.NOTION_CITAS_DATA_SOURCE_ID;

async function filasDelAsistente(asistentePageId) {
  const data = await notionFetch(`/data_sources/${CITAS_DS}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Contacto Principal', relation: { contains: asistentePageId } },
          { property: 'Estatus', select: { equals: 'Aprobado' } },
        ],
      },
      page_size: 100,
    }),
  });
  return (data.results || []).map((fila) => ({
    id: fila.id,
    titulo: fila.properties?.Nombre?.title?.[0]?.plain_text || '',
    sponsorPageId: fila.properties?.['Contacto Match']?.relation?.[0]?.id || null,
    score: citas.scoreDeFilaCita(fila),
    campanaEnviada: fila.properties?.['Campaña Enviada']?.checkbox === true,
  }));
}

function render(cuerpo, params) {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_, numero) => params[Number(numero) - 1] ?? '');
}

// Cuatro cuerpos APROBADOS en Meta (verificados con get_template el 9-sep).
function cuerpoAprobadoOferta(cantidadSponsors) {
  const variables = Array.from({ length: cantidadSponsors }, (_, indice) => `{{${indice + 2}}}`);
  return [
    '¡Hola, {{1}}! Qué gusto saludarte 😊',
    '',
    'Te escribo de parte del equipo de Fashion Digital Talks 2026.',
    '',
    '¡Estamos a tan solo unos días del evento! Y tu acceso incluye reuniones privadas de 20 minutos con expertos, pensadas para ayudarte a resolver retos actuales de tu empresa y conectar con soluciones relevantes para ti.',
    '',
    'Te comparto algunas opciones que encontramos de acuerdo a tu perfil:',
    '',
    ...variables.flatMap((variable) => [variable, '']),
    '¿Te gustaría reunirte con alguno de ellos? O ¿deseas que te ayudemos a buscar otras opciones?',
  ].join('\n');
}

const CUERPO_APROBADO_FOLLOWUP =
  'Hola {{1}},  quiero darle seguimiento personalmente a tus citas 1 a 1, te puedo ayudar a agendar de acuerdo a tu preferencia de pefil y disponibilidad de horario, por favor compárteme cualquier duda al respecto ☺️';

const CUERPO_APROBADO_LASTCALL = [
  '¡Hola {{1}}! Ya estamos a nada de arrancar Fashion Digital Talks 🎉',
  '',
  'Si tienes cualquier consulta sobre el programa o el acceso, con gusto te puedo apoyar. ',
  '',
  'Y aprovecho para avisarte que hoy cerramos la agenda de las citas de negocios. Nos encantaría que pudieras aprovechar este beneficio.',
  '',
  'Nuestro match ideal para ti es:',
  '',
  '{{2}}',
  '',
  '¿Te aparto un lugar de 30 minutos con alguno de ellos antes de que cierre el sistema?',
].join('\n');

(async () => {
  const encontrados = await contactos.buscarContacto({ nombre: NOMBRE, categoria: 'Asistente' });
  if (encontrados.length === 0) throw new Error(`Sin asistente que coincida con "${NOMBRE}"`);
  for (const c of encontrados) {
    console.log(`· candidato: ${c.nombre} | ${c.empresa} | ${c.id}`);
  }
  const contacto = encontrados[0];
  console.log('\n=== ASISTENTE ===');
  console.log({
    nombre: contacto.nombre,
    empresa: contacto.empresa,
    whatsapp: contacto.whatsapp ? `…${contacto.whatsapp.slice(-4)}` : null,
    ticketTipo: contacto.ticketTipo,
    area: contacto.area,
    solucionesBuscadas: contacto.solucionesBuscadas,
    ultimaCampanaEnviada: contacto.ultimaCampanaEnviada,
  });
  console.log('primerNombreParaSaludo =>', campanas.primerNombreParaSaludo(contacto.nombre));

  const filas = await filasDelAsistente(contacto.id);
  console.log(`\n=== FILAS Aprobado (${filas.length}) ===`);

  const ordenadas = [...filas].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const vistos = new Set();
  const ofrecidas = [];
  for (const fila of ordenadas) {
    if (ofrecidas.length >= 4) break;
    if (!fila.sponsorPageId || vistos.has(fila.sponsorPageId)) continue;
    vistos.add(fila.sponsorPageId);
    ofrecidas.push(fila);
  }

  const sponsors = [];
  for (const fila of ofrecidas) {
    const sponsor = await contactos.obtenerContacto(fila.sponsorPageId);
    sponsors.push(sponsor);
    console.log({
      score: fila.score,
      campanaEnviada: fila.campanaEnviada,
      sponsorNombre: sponsor.nombre,
      representante: campanas.nombreRepresentanteParaOferta(sponsor.nombre),
      empresa: sponsor.empresa,
      nivel: sponsor.nivelPatrocinio,
      solucion: sponsor.solucion,
    });
  }

  const escenarios = [
    { etiqueta: '4 SPONSORS (real, como está aprobado hoy)', lista: sponsors },
    { etiqueta: '3 SPONSORS (los primeros 3 por score)', lista: sponsors.slice(0, 3) },
  ];

  for (const escenario of escenarios) {
    const payload = campanas.payloadPara({
      contacto,
      sugerencias: escenario.lista,
      modoSimulacion: true,
    });
    const param1 = payload.params[0];
    console.log(`\n\n########## ${escenario.etiqueta} ##########`);
    console.log(`plantilla: ${payload.templateName}`);
    payload.params.forEach((param, indice) => {
      console.log(`{{${indice + 1}}} (${param.length} chars) = ${param}`);
    });
    const cuerpoCodigo = campanas.largoCuerpoOferta(payload.params);
    console.log(`\nlargo cuerpo con la plantilla del CÓDIGO: ${cuerpoCodigo} / ${campanas.TOPE_CUERPO_META}`);
    const textoAprobado = render(cuerpoAprobadoOferta(payload.params.length - 1), payload.params);
    console.log(`largo cuerpo con la plantilla APROBADA en Meta: ${textoAprobado.length} / ${campanas.TOPE_CUERPO_META}`);
    console.log(`\n--- ${payload.templateName} (aprobada) ---`);
    console.log(textoAprobado);
    console.log('\n--- lastcall_cita1a1 (aprobada, contrato legado de 2 variables) ---');
    const lastcall = render(CUERPO_APROBADO_LASTCALL, [
      param1,
      payload.params.slice(1).join(' | '),
    ]);
    console.log(lastcall);
    console.log(`(largo: ${lastcall.length} / ${campanas.TOPE_CUERPO_META})`);
  }

  const followup = campanas.payloadFollowup72h(contacto, true);
  console.log('\n\n########## FOLLOW-UP 72H ##########');
  console.log(`plantilla: ${followup.templateName}`);
  console.log(`{{1}} = ${followup.params[0]}`);
  const textoFollowup = render(CUERPO_APROBADO_FOLLOWUP, followup.params);
  console.log('\n--- followup_72hrs (aprobada) ---');
  console.log(textoFollowup);
  console.log(`(largo: ${textoFollowup.length})`);
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
