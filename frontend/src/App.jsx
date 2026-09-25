import { useMemo, useState } from 'react';
import {
  ApiError,
  cancelarCita,
  cerrarSesion,
  consultarDisponibilidad,
  identificar,
  listarSponsors,
  modificarCita,
  reservar,
} from './api';

const FECHAS = String(
  import.meta.env.VITE_EVENT_DATES || '2026-10-07,2026-10-08'
)
  .split(',')
  .map((fecha) => fecha.trim())
  .filter(Boolean);

function fechasDeSponsor(sponsor) {
  const listadas = Array.isArray(sponsor?.fechasPermitidas)
    ? sponsor.fechasPermitidas.map((fecha) => String(fecha).trim()).filter(Boolean)
    : [];
  const filtradas = listadas.filter((fecha) => FECHAS.includes(fecha));
  return filtradas.length ? filtradas : FECHAS;
}

const COPY_ERROR = {
  EMAIL_NO_ENCONTRADO:
    'No encontramos este correo entre los asistentes registrados. Intenta con el mismo correo que utilizaste en tu registro. Si necesitas ayuda, acércate con el equipo de Fashion Digital Talks.',
  BOLETO_EXPO_NO_PERMITE_CITAS:
    'Tu boleto Expo incluye acceso al piso de exhibición, pero no incluye citas 1 a 1. Si tienes dudas, acércate con el equipo de Fashion Digital Talks.',
  CITA_YA_OCURRIO:
    'Esta cita ya ocurrió y tiene el check-in marcado, así que no se puede mover. Si hace falta, agenda una cita nueva.',
  FECHA_NO_PERMITIDA_PARA_SPONSOR:
    'Este sponsor no recibe citas ese día. Elige una de las fechas que aparecen arriba.',
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

function citaYaOcurrio(cita) {
  if (!cita?.checkInRealizado || !cita.fechaHora) return false;
  return Date.parse(cita.fechaHora) < Date.now();
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

function Steps({ step, requierePersona = false }) {
  const labels = requierePersona
    ? ['Identifícate', 'Elige persona', 'Elige sponsor', 'Selecciona horario', 'Confirma']
    : ['Identifícate', 'Elige sponsor', 'Selecciona horario', 'Confirma'];
  const active = (
    requierePersona
      ? { email: 0, persona: 1, sponsors: 2, horarios: 3, exito: 4 }
      : { email: 0, sponsors: 1, horarios: 2, exito: 3 }
  )[step] ?? 0;
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

function PersonSelection({ personas, loading, onSelect }) {
  return (
    <section className="content-section person-selection">
      <span className="eyebrow">Correo compartido</span>
      <h1>¿Para quién quieres gestionar las citas?</h1>
      <p>
        Encontramos más de una persona registrada con este correo. Elige el
        registro correcto para continuar.
      </p>
      <div className="person-grid">
        {personas.map((persona) => (
          <article className="person-card" key={persona.id}>
            <div>
              <h2>{persona.nombre}</h2>
              {persona.empresa && <p>{persona.empresa}</p>}
              {persona.ticketTipo && <small>{persona.ticketTipo}</small>}
            </div>
            <button
              type="button"
              className="button button-small"
              disabled={loading}
              onClick={() => onSelect(persona)}
            >
              Continuar con {persona.nombre.split(/\s+/)[0]}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExistingAppointments({
  citas,
  virtual = false,
  onModificar,
  onCancelar,
}) {
  if (!citas?.length) return null;
  return (
    <aside className="existing">
      <span className="eyebrow">Tus citas confirmadas</span>
      {citas.map((cita) => {
        const noMover = citaYaOcurrio(cita);
        return (
          <div className="existing-row" key={cita.citaId}>
            <div className="existing-copy">
              <strong>{cita.sponsorNombre}</strong>
              <span>
                {cita.fechaHora && fechaLarga(cita.fechaHora.slice(0, 10))} ·{' '}
                {horaCorta(cita.fechaHora)} ·{' '}
                {virtual ? 'Google Meet' : cita.mesa || 'Mesa por asignar'}
              </span>
            </div>
            <div className="existing-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={noMover}
                title={noMover ? COPY_ERROR.CITA_YA_OCURRIO : undefined}
                onClick={() => onModificar(cita)}
              >
                Modificar horario
              </button>
              <button
                type="button"
                className="ghost-button ghost-danger"
                onClick={() => onCancelar(cita)}
              >
                Cancelar
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function CancelledAppointments({ citas, virtual = false, onReagendar }) {
  if (!citas?.length) return null;
  return (
    <aside className="existing cancelled">
      <span className="eyebrow">Citas canceladas</span>
      {citas.map((cita) => (
        <div className="existing-row" key={cita.citaId}>
          <div className="existing-copy">
            <strong>{cita.sponsorNombre}</strong>
            <span>
              La cita con {cita.sponsorNombre} quedó cancelada; se puede volver a
              agendar
              {cita.fechaHora
                ? ` · era el ${fechaLarga(cita.fechaHora.slice(0, 10))} a las ${horaCorta(cita.fechaHora)}`
                : ''}
              {virtual ? ' · Google Meet' : ''}.
            </span>
          </div>
          <div className="existing-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onReagendar(cita)}
            >
              Reagendar
            </button>
          </div>
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
  const [personas, setPersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');
  const [identidad, setIdentidad] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const [fecha, setFecha] = useState(FECHAS[0]);
  const [bloques, setBloques] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [reservationRequestId, setReservationRequestId] = useState('');
  const [modoHorario, setModoHorario] = useState('reservar');
  const [citaEnEdicion, setCitaEnEdicion] = useState(null);
  const [citaACancelar, setCitaACancelar] = useState(null);
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

  function sponsorDesdeCita(cita) {
    return (
      sponsors.find((item) => item.id === cita.sponsor_notion_id) || {
        id: cita.sponsor_notion_id,
        empresa: cita.sponsorNombre,
      }
    );
  }

  async function cargarSponsors(correo, contactoId) {
    setLoading(true);
    setError('');
    try {
      const persona = await identificar(correo, contactoId);
      const catalogo = await listarSponsors();
      setIdentidad(persona);
      setSponsors(catalogo.sponsors || []);
      setSelectedPersonaId(contactoId || '');
      setSelectedSponsor(null);
      setSelectedBlock(null);
      setReservationRequestId('');
      setCitaEnEdicion(null);
      setCitaACancelar(null);
      setModoHorario('reservar');
      setResultado(null);
      setStep('sponsors');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_AMBIGUO') {
        cerrarSesion();
        setPersonas(Array.isArray(err.data?.personas) ? err.data.personas : []);
        setSelectedPersonaId('');
        setIdentidad(null);
        setSponsors([]);
        setStep('persona');
        return;
      }
      setError(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(event) {
    event.preventDefault();
    cerrarSesion();
    setPersonas([]);
    setSelectedPersonaId('');
    await cargarSponsors(email);
  }

  async function cargarHorarios(sponsor, nuevaFecha = fecha, { modo = 'reservar', cita = null } = {}) {
    setLoading(true);
    setError('');
    setSelectedSponsor(sponsor);
    setSelectedBlock(null);
    setReservationRequestId('');
    setModoHorario(modo);
    setCitaEnEdicion(modo === 'modificar' ? cita : null);
    try {
      const data = await consultarDisponibilidad(
        sponsor.id,
        nuevaFecha,
        modo === 'modificar' ? cita?.citaId : undefined
      );
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
      const data =
        modoHorario === 'modificar' && citaEnEdicion
          ? await modificarCita({
              citaId: citaEnEdicion.citaId,
              inicio: selectedBlock.inicio,
            })
          : await reservar({
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
        await cargarHorarios(selectedSponsor, fecha, {
          modo: modoHorario,
          cita: citaEnEdicion,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function confirmarCancelacion() {
    if (!citaACancelar) return;
    setLoading(true);
    setError('');
    try {
      await cancelarCita(citaACancelar.citaId);
      setCitaACancelar(null);
      await cargarSponsors(email, selectedPersonaId);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  function reiniciar() {
    cerrarSesion();
    setStep('email');
    setEmail('');
    setPersonas([]);
    setSelectedPersonaId('');
    setIdentidad(null);
    setSponsors([]);
    setSelectedSponsor(null);
    setSelectedBlock(null);
    setReservationRequestId('');
    setCitaEnEdicion(null);
    setCitaACancelar(null);
    setModoHorario('reservar');
    setError('');
    setResultado(null);
  }

  const virtual = identidad?.asistente?.ticketTipo === 'Virtual';
  const confirmandoModificacion = modoHorario === 'modificar';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        {(identidad || step === 'persona') && (
          <button className="text-button" onClick={reiniciar}>
            Cambiar correo
          </button>
        )}
      </header>

      <main>
        <Steps step={step} requierePersona={personas.length > 1} />
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

        {step === 'persona' && (
          <PersonSelection
            personas={personas}
            loading={loading}
            onSelect={(persona) => cargarSponsors(email, persona.id)}
          />
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
              virtual={virtual}
              onModificar={(cita) => {
                const sponsor = sponsorDesdeCita(cita);
                return cargarHorarios(sponsor, fechasDeSponsor(sponsor)[0], {
                  modo: 'modificar',
                  cita,
                });
              }}
              onCancelar={setCitaACancelar}
            />
            <CancelledAppointments
              citas={identidad?.citasCanceladasReagendables}
              virtual={virtual}
              onReagendar={(cita) => {
                const sponsor = sponsorDesdeCita(cita);
                return cargarHorarios(sponsor, fechasDeSponsor(sponsor)[0], { modo: 'reservar' });
              }}
            />
            <div className="sponsor-grid">
              {filtrados.map((sponsor) => (
                <SponsorCard
                  key={sponsor.id}
                  sponsor={sponsor}
                  onSelect={(item) => cargarHorarios(item, fechasDeSponsor(item)[0], { modo: 'reservar' })}
                />
              ))}
            </div>
          </section>
        )}

        {step === 'horarios' && selectedSponsor && (
          <section className="content-section schedule">
            <button className="back" onClick={() => setStep('sponsors')}>← Sponsors</button>
            <span className="eyebrow">
              {confirmandoModificacion
                ? `Cambiar horario con ${selectedSponsor.empresa}`
                : `Cita con ${selectedSponsor.empresa}`}
            </span>
            <h1>
              {confirmandoModificacion
                ? 'Elige el nuevo horario.'
                : 'Elige el mejor momento para ti.'}
            </h1>
            <ModalityNotice
              ticketTipo={identidad?.asistente?.ticketTipo}
              compact
            />
            <div className="date-tabs" role="tablist">
              {fechasDeSponsor(selectedSponsor).map((item) => (
                <button
                  key={item}
                  className={item === fecha ? 'active' : ''}
                  onClick={() =>
                    cargarHorarios(selectedSponsor, item, {
                      modo: modoHorario,
                      cita: citaEnEdicion,
                    })
                  }
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
                {loading
                  ? confirmandoModificacion
                    ? 'Guardando…'
                    : 'Confirmando…'
                  : confirmandoModificacion
                    ? 'Guardar horario'
                    : 'Confirmar cita'}
              </button>
            </div>
          </section>
        )}

        {step === 'exito' && (
          <section className="success panel">
            <div className="success-icon">✓</div>
            <span className="eyebrow">
              {confirmandoModificacion ? 'Horario actualizado' : 'Reserva completada'}
            </span>
            <h1>
              {confirmandoModificacion
                ? 'El horario de tu cita quedó actualizado.'
                : '¡Tu cita quedó confirmada!'}
            </h1>
            <p>
              Tu cita con {selectedSponsor?.empresa} es el{' '}
              {selectedBlock && fechaLarga(selectedBlock.inicio.slice(0, 10))} a las{' '}
              {selectedBlock && horaCorta(selectedBlock.inicio)}
              {virtual
                ? ', por Google Meet. '
                : `, en la ${resultado?.mesa || 'mesa por confirmar'}. `}
              {resultado?.notificacion_error
                ? 'No pudimos enviar el correo con los detalles. '
                : 'También recibirás los detalles por correo. '}
              {virtual &&
                'Recibirás la liga aproximadamente 15 minutos antes por WhatsApp y también una invitación de Google en tu correo. '}
              Desde esta página puedes modificar o cancelar la cita. Si necesitas
              ayuda, escríbenos por WhatsApp al{' '}
              <a href={`https://wa.me/${String(resultado?.whatsappSoporte || '').replace(/\D/g, '')}`}>
                {resultado?.whatsappSoporte}
              </a>.
            </p>
            <div className="ticket">
              <span>{selectedSponsor?.empresa}</span>
              <strong>{selectedBlock && horaCorta(selectedBlock.inicio)}</strong>
              <small>{selectedBlock && fechaLarga(selectedBlock.inicio.slice(0, 10))}</small>
              <em>{virtual ? 'Google Meet' : resultado?.mesa || 'Mesa por confirmar'}</em>
            </div>
            <div className="success-actions">
              <button
                className="button"
                disabled={loading}
                onClick={() => cargarSponsors(email, selectedPersonaId)}
              >
                {loading ? 'Cargando…' : 'Volver a tus citas'}
              </button>
            </div>
          </section>
        )}
      </main>

      {citaACancelar && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCitaACancelar(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">Cancelar cita</span>
            <h2 id="cancel-title">¿Confirmas que la cancele?</h2>
            <p>
              Se cancelará la cita con {citaACancelar.sponsorNombre}
              {citaACancelar.fechaHora
                ? ` del ${fechaLarga(citaACancelar.fechaHora.slice(0, 10))} a las ${horaCorta(citaACancelar.fechaHora)}`
                : ''}
              . Después podrás reagendarla si lo necesitas.
            </p>
            <div className="modal-actions">
              <button type="button" className="text-button" onClick={() => setCitaACancelar(null)}>
                No, mantenerla
              </button>
              <button
                type="button"
                className="button"
                disabled={loading}
                onClick={confirmarCancelacion}
              >
                {loading ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <span>Fashion Digital Talks 2026</span>
        <a href="https://www.fashiondigitaltalks.com/" target="_blank" rel="noreferrer">
          Sitio oficial ↗
        </a>
      </footer>
    </div>
  );
}
