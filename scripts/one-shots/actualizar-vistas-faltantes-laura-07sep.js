#!/usr/bin/env node
/**
 * Citas de Laura: crea el rollup "Citas Faltantes (sponsor)" desde
 * Contacto Match → Citas Faltantes y lo muestra junto a Empresa Sponsor
 * en las diez vistas operativas de decisión.
 *
 * Idempotente y dry-run por default. No modifica filtros, sorts ni group_by.
 *
 * Dry-run:
 *   node scripts/one-shots/actualizar-vistas-faltantes-laura-07sep.js
 * Escribe:
 *   node scripts/one-shots/actualizar-vistas-faltantes-laura-07sep.js --confirmar
 */
require('dotenv').config();

const DS_VER = '2025-09-03';
const VIEWS_VER = '2026-03-11';
const CITAS_DS_LAURA = '3b162dda-199a-8053-8098-000b00916893';
const CAMPO = 'Citas Faltantes (sponsor)';
const RELACION = 'Contacto Match';
const ROLLUP_ORIGEN = 'Citas Faltantes';
const ANCLA = 'Empresa Sponsor';
const CONFIRMAR = process.argv.includes('--confirmar');

const VISTAS = [
  ['3d062dda-199a-81eb-8b59-000cc3a4da8b', 'Sugeridos por decidir'],
  ['3d062dda-199a-81e2-bc4a-000c0f6ff9e6', 'Aprobados sin agendar'],
  ['3d062dda-199a-81f7-bf37-000cfe5049e2', 'Top Aprobadas por Asistente'],
  ['3d062dda-199a-81d1-aa1f-000cf164c06d', 'Top Confirmadas por Asistente'],
  ['3d062dda-199a-81be-b8c9-000cea433bf1', 'Top Rechazadas por Asistente'],
  ['3d062dda-199a-81e2-9dcf-000cc9af3e38', 'Top Sugeridas por Asistente'],
  ['3cf62dda-199a-81cf-b15d-000cd6d46e41', 'Top Sugeridas y Aprobadas por Asistente'],
  ['3d062dda-199a-8159-82ed-000c83a37787', 'Cola — Sugeridas por aprobar'],
  ['3d062dda-199a-81c0-8f99-000ca40318ab', 'Aprobadas sin oferta (por asistente)'],
  ['3d062dda-199a-81c6-88bb-000c19ba9a5b', 'Aprobadas con oferta (por asistente)'],
];

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
  const nameToId = new Map();
  const idToName = new Map();
  for (const [nombre, propiedad] of Object.entries(ds.properties || {})) {
    const id = decodeURIComponent(propiedad.id);
    nameToId.set(nombre, id);
    idToName.set(id, nombre);
  }
  nameToId.set('Nombre', 'title');
  idToName.set('title', 'Nombre');
  return { nameToId, idToName };
}

function propiedadConfig(item) {
  const salida = {
    property_id: decodeURIComponent(item.property_id || item.property || ''),
    visible: item.visible !== false,
  };
  for (const clave of ['width', 'wrap', 'date_format', 'status_show_as']) {
    if (item[clave] !== undefined) salida[clave] = item[clave];
  }
  return salida;
}

function jsonEstable(valor) {
  return JSON.stringify(valor ?? null);
}

function prepararPropiedades(vista, mapas, idCampo) {
  const props = (vista.configuration?.properties || [])
    .map(propiedadConfig)
    .filter((item) => mapas.idToName.has(item.property_id) && item.property_id !== idCampo);

  const idAncla = mapas.nameToId.get(ANCLA);
  const idNotas = mapas.nameToId.get('Notas');
  if (!idAncla || !idNotas) throw new Error(`Falta ${ANCLA} o Notas en Citas de Laura`);

  const ancla = props.findIndex((item) => item.property_id === idAncla);
  if (ancla === -1) throw new Error(`La vista "${vista.name}" no contiene ${ANCLA}`);
  props.splice(ancla + 1, 0, { property_id: idCampo, visible: true });

  const notas = props.find((item) => item.property_id === idNotas);
  if (notas) notas.visible = true;
  else props.push({ property_id: idNotas, visible: true });
  return props;
}

function configParaPatch(vista, properties) {
  const config = { type: vista.configuration.type, properties };
  if (vista.type === 'board') {
    if (!vista.configuration.group_by) throw new Error(`Board "${vista.name}" perdió group_by`);
    config.group_by = vista.configuration.group_by;
  }
  return config;
}

