#!/usr/bin/env node
/**
 * Recalcula score y explicación de las filas Aprobado de Citas de Laura
 * con las reglas vigentes. Solo actualiza Notas; preserva estatus,
 * relaciones y cualquier otro campo.
 *
 * Dry-run nominal:
 *   node scripts/one-shots/reconciliar-aprobadas-matchmaking-laura-07sep.js
 * Escritura, únicamente después de revisar el dry-run:
 *   node scripts/one-shots/reconciliar-aprobadas-matchmaking-laura-07sep.js --confirmar
 */
require('dotenv').config();

const CONTACTOS_LAURA = '3b162dda-199a-8029-8d58-000b6d1fed37';
const CITAS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const CONFIRMAR = process.argv.includes('--confirmar');

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
  generarExplicacionNatural,
} = require('../../src/services/matchmaking.service');

async function queryAprobadas() {
  const filas = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: { property: 'Estatus', select: { equals: 'Aprobado' } },
    };
    if (cursor) body.start_cursor = cursor;
    const pagina = await notionFetch(`/data_sources/${CITAS_LAURA}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    filas.push(...(pagina.results || []));
    cursor = pagina.has_more ? pagina.next_cursor : null;
  } while (cursor);
  return filas;
}

function relacionId(fila, nombre) {
  return fila.properties?.[nombre]?.relation?.[0]?.id || null;
}

function textoPlano(propiedad) {
  return (propiedad?.rich_text || []).map((item) => item.plain_text || '').join('');
}

async function preparar(fila) {
  const sponsorId = relacionId(fila, 'Contacto Match');
  const asistenteId = relacionId(fila, 'Contacto Principal');
  if (!sponsorId || !asistenteId) {
    throw new Error(`Fila Aprobado ${fila.id} sin Contacto Match o Contacto Principal`);
  }
  const [sponsor, asistente] = await Promise.all([
    contactos.obtenerContacto(sponsorId),
    contactos.obtenerContacto(asistenteId),
  ]);
  const areaValida = esCandidatoPorArea(asistente, sponsor.puestosBuscados);
  const tamanoValido = esCandidatoPorTamanoNegocio(asistente, sponsor.etapaClienteBuscada);
  const { score, senales } = calcularScore(sponsor, asistente);
  const explicacion = generarExplicacionNatural(asistente, senales);
  const notasNuevas = `Score: ${score}. ${explicacion}`.slice(0, 1900);
  return {
    filaId: fila.id,
    sponsor,
    asistente,
    areaValida,
    tamanoValido,
    score,
    explicacion,
    notasNuevas,
    notasAnteriores: textoPlano(fila.properties?.Notas),
  };
}

async function main() {
  const filas = await queryAprobadas();
  console.log(`Aprobadas encontradas: ${filas.length}`);
  const cambios = [];
  for (const fila of filas) cambios.push(await preparar(fila));

  const incompatibles = cambios.filter((item) => !item.areaValida || !item.tamanoValido);
  for (const [indice, item] of cambios.entries()) {
    console.log(
      `\n${indice + 1}. ${item.sponsor.empresa || item.sponsor.nombre} → ${
        item.asistente.empresa || item.asistente.nombre
      }`
    );
    console.log(`   fila: ${item.filaId}`);
    console.log(`   elegible: Área=${item.areaValida ? 'sí' : 'NO'} | Tamaño=${item.tamanoValido ? 'sí' : 'NO'}`);
    console.log(`   score nuevo: ${item.score}`);
    console.log(`   Notas nuevas: ${item.notasNuevas}`);
  }

  if (incompatibles.length > 0) {
    throw new Error(
      `${incompatibles.length} Aprobado(s) ya no son elegibles; se aborta sin escribir para decisión manual`
    );
  }
  if (!CONFIRMAR) {
    console.log('\nDRY-RUN. Nada escrito. Revisa la lista nominal antes de usar --confirmar.');
    return;
  }

  for (const item of cambios) {
    await notionFetch(`/pages/${item.filaId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: {
          Notas: {
            rich_text: [{ type: 'text', text: { content: item.notasNuevas } }],
          },
        },
      }),
    });
    const verificada = await notionFetch(`/pages/${item.filaId}`);
    const estatus = verificada.properties?.Estatus?.select?.name;
    const sponsorId = relacionId(verificada, 'Contacto Match');
    const asistenteId = relacionId(verificada, 'Contacto Principal');
    const notas = textoPlano(verificada.properties?.Notas);
    if (
      estatus !== 'Aprobado' ||
      sponsorId !== item.sponsor.id ||
      asistenteId !== item.asistente.id ||
      notas !== item.notasNuevas ||
      verificada.properties?.['Score (de Notas)']?.formula?.number !== item.score
    ) {
      throw new Error(`Validación posterior falló en ${item.filaId}`);
    }
    console.log(`PATCH OK: ${item.filaId}`);
  }
  console.log(`\nReconciliadas: ${cambios.length}; solo cambió Notas.`);
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
