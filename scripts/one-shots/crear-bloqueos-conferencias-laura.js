// Crea las 7 filas de bloqueo de conferencia en Citas de Laura.
// El contacto ficticio ya debe existir (creado 2-sep). No toca pruebas.
// Idempotente: si ya hay fila Confirmada sin notificar para el mismo
// sponsor + horario + Contacto Principal de bloqueo, no duplica.
//
//   node scripts/one-shots/crear-bloqueos-conferencias-laura.js --confirmar

require('dotenv').config();

if (!process.env.NOTION_API_KEY_LAURA) {
  throw new Error('Falta NOTION_API_KEY_LAURA');
}
process.env.NOTION_API_KEY = process.env.NOTION_API_KEY_LAURA;

const CONTACTOS_LAURA = '3b162dda-199a-8029-8d58-000b6d1fed37';
const CITAS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const BLOQUEO_ID = '3cf62dda-199a-81fa-85fc-c32e95485c04';
const CONTACTOS_PRUEBAS = '9f335308-da0e-4672-9744-c1dabcfb22aa';
const BLOQUEO_PRUEBAS = '3c990fe2-7345-8121-92a6-f9e09a540d2e';

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = CONTACTOS_LAURA;
process.env.NOTION_CITAS_DATA_SOURCE_ID = CITAS_LAURA;
process.env.NOTION_CONTACTO_BLOQUEO_AGENDA_ID = BLOQUEO_ID;
process.env.CITAS_DURACION_BLOQUE_MINUTOS = process.env.CITAS_DURACION_BLOQUE_MINUTOS || '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';

const { notionFetch } = require('../../src/utils/notion-client');

const ZONA = process.env.CITAS_ZONA_HORARIA_OFFSET;
const DURACION = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS);

const PROGRAMA = [
  { empresa: 'Flow', aliases: ['Flow Pagos'], fecha: '2026-10-07', hora: '10:30', sesion: 'Conferencia', dia: 'día 1' },
  { empresa: 'Blip', aliases: [], fecha: '2026-10-07', hora: '12:00', sesion: 'Conversatorio', dia: 'día 1' },
  { empresa: 'Infracommerce', aliases: [], fecha: '2026-10-07', hora: '12:30', sesion: 'Conversatorio', dia: 'día 1' },
  { empresa: 'CaaS', aliases: ['CAAS', 'CaaS MX'], fecha: '2026-10-07', hora: '15:00', sesion: 'Conversatorio', dia: 'día 1' },
  { empresa: 'Revie', aliases: [], fecha: '2026-10-07', hora: '15:30', sesion: 'Conversatorio', dia: 'día 1' },
  { empresa: 'Platica.mx', aliases: ['Plática.mx', 'Platica'], fecha: '2026-10-08', hora: '10:30', sesion: 'Conversatorio', dia: 'día 2' },
  { empresa: 'Reversso', aliases: [], fecha: '2026-10-08', hora: '11:00', sesion: 'Mesa de Diálogo', dia: 'día 2' },
];

function isoInicio(fecha, hora) {
  return `${fecha}T${hora}:00${ZONA}`;
}

function isoFin(inicio) {
  const m = inicio.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  const minutos = Number(m[2]) * 60 + Number(m[3]) + DURACION;
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const min = String(minutos % 60).padStart(2, '0');
  return `${m[1]}T${h}:${min}:00${ZONA}`;
}

function textoEmpresa(pagina) {
  const fragmentos = pagina.properties?.Empresa?.rich_text || [];
  return fragmentos.map((f) => f.plain_text || f.text?.content || '').join('').trim();
}

function pageIdCanonico(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}

async function queryPaginado(dataSourceId, filter) {
  const resultados = [];
  let cursor;
  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    resultados.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return resultados;
}

function empresaCoincide(valor, nombres) {
  const hay = valor.toLowerCase();
  return nombres.some((n) => hay === n.toLowerCase() || hay.includes(n.toLowerCase()));
}

