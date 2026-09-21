#!/usr/bin/env node
/**
 * Entregable para el proveedor de pantallas: un enlace wa.me por empresa
 * sponsor, con el mensaje prellenado que decidió Laura el 17-sep.
 *
 * Solo lee Notion (Contactos de Laura) y escribe un .md local. No toca
 * Notion, Plática ni correo — se puede reejecutar cuando cambien los
 * sponsors.
 *
 * Un QR por EMPRESA, no por contacto: varios representantes de la misma
 * empresa comparten enlace. Bronce queda fuera porque no participa en
 * citas 1a1.
 *
 *   node scripts/one-shots/generar-qrs-wa-sponsors-21sep.js
 */
require('dotenv').config();

if (!process.env.NOTION_API_KEY_LAURA && !process.env.NOTION_API_KEY) {
  throw new Error('Falta token Notion');
}
process.env.NOTION_API_KEY = process.env.NOTION_API_KEY_LAURA || process.env.NOTION_API_KEY;

const CONTACTOS_LAURA = '3b162dda-199a-8029-8d58-000b6d1fed37';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID =
  process.env.NOTION_CONTACTOS_DATA_SOURCE_ID || CONTACTOS_LAURA;

const fs = require('fs');
const path = require('path');
const contactos = require('../../src/services/contactos.service');

// Espejo de NIVELES_SIN_CITAS_1A1 en matchmaking.service.js, que no lo exporta.
const NIVELES_SIN_CITAS_1A1 = ['Bronce'];
const NUMERO_AGENTE2 = '5213332361963';
const SALIDA = path.join(__dirname, '..', '..', 'qrs-piso-wa-sponsors.md');

function mensajePara(empresa) {
  return `¡Hola! Estoy en el evento y me gustaría obtener más información para conectar con ${empresa}. ¡Gracias!`;
}

function enlacePara(empresa) {
  return `https://wa.me/${NUMERO_AGENTE2}?text=${encodeURIComponent(mensajePara(empresa))}`;
}

async function main() {
  const sponsors = await contactos.listarSponsorsActivos();
  const porEmpresa = new Map();
  const sinEmpresa = [];

  for (const sponsor of sponsors) {
    const empresa = String(sponsor.empresa || '').trim();
    if (!empresa) {
      sinEmpresa.push(sponsor.nombre || sponsor.id);
      continue;
    }
    const previo = porEmpresa.get(empresa);
    if (previo) {
      previo.representantes.push(sponsor.nombre || '(sin nombre)');
      continue;
    }
    porEmpresa.set(empresa, {
      empresa,
      nivel: sponsor.nivelPatrocinio || '(sin nivel)',
      representantes: [sponsor.nombre || '(sin nombre)'],
    });
  }

  const todas = [...porEmpresa.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, 'es-MX'));
  const conCitas = todas.filter((item) => !NIVELES_SIN_CITAS_1A1.includes(item.nivel));
  const bronce = todas.filter((item) => NIVELES_SIN_CITAS_1A1.includes(item.nivel));

  const lineas = [];
  lineas.push('# QR de piso — un enlace de WhatsApp por sponsor');
  lineas.push('');
  lineas.push('Generado por `scripts/one-shots/generar-qrs-wa-sponsors-21sep.js` desde');
  lineas.push('Contactos de Notion (Laura). Si cambian los sponsors, volver a correrlo.');
  lineas.push('');
  lineas.push(`Número del Agente 2: \`${NUMERO_AGENTE2}\` (no el de Marketing).`);
  lineas.push('');
  lineas.push('El nombre de la empresa viaja en el texto prellenado. El agente lo resuelve');
  lineas.push('aunque el usuario lo edite o venga aproximado, así que el QR no depende de');
  lineas.push('que el texto coincida carácter por carácter con Notion.');
  lineas.push('');
  lineas.push(`## Sponsors con citas 1a1 (${conCitas.length})`);
  lineas.push('');
  lineas.push('| Empresa | Nivel | Enlace del QR |');
  lineas.push('|---|---|---|');
  for (const item of conCitas) {
    lineas.push(`| ${item.empresa} | ${item.nivel} | ${enlacePara(item.empresa)} |`);
  }
  lineas.push('');
  lineas.push('## Mensaje prellenado');
  lineas.push('');
  lineas.push('```');
  lineas.push(mensajePara('[EMPRESA]'));
  lineas.push('```');

  if (bronce.length) {
    lineas.push('');
    lineas.push(`## Sin QR — Bronce, no participa en citas 1a1 (${bronce.length})`);
    lineas.push('');
    for (const item of bronce) lineas.push(`- ${item.empresa}`);
  }
  if (sinEmpresa.length) {
    lineas.push('');
    lineas.push(`## Sin QR — contacto sponsor sin empresa en Notion (${sinEmpresa.length})`);
    lineas.push('');
    for (const nombre of sinEmpresa) lineas.push(`- ${nombre}`);
  }
  lineas.push('');

  fs.writeFileSync(SALIDA, lineas.join('\n'), 'utf8');
  console.log(`Sponsors activos: ${sponsors.length} contactos / ${todas.length} empresas`);
  console.log(`Con QR: ${conCitas.length} | Bronce: ${bronce.length} | Sin empresa: ${sinEmpresa.length}`);
  console.log(`Archivo: ${SALIDA}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
