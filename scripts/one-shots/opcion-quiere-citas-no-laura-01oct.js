#!/usr/bin/env node
/**
 * Agrega "Quiere citas no" al select Última Campaña Enviada de Contactos
 * de Laura. No toca filas.
 *
 * Un PATCH de opciones tiene que reenviar la lista completa.
 *
 * Dry-run:  node scripts/one-shots/opcion-quiere-citas-no-laura-01oct.js
 * Escribe:  node scripts/one-shots/opcion-quiere-citas-no-laura-01oct.js --confirmar
 */
require('dotenv').config();

const { notionFetch } = require('../../src/utils/notion-client');

const CAMPO = 'Última Campaña Enviada';
const NUEVA = 'Quiere citas no';
const CONFIRMAR = process.argv.includes('--confirmar');

async function main() {
  const id = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
  if (!String(id || '').startsWith('3b162dda')) {
    throw new Error('Abortado: NOTION_CONTACTOS_DATA_SOURCE_ID no es Contactos de Laura');
  }

  const actual = await notionFetch(`/data_sources/${id}`);
  const propiedad = actual.properties?.[CAMPO];
  if (propiedad?.type !== 'select') {
    throw new Error(`"${CAMPO}" no existe o no es select`);
  }

  const opciones = propiedad.select.options || [];
  console.log('Opciones actuales:', opciones.map((opcion) => opcion.name).join(' | '));
  if (opciones.some((opcion) => opcion.name === NUEVA)) {
    console.log(`"${NUEVA}" ya existe. Nada que hacer.`);
    return;
  }
  if (!CONFIRMAR) {
    console.log(`Dry-run. Agregaría "${NUEVA}". Para escribir: --confirmar`);
    return;
  }

  const actualizado = await notionFetch(`/data_sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        [CAMPO]: {
          select: {
            options: [
              ...opciones.map(({ id: optionId, name, color }) => ({
                id: optionId,
                name,
                color,
              })),
              { name: NUEVA, color: 'purple' },
            ],
          },
        },
      },
    }),
  });

  const finales = (actualizado.properties?.[CAMPO]?.select?.options || []).map(
    (opcion) => opcion.name
  );
  for (const previa of opciones) {
    if (!finales.includes(previa.name)) {
      throw new Error(`Se perdió la opción "${previa.name}"`);
    }
  }
  if (!finales.includes(NUEVA)) throw new Error(`Notion no devolvió "${NUEVA}"`);
  console.log('PATCH ok. Opciones:', finales.join(' | '));
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
