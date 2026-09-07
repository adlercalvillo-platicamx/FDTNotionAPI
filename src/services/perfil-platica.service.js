// Sincroniza el perfil visible en Plática desde la fuente de verdad (Notion).
// Se usa antes de enviar plantillas, al recibir un mensaje sin campaña previa
// y después de reservar/modificar/cancelar una cita.

const contactosService = require('./contactos.service');
const citasService = require('./citas.service');

// Los campos `textList` de Plática no se pueden reemplazar: cada PATCH agrega
// una entrada más y ni `null` ni `[]` los vacían (probado 7-sep). Las citas
// viven en un campo de texto propio; `soluciones_buscadas` sigue siendo lista
// de Marketing y solo se escribe cuando está vacía.
const CAMPOS = {
  area: 'area',
  rolPuesto: 'role_puesto',
  solucionesBuscadas: 'soluciones_buscadas',
  tamanoNegocio: 'tamano_de_negocio',
  tipoAsistencia: 'tipo_de_asistencia',
  giroIndustria: 'giro_industria',
  redesSociales: 'redes_sociales',
  citasConfirmadas: 'citas_confirmadas_del_asistente',
  numeroCitasConfirmadas: 'numero_de_citas_confirmadas',
};

function capitalizarPalabra(palabra) {
  if (!palabra) return palabra;
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es');
}

function capitalizarTokenNombre(token) {
  return token
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizarPalabra(parte)))
    .join('');
}

