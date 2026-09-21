#!/usr/bin/env node
/**
 * Programa FDT2026 (versión 20-sep): Mercado Libre entró al escenario el
 * 8-oct 13:00–13:30 ("El futuro de la moda es online") y es sponsor de 1a1
 * desde el 18-sep, así que podía recibir una cita a esa hora.
 *
 * Crea el bloqueo de agenda y marca Es Speaker. Idempotente: si el bloqueo
 * ya existe, no duplica.
 *
 *   node scripts/one-shots/bloqueo-mercado-libre-programa-20sep.js --confirmar
 */
require('dotenv').config();

if (!process.env.NOTION_API_KEY_LAURA && !process.env.NOTION_API_KEY) {
  throw new Error('Falta token Notion');
}
process.env.NOTION_API_KEY = process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;

const CONTACTOS_LAURA = '3b162dda-199a-8029-8d58-000b6d1fed37';
const CITAS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const BLOQUEO_ID = '3cf62dda-199a-81fa-85fc-c32e95485c04';
const CONTACTOS_PRUEBAS = '9f335308-da0e-4672-9744-c1dabcfb22aa';
const BLOQUEO_PRUEBAS = '3c990fe2-7345-8121-92a6-f9e09a540d2e';

// Alta 18-sep (bitacora-18sep-sponsors-nuevos-laura.md).
const MERCADO_LIBRE_ID = '3df62dda-199a-81c3-b9a2-ffb0478b4663';
const SESION = {
  empresa: 'Mercado Libre',
  fecha: '2026-10-08',
  hora: '13:00',
  sesion: 'Conferencia',
  dia: 'día 2',
};

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = CONTACTOS_LAURA;
process.env.NOTION_CITAS_DATA_SOURCE_ID = CITAS_LAURA;
process.env.NOTION_CONTACTO_BLOQUEO_AGENDA_ID = BLOQUEO_ID;
process.env.CITAS_DURACION_BLOQUE_MINUTOS = process.env.CITAS_DURACION_BLOQUE_MINUTOS || '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = process.env.CITAS_ZONA_HORARIA_OFFSET || '-06:00';

const { notionFetch } = require('../../src/utils/notion-client');

