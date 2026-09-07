#!/usr/bin/env node
/**
 * Crea el conteo de citas confirmadas por contacto en su rol de ASISTENTE.
 *
 * "Citas Confirmadas (Count)" ya existe, pero usa "Citas (relacional)",
 * que es la relación donde el contacto participa como sponsor. Este conteo
 * usa "Citas como asistente" y excluye Aprobado/Cancelada.
 *
 * Dry-run:
 *   node scripts/one-shots/citas-confirmadas-asistente-schema-07sep.js
 * Escribe:
 *   node scripts/one-shots/citas-confirmadas-asistente-schema-07sep.js --confirmar
 */
require('dotenv').config();

const { notionFetch } = require('../../src/utils/notion-client');

const CONFIRMAR = process.argv.includes('--confirmar');
const CONTACTOS_DS = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
const CITAS_DS = process.env.NOTION_CITAS_DATA_SOURCE_ID;

const INDICADOR_CITA = 'Confirmada asistente (1/0)';
const ROLLUP_CONFIRMADAS = 'Citas Confirmadas Asistente (rollup)';
const FORMULA_CONFIRMADAS = 'Citas Confirmadas Asistente (Count)';

const EXPRESION_INDICADOR =
  'if(or(prop("Estatus") == "Confirmada", ' +
  'prop("Estatus") == "Confirmada sin notificar", ' +
  'prop("Estatus") == "Completada"), 1, 0)';

async function obtenerDataSource(id) {
  return notionFetch(`/data_sources/${id}`);
}

async function crearPropiedad(dataSourceId, nombre, definicion) {
  return notionFetch(`/data_sources/${dataSourceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { [nombre]: definicion } }),
  });
}

async function main() {
  if (!CONTACTOS_DS || !CITAS_DS) {
    throw new Error('Faltan NOTION_CONTACTOS_DATA_SOURCE_ID o NOTION_CITAS_DATA_SOURCE_ID');
  }
  if (!CONTACTOS_DS.startsWith('3b162dda') || !CITAS_DS.startsWith('3b162dda')) {
    throw new Error('Este one-shot solo puede operar sobre los data sources de producción de Laura');
  }

  let [contactos, citas] = await Promise.all([
    obtenerDataSource(CONTACTOS_DS),
    obtenerDataSource(CITAS_DS),
  ]);
  const tituloContactos = (contactos.title || []).map((t) => t.plain_text || '').join('');
  const tituloCitas = (citas.title || []).map((t) => t.plain_text || '').join('');
  if (tituloContactos !== 'Contactos FDT' || tituloCitas !== 'Citas FDT2026') {
    throw new Error(`Destino inesperado: "${tituloContactos}" / "${tituloCitas}"`);
  }
  if (!contactos.properties['Citas como asistente']) {
    throw new Error('Falta la relación "Citas como asistente" en Contactos FDT');
  }

  const pasos = [
    {
      dataSourceId: CITAS_DS,
      nombre: INDICADOR_CITA,
      definicion: { formula: { expression: EXPRESION_INDICADOR } },
      existe: () => citas.properties[INDICADOR_CITA],
      actualizar: (ds) => {
        citas = ds;
      },
    },
    {
      dataSourceId: CONTACTOS_DS,
      nombre: ROLLUP_CONFIRMADAS,
      definicion: {
        rollup: {
          relation_property_name: 'Citas como asistente',
          rollup_property_name: INDICADOR_CITA,
          function: 'sum',
        },
      },
      existe: () => contactos.properties[ROLLUP_CONFIRMADAS],
      actualizar: (ds) => {
        contactos = ds;
      },
    },
    {
      dataSourceId: CONTACTOS_DS,
      nombre: FORMULA_CONFIRMADAS,
      definicion: { formula: { expression: `prop("${ROLLUP_CONFIRMADAS}")` } },
      existe: () => contactos.properties[FORMULA_CONFIRMADAS],
      actualizar: (ds) => {
        contactos = ds;
      },
    },
  ];

  console.log(`Destino: ${tituloContactos} / ${tituloCitas}`);
  for (const paso of pasos) {
    if (paso.existe()) {
      console.log(`${paso.nombre}: ya existe`);
      continue;
    }
    if (!CONFIRMAR) {
      console.log(`${paso.nombre}: se crearía`);
      continue;
    }
    const actualizado = await crearPropiedad(
      paso.dataSourceId,
      paso.nombre,
      paso.definicion
    );
    paso.actualizar(actualizado);
    if (!actualizado.properties[paso.nombre]) {
      throw new Error(`Notion no devolvió la propiedad "${paso.nombre}"`);
    }
    console.log(`${paso.nombre}: creado`);
  }

  if (!CONFIRMAR) console.log('DRY-RUN: no se escribió nada.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
