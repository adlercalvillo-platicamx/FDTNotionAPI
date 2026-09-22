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

## Pendientes

Ninguno de esta revalidación.
