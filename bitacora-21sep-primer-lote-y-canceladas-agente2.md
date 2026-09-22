# Bitácora 21sep — el "hola" que solo ofreció CaaS
Handoff. Código gana si esto contradice algo.
Trabajo del 21-sep (madrugada del 22 UTC). Backend en `24808b2`; corrección
de evidencia en `17ff497`. Continúa
[bitacora-21sep-retro-eduardo-agente2.md].

## Pedido

Adler le escribió “Hola” al Agente 2 por WhatsApp y el agente le soltó CaaS
sola, sin explicar qué era. Decisión de Adler: completar el primer lote hasta
4 desde el backend y nombrar explícitamente la cita cancelada.

## Qué pasaba

El agente no improvisó: la tool le mandó **un solo** ítem en
`sugeridas_para_ofrecer` y con el nombre equivocado.

| Dato | Antes | Ahora |
|---|---|---|
| `sugeridas_para_ofrecer` | CaaS (1) | CaaS, Reevolution, Blip, Tiendanube (4) |
| `sponsor_nombre` de la cancelada | `"CaaS"` | `"Magali Parra"` |
| `opciones_adicionales_para_ofrecer` | Reevolution, Blip, Tiendanube, Pikstudio | Pikstudio, Leadin, Reversso, Flow |

Dos causas, las dos en `citas.service.js`:

1. Las canceladas reagendables pasan por `formatearCitaConfirmadaAsistente`,
   que mete la **empresa** en `sponsorNombre`. `enriquecerOpcionOfrecida`
   copiaba ese valor tal cual aunque el `sponsorMap` sí tenía a la persona
   (de ahí ya sacaba las soluciones). El prompt pide “con [Nombre]” y el
   agente no tenía nombre que poner.
2. El primer grupo era solo cancelada + Aprobado. Con una cancelada y cero
   Aprobado, el lote de “hasta 4” salía de 1 y las cuatro sugeridas se
   quedaban esperando a que el contacto pidiera “más opciones”.

## Qué cambió

**Backend** (`src/services/citas.service.js`):

- `enriquecerOpcionOfrecida` resuelve `sponsor_nombre` / `sponsor_empresa`
  contra el `sponsorMap` antes de devolver la opción.
- Si cancelada + Aprobado no llenan `LIMITE_SUGERIDAS_PARA_OFRECER`, se
  promueven las primeras `opciones_adicionales` al lote y **salen** de
  `opciones_adicionales`, para que la pasada no las repita. `hay_mas_opciones`
  y `opciones_adicionales_para_ofrecer` se calculan sobre el resto.
- `motivo_sin_opciones` sigue mirando la lista completa de adicionales: sin la
  promoción contaría 0 y diría “opciones agotadas” con opciones en mano.

**Prompt del Agente 2** (`c1IYnFsr0Jzfqq4NeLAs`; tras la revalidación,
activo `Tzj02oyPHGAmhQGyW7C9`, 22 sep 05:21 UTC):

- Si la lista trae 4, van las 4 en ese mensaje.
- Una cancelada reagendable se nombra antes de la lista y con la persona:
  “Tu reunión con Magali Parra, de *CaaS*, quedó cancelada; la podemos
  reagendar cuando quieras.”
- `consultar_sugeridas_para_asistente` se vuelve a llamar en cada intención
  nueva; prohibido repetir de memoria algo que dependa de `fase_evento` o del
  estado de las citas.

Snapshot en `prompts-agentes-platica/` actualizado.

## Lo de “la edición ya terminó”

En el hilo `NIQn7zt9U7Pc1s2OljS1` el agente contestó dos veces que la edición
ya había terminado: la primera con `fase_evento=despues` (Adler estaba
probando `CITAS_FASE_EVENTO_SIMULADA`) y la segunda, a las 04:42 UTC, **sin
llamar ninguna tool**, arrastrando la conclusión vieja del mismo hilo. La
variable ya no está en Coolify y archivar la conversación destrabó al agente.
No se cambió nada de infraestructura; solo el guardrail del prompt.

## Cómo operarlo

Redeploy de Coolify hecho por Adler después de subir `24808b2`.

## Evidencia

- Tool con el WhatsApp de Adler (`524492867741`), después del arreglo:
  `sugeridas_para_ofrecer` = CaaS / Magali Parra (cancelada, reagendar),
  Reevolution / Alexandro Huerta, Blip / Zuleyma Chávez, Tiendanube / Ana
  Olhovich. `hay_mas_opciones: true`.
- `tests/*.manual-test.js` completos: 0 fallas.
- Dos tests traían expectativas viejas y se actualizaron:
  `sugeridas-empresas` (la adicional ahora sube al lote) y
  `sugerencias-asistente` + `sugeridas-empresas` (`horario_legible` en
  `citasConfirmadas`, que entró en `e80214c` y nunca se reflejó en el test;
  ya fallaban **antes** de este cambio).

## Revalidación real post-redeploy (22-sep, 05:10–05:24 UTC)

No se dio por bueno el primer resultado. Se abrieron conversaciones nuevas
con el Agente 2 y se corrigió cada desviación encontrada:

