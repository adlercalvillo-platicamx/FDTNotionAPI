# Bitácora 23-ago — Pool de variantes C1/C2

Handoff corto. Código gana si esto contradice algo. Fecha: 23-ago-2026. **Sin commit.** Reemplaza la tabla de `bitacora-23ago-reactivaciones-tope.md` (esa bitácora sigue válida para el campo `Reactivaciones Enviadas` y el tope de 2).

## Por qué

Mandar la misma C dos veces se siente a bot. Además, B no es un “reintento”: solo informa “tienes más opciones” **mientras hay cita confirmada viva**. Si se pierde la cita (o nunca hubo), entra al **mismo** camino de reactivación que quien no contestó A.

## Tabla que quedó

| Estado | Resultado |
|---|---|
| Cita confirmada / confirmada sin notificar **ahora** | **B**. No toca el contador. Gana aunque el tope esté en 2. |
| Sin confirmada, nunca recibió campaña | **A**. Contador 0. |
| Sin confirmada, última = A, ventana no cumplida | Nada. `VENTANA_REACTIVACION_NO_CUMPLIDA`. |
| Sin confirmada, última = A, ventana cumplida | **C1**. Contador 0→1. |
| Sin confirmada, última = B perdida / C legado / C1 / C2, contador &lt; 2, ventana no cumplida | Nada. Misma ventana. |
| Sin confirmada, última = B perdida / C legado / C1 / C2, contador &lt; 2, ventana cumplida | Siguiente variante del pool. Contador +1. |
| Sin confirmada, contador = 2 | Nada, siempre. `TOPE_REACTIVACIONES_ALCANZADO`. |

Rotación (contador **antes** de incrementar): 0 → `C1 - Reactivación`; 1 → `C2 - Reactivación`. No hace falta guardar “cuál variante” para decidir la siguiente; el número basta. Igual se escribe la opción exacta en `Última Campaña Enviada` para que Laura/Liz la vean.

Ventana: igual que antes (`fechaAnterior < ahora - 14d`). A los 14 días exactos **no** dispara.

`COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO` **ya no se usa**. B sin confirmada cae al pool.

## Código

`src/services/campanas-matchmaking.service.js`:

- `REACTIVACION_1` / `REACTIVACION_2` / `VARIANTES_REACTIVACION`
- `CAMPANA_C_LEGACY = 'C - Reactivación'` solo para filas viejas; no se envía
- `varianteReactivacionPara(n)` / `esVarianteReactivacion(campana)`
- `evaluarVentanaReactivacion` ahora devuelve `{ listo, motivo }`, no una campaña
- `persistirEnvioCampana` incrementa el contador si la campaña es **cualquier** variante del pool
- Resumen: `enviadosC1` / `enviadosC2` (y simulados / marcadosSinEnviar)

Env: `PLATICA_TEMPLATE_MATCHMAKING_C1` / `_C2`. Simulación: `PENDIENTE_PLANTILLA_C1` / `_C2`.

## Notion (solo pruebas Adler)

Data source Contactos (nueva) `9f335308-da0e-4672-9744-c1dabcfb22aa`. Select `Última Campaña Enviada` ahora: A, B, **C legado**, C1, C2 (se listaron todas para no vaciar valores). Conteo **antes y después: 87 filas**, todas sin última campaña. **No** se tocó Laura.

## Tests

`node tests/campanas-matchmaking.manual-test.js` — B perdida → C1; contador 0 → C1; 1 → C2; tope; confirmada gana B; vacío = 0.

## Pendiente Sam (bloquea envío real)

Copy y nombres Meta de C1 y C2. Simulación no los necesita. El array admite una tercera variante sin rediseño (subir también `REACTIVACIONES_MAXIMAS` si el tope cambia).

## Qué no hacer

No tratar B como reintento. No incrementar el contador en A ni B. No aplicar el select en producción Laura sin que Adler lo pida.
