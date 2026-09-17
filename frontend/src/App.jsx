import { useMemo, useState } from 'react';
import {
  ApiError,
  cerrarSesion,
  consultarDisponibilidad,
  identificar,
  listarSponsors,
  reservar,
} from './api';

const FECHAS = String(
  import.meta.env.VITE_EVENT_DATES || '2026-10-07,2026-10-08'
)
  .split(',')
  .map((fecha) => fecha.trim())
  .filter(Boolean);

const COPY_ERROR = {
  EMAIL_NO_ENCONTRADO:
    'No encontramos este correo entre los asistentes registrados. Intenta con el mismo correo que utilizaste en tu registro. Si necesitas ayuda, acércate con el equipo de Fashion Digital Talks.',
  BOLETO_EXPO_NO_PERMITE_CITAS:
    'Tu boleto Expo incluye acceso al piso de exhibición, pero no incluye citas 1 a 1. Si tienes dudas, acércate con el equipo de Fashion Digital Talks.',
};

function fechaLarga(fecha) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00-06:00`));
}

function horaCorta(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function mensajeError(error) {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado.';
  return COPY_ERROR[error.code] || error.message;
}

function Brand() {
  return (
    <a
      className="brand"
      href="https://www.fashiondigitaltalks.com/"
      target="_blank"
      rel="noreferrer"
    >
      <span className="brand-mark">FDT</span>
      <span>
        <strong>Fashion Digital Talks</strong>
        <small>#FDT2026 · 7 y 8 de octubre</small>
      </span>
    </a>
  );
}

function Steps({ step }) {
  const labels = ['Identifícate', 'Elige sponsor', 'Selecciona horario', 'Confirma'];
  const active = { email: 0, sponsors: 1, horarios: 2, exito: 3 }[step] ?? 0;
  return (
    <ol className="steps" aria-label="Progreso de la reserva">
      {labels.map((label, index) => (
        <li key={label} className={index <= active ? 'active' : ''}>
          <span>{index + 1}</span>
          <em>{label}</em>
        </li>
      ))}
    </ol>
  );
}

function ExistingAppointments({ citas, virtual = false }) {
  if (!citas?.length) return null;
  return (
    <aside className="existing">
      <span className="eyebrow">Tus citas confirmadas</span>
      {citas.map((cita) => (
        <div className="existing-row" key={cita.citaId}>
          <strong>{cita.sponsorNombre}</strong>
          <span>
            {horaCorta(cita.fechaHora)} ·{' '}
            {virtual ? 'Google Meet' : cita.mesa || 'Mesa por asignar'}
          </span>
        </div>
      ))}
    </aside>
  );
}

function ModalityNotice({ ticketTipo, compact = false }) {
  const virtual = ticketTipo === 'Virtual';
  return (
    <aside className={`modality-notice ${virtual ? 'virtual' : ''} ${compact ? 'compact' : ''}`}>
      <strong>Modalidad: {ticketTipo || 'Por confirmar'}</strong>
      {virtual && (
        <span>
          Tu cita será virtual por Google Meet. Recibirás la liga aproximadamente
          15 minutos antes por WhatsApp y también una invitación de Google en tu correo.
        </span>
      )}
    </aside>
  );
}

function SponsorCard({ sponsor, onSelect }) {
  const initials = sponsor.empresa
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (
    <article className="sponsor-card">
      <div className="sponsor-logo">
        {sponsor.logoUrl ? <img src={sponsor.logoUrl} alt="" /> : <span>{initials}</span>}
      </div>
      <div className="sponsor-copy">
        <h3>{sponsor.empresa}</h3>
        {sponsor.descripcion && <p>{sponsor.descripcion}</p>}
        {!!sponsor.soluciones?.length && (
          <div className="chips">
            {sponsor.soluciones.slice(0, 3).map((solucion) => (
              <span key={solucion}>{solucion}</span>
            ))}
          </div>
        )}
      </div>
      <button className="button button-small" onClick={() => onSelect(sponsor)}>
        Ver horarios
      </button>
    </article>
  );
}

export default function App() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [identidad, setIdentidad] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const [fecha, setFecha] = useState(FECHAS[0]);
  const [bloques, setBloques] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [reservationRequestId, setReservationRequestId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const filtrados = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sponsors;
    return sponsors.filter((sponsor) =>
      [sponsor.empresa, sponsor.descripcion, ...(sponsor.soluciones || [])]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [query, sponsors]);

  async function cargarSponsors(correo) {
    setLoading(true);
    setError('');
    try {
      const persona = await identificar(correo);
      const catalogo = await listarSponsors();
      setIdentidad(persona);
      setSponsors(catalogo.sponsors || []);
      setSelectedSponsor(null);
      setSelectedBlock(null);
      setReservationRequestId('');
      setResultado(null);
      setStep('sponsors');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(event) {
    event.preventDefault();
    await cargarSponsors(email);
  }

  async function cargarHorarios(sponsor, nuevaFecha = fecha) {
    setLoading(true);
    setError('');
    setSelectedSponsor(sponsor);
    setSelectedBlock(null);
    setReservationRequestId('');
    try {
      const data = await consultarDisponibilidad(sponsor.id, nuevaFecha);
      setBloques((data.bloques || []).filter((bloque) => bloque.disponible));
      setFecha(nuevaFecha);
      setStep('horarios');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmar() {
    if (!selectedBlock) return;
    setLoading(true);
    setError('');
    try {
      const data = await reservar({
        sponsor: selectedSponsor.id,
        inicio: selectedBlock.inicio,
        fin: selectedBlock.fin,
        requestId: reservationRequestId,
      });
      setResultado(data);
      setStep('exito');
    } catch (err) {
      setError(mensajeError(err));
      if (['SPONSOR_YA_OCUPADO', 'ASISTENTE_YA_OCUPADO', 'CAPACIDAD_MESAS_LLENA'].includes(err.code)) {
        await cargarHorarios(selectedSponsor, fecha);
      }
    } finally {
      setLoading(false);
    }
  }

  function reiniciar() {
    cerrarSesion();
    setStep('email');
    setEmail('');
    setIdentidad(null);
    setSponsors([]);
    setSelectedSponsor(null);
    setSelectedBlock(null);
    setReservationRequestId('');
    setError('');
    setResultado(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        {identidad && (
          <button className="text-button" onClick={reiniciar}>
            Cambiar correo
          </button>
        )}
      </header>

      <main>
        <Steps step={step} />
        {error && <div className="alert" role="alert">{error}</div>}

        {step === 'email' && (
          <section className="hero panel">
            <div className="hero-copy">
              <span className="eyebrow">Networking en el evento</span>
              <h1>Tu próxima gran conversación empieza aquí.</h1>
              <p>
                Agenda una cita 1 a 1 con aliados tecnológicos y expertos de la
                industria durante Fashion Digital Talks 2026.
              </p>
            </div>
            <form className="email-card" onSubmit={submitEmail}>
              <span className="number">01</span>
              <h2>Encuentra tu registro</h2>
              <label htmlFor="email">Correo de registro</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
                required
              />
              <button className="button" disabled={loading}>
                {loading ? 'Buscando…' : 'Continuar'}
              </button>
              <small>Usa el mismo correo que proporcionaste al registrarte.</small>
            </form>
          </section>
        )}

        {step === 'sponsors' && (
          <section className="content-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Hola, {identidad?.asistente?.nombre}</span>
                <h1>¿Con quién quieres conversar?</h1>
                <p>Explora los sponsors disponibles y elige uno para consultar horarios.</p>
              </div>
              <label className="search">
                <span>Buscar sponsor</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Empresa o solución"
                />
              </label>
            </div>
            <ModalityNotice ticketTipo={identidad?.asistente?.ticketTipo} />
            <ExistingAppointments
              citas={identidad?.citasConfirmadas}
              virtual={identidad?.asistente?.ticketTipo === 'Virtual'}
            />
            <div className="sponsor-grid">
              {filtrados.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} onSelect={cargarHorarios} />
              ))}
            </div>
          </section>
        )}

        {step === 'horarios' && selectedSponsor && (
          <section className="content-section schedule">
            <button className="back" onClick={() => setStep('sponsors')}>← Sponsors</button>
            <span className="eyebrow">Cita con {selectedSponsor.empresa}</span>
            <h1>Elige el mejor momento para ti.</h1>
            <ModalityNotice
              ticketTipo={identidad?.asistente?.ticketTipo}
              compact
            />
            <div className="date-tabs" role="tablist">
              {FECHAS.map((item) => (
                <button
                  key={item}
                  className={item === fecha ? 'active' : ''}
                  onClick={() => cargarHorarios(selectedSponsor, item)}
                >
                  {fechaLarga(item)}
                </button>
              ))}
            </div>
            <div className="time-grid">
              {bloques.map((bloque) => (
                <button
                  key={bloque.inicio}
                  className={selectedBlock?.inicio === bloque.inicio ? 'selected' : ''}
                  onClick={() => {
                    setSelectedBlock(bloque);
                    setReservationRequestId(crypto.randomUUID());
                  }}
                >
                  {horaCorta(bloque.inicio)}
                </button>
              ))}
            </div>
            {!loading && bloques.length === 0 && (
              <p className="empty">No quedan horarios disponibles para este día.</p>
            )}
            <div className="confirm-bar">
              <div>
                <small>Tu selección</small>
                <strong>
                  {selectedBlock
                    ? `${fechaLarga(fecha)}, ${horaCorta(selectedBlock.inicio)}`
                    : 'Selecciona un horario'}
                </strong>
              </div>
              <button className="button" disabled={!selectedBlock || loading} onClick={confirmar}>
                {loading ? 'Confirmando…' : 'Confirmar cita'}
              </button>
            </div>
          </section>
        )}

        {step === 'exito' && (
          <section className="success panel">
            <div className="success-icon">✓</div>
            <span className="eyebrow">Reserva completada</span>
            <h1>¡Tu cita quedó confirmada!</h1>
            <p>
              Tu cita con {selectedSponsor?.empresa} es el{' '}
              {selectedBlock && fechaLarga(selectedBlock.inicio.slice(0, 10))} a las{' '}
              {selectedBlock && horaCorta(selectedBlock.inicio)}
              {identidad?.asistente?.ticketTipo === 'Virtual'
                ? ', por Google Meet. '
                : `, en la ${resultado?.mesa || 'mesa por confirmar'}. `}
              {resultado?.notificacion_error
                ? 'No pudimos enviar el correo con los detalles. '
                : 'También recibirás los detalles por correo. '}
              {identidad?.asistente?.ticketTipo === 'Virtual' &&
                'Recibirás la liga aproximadamente 15 minutos antes por WhatsApp y también una invitación de Google en tu correo. '}
              Guarda estos datos. Para modificar, cancelar o preguntar por
              esta cita, escríbenos por WhatsApp al{' '}
              <a href={`https://wa.me/${String(resultado?.whatsappSoporte || '').replace(/\D/g, '')}`}>
                {resultado?.whatsappSoporte}
              </a>.
            </p>
            <div className="ticket">
              <span>{selectedSponsor?.empresa}</span>
              <strong>{selectedBlock && horaCorta(selectedBlock.inicio)}</strong>
              <small>{selectedBlock && fechaLarga(selectedBlock.inicio.slice(0, 10))}</small>
              <em>
                {identidad?.asistente?.ticketTipo === 'Virtual'
                  ? 'Google Meet'
                  : resultado?.mesa || 'Mesa por confirmar'}
              </em>
            </div>
            <div className="success-actions">
              <button
                className="button"
                disabled={loading}
                onClick={() => cargarSponsors(email)}
              >
                {loading ? 'Cargando…' : 'Agendar con otro sponsor'}
              </button>
            </div>
          </section>
        )}
      </main>
      <footer>
        <span>Fashion Digital Talks 2026</span>
        <a href="https://www.fashiondigitaltalks.com/" target="_blank" rel="noreferrer">
          Sitio oficial ↗
        </a>
      </footer>
    </div>
  );
}