1. Primer “Hola”: duplicó CaaS (cancelada + número 1).
2. Segundo “Hola”: dejó de duplicarla, pero ofreció 5 posibilidades totales.
3. Tercer “Hola”: aprobado. Cancelada CaaS/Magali una sola vez + Reevolution,
   Blip y Tiendanube; pregunta concreta.
4. Folio: la primera repetición pidió “empresa a la que te interesa
   contactar”, ambiguo e incorrecto. Corregido y repetido en chat limpio:
   pidió nombre, correo de compra y “empresa con la que te registraste o donde
   trabajas”, aclarando que no es el sponsor. Solo después de los tres datos
   escaló. Cliente sintético eliminado al terminar.
5. Orden backend, caso que antes no se había probado: Reevolution con
   `hora=11:30` devolvió desde la tool `10:30`, `11:30`, `jueves 11:30`. El
   agente conservó el orden. Esto sí prueba el sort desplegado.
6. Duración: “20 minutos”; calendario 30 = 20 + 10 de margen.
7. Reserva controlada CaaS: confirmó miércoles 7 10:30, Mesa 1, Club France,
   zona y pasillo.
8. Modificación controlada: confirmó miércoles 7 14:00, Mesa 1, Club France,
   zona y pasillo.
9. Primera cancelación: **falló** el guardrail; ejecutó la tool sin pedir
   confirmación. Se endureció a dos turnos y se repitió desde una conversación
   nueva. Resultado final aprobado: “Cancela…” solo repitió empresa, fecha,
   hora y mesa y preguntó “¿Confirmas que la cancele?”; únicamente después de
   “Sí” ejecutó la cancelación.

Destinatarios reales de las pruebas de reserva/mover/cancelar, nombrados antes
de disparar: Adler `adlerero666@gmail.com` y Magali/CaaS de prueba
`adler.calvillo@platica.mx`. Ningún correo externo.

Estado final: Adler con 0 citas activas; CaaS sigue como cancelada reagendable.
`fase_evento=antes`. Toda la batería `tests/*.manual-test.js`: 0 fallas.

## Prueba por WhatsApp real y la casilla de Día 2 (22-sep, 05:31–05:33 UTC)

Lo anterior se había probado por el canal de chat de la API, no por WhatsApp.
Adler repitió el saludo y los horarios desde su teléfono en el canal
`wb-1167456423128610`. Antes se cerró el hilo `OuigYiPKdwhNojLUUwnt`, que
seguía `active` con el saludo viejo, para no probar una continuación.

Saludo: correcto. Cancelada de Magali Parra / CaaS en un renglón aparte y
tres empresas numeradas; cuatro opciones en total.

**Bug encontrado por Adler.** Con `hora=11:30` la tool devolvió `10:30`,
`11:30` y `14:00`, todas del miércoles 7: el jueves nunca apareció en el
primer ofrecimiento. No era azar. La hora pedida se **sumaba** a las tres
casillas y el lote quedaba `[11:30, D1 Mañana, D1 Tarde, D2]`; el corte a 3
tiraba siempre el último, que es la casilla de Día 2. O sea: pedir una hora
concreta borraba el segundo día. Sin pedir hora, el Día 2 sí salía.

Arreglo en `seleccionarHorariosParaOferta`: la hora pedida ocupa la casilla
que le corresponde por día y periodo en lugar de agregarse encima. La misma
consulta ahora devuelve `11:30`, `14:00` y jueves `09:00`. Se pierde el 10:30
y se gana el segundo día. Decisión de Adler, 22-sep.

Caso nuevo en `tests/horarios-oferta.manual-test.js`
(`casoPedidoDeHoraNoBorraElDia2`), que fija el triple exacto y cubre también
una hora pedida que cae en el Día 2. `casoPedidoDeLas15h…` sigue pasando sin
tocarlo. Suite completa: 0 fallas (`asignacion-mesa.notion-smoke.js` aborta
por falta de `NOTION_API_KEY`, como siempre fuera de Coolify).

Verificado contra Notion de producción: Reevolution tiene el 7 libre desde
las 10:30 (hora de inicio configurada del día, no ocupación) y el 8 desde las
9:00, con solo las 15:30 ocupadas. Los datos que dio el agente eran correctos,
solo incompletos.

**Guarda de ids funcionando.** En la primera llamada el agente armó un
`sponsorPageId` inválido pegando el prefijo de sponsors con la cola del id de
Adler — la misma falla del 2-sep. `requireSponsorExistente` respondió
`SPONSOR_NO_ENCONTRADO`, el agente reconsultó sugeridas y se corrigió en el
mismo turno, sin efecto visible. Adler decidió no endurecer el prompt: la
guarda basta.

## Pendientes

- **Requiere redeploy**: el arreglo de la casilla de Día 2 es backend.
- No se revisó el contenido real de los correos ni del `.ics` en esta ronda;
  solo se verificó que los destinatarios estén en la allowlist.
- El caso de Eduardo donde la mesa cambia de número al mover no se reprodujo:
  en las pruebas la mesa se quedó en 1 las dos veces.
