# Bitácora 23sep — enriquecimiento cualitativo Match Ideal Sponsor

Handoff. Código gana si esto contradice algo. Trabajo del 23 de septiembre de
2026, sin commit. Continúa
[`bitacora-27ago-exa-icp-estado-web.md`](bitacora-27ago-exa-icp-estado-web.md).

## Pedido y decisión

Adler aprobó agregar una evaluación cualitativa por cada par sponsor–asistente
sin tocar el matchmaking que ya funciona. Se implementó como proceso posterior
y separado: no cambia `/matchmaking/sugerir-todos`, score, `Notas` ni
`Estatus`.

## Qué cambió

- En la data source Citas de Laura (`3b162dda-199a-8053-8098-000b00916893`)
  se crearon:
  - `Match Ideal Sponsor`: select `Sí` / `No` / `Ambiguo`.
  - `Explicación Match Ideal`: rich text.
  - `Estado Enriquecimiento Match`: `En curso` / `Completado` / `Falló`.
  - `Intentos Enriquecimiento Match`: número.
  - `Fecha Enriquecimiento Match`: fecha.
- `middleware-enriquecimiento/` quedó dentro del repo como Application Python
  separada. Conserva el polling de Contactos y añade el de Citas.
- El middleware toma filas con `Contacto Match` y `Contacto Principal`, excluye
  el contacto de bloqueo, reclama la fila antes de llamar Plática, incrementa
  intentos y permite retomar un `En curso` vencido.
- El subagente Plática `vhmqfLCnNLKsBDh2HEd2` quedó en prompt v15, activo
  `b94jmiyXwaaiRlquPtRJ`, con ramas explícitas CONTACTO/MATCH y escritura
  limitada a los cinco campos anteriores para MATCH.
- Se redujeron sus herramientas de 23 activas a 6: leer/query/update de Notion
  y search/advanced/fetch de Exa. Herramientas de crear, mover, duplicar,
  comentar y cambiar esquema quedaron inactivas.
- Snapshot completo:
  [`prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Subagente Enriquecimiento ICP (Exa).md`](prompts-agentes-platica/Prompt%20y%20detalles%20-%20Citas%201-1%20-%20Subagente%20Enriquecimiento%20ICP%20(Exa).md).

## Operación

Usar la Application de enriquecimiento de Contactos que ya existe, apuntándola
a este repo con Base Directory `/middleware-enriquecimiento`, Build Pack
Nixpacks y Start Command `python notion_platica_middleware.py`. No crear
Docker, cron HTTP ni otro recurso. El código acepta las env legacy del poller
de Contactos para que el cambio de repo no detenga ese flujo. Variables nuevas
documentadas en `.env.example`.

Default seguro:

```text
MATCHES_HABILITADO=false
MATCH_BACKFILL_GUARD_MAX=15
SKIP_MATCH_BACKFILL_GUARD=false
MATCH_STALE_MINUTES=60
MATCH_MAX_ATTEMPTS=3
```

No encender matches hasta:

1. nombrar la fila exacta de Citas que recibirá la prueba;
2. confirmar sus dos contactos relacionados;
3. revisar cuántas filas históricas están pendientes;
4. decidir el lote de backfill.

Un 2xx de `/v1/chat` deja la fila `En curso`: el subagente debe terminarla en
`Completado`. Un rechazo de Plática deja `Falló`. `Ambiguo` es un resultado de
negocio terminal y queda `Completado`.

## Evidencia

- Esquema de Citas releído después del cambio: las cinco propiedades existen
  con tipos y opciones correctos.
- Prompt activo v15 verificado completo; 20 versiones totales.
- Herramientas verificadas: 43 conectadas, solo 6 activas.
- `python -m unittest discover -s middleware-enriquecimiento -p "test_*.py"`:
  11 pruebas, OK, incluidas compatibilidad de env legacy y matches apagados.
- `python -m py_compile` del middleware y sus pruebas: OK.
- Prueba real única en Citas
  `3e562dda-199a-8152-b31b-f5b7e6b03eae`: HABER HOLDING × Global Vía
  Pública, `Estatus=Sugerido`.
- Plática aceptó una tarea (`request message`
  `apiChatMessage_a7fcc45f-ecc6-4bdc-9118-ff4e257ee74c`) y el subagente la
  terminó en `Completado`, intento 1, sin llamadas a Exa.
- Resultado escrito: `Match Ideal Sponsor=Sí`. La explicación fundamenta el
  encaje en moda/ecommerce, omnichannel, marketing y publicidad exterior.
- Verificación posterior: `Estatus=Sugerido`, `Score=345` y `Notas` quedaron
  intactos. No hubo WhatsApp ni correo al asistente o sponsor.

## Pendientes

- Cambiar la fuente de la Application existente al repo de Adler y añadir las
  env nuevas con `MATCHES_HABILITADO=false` antes del primer redeploy.
- Revisar backfill antes de cambiar `MATCHES_HABILITADO`.
- Rotar el token de integración de Notion y la `X-API-Key` que fueron
  compartidos en texto durante la configuración. No se documentan aquí.
