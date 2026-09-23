// Snapshot de solo lectura de Contactos + Citas → gzip a Cloudflare R2.
// Notion no se escribe. No descarga archivos (files: solo el nombre).
// Rotación: borra objetos notion-fdt/ con LastModified > R2_RETENCION_DIAS.

const zlib = require('zlib');
const { promisify } = require('util');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { notionFetch } = require('../utils/notion-client');

const gzipAsync = promisify(zlib.gzip);

const PREFIJO = 'notion-fdt/';
const RETENCION_DEFAULT_DIAS = 14;

class RespaldoError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function diasRetencion() {
  const n = Number(process.env.R2_RETENCION_DIAS);
  if (Number.isInteger(n) && n >= 1 && n <= 90) return n;
  return RETENCION_DEFAULT_DIAS;
}

function credencialesR2() {
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (process.env.R2_BUCKET || '').trim();
  const endpoint = (process.env.R2_ENDPOINT || '').trim();
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new RespaldoError(
      'RESPALDO_NO_CONFIGURADO',
      'Faltan R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET o R2_ENDPOINT.',
      503
    );
  }
  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    region: (process.env.R2_REGION || 'auto').trim() || 'auto',
  };
}

function crearClienteS3(creds) {
  return new S3Client({
    region: creds.region,
    endpoint: creds.endpoint,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });
}

function sanitizarProperties(properties) {
  const out = {};
  for (const [nombre, valor] of Object.entries(properties || {})) {
    if (valor && valor.type === 'files') {
      out[nombre] = {
        type: 'files',
        files: (valor.files || []).map((f) => ({
          name: f.name || null,
          type: f.type || null,
        })),
      };
      continue;
    }
    out[nombre] = valor;
  }
  return out;
}

function simplificarFila(page) {
  return {
    id: page.id,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    in_trash: Boolean(page.in_trash || page.archived),
    parent: page.parent,
    properties: sanitizarProperties(page.properties),
  };
}

function simplificarSchema(ds) {
  return {
    id: ds.id,
    title: ds.title,
    last_edited_time: ds.last_edited_time,
    properties: ds.properties,
  };
}

async function queryTodasLasFilas(dataSourceId) {
  let cursor;
  const filas = [];
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    filas.push(...(r.results || []).map(simplificarFila));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return filas;
}

function stampArchivo(ahora) {
  return ahora.toISOString().replace(/[:.]/g, '-');
}

async function listarTodasLasKeys(s3, bucket) {
  const keys = [];
  let token;
  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIJO,
        ContinuationToken: token,
      })
    );
    for (const obj of r.Contents || []) {
      if (obj.Key) keys.push({ Key: obj.Key, LastModified: obj.LastModified });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function borrarVencidos(s3, bucket, ahora, retencionDias) {
  const corte = ahora.getTime() - retencionDias * 24 * 60 * 60 * 1000;
  const keys = await listarTodasLasKeys(s3, bucket);
  const aBorrar = keys
    .filter((o) => o.LastModified && o.LastModified.getTime() < corte)
    .map((o) => ({ Key: o.Key }));
  if (aBorrar.length === 0) return { candidatos: 0, borrados: 0 };
  for (let i = 0; i < aBorrar.length; i += 1000) {
    const lote = aBorrar.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: lote, Quiet: true },
      })
    );
  }
  return { candidatos: aBorrar.length, borrados: aBorrar.length };
}

async function respaldarNotion(opciones = {}) {
  const creds = credencialesR2();
  const contactosId = process.env.NOTION_CONTACTOS_DATA_SOURCE_ID;
  const citasId = process.env.NOTION_CITAS_DATA_SOURCE_ID;
  if (!contactosId || !citasId) {
    throw new RespaldoError(
      'RESPALDO_NO_CONFIGURADO',
      'Faltan NOTION_CONTACTOS_DATA_SOURCE_ID o NOTION_CITAS_DATA_SOURCE_ID.',
      503
    );
  }

  const ahora = opciones.ahora instanceof Date ? opciones.ahora : new Date();
  const retencionDias = diasRetencion();
  const s3 = opciones.s3 || crearClienteS3(creds);

  const [schemaContactos, schemaCitas, filasContactos, filasCitas] = await Promise.all([
    notionFetch(`/data_sources/${contactosId}`),
    notionFetch(`/data_sources/${citasId}`),
    queryTodasLasFilas(contactosId),
    queryTodasLasFilas(citasId),
  ]);

  const payload = {
    generadoEn: ahora.toISOString(),
    retencionDias,
    dataSources: { contactos: contactosId, citas: citasId },
    schema: {
      contactos: simplificarSchema(schemaContactos),
      citas: simplificarSchema(schemaCitas),
    },
    filas: {
      contactos: filasContactos,
      citas: filasCitas,
    },
    conteos: {
      contactos: filasContactos.length,
      citas: filasCitas.length,
    },
  };

  const gzip = await gzipAsync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const key = `${PREFIJO}${stampArchivo(ahora)}/contactos-citas.json.gz`;

  await s3.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: key,
      Body: gzip,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
    })
  );

  let rotacion = { candidatos: 0, borrados: 0 };
  try {
    rotacion = await borrarVencidos(s3, creds.bucket, ahora, retencionDias);
  } catch (error) {
    console.error('[NotionRespaldo] Subida OK; falló la rotación:', error.message);
    rotacion = { candidatos: 0, borrados: 0, error: error.message };
  }

  return {
    ok: true,
    key,
    bytesGzip: gzip.length,
    conteos: payload.conteos,
    retencionDias,
    rotacion,
  };
}

module.exports = {
  respaldarNotion,
  RespaldoError,
  sanitizarProperties,
  PREFIJO,
  RETENCION_DEFAULT_DIAS,
};
