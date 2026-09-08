#!/usr/bin/env node
/**
 * Dry-run de Laura: recalcula con las reglas vigentes las filas Sugerido /
 * Aprobado existentes y compara el top anterior contra el nuevo por sponsor.
 * Solo lectura; no crea, actualiza ni archiva filas.
 */
require('dotenv').config();

const CONTACTOS_LAURA = '3b162dda-199a-8029-8d58-000b6d1fed37';
const CITAS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const MARGEN_CANDIDATOS = Number(process.env.MARGEN_CANDIDATOS || 2);

const tokenLaura = process.env.NOTION_API_KEY_LAURA;
if (!tokenLaura) throw new Error('Falta NOTION_API_KEY_LAURA');
process.env.NOTION_API_KEY = tokenLaura;
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = CONTACTOS_LAURA;
process.env.NOTION_CITAS_DATA_SOURCE_ID = CITAS_LAURA;

const { notionFetch } = require('../../src/utils/notion-client');
const contactos = require('../../src/services/contactos.service');
const {
  calcularScore,
  esCandidatoPorArea,
  esCandidatoPorTamanoNegocio,
} = require('../../src/services/matchmaking.service');

async function queryFilas() {
  const resultados = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: {
        or: [
          { property: 'Estatus', select: { equals: 'Sugerido' } },
          { property: 'Estatus', select: { equals: 'Aprobado' } },
        ],
      },
    };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${CITAS_LAURA}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    resultados.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return resultados;
}

function relacion(fila, nombre) {
  return fila.properties?.[nombre]?.relation?.[0]?.id || null;
}

function scoreAnterior(fila) {
  const formula = fila.properties?.['Score (de Notas)']?.formula;
  return typeof formula?.number === 'number' ? formula.number : Number(formula?.string) || 0;
}

async function main() {
  const filas = await queryFilas();
  const cache = new Map();
  async function contacto(id) {
    if (!cache.has(id)) cache.set(id, contactos.obtenerContacto(id));
    return cache.get(id);
  }

  const evaluadas = [];
  for (const fila of filas) {
    const sponsorId = relacion(fila, 'Contacto Match');
    const asistenteId = relacion(fila, 'Contacto Principal');
    if (!sponsorId || !asistenteId) continue;
    const [sponsor, asistente] = await Promise.all([contacto(sponsorId), contacto(asistenteId)]);
    const areaValida = esCandidatoPorArea(asistente, sponsor.puestosBuscados);
    const tamanoValido = esCandidatoPorTamanoNegocio(asistente, sponsor.etapaClienteBuscada);
    evaluadas.push({
      estatus: fila.properties?.Estatus?.select?.name,
      sponsor,
      asistente,
      areaValida,
      tamanoValido,
      scoreAnterior: scoreAnterior(fila),
      scoreNuevo: calcularScore(sponsor, asistente).score,
    });
  }

  const porSponsor = new Map();
  for (const item of evaluadas) {
    if (!porSponsor.has(item.sponsor.id)) porSponsor.set(item.sponsor.id, []);
    porSponsor.get(item.sponsor.id).push(item);
  }

  for (const items of porSponsor.values()) {
    const sponsor = items[0].sponsor;
    const topN = (sponsor.citasMinimasPrometidas || 0) + MARGEN_CANDIDATOS;
    const etiqueta = (item) =>
      `${item.asistente.empresa || item.asistente.nombre} (${item.scoreAnterior}→${item.scoreNuevo})`;
    const anterior = [...items]
      .sort((a, b) => b.scoreAnterior - a.scoreAnterior)
      .slice(0, topN)
      .map(etiqueta);
    const nuevo = items
      .filter((item) => item.areaValida && item.tamanoValido)
      .sort((a, b) => b.scoreNuevo - a.scoreNuevo)
      .slice(0, topN)
      .map(etiqueta);
    console.log(`\n${sponsor.empresa || sponsor.nombre} — topN ${topN}`);
    console.log(`  anterior: ${anterior.join(' | ') || '(vacío)'}`);
    console.log(`  nuevo:    ${nuevo.join(' | ') || '(vacío)'}`);
  }

  const sugeridas = evaluadas.filter((item) => item.estatus === 'Sugerido');
  const aprobadas = evaluadas.filter((item) => item.estatus === 'Aprobado');
  const areaIncompatible = evaluadas.filter((item) => !item.areaValida);
  const tamanoIncompatible = evaluadas.filter((item) => !item.tamanoValido);
  console.log('\n=== Resumen dry-run ===');
  console.log(`Filas evaluadas: ${evaluadas.length} (${sugeridas.length} Sugerido / ${aprobadas.length} Aprobado)`);
  console.log(`Área conocida no solicitada: ${areaIncompatible.length}`);
  console.log(`Tamaño incompatible: ${tamanoIncompatible.length}`);
  console.log(
    `Aprobado incompatible: ${
      aprobadas.filter((item) => !item.areaValida || !item.tamanoValido).length
    }`
  );
  console.log('Escrituras: 0');
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
