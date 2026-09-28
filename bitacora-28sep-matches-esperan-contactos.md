# Bitácora 28sep — los matches esperan a que no queden contactos
Handoff. Código gana si esto contradice algo.
28 sep 2026. Sin commit. Continúa [bitacora-23sep-enriquecimiento-match-ideal.md](bitacora-23sep-enriquecimiento-match-ideal.md).

## Pedido y decisión
Luis: un match no debe enriquecerse si el asistente todavía no tiene perfil, porque el subagente lo evalúa sin información. Decisión: el poller de `middleware-enriquecimiento/` no manda matches mientras exista un contacto pendiente del mismo filtro de siempre (`Webhook enviado = false`, sin Prensa ni Comite/Team).

## Qué cambió y por qué
`process_matches_once` consulta la cola de contactos antes de reclamar filas de Citas. Si queda aunque sea uno, el ciclo registra la espera y no llama a Plática ni escribe `Estado Enriquecimiento Match`. El lote de contactos del mismo ciclo no abre la puerta: si después de marcarlo todavía sobran, los matches siguen esperando al siguiente ciclo.

No hay variable nueva. `MATCHES_HABILITADO=false` sigue siendo el default. Apagar contactos no salta la espera: si hay pendientes, los matches no corren.

## Cómo operarlo
Misma Application. No hace falta cambiar env en Coolify para que la espera aplique: entra con el próximo deploy del middleware. Mientras haya contactos con el checkbox en falso, los matches no se mueven aunque `MATCHES_HABILITADO=true`.

## Evidencia
`python -m unittest discover -s middleware-enriquecimiento -p "test_*.py"`: 13 pruebas, OK.

## Pendiente
Ninguno de esta regla. Sigue pendiente, de la bitácora del 23-sep, nombrar la fila de prueba y revisar el backfill antes de encender matches en producción.