const ZONA = process.env.CITAS_ZONA_HORARIA_OFFSET;
const DURACION = Number(process.env.CITAS_DURACION_BLOQUE_MINUTOS);

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
function pageIdCanonico(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}
function normalizarIso(valor) {
  return String(valor || '').replace(/\.\d{3}(?=[+-]\d{2}:\d{2}$)/, '');
}
function texto(prop) {
  return (prop?.rich_text || []).map((f) => f.plain_text || f.text?.content || '').join('').trim();
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

async function buscarBloqueoExistente({ sponsorId, inicio }) {
  const filas = await queryPaginado(CITAS_LAURA, {
    and: [
      { property: 'Contacto Principal', relation: { contains: BLOQUEO_ID } },
      { property: 'Contacto Match', relation: { contains: sponsorId } },
    ],
  });
  return (
    filas.find((f) =>
      normalizarIso(f.properties?.['Fecha y Hora']?.date?.start).startsWith(
        normalizarIso(inicio).slice(0, 16)
      )
    ) || null
  );
}

function verificarFila(pagina, { sponsorId, inicio }) {
  const estatus = pagina.properties?.Estatus?.select?.name;
  const start = pagina.properties?.['Fecha y Hora']?.date?.start;
  const matchId = (pagina.properties?.['Contacto Match']?.relation || [])[0]?.id;
  const principalId = (pagina.properties?.['Contacto Principal']?.relation || [])[0]?.id;
  if (estatus !== 'Confirmada sin notificar') throw new Error(`Estatus inesperado: ${estatus}`);
  if (!normalizarIso(start).startsWith(normalizarIso(inicio).slice(0, 16))) {
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
    console.error('Falta --confirmar. Este script escribe en Citas y Contactos de Laura.');
    process.exit(1);
  }
  if (pageIdCanonico(BLOQUEO_ID) === pageIdCanonico(BLOQUEO_PRUEBAS)) {
    throw new Error('Abortado: BLOQUEO_ID es el de pruebas.');
  }
  if (pageIdCanonico(CONTACTOS_LAURA) === pageIdCanonico(CONTACTOS_PRUEBAS)) {
    throw new Error('Abortado: data source de Contactos es el de pruebas.');
  }

  const contactoBloqueo = await notionFetch(`/pages/${BLOQUEO_ID}`);
  const nombreBloqueo = (contactoBloqueo.properties?.Nombre?.title || [])
    .map((t) => t.plain_text)
    .join('');
  if (nombreBloqueo !== 'Bloqueo de Agenda (Programa del Evento)') {
    throw new Error(`El contacto ${BLOQUEO_ID} no es el ficticio de Laura: "${nombreBloqueo}"`);
  }

  const sponsor = await notionFetch(`/pages/${MERCADO_LIBRE_ID}`);
  const categoria = sponsor.properties?.Categoria?.select?.name;
  const empresa = texto(sponsor.properties?.Empresa);
  if (categoria !== 'Sponsor') throw new Error(`Categoria=${categoria}, esperado Sponsor`);
  if (!/mercado\s*libre/i.test(empresa)) {
    throw new Error(`Empresa="${empresa}", no parece Mercado Libre`);
  }

  const inicio = isoInicio(SESION.fecha, SESION.hora);
  const fin = isoFin(inicio);
  const existente = await buscarBloqueoExistente({ sponsorId: MERCADO_LIBRE_ID, inicio });

  let pagina = existente;
  let accion = 'ya existía';
  if (!pagina) {
    pagina = await notionFetch('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'data_source_id', data_source_id: CITAS_LAURA },
        properties: {
          Nombre: { title: [{ text: { content: `BLOQUEO — ${SESION.empresa} — ${SESION.sesion}` } }] },
          Estatus: { select: { name: 'Confirmada sin notificar' } },
          'Fecha y Hora': { date: { start: inicio, end: fin } },
          'Contacto Match': { relation: [{ id: MERCADO_LIBRE_ID }] },
          'Contacto Principal': { relation: [{ id: BLOQUEO_ID }] },
          Notas: {
            rich_text: [
              {
                text: {
                  content:
                    `BLOQUEO — Conferencia del programa del evento. No es una cita real. ` +
                    `Sesión: ${SESION.sesion}, ${SESION.dia}. Programa del 20-sep: ` +
                    `"El futuro de la moda es online".`,
                },
              },
            ],
          },
        },
      }),
    });
    accion = 'creada';
  }

  const refetch = await notionFetch(`/pages/${pagina.id}`);
  verificarFila(refetch, { sponsorId: MERCADO_LIBRE_ID, inicio });
  console.log(`${accion}: ${SESION.empresa} ${inicio} → ${pagina.id}`);

  const yaSpeaker = sponsor.properties?.['Es Speaker']?.checkbox === true;
  if (!yaSpeaker) {
    await notionFetch(`/pages/${MERCADO_LIBRE_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { 'Es Speaker': { checkbox: true } } }),
    });
  }
  const sponsorRefetch = await notionFetch(`/pages/${MERCADO_LIBRE_ID}`);
  if (sponsorRefetch.properties?.['Es Speaker']?.checkbox !== true) {
    throw new Error('Es Speaker no quedó en true');
  }
  console.log(`Es Speaker: ${yaSpeaker ? 'ya estaba' : 'marcado'}`);

  const citasService = require('../../src/services/citas.service');
  const ocupado = await citasService.sponsorOcupadoEnBloque({
    sponsorPageId: MERCADO_LIBRE_ID,
    inicio,
  });
  const mesas = await citasService.contarCitasEnBloque({ inicio });
  if (ocupado !== true) throw new Error(`sponsorOcupadoEnBloque=${ocupado}, esperado true`);
  console.log(`OK ${SESION.empresa}: ocupado=${ocupado} mesas_reales=${mesas}`);

  console.log(
    JSON.stringify(
      { empresa: empresa, sponsorId: MERCADO_LIBRE_ID, citaId: pagina.id, inicio, fin, accion },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  if (err.notion) console.error(JSON.stringify(err.notion, null, 2));
  process.exit(1);
});
