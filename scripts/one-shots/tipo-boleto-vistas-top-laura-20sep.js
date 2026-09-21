#!/usr/bin/env node
/**
 * Citas de Laura: crea el rollup "Tipo boleto (asistente)" y lo muestra en
 * las cuatro vistas board "Top ... por Asistente".
 *
 * Dry-run:
 *   node scripts/one-shots/tipo-boleto-vistas-top-laura-20sep.js
 * Escribe:
 *   node scripts/one-shots/tipo-boleto-vistas-top-laura-20sep.js --confirmar
 */
require('dotenv').config();

const DS_VER = '2025-09-03';
const VIEWS_VER = '2026-03-11';
const CITAS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const CAMPO = 'Tipo boleto (asistente)';
const ANCLA = 'Tamaño Negocio (asistente)';
const CONFIRMAR = process.argv.includes('--confirmar');
const VISTAS = new Map([
  ['3d062dda-199a-81f7-bf37-000cfe5049e2', 'Top Aprobadas por Asistente'],
  ['3d062dda-199a-81d1-aa1f-000cf164c06d', 'Top Confirmadas por Asistente'],
  ['3d062dda-199a-81be-b8c9-000cea433bf1', 'Top Rechazadas por Asistente'],
  ['3d062dda-199a-81e2-9dcf-000cc9af3e38', 'Top Sugeridas por Asistente'],
  ['3cf62dda-199a-81cf-b15d-000cd6d46e41', 'Top Sugeridas y Aprobadas por Asistente'],
]);

async function notion(token, version, method, apiPath, body) {
  const response = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': version,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} -> ${response.status} ${data.message || ''}`);
  }
  return data;
}

function mapaPropiedades(ds) {
  const nameToId = new Map(
    Object.entries(ds.properties || {}).map(([name, property]) => [
      name,
      decodeURIComponent(property.id),
    ])
  );
  nameToId.set('Nombre', 'title');
  return nameToId;
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA');

  let ds = await notion(token, DS_VER, 'GET', `/data_sources/${CITAS_LAURA}`);
  if (!String(ds.id).startsWith('3b162dda')) {
    throw new Error(`Destino no es Citas de Laura (${ds.id})`);
  }

  if (!ds.properties[CAMPO]) {
    console.log(`crear rollup ${CAMPO}: Contacto Principal → Ticket / Tipo Asistencia`);
    if (CONFIRMAR) {
      ds = await notion(token, DS_VER, 'PATCH', `/data_sources/${CITAS_LAURA}`, {
        properties: {
          [CAMPO]: {
            rollup: {
              relation_property_name: 'Contacto Principal',
              rollup_property_name: 'Ticket / Tipo Asistencia',
              function: 'show_original',
            },
          },
        },
      });
    }
  } else {
    console.log(`${CAMPO} ya existe (${ds.properties[CAMPO].type})`);
  }

  const nameToId = mapaPropiedades(ds);
  const idsValidos = new Set(nameToId.values());
  const campoId = nameToId.get(CAMPO);
  if (CONFIRMAR && !campoId) throw new Error(`${CAMPO} no apareció tras PATCH`);

  for (const [viewId, nombreEsperado] of VISTAS) {
    const vista = await notion(token, VIEWS_VER, 'GET', `/views/${viewId}`);
    if (vista.name !== nombreEsperado || vista.type !== 'board') {
      throw new Error(
        `Vista ${viewId} cambió: "${vista.name}" (${vista.type}), esperada "${nombreEsperado}" board`
      );
    }

    const props = [];
    for (const item of vista.configuration?.properties || []) {
      const id = decodeURIComponent(item.property_id || '');
      if (campoId && id === campoId) continue;
      // Algunas vistas conservan IDs de propiedades ya borradas. Reenviarlas
      // hace que PATCH /views falle con "Property ... not found".
      if (!idsValidos.has(id)) {
        console.log(`  omitir propiedad huérfana ${id}`);
        continue;
      }
      props.push({ property_id: id, visible: item.visible !== false });
    }
    if (campoId) {
      const anclaId = nameToId.get(ANCLA);
      const indice = props.findIndex((item) => item.property_id === anclaId);
      props.splice(indice === -1 ? props.length : indice + 1, 0, {
        property_id: campoId,
        visible: true,
      });
    }

    const yaVisible = (vista.configuration?.properties || []).some(
      (item) => decodeURIComponent(item.property_id || '') === campoId && item.visible !== false
    );
    console.log(`${nombreEsperado}: ${yaVisible ? 'ya visible' : 'agregar a tarjeta'}`);
    if (!CONFIRMAR || yaVisible) continue;

    const actualizada = await notion(token, VIEWS_VER, 'PATCH', `/views/${viewId}`, {
      configuration: {
        type: 'board',
        ...(vista.configuration?.group_by ? { group_by: vista.configuration.group_by } : {}),
        properties: props,
      },
    });
    const quedo = (actualizada.configuration?.properties || []).some(
      (item) => decodeURIComponent(item.property_id || '') === campoId && item.visible !== false
    );
    if (!quedo) throw new Error(`${CAMPO} no quedó visible en "${nombreEsperado}"`);
  }

  if (!CONFIRMAR) console.log('\nDRY-RUN. Nada escrito. Agrega --confirmar.');
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