async function buscarSponsorPorEmpresa(item) {
  const nombres = [item.empresa, ...(item.aliases || [])];
  for (const nombre of nombres) {
    const filas = await queryPaginado(CONTACTOS_LAURA, {
      and: [
        { property: 'Categoria', select: { equals: 'Sponsor' } },
        { property: 'Empresa', rich_text: { equals: nombre } },
      ],
    });
    if (filas.length === 1) return filas[0];
    if (filas.length > 1) {
      throw new Error(`Varios sponsors con Empresa="${nombre}": ${filas.map((f) => f.id).join(', ')}`);
    }
  }
  const todos = await queryPaginado(CONTACTOS_LAURA, {
    property: 'Categoria', select: { equals: 'Sponsor' },
  });
  const parciales = todos.filter((f) => empresaCoincide(textoEmpresa(f), nombres));
  if (parciales.length === 1) return parciales[0];
  throw new Error(
    `No encontré sponsor único "${item.empresa}". Candidatos: ${parciales.map((f) => `${textoEmpresa(f)} (${f.id})`).join('; ') || '(ninguno)'}`
  );
}

async function buscarBloqueoExistente({ sponsorId, inicio }) {
  const filas = await queryPaginado(CITAS_LAURA, {
    and: [
      { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
      { property: 'Contacto Principal', relation: { contains: BLOQUEO_ID } },
      { property: 'Contacto Match', relation: { contains: sponsorId } },
      { property: 'Fecha y Hora', date: { equals: inicio } },
    ],
  });
  return filas[0] || null;
}

async function crearFila({ sponsor, item, inicio, fin }) {
  const notas = `BLOQUEO — Conferencia del programa del evento. No es una cita real. Sesión: ${item.sesion}, ${item.dia}.`;
  const titulo = `BLOQUEO — ${item.empresa} — ${item.sesion}`;
  return notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: CITAS_LAURA },
      properties: {
        Nombre: { title: [{ text: { content: titulo } }] },
        Estatus: { select: { name: 'Confirmada sin notificar' } },
        'Fecha y Hora': { date: { start: inicio, end: fin } },
        'Contacto Match': { relation: [{ id: sponsor.id }] },
        'Contacto Principal': { relation: [{ id: BLOQUEO_ID }] },
        Notas: { rich_text: [{ text: { content: notas } }] },
      },
    }),
  });
}

function normalizarIso(valor) {
  return String(valor || '').replace(/\.\d{3}(?=[+-]\d{2}:\d{2}$)/, '');
}

function verificarFila(pagina, { sponsorId, inicio }) {
  const estatus = pagina.properties?.Estatus?.select?.name;
  const start = pagina.properties?.['Fecha y Hora']?.date?.start;
  const matchId = (pagina.properties?.['Contacto Match']?.relation || [])[0]?.id;
  const principalId = (pagina.properties?.['Contacto Principal']?.relation || [])[0]?.id;
  if (estatus !== 'Confirmada sin notificar') {
    throw new Error(`Estatus inesperado: ${estatus}`);
  }
  if (normalizarIso(start) !== normalizarIso(inicio)) {
    throw new Error(`Fecha y Hora start=${start}, esperado ${inicio}`);
  }
  if (pageIdCanonico(matchId) !== pageIdCanonico(sponsorId)) {
    throw new Error(`Contacto Match ${matchId} != ${sponsorId}`);
  }
  if (pageIdCanonico(principalId) !== pageIdCanonico(BLOQUEO_ID)) {
    throw new Error(`Contacto Principal ${principalId} != ${BLOQUEO_ID}`);
  }
}

