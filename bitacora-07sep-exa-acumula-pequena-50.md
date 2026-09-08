# Bitácora 07sep — Exa suma con tamaño declarado; Pequeña a 50
Handoff. Código gana si esto contradice algo.
7-sep-2026 noche. Continúa [bitacora-07sep-verificar-corrida-soluciones.md](bitacora-07sep-verificar-corrida-soluciones.md). Sin deploy.

## Pedido

Adler: Consolidado/PyME de Exa deben sumar en ranking aunque el asistente ya tenga tamaño declarado. Siguen siendo el filtro de quien no trajo tamaño. Pequeña baja de 58 a 50.

## Qué cambió

- `PESOS.TAMANO_PEQUENA`: 58 → **50**.
- `calcularScore`: Exa Consolidado +80 / PyME +40 ya no son un `else` del tamaño. Se acumulan. Temprano sigue en 0. Capa 1 no se tocó.
- Notas: si ya entró por tamaño declarado (o bypass VIP/Speaker) y Exa es Consolidado/PyME, lo mencionan. Quien entra solo por Exa conserva la frase de fallback.

## Operación

Las 105 `Sugerido` actuales no se reordenan solas. Hace falta borrar `Sugerido` otra vez o esperar la siguiente corrida (que escribe el topN del pool restante, no reescribe scores). Sin deploy este cambio no llega a Coolify.

PROPIA × Reevolution (Virtual, Pequeña, área, 11 sols, Exa Ambiguo): 178 → **170**. Si tuviera Consolidado, sumaría +80 encima.
