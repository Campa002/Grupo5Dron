# Plan de pruebas

La columna **Resultado** se completa en clase (la guía paso a paso está en [guia-pruebas-en-clase.md](guia-pruebas-en-clase.md), con los mismos códigos). La columna **Antes de la clase** dice qué ya se verificó sin el hardware real.

Referencias: **Auto** = pruebas automáticas (`node --test`, 108 pruebas, también en el CI). **Navegador** = Playwright con Chromium. **Mock** = Tello simulado (plugin falso que respeta el contrato). **Edge + mock** = la cabina en Edge con el Tello simulado y la foto de prueba dibujada en el video. **API local** = PHP + MariaDB con el ESP32 simulado por HTTP. **OpenSCAD** = modelo 3D.

## Circuito del aula y firmware

| Código | Prueba | Esperado | Antes de la clase | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| A1 | Subir el banco de pruebas | Menú en el monitor serie | Compila en el CI | |
| A2 | Relé (y nivel activo) | Clic al prender y al apagar; arranca apagado | — | |
| A3 | LEDs IR | Los dos parpadean en la cámara | — | |
| A4 | Receptor con el control del proyector | Protocolo, bits y pulsos, sin "cortada" | — | |
| A5 | Receptor con el control del aire | Código largo completo, sin "cortada" | Buffer de 1024 pulsos (en el código) | |
| B1 | Firmware real conectado | WiFi, IP y latido cada 10 s | Compila en el CI | |
| B8 | Alimentado por el cargador | No se reinicia con relé + LEDs + WiFi | Consumo calculado: ~520 mA de pico | |
| H1-H2 | Lámpara con 220 V (con el profe) | Prende y apaga; apagada al desenchufar | — | |

## App del aula y servidor

| Código | Prueba | Esperado | Antes de la clase | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| B2 | Login con cambio de contraseña | Pide cambiarla y entra al aula | Navegador + API local | |
| B3 | Aprender el código del proyector | "Código guardado (protocolo, bits)" | Navegador + API local con ESP32 simulado | |
| B4 | Prender y apagar el proyector | El proyector responde; "listo" | API local (la orden llega al ESP32 simulado) | |
| B5 | Aprender y usar el aire | Código largo guardado y reenviado completo; el proyector no reacciona | API local con un código DAIKIN de 280 bits y 583 tiempos: vuelve igual | |
| B6 | Subir y bajar temperatura | Aparecen al aprenderlos; cambian la temperatura | Navegador (aparecen solo con código) | |
| B7 | Luces sin 220 V | Bloqueado sin habilitar; clic del relé al habilitarlo | API local + navegador | |
| — | Usuario común no aprende códigos | 403 | API local | |
| — | Acción inválida para las luces | 400 | API local | |
| — | Administración: historial, usuarios, relé | Tres pestañas sin errores | Navegador + API local | |
| — | APK del aula contra el hosting (HTTPS) | Login y control igual que en el navegador | Compila en el CI | |

## App del dron sin volar

| Código | Prueba | Esperado | Antes de la clase | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Abrir la app | Inicio con Cabina, Prueba Tello y Seguimiento | Navegador | |
| C2 | Seguimiento con la cámara del celular | Recuadro en la cara, etiqueta derecha, "Siguiendo" | Navegador con cámara falsa (foto de la NASA): sigue la cara al 96 % a los 16 s | |
| C3 | Diagnóstico | Lista y conclusión en palabras | Navegador: todo verde salvo velocidad (sin GPU) | |
| C4 | De espaldas | Pasa al cuerpo sin perderlo | Auto (cambio de cara a cuerpo) | |
| C5 | Perder el objetivo | "Objetivo perdido", rc 0 0 0 0, historial | Auto + navegador | |
| C6 | Tocar un recuadro | Elige ese y vuelve a confirmar | Auto | |
| C7 | Inclinación | Cambian los números | Auto (eventos simulados) | |
| — | Pantallas a 360, 390 y 412 px, vertical y horizontal | Sin scroll horizontal, botones de 44 px o más | Navegador | |