function tokensNombre(nombreCompleto) {
  return String(nombreCompleto || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(capitalizarTokenNombre);
}

// Ticketópolis vuelca "ANA MARIA PEREZ LOPEZ". Nombre completo en Title Case.
// Primer nombre = primer token + segundo token si hay 3+ (Ana Maria);
// apellido = el resto (Perez Lopez). 2 tokens: Adler / Calvillo.
function nombreParaPerfilPlatica(nombreCompleto) {
  const tokens = tokensNombre(nombreCompleto);
  const name = tokens.join(' ');
  if (tokens.length === 0) return { name: '', firstname: '', lastname: '' };
  if (tokens.length === 1) return { name, firstname: tokens[0], lastname: '' };
  if (tokens.length === 2) {
    return { name, firstname: tokens[0], lastname: tokens[1] };
  }
  return {
    name,
    firstname: `${tokens[0]} ${tokens[1]}`,
    lastname: tokens.slice(2).join(' '),
  };
}

function unirTextos(...valores) {
  return [...new Set(valores.map((v) => String(v || '').trim()).filter(Boolean))].join(' | ');
}

function textoEnTitulo(valor) {
  return tokensNombre(valor).join(' ');
}

function estaGritado(valor) {
  const letras = String(valor || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  return letras.length > 0 && letras === letras.toLocaleUpperCase('es');
}

function textoEnTituloSiGritado(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return '';
  return estaGritado(texto) ? textoEnTitulo(texto) : texto;
}

function redesEnMinusculas(...valores) {
  return unirTextos(...valores).toLocaleLowerCase('es');
}

function lineaCita(cita) {
  const empresa = cita.sponsorEmpresa || cita.sponsorNombre || 'Sponsor';
  const horario = cita.inicio
    ? citasService.formatearHorarioLegible(cita.inicio)
    : 'horario por confirmar';
  return `${empresa} — ${horario}`;
}

function ordenarCitas(citasConfirmadas) {
  return [...(citasConfirmadas || [])].sort((a, b) =>
    String(a.inicio || '').localeCompare(String(b.inicio || ''))
  );
}

function textoCitas(citasOrdenadas) {
  return citasOrdenadas.map((cita) => `• ${lineaCita(cita)}`).join('\n');
}

// Para la respuesta HTTP: la lista legible de lo que quedó en el campo de texto.
function citasOrdenadasParaRespuesta(citasConfirmadas) {
  return ordenarCitas(citasConfirmadas).map(lineaCita);
}

// Un `textList` guarda entradas con forma { content: [...] }; toleramos también
// arreglos planos y texto suelto por si Plática cambia la representación.
function campoListaTieneValor(valor) {
  if (!valor) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  if (Array.isArray(valor)) return valor.some((entrada) => campoListaTieneValor(entrada));
  if (typeof valor === 'object') return campoListaTieneValor(valor.content);
  return false;
}

function payloadPerfil(contacto, citasConfirmadas, { perfilActual } = {}) {
  const citasOrdenadas = ordenarCitas(citasConfirmadas);
  const { name, firstname, lastname } = nombreParaPerfilPlatica(contacto.nombre);
  const payload = {
    name,
    firstname,
    lastname,
    company: textoEnTituloSiGritado(contacto.empresa),
    customFields: {
      [CAMPOS.area]: contacto.area || '',
      [CAMPOS.rolPuesto]: textoEnTitulo(contacto.rolPuesto),
      [CAMPOS.tamanoNegocio]: contacto.tamanoNegocio || '',
      [CAMPOS.tipoAsistencia]: contacto.ticketTipo || '',
      [CAMPOS.giroIndustria]: contacto.giroIndustria || '',
      [CAMPOS.redesSociales]: redesEnMinusculas(contacto.linkedinInstagram, contacto.webRedes),
      [CAMPOS.citasConfirmadas]: textoCitas(citasOrdenadas),
      [CAMPOS.numeroCitasConfirmadas]: citasOrdenadas.length,
    },
  };
  const soluciones = contacto.solucionesBuscadas || [];
  const yaTieneSoluciones = campoListaTieneValor(
    perfilActual?.customFields?.[CAMPOS.solucionesBuscadas]
  );
  if (soluciones.length && !yaTieneSoluciones) {
    payload.customFields[CAMPOS.solucionesBuscadas] = soluciones;
  }
  if (contacto.email) payload.email = contacto.email;
  return payload;
}

async function hidratarPerfilPlatica({
  whatsapp,
  asistentePageId,
  actualizarClienteFn,
  obtenerClienteFn,
} = {}) {
  const phone = String(whatsapp || '').trim();
  let contacto = null;
  if (asistentePageId) {
    contacto = await contactosService.obtenerContacto(asistentePageId);
  } else if (phone) {
    contacto = await contactosService.buscarAsistentePorWhatsApp(phone);
  }
  if (!contacto) {
    const error = new Error('No hay un asistente activo para hidratar en Plática.');
    error.code = 'ASISTENTE_NO_ENCONTRADO';
    error.status = 404;
    throw error;
  }

  const telefono = contacto.whatsapp || phone;
  if (!telefono) {
    const error = new Error('El asistente de Notion no tiene WhatsApp.');
    error.code = 'SIN_WHATSAPP';
    error.status = 400;
    throw error;
  }

  const citasConfirmadas = await citasService.listarCitasRealesPorAsistente(contacto.id, {
    incluirCompletadas: true,
  });

  // Leer el perfil antes de escribir es lo único que evita apilar en
  // `soluciones_buscadas`: si Plática ya tiene algo ahí, no se vuelve a mandar.
  const obtener = obtenerClienteFn || require('./platica-client.service').obtenerCliente;
  let perfilActual = null;
  try {
    perfilActual = await obtener(telefono);
  } catch (error) {
    console.warn(
      `[PerfilPlatica] No se pudo leer el perfil de ${telefono}, se omiten soluciones:`,
      error.message
    );
    perfilActual = { customFields: { [CAMPOS.solucionesBuscadas]: 'lectura-fallida' } };
  }

  const cambios = payloadPerfil(contacto, citasConfirmadas, { perfilActual });
  const actualizar =
    actualizarClienteFn || require('./platica-client.service').actualizarCliente;
  await actualizar({ phone: telefono, ...cambios });

  return {
    actualizado: true,
    contactoId: contacto.id,
    whatsapp: telefono,
    numeroCitasConfirmadas: citasConfirmadas.length,
    citasConfirmadas: citasOrdenadasParaRespuesta(citasConfirmadas),
    solucionesEscritas: Boolean(cambios.customFields[CAMPOS.solucionesBuscadas]),
  };
}

module.exports = {
  CAMPOS,
  nombreParaPerfilPlatica,
  lineaCita,
  payloadPerfil,
  hidratarPerfilPlatica,
};
