const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'fdt_reserva_token';

export class ApiError extends Error {
  constructor(code, message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

function token() {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  if (!API_BASE) {
    throw new ApiError(
      'FRONTEND_NO_CONFIGURADO',
      'Falta configurar VITE_API_BASE_URL.',
      503
    );
  }
  const { auth = true, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE}/reserva-publica${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(!auth || !token()
        ? {}
        : { Authorization: `Bearer ${token()}` }),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data.error || 'SOLICITUD_FALLO',
      data.message || 'No se pudo completar la solicitud.',
      response.status,
      data
    );
  }
  return data;
}

export async function identificar(email, contactoId) {
  const data = await request('/identificar', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      email,
      ...(contactoId ? { contactoId } : {}),
    }),
  });
  window.sessionStorage.setItem(TOKEN_KEY, data.token);
  return data;
}

export function cerrarSesion() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export function listarSponsors() {
  return request('/sponsors');
}

export function consultarDisponibilidad(sponsor, fecha, exceptCitaId) {
  const query = new URLSearchParams({ sponsor, fecha });
  if (exceptCitaId) query.set('exceptCitaId', exceptCitaId);
  return request(`/disponibilidad?${query}`);
}

export function reservar({ sponsor, inicio, fin, requestId }) {
  return request('/reservar', {
    method: 'POST',
    body: JSON.stringify({
      sponsor,
      inicio,
      fin,
      request_id: requestId,
    }),
  });
}

export function modificarCita({ citaId, inicio }) {
  return request(`/citas/${citaId}/modificar`, {
    method: 'POST',
    body: JSON.stringify({ inicio }),
  });
}

export function cancelarCita(citaId) {
  return request(`/citas/${citaId}/cancelar`, {
    method: 'POST',
  });
}