## Dron

| Código | Prueba | Esperado | Antes de la clase | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Prueba Tello | Cinco pasos en verde | Mock | |
| D2 | Cabina conectada | Datos, video, Despegar habilitado | Mock | |
| D3 | Seguimiento en el piso con el video del Tello | Solo marca el objetivo (recuadro y etiqueta); no manda nada al dron; cartel "En el piso solo marca el objetivo…" | Edge + mock: en el piso no sale ningún rc y aparece el cartel | |
| E1 | Despegar y aterrizar | Confirmación; "En vuelo"; no aterriza solo | Mock (plugin 2.2.0) | |
| E2 | Botones de mantener apretado | Mueve mientras apretás, frena al soltar | Auto + mock | |
| E3 | Freno al soltar los botones | Al soltar frena y queda quieto; no hay botón de freno aparte | Auto + mock (lo mismo que E2) | |
| E3b | Inclinación: calibración automática | "Inclinación prendida: esta posición es quieto"; no se mueve hasta inclinarlo; se apaga al girar la pantalla | — | |
| E4 | EMERGENCIA | Motores apagados en el acto | Mock | |
| E5 | Salir de la cabina en vuelo | Aterriza antes | Simulador | |
| E6 | Pérdida de conexión | Freno y aterrizaje | Mock | |
| F1 | Seguir persona en vuelo | Despegar detiene el seguimiento; en el aire, Seguir lo confirma (8 de 75 %) y lo sigue despacio (giro hasta 20, altura y avance hasta 15, nunca de costado); si falta algo, "Todavía no sigue: motivo" | Edge + mock: despegar lo detiene con aviso; en vuelo confirma y manda rc dentro de los límites (roll 0, avance y altura hasta 15, giro hasta 20). PC lenta: no mueve el dron y dice "Todavía no sigue: la imagen se analiza muy lento" (*) | |
| F2 | Objetivo perdido | "Objetivo perdido: el dron queda quieto"; rc 0 0 0 0; lo retoma si vuelve cerca en 5 s | Auto + Edge + mock: aviso y rc 0 0 0 0 | |
| F3 | Qué detiene el seguimiento | Botón de movimiento, inclinación, Detener seguimiento, Aterrizar y EMERGENCIA lo detienen (con aviso cuando corresponde) | Edge + mock: un botón de movimiento y Aterrizar lo detienen | |
| — | Dejan de cumplirse las condiciones mientras sigue (por ejemplo, sin datos del dron) | Se detiene con freno y avisa el motivo; hay que volver a tocar Seguir; si se corta la conexión, el failsafe aterriza | Auto (`decidirSeguimiento`) | |
| — | Cabina a 360, 412 y 740 px parado y a 740×360 y 915×412 acostado, sin conexión y en vuelo | Ningún botón se pisa ni baja de 44 px; EMERGENCIA no tapa lo último; sin scroll horizontal | Edge + mock: sin errores de consola | |

(*) En esa PC, sin placa de video, el camino que mueve el dron se probó bajando solo el mínimo de detecciones por segundo en el navegador de prueba. Los límites no se tocaron.

## Carcasa

| Prueba | Esperado | Antes de la clase | Resultado |
| :--- | :--- | :--- | :--- |
| Piezas imprimibles en la cama redonda | Todas en un círculo de 160 mm | OpenSCAD: la más grande Ø137 | |
| Nada choca | Vista "choques" vacía | OpenSCAD | |
| Tiempo de impresión | Unas 6 h 45 min en total | PrusaSlicer | |
| Medidas de las piezas reales | Entran relé, ESP32, KY-022, PG7 | — (falta medir con calibre) | |
| Rótula | La bola entra a presión, gira y queda apuntando | OpenSCAD: gira 50° | |
| USB-C | Entra la ficha; el precinto sujeta el cable | OpenSCAD (la ficha no toca el cuerpo) | |
