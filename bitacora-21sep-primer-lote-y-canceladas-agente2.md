# Bitácora 21sep — el "hola" que solo ofreció CaaS
Handoff. Código gana si esto contradice algo.
Trabajo del 21-sep (madrugada del 22 UTC). Sin commit al cerrar: cambios en árbol de trabajo. Continúa [bitacora-21sep-retro-eduardo-agente2.md].

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

**Prompt del Agente 2** (`c1IYnFsr0Jzfqq4NeLAs`, activo
`8PwHCaweJS4enS9l3KCX`, 22 sep 04:57 UTC, tres ediciones exactas sobre
`knaysLsydl5vrN8Q1R9R`):

- Si la lista trae 4, van las 4 en ese mensaje.
- Una cancelada reagendable se nombra antes de la lista y con la persona:
  “Tu reunión con Magali Parra, de *CaaS*, quedó cancelada; la podemos
  reagendar cuando quieras.”
- `consultar_sugeridas_para_asistente` se vuelve a llamar en cada intención
  nueva; prohibido repetir de memoria algo que dependa de `fase_evento` o del
  estado de las citas.

Snapshot en `prompts-agentes-platica/` actualizado y verificado idéntico al
prompt vivo.

## Lo de “la edición ya terminó”

En el hilo `NIQn7zt9U7Pc1s2OljS1` el agente contestó dos veces que la edición
ya había terminado: la primera con `fase_evento=despues` (Adler estaba
probando `CITAS_FASE_EVENTO_SIMULADA`) y la segunda, a las 04:42 UTC, **sin
llamar ninguna tool**, arrastrando la conclusión vieja del mismo hilo. La
variable ya no está en Coolify y archivar la conversación destrabó al agente.
No se cambió nada de infraestructura; solo el guardrail del prompt.

## Cómo operarlo

Requiere **redeploy** de Coolify: los dos arreglos son de backend. Sin
redeploy, el prompt nuevo seguirá recibiendo un solo ítem en el lote.

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

## Pendientes

- Redeploy y volver a escribir “Hola” desde el WhatsApp de Adler para ver el
  lote de 4 y la frase de la cancelada en vivo.
- La cita cancelada de CaaS sigue abierta como reagendable; si estorba en las
  pruebas, reagendarla o dejarla consumida.
