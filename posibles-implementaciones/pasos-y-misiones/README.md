# Pasos, misiones, Calibrar y "Control real (experimental)"

Funciones de la cabina del dron que se sacaron el 26/11/2026, cuando la cabina quedó solo con lo final (pedido después de probar la APK en el Galaxy A06). Se guardan acá por si el profe pregunta cómo eran. **La app no carga estos archivos.**

| Qué era | Por qué se sacó | Qué lo reemplaza |
|---|---|---|
| **Por pasos**: distancia, giro, cruz, Subir, Bajar, Girar y el botón rojo de frenar | Repetía lo que hacen los botones de mantener apretado | Botones de mantener apretado: al soltar, el dron frena |
| **Automático**: misiones (cuadrado, giro 360°, ida y vuelta) | No lo pide el proyecto | — |
| **Calibrar** (sección "02 — Inclinación") | Repetía lo que ya pasaba al prender la inclinación | La calibración es automática: al prender la inclinación, esa posición es "quieto" |
| **Control real (experimental)**: interruptor, cartel y confirmación | El seguimiento pasó a ser la función final | En vuelo, Seguir persona o Seguir objeto mueven el dron con los mismos límites |

## Archivos

- `movido-de-dron.js.txt`: constantes, funciones, eventos y plantilla que salieron de `backend/public/js/dron.js` (pasos, misiones, Calibrar, el interruptor del control real con su confirmación).
- `movido-de-dron-adaptadores.js.txt`: los movimientos por paso del adaptador (`moverPaso`, `girarPaso`, `subirPaso`, `bajarPaso`, `comandoOk`, `reanudarRC`) y la parte del simulador que los imitaba.

Tienen extensión `.txt` para que nadie los cargue por error: son pedazos sueltos, no un módulo que ande solo.

## Si se quisiera volver a poner

Los pasos usaban los comandos del Tello que esperan respuesta (`forward 30`, `cw 90`…) y pausaban el envío continuo (`rc`) mientras duraban. Para volver a usarlos habría que:

1. devolver los métodos al adaptador y las funciones y la plantilla a `dron.js`;
2. volver a sumar la bandera de "paso o misión en curso" a `_maniobraEnCurso()`, para que el failsafe, Aterrizar y EMERGENCIA cancelen la misión;
3. revisar las reglas de seguridad de `CLAUDE.md` antes de probarlo con el dron.
