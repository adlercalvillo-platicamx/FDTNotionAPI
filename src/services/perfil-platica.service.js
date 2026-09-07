// Sincroniza el perfil visible en Plática desde la fuente de verdad (Notion).
// Se usa antes de enviar plantillas, al recibir un mensaje sin campaña previa
// y después de reservar/modificar/cancelar una cita.

const contactosService = require('./contactos.service');
const citasService = require('./citas.service');

const CAMPOS = {
  area: 'area',
  rolPuesto: 'role_puesto',
  solucionesBuscadas: 'soluciones_buscadas',
  tamanoNegocio: 'tamano_de_negocio',
  tipoAsistencia: 'tipo_de_asistencia',
  giroIndustria: 'giro_industria',
  redesSociales: 'redes_sociales',
  citasConfirmadas: 'citas_confirmadas',
  numeroCitasConfirmadas: 'numero_de_citas_confirmadas',
};

function primerNombre(nombreCompleto) {
  const primero = String(nombreCompleto || '').trim().split(/\s+/)[0] || '';
  if (!primero) return '';
  return primero.charAt(0).toLocaleUpperCase('es') + primero.slice(1).toLocaleLowerCase('es');
}

function unirTextos(...valores) {
  return [...new Set(valores.map((v) => String(v || '').trim()).filter(Boolean))].join(' | ');
}

function lineaCita(cita) {
  const empresa = cita.sponsorEmpresa || cita.sponsorNombre || 'Sponsor';
  const horario = cita.inicio
    ? citasService.formatearHorarioLegible(cita.inicio)
    : 'horario por confirmar';
  return `${empresa} — ${horario}`;
}

function payloadPerfil(contacto, citasConfirmadas) {
  const citasOrdenadas = [...(citasConfirmadas || [])].sort((a, b) =>
    String(a.inicio || '').localeCompare(String(b.inicio || ''))
  );
  const payload = {
    name: contacto.nombre || '',
    firstname: primerNombre(contacto.nombre),
    company: contacto.empresa || '',
    customFields: {
      [CAMPOS.area]: contacto.area || '',
      [CAMPOS.rolPuesto]: contacto.rolPuesto || '',
      [CAMPOS.solucionesBuscadas]: contacto.solucionesBuscadas || [],
      [CAMPOS.tamanoNegocio]: contacto.tamanoNegocio || '',
      [CAMPOS.tipoAsistencia]: contacto.ticketTipo || '',
      [CAMPOS.giroIndustria]: contacto.giroIndustria || '',
      [CAMPOS.redesSociales]: unirTextos(contacto.linkedinInstagram, contacto.webRedes),
      [CAMPOS.citasConfirmadas]: citasOrdenadas.map(lineaCita),
      [CAMPOS.numeroCitasConfirmadas]: citasOrdenadas.length,
    },
  };
  if (contacto.email) payload.email = contacto.email;
  return payload;
}

async function hidratarPerfilPlatica({
  whatsapp,
  asistentePageId,
  actualizarClienteFn,
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
  const cambios = payloadPerfil(contacto, citasConfirmadas);
  const actualizar =
    actualizarClienteFn || require('./platica-client.service').actualizarCliente;
  await actualizar({ phone: telefono, ...cambios });

  return {
    actualizado: true,
    contactoId: contacto.id,
    whatsapp: telefono,
    numeroCitasConfirmadas: citasConfirmadas.length,
    citasConfirmadas: cambios.customFields[CAMPOS.citasConfirmadas],
  };
}

module.exports = {
  CAMPOS,
  primerNombre,
  lineaCita,
  payloadPerfil,
  hidratarPerfilPlatica,
};