async function main() {
  if (!process.argv.includes('--confirmar')) {
    console.error('Falta --confirmar. Este script escribe en Citas de Laura.');
    process.exit(1);
  }
  if (pageIdCanonico(BLOQUEO_ID) === pageIdCanonico(BLOQUEO_PRUEBAS)) {
    throw new Error('Abortado: BLOQUEO_ID es el de pruebas.');
  }
  if (pageIdCanonico(CONTACTOS_LAURA) === pageIdCanonico(CONTACTOS_PRUEBAS)) {
    throw new Error('Abortado: data source de Contactos es el de pruebas.');
  }

  const dsContactos = await notionFetch(`/data_sources/${CONTACTOS_LAURA}`);
  if (pageIdCanonico(dsContactos.id) === pageIdCanonico(CONTACTOS_PRUEBAS)) {
    throw new Error('Abortado: el fetch de Contactos devolvió el data source de pruebas.');
  }
  const tituloContactos = (dsContactos.title || []).map((t) => t.plain_text).join('');
  console.log(`Contactos: ${tituloContactos} (${dsContactos.id})`);
  if (/nueva/i.test(tituloContactos) && /prueba/i.test(tituloContactos)) {
    throw new Error(`Abortado por título de Contactos de pruebas: ${tituloContactos}`);
  }

  const contactoBloqueo = await notionFetch(`/pages/${BLOQUEO_ID}`);
  const nombreBloqueo = (contactoBloqueo.properties?.Nombre?.title || [])
    .map((t) => t.plain_text).join('');
  if (nombreBloqueo !== 'Bloqueo de Agenda (Programa del Evento)') {
    throw new Error(`El contacto ${BLOQUEO_ID} no es el ficticio de Laura: "${nombreBloqueo}"`);
  }

  const reporte = [];
  for (const item of PROGRAMA) {
    const inicio = isoInicio(item.fecha, item.hora);
    const fin = isoFin(inicio);
    const sponsor = await buscarSponsorPorEmpresa(item);
    const empresa = textoEmpresa(sponsor) || item.empresa;
    const existente = await buscarBloqueoExistente({ sponsorId: sponsor.id, inicio });
    let pagina = existente;
    let accion = 'ya existía';
    if (!pagina) {
      pagina = await crearFila({ sponsor, item, inicio, fin });
      accion = 'creada';
    }
    const refetch = await notionFetch(`/pages/${pagina.id}`);
    verificarFila(refetch, { sponsorId: sponsor.id, inicio });
    reporte.push({
      empresa,
      sponsorNombre: (sponsor.properties?.Nombre?.title || []).map((t) => t.plain_text).join(''),
      sponsorId: sponsor.id,
      citaId: pagina.id,
      inicio,
      fin,
      accion,
      estatus: refetch.properties?.Estatus?.select?.name,
    });
    console.log(`  ${accion}: ${empresa} ${inicio} → ${pagina.id}`);
  }
  console.log(JSON.stringify(reporte, null, 2));

  const citasService = require('../../src/services/citas.service');
  const blip = reporte.find((r) => /blip/i.test(r.empresa));
  if (!blip) throw new Error('No quedó Blip en el reporte — no se puede verificar ocupación.');
  const ocupado = await citasService.sponsorOcupadoEnBloque({
    sponsorPageId: blip.sponsorId,
    inicio: blip.inicio,
  });
  const mesas = await citasService.contarCitasEnBloque({ inicio: blip.inicio });
  if (!ocupado) throw new Error(`Blip debería estar ocupado a las ${blip.inicio}`);
  const mesasPorBloque = [];
  for (const fila of reporte) {
    const ocupadoSponsor = await citasService.sponsorOcupadoEnBloque({
      sponsorPageId: fila.sponsorId,
      inicio: fila.inicio,
    });
    const mesasBloque = await citasService.contarCitasEnBloque({ inicio: fila.inicio });
    if (!ocupadoSponsor) {
      throw new Error(`${fila.empresa} debería estar ocupado a las ${fila.inicio}`);
    }
    mesasPorBloque.push({ empresa: fila.empresa, inicio: fila.inicio, mesas: mesasBloque });
  }
  console.log(`OK Laura: Blip ocupado a ${blip.inicio}; mesas reales en ese bloque = ${mesas} (el bloqueo no suma).`);
  console.log(JSON.stringify({ mesasPorBloque }, null, 2));
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  if (err.notion) console.error(JSON.stringify(err.notion, null, 2));
  process.exit(1);
});