async function main() {
  const token = process.env.NOTION_API_KEY_LAURA;
  if (!token) throw new Error('Falta NOTION_API_KEY_LAURA');

  let ds = await notion(token, DS_VER, 'GET', `/data_sources/${CITAS_DS_LAURA}`);
  if (!String(ds.id).startsWith('3b162dda')) throw new Error(`Destino no es Laura (${ds.id})`);
  if (!ds.properties?.[RELACION]) throw new Error(`No existe la relación "${RELACION}"`);

  const existente = ds.properties?.[CAMPO];
  if (existente && existente.type !== 'rollup') {
    throw new Error(`"${CAMPO}" ya existe pero es ${existente.type}, no rollup`);
  }
  console.log(
    existente
      ? `${CAMPO}: ya existe (${existente.type})`
      : `${CAMPO}: crear ${RELACION} → ${ROLLUP_ORIGEN} (show_original)`
  );

  if (!existente && CONFIRMAR) {
    ds = await notion(token, DS_VER, 'PATCH', `/data_sources/${CITAS_DS_LAURA}`, {
      properties: {
        [CAMPO]: {
          rollup: {
            relation_property_name: RELACION,
            rollup_property_name: ROLLUP_ORIGEN,
            function: 'show_original',
          },
        },
      },
    });
    if (ds.properties?.[CAMPO]?.type !== 'rollup') {
      throw new Error('PATCH schema respondió pero el rollup no apareció');
    }
  }

  const mapas = mapaPropiedades(ds);
  const idCampo = mapas.nameToId.get(CAMPO);
  if (!idCampo) {
    console.log('Vistas: validar IDs/configuración; se actualizarán después de crear el rollup.');
    for (const [id, nombre] of VISTAS) {
      const vista = await notion(token, VIEWS_VER, 'GET', `/views/${id}`);
      if (vista.name !== nombre) {
        throw new Error(`La vista ${id} debía ser "${nombre}" y ahora es "${vista.name}"`);
      }
      if (!['table', 'board'].includes(vista.type)) {
        throw new Error(`Tipo inesperado en "${vista.name}": ${vista.type}`);
      }
      const nombres = (vista.configuration?.properties || []).map((item) =>
        mapas.idToName.get(decodeURIComponent(item.property_id || item.property || ''))
      );
      if (!nombres.includes(ANCLA) || !nombres.includes('Notas')) {
        throw new Error(`"${vista.name}" no contiene ${ANCLA} o Notas`);
      }
      if (vista.type === 'board' && !vista.configuration?.group_by) {
        throw new Error(`Board "${vista.name}" perdió group_by`);
      }
      console.log(`  ${vista.name}: mostrar ${CAMPO} después de ${ANCLA}; mantener Notas`);
    }
    console.log('\nDRY-RUN. Nada escrito. Agrega --confirmar.');
    return;
  }

  for (const [id, nombreEsperado] of VISTAS) {
    const antes = await notion(token, VIEWS_VER, 'GET', `/views/${id}`);
    if (antes.name !== nombreEsperado) {
      throw new Error(`La vista ${id} debía ser "${nombreEsperado}" y ahora es "${antes.name}"`);
    }
    if (!['table', 'board'].includes(antes.type)) {
      throw new Error(`Tipo inesperado en "${antes.name}": ${antes.type}`);
    }

    const properties = prepararPropiedades(antes, mapas, idCampo);
    const visibles = properties
      .filter((item) => item.visible)
      .map((item) => mapas.idToName.get(item.property_id) || item.property_id);
    console.log(`${antes.name}: ${visibles.join(' | ')}`);
    if (!CONFIRMAR) continue;

    const invariantes = {
      filter: jsonEstable(antes.filter),
      sorts: jsonEstable(antes.sorts),
      group_by: jsonEstable(antes.configuration?.group_by),
    };
    await notion(token, VIEWS_VER, 'PATCH', `/views/${id}`, {
      configuration: configParaPatch(antes, properties),
    });
    const despues = await notion(token, VIEWS_VER, 'GET', `/views/${id}`);
    const nombresVisibles = (despues.configuration?.properties || [])
      .filter((item) => item.visible !== false)
      .map((item) => mapas.idToName.get(decodeURIComponent(item.property_id || item.property || '')));
    if (!nombresVisibles.includes(CAMPO) || !nombresVisibles.includes('Notas')) {
      throw new Error(`Validación falló en "${despues.name}": faltan ${CAMPO} o Notas`);
    }
    if (
      invariantes.filter !== jsonEstable(despues.filter) ||
      invariantes.sorts !== jsonEstable(despues.sorts) ||
      invariantes.group_by !== jsonEstable(despues.configuration?.group_by)
    ) {
      throw new Error(`Validación falló: cambió filtro, sorts o group_by en "${despues.name}"`);
    }
    console.log(`  PATCH y validación OK`);
  }

  if (!CONFIRMAR) console.log('\nDRY-RUN. Nada escrito. Agrega --confirmar.');
}

main().catch((error) => {
  console.error('FAIL', error.message || error);
  process.exit(1);
});
