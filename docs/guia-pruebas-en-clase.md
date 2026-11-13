# Guía de pruebas en clase (80 minutos)

Todo lo que hay que probar, en orden: primero lo que no vuela, después el dron en el piso, después el vuelo con botones y al final el seguimiento. En cada prueba marcá **Anduvo** o **No anduvo** y anotá qué pasó (aunque haya andado, si algo te llamó la atención).

Si algo falla, no te trabes: anotá, copiá los datos que dice la sección "Qué copiarme si algo falla" y pasá a la prueba siguiente.

---

## 0. Antes de la clase (en casa)

### 0.1 Bajar los APK

1. Entrá al PR #5 de GitHub ("NO MERGEAR: para probar en clase") → pestaña **Checks** (o **Actions**) → la última corrida verde del workflow.
2. Abajo de todo, en **Artifacts**, bajá los dos:
   - `Grupo5Dron-app-debug` → la app del dron;
   - `Grupo5Aula-app-debug` → la app del aula.
3. Cada uno es un `.zip` con un `.apk` adentro. Pasalos al celular.

### 0.2 Instalar en el celular

1. Abrí cada `.apk` desde el celular. Si Android pregunta, permití "instalar apps desconocidas" para el explorador de archivos.
2. Si dice que no se puede instalar porque ya hay una versión con otra firma: desinstalá la versión vieja y volvé a instalar.
3. Quedan dos íconos: "Grupo 5 — Dron" y "Grupo 5 Aula" (son apps distintas, pueden estar las dos).

### 0.3 Preparar el servidor del aula en la notebook (XAMPP)

En clase no hace falta el hosting: el aula se prueba con la notebook como servidor y el **navegador** del celular (el APK del aula necesita HTTPS, así que en clase usamos el navegador; el APK se prueba cuando esté el hosting).

1. En `C:\xampp\htdocs\` armá esta estructura (copiando del repo):
   - `htdocs\api\` ← `backend\api\`
   - `htdocs\config\` ← `backend\config\` (con tu `config.php`)
   - `htdocs\includes\` ← `backend\includes\`
   - `htdocs\aula\` ← `backend\public-aula\`
2. En phpMyAdmin: creá la base `grupo5dron_db` e importá `backend\sql\schema.sql` (borra y vuelve a crear todo: así arranca limpia, con el proyector y el aire sin códigos).
3. En `config.php`: `esp32_token` igual al de `config.h` del ESP32.
4. Prendé Apache y MySQL. Probá en la notebook: `http://localhost/aula/` → tiene que aparecer el login.
5. Anotá la IP de la notebook en la red que van a usar (`ipconfig` en PowerShell, "Dirección IPv4"): ______________
6. Si el celular no llega a `http://IP/aula/`, en el firewall de Windows permití Apache en redes privadas.

**Red:** la notebook, el ESP32 y el celular tienen que estar en la **misma red WiFi de 2,4 GHz** (el ESP32 no ve 5 GHz). Si la red de la escuela bloquea, usá la zona WiFi (hotspot) de otro celular.

### 0.4 Preparar el ESP32

1. Copiá `src/config.h.example` como `src/config.h` y completá:
   - `WIFI_SSID` y `WIFI_PASSWORD` de la red de la clase;
   - `API_URL` = `http://IP-de-la-notebook/api/esp32.php` (con `http://`, no `https://`);
   - `ESP32_TOKEN` = el mismo de `config.php`;
   - `RELE_ACTIVO_EN_BAJO` (si ya sabés si tu relé es activo en bajo o en alto; si no, se averigua en la prueba A2).
2. Llevá la notebook con PlatformIO (VS Code) para subir el banco de pruebas y después el firmware. Los pasos están en el README del firmware, sección "Primer arranque".

### 0.5 Preparar el dron

- Batería del Tello cargada (y la de repuesto, si hay). Celular cargado.
- **Protectores de hélices puestos.**
- Tela o algo blando para la prueba de EMERGENCIA.

---

## Reglas de seguridad

**Para volar en el aula:**
- Protectores de hélices siempre puestos.
- Un espacio libre de 3 × 3 m como mínimo, sin personas debajo ni cerca. Lejos de ventiladores de techo y del aire acondicionado prendido (lo mueve el viento).
- Una persona tiene el celular y el dedo listo en **EMERGENCIA** (apaga los motores en el acto: el dron cae). Otra persona solo mira el dron y avisa.
- Nadie toca el dron con las hélices girando. Pelo largo atado.
- Si algo no se entiende, **Aterrizar** primero y después se piensa.

**Para el 220 V:**
- Todo el armado y las pruebas con 220 V, **con el profe**, y el profe revisa el cableado antes de enchufar.
- Mientras se arma o se toca la caja: **desenchufado** y con la térmica de las luces baja.
- La caja se cierra (tapa atornillada y prensacables ajustados) antes de enchufar.
- La fuente HLK-5M05 **ya no se usa**: tiene que estar desoldada o con sus cables cortados y aislados con termocontraíble. El ESP32 se alimenta solo por el USB-C con un cargador de celular.

---

## Plan de la clase

| Minutos | Bloque | Qué se necesita |
| :--- | :--- | :--- |
| 0 a 10 | A. Circuito del aula, sin 220 V (banco de pruebas) | ESP32, notebook con PlatformIO, controles remotos |
| 10 a 25 | B. App del aula con el ESP32 | Notebook con XAMPP, misma red WiFi |
| 25 a 35 | C. App del dron sin dron (cámara del celular) | Solo el celular |
| 35 a 45 | D. Dron en el piso, sin volar | Tello prendido, celular en su WiFi |
| 45 a 60 | E. Vuelo con botones | Espacio libre, alguien en EMERGENCIA |
| 60 a 75 | F. Seguimiento en vuelo (ensayo y control real) | Una persona que se deje seguir |
| 75 a 80 | G. Copiar registros y anotar | — |

Si sobra tiempo, al final: H. Luces con 220 V (solo con el profe).

---

## A. Circuito del aula, sin 220 V (banco de pruebas)

Todo con el ESP32 alimentado por USB (de la notebook o del cargador). **Sin 220 V conectado al relé.**

### A1. Subir el banco de pruebas
- **Hacer:** en la notebook, subí `tests/test_hardware.ino` (README del firmware, "Primer arranque", paso 3). Abrí el monitor serie a 115200.
- **Debería:** aparece el menú "BANCO DE PRUEBAS DE HARDWARE" con las opciones 1 a 4.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### A2. Relé (y si es activo en alto o en bajo)
- **Hacer:** mandá `1`.
- **Debería:** el relé hace **clic al prender y clic al apagar** (2 segundos entre medio). Al arrancar el ESP32 tiene que estar apagado (sin clic, LED del relé apagado).
- **Si hace al revés** (arranca prendido y "prende" cuando debería apagar): el relé es activo en alto. Cambiá `RELE_ACTIVO_EN_BAJO` a `0` en `config.h` y en `test_hardware.ino`.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Activo en: ☐ bajo ☐ alto — Qué pasó: ____________________

### A3. LEDs IR
- **Hacer:** mandá `2` y mirá los LEDs IR **con la cámara del celular** (el ojo no ve el infrarrojo).
- **Debería:** **los dos LEDs** parpadean 5 veces en la pantalla del celular (violeta o blanco). Si la cámara de atrás no lo muestra, probá con la de adelante.
- **Resultado:** ☐ Anduvo ☐ No anduvo — ¿Los dos? ☐ sí ☐ uno solo ☐ ninguno — Qué pasó: ____________________

### A4. Receptor con el control del proyector
- **Hacer:** mandá `3`, apuntá el control del proyector al KY-022 (a menos de 1 m) y apretá encender.
- **Debería:** aparece "SEÑAL DETECTADA" con protocolo, código, bits y pulsos. Anotá:
  - Protocolo: ________ Bits: ______ Pulsos: ______ ¿Dice CORTADA? ☐ sí ☐ no
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### A5. Receptor con el control del aire acondicionado
- **Hacer:** igual que A4, con el control del aire (apretá encender, con la temperatura y el modo que usarían en clase).
- **Debería:** "SEÑAL DETECTADA". Los aires mandan códigos **largos**: lo normal es un protocolo de aire (por ejemplo COOLIX, DAIKIN, GREE, MIDEA, LG, SAMSUNG_AC) con muchos bits (más de 100), o UNKNOWN con muchos pulsos (200 a 600). **No tiene que decir CORTADA.**
  - Protocolo: ________ Bits: ______ Pulsos: ______ ¿Dice CORTADA? ☐ sí ☐ no
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________
- **Si sale UNKNOWN con pocos pulsos (menos de 50) o CORTADA:** copiame todo lo que salió en el monitor serie.

---

## B. App del aula con el ESP32 (sin 220 V)

### B1. Subir el firmware real y ver que se conecta
- **Hacer:** subí el firmware (`pio run --target upload`, README del firmware, "Primer arranque", paso 5) y mirá el monitor serie.
- **Debería:** se conecta al WiFi, muestra su IP y "Heartbeat" cada 10 segundos sin errores.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### B2. Entrar a la app del aula
- **Hacer:** en el **navegador** del celular (en la misma red), entrá a `http://IP-de-la-notebook/aula/` e iniciá sesión con `piris@grupo5dron.local` / `password`.
- **Debería:** te pide cambiar la contraseña (poné una nueva y anotala) y después muestra "Control del aula" con Luces, Proyector, Aire acondicionado y "04 — Aprender código". Arriba: "Equipo del aula en línea" con punto verde.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### B3. Aprender el código del proyector
- **Hacer:** en "04 — Aprender código" elegí Proyector → Encender y tocá **Aprender**. Cuando diga "Escuchando", apuntá el control del proyector al receptor y apretá encender **una vez**.
- **Debería:** en unos segundos dice "Código guardado para Proyector: Encender (protocolo …, … bits)". El botón Encender del proyector se habilita.
- Repetí con Proyector → Apagar.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Protocolo que guardó: ________ — Qué pasó: ____________________

### B4. Prender y apagar el proyector
- **Hacer:** apuntá **una de las cápsulas** al proyector y tocá Encender. Después Apagar.
- **Debería:** el proyector se prende y se apaga. Aparece "Proyector: encender: listo".
- **Resultado:** ☐ Anduvo ☐ No anduvo — Distancia: ____ m — Qué pasó: ____________________

### B5. Aprender y usar el aire (código largo)
- **Hacer:** Aprender código → Aire acondicionado → Encender (con el control en la temperatura y el modo que quieran). Después Apagar. Después apuntá **la otra cápsula** al aire y probá Encender y Apagar desde la app.
- **Debería:** "Código guardado" con un protocolo de aire o UNKNOWN; el aire se prende y se apaga. Mientras tanto, el proyector **no** tiene que reaccionar (cada aparato responde solo a su código).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Protocolo: ________ Bits: ______ — Qué pasó: ____________________
- **Ojo:** en muchos aires el código lleva la temperatura completa. Si aprendés "Subir temperatura" con el control en 24 °C, ese botón siempre deja el aire en 24 °C (no sube de a un grado). Probalo y anotá cómo se comporta.

### B6. Subir y bajar la temperatura (si da el tiempo)
- **Hacer:** aprendé Subir temperatura y Bajar temperatura (aparecen en la sección del aire cuando tienen código). Probalos.
- **Debería:** el aire cambia la temperatura (ver la nota de B5).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### B7. Luces (relé) sin 220 V
- **Hacer:** entrá como `admin@grupo5dron.local` / `password` (cambiá la contraseña), andá a Administración → Configuración y activá "Relé habilitado". Volvé al aula y tocá "Encender luces" y "Apagar luces".
- **Debería:** el relé hace clic al encender y al apagar; aparece "Luces: encender: listo". Antes de habilitarlo, tiene que decir que el relé está desactivado.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### B8. Alimentación por el cargador
- **Hacer:** desenchufá el ESP32 de la notebook y enchufalo al **cargador de celular** (5 V, 1 A o más). Repetí B4 (proyector) y B7 (relé) a la vez varias veces.
- **Debería:** el ESP32 no se reinicia (en la app sigue "en línea") y el relé y los LEDs andan igual.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Cargador usado (A): ____ — Qué pasó: ____________________

---

## C. App del dron sin dron (cámara del celular)

### C1. Abrir la app del dron
- **Hacer:** abrí "Grupo 5 — Dron".
- **Debería:** entra directo al inicio (sin login) con tres opciones: Cabina, Prueba Tello y Seguimiento.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### C2. Seguimiento con la cámara del celular
- **Hacer:** Inicio → **Seguimiento** → "Iniciar seguimiento". Aceptá el permiso de la cámara. Apuntá a un compañero de frente, a 1 o 2 m, que se quede quieto.
- **Debería:**
  - el video sin espejar, con un recuadro en la **cara** y la etiqueta "Persona 9x %" arriba a la derecha del recuadro (que se lea derecha, no espejada);
  - la tarjeta de Estado pasa de "Buscando objetivo..." (naranja) a "Confirmando: Persona (n/8)" y a "Siguiendo: Persona" (verde);
  - arriba a la derecha del video, la cantidad de FPS.
- Anotá los FPS: ______ y cuánto tarda en pasar a "Siguiendo": ______ s
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### C3. Diagnóstico (sobre todo si queda en "Buscando")
- **Hacer:** tocá **Diagnosticar** (abajo de todo) apuntando a la persona.
- **Debería:** una lista con puntos verdes o rojos (imagen, brillo, placa de video, foto de prueba, persona en la imagen, velocidad) y una conclusión en palabras. Tocá **Copiar diagnóstico** y guardalo para mandármelo, ande o no ande.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Conclusión: ______________________________

### C4. De espaldas: el cuerpo de respaldo
- **Hacer:** con el seguimiento en "Siguiendo", que la persona se dé vuelta.
- **Debería:** el recuadro pasa de la cara al **cuerpo** y la tarjeta dice "No ve la cara: sigue el cuerpo"; no se pierde. Al darse vuelta de nuevo, vuelve a la cara.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### C5. Perder el objetivo
- **Hacer:** que la persona salga de la imagen.
- **Debería:** en menos de un segundo pasa a "Objetivo perdido" (rojo) y el comando queda en "rc 0 0 0 0". El Historial anota "Siguiendo" y "Objetivo perdido" con la hora. **Limpiar** vacía el historial.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### C6. Tocar un recuadro para elegir
- **Hacer:** con dos personas (o una persona y una botella o una taza) en la imagen, tocá el recuadro de la que no está siguiendo.
- **Debería:** dice "Elegido: …", vuelve a confirmar (n/8) y sigue a la elegida. Los objetos muestran su nombre en español ("Botella 78 %").
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### C7. Inclinación del celular
- **Hacer:** Menú → Sensores. Inclinate con el celular hacia adelante, atrás y a los costados.
- **Debería:** cambian los números de "Adelante / atrás" y "Costados". Si el celular no tiene giroscopio (el A06 no tiene), dice que usa el acelerómetro.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

---

## D. Dron en el piso, sin volar

Celular conectado al WiFi del Tello (`TELLO-…`). Los datos móviles pueden quedar prendidos.

### D1. Prueba Tello
- **Hacer:** Inicio → Prueba Tello → "Probar conexión".
- **Debería:** los cinco pasos en verde (conexión, respuesta, batería, datos y video) y "Listo para volar". Dice qué red usa.
- Tocá **Copiar informe** y guardalo (mandámelo siempre, ande o no).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Batería: ____ % — Qué pasó: ____________________

### D2. Cabina conectada
- **Hacer:** Inicio → Cabina. Acostá el celular.
- **Debería:** "Conectado (en tierra)", batería y altura sobre el video, video del Tello sin cuadros rotos, "Despegar" habilitado (si dice "Esperando datos del dron…", esperá unos segundos).
- **Resultado:** ☐ Anduvo ☐ No anduvo — ¿Video con cuadros rotos? ☐ sí ☐ no — Qué pasó: ____________________

### D3. Seguimiento en ensayo con el video del Tello (sin volar)
- **Hacer:** con el dron en la mano (o sobre una mesa) apuntando a una persona a 2 o 3 m, tocá "Seguimiento: OFF" (columna de la derecha) o bajá a "01 — Seguimiento" → Iniciar seguimiento.
- **Debería:** recuadro en la cara, "Siguiendo: Persona" y el cartel "Ensayo (no mueve el dron): …". En la tarjeta: "Ensayo: no se manda nada". El interruptor "Control real" **no se deja activar en tierra** (avisa que el dron no está en vuelo).
- **Resultado:** ☐ Anduvo ☐ No anduvo — FPS: ____ — Qué pasó: ____________________

---

## E. Vuelo con botones

Espacio libre, protectores, alguien con el dedo en EMERGENCIA.

### E1. Despegar y aterrizar
- **Hacer:** Despegar → confirmar. Esperá que quede quieto. Aterrizar.
- **Debería:** pide confirmación; despega, pasa a "En vuelo" en pocos segundos (no se queda en "Despegando..."); no aterriza solo a los 15 s; Aterrizar lo baja y pasa a "Conectado (en tierra)".
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### E2. Botones de mantener apretado
- **Hacer:** en vuelo, velocidad **Lenta**: mantené apretado Adelante 1 segundo y soltá; lo mismo con Atrás, Izquierda, Derecha, Subir, Bajar y los dos giros.
- **Debería:** se mueve mientras está apretado y **frena al soltar**. Con dos dedos se combinan.
- **Resultado:** ☐ Anduvo ☐ No anduvo — ¿Lenta es manejable? ☐ sí ☐ muy rápido ☐ muy lento — Qué pasó: ____________________

### E3. Paso y freno
- **Hacer:** "03 — Por pasos": Adelante 30 cm. Después un Girar 90°. Mientras hace un paso, tocá el botón rojo del centro (freno).
- **Debería:** hace el paso y queda quieto; el freno lo para.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### E4. EMERGENCIA (a poca altura)
- **Hacer:** con el dron a menos de 50 cm de altura y sobre algo blando, tocá EMERGENCIA.
- **Debería:** los motores se apagan en el acto (cae).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### E5. Salir de la cabina en vuelo
- **Hacer:** en vuelo, abrí el menú y andá al Inicio. Confirmá.
- **Debería:** avisa y aterriza antes de salir.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### E6. Pérdida de conexión (failsafe), si el profe está de acuerdo
- **Hacer:** en vuelo, a 1 m de altura, alejate con el celular hasta que se corte o apagá el WiFi del celular.
- **Debería:** a los ~3,5 s: "Se cortó la conexión con el dron: frenando y aterrizando". El dron aterriza (si no le llegan órdenes, el Tello aterriza solo a los ~15 s).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

---

## F. Seguimiento en vuelo

Una persona se pone de frente a 2 o 3 m del dron. Otra con el dedo en EMERGENCIA. Primero ensayo, después control real.

### F1. Ensayo en vuelo
- **Hacer:** despegá, subí a la altura de la cara (con Subir) y tocá Iniciar seguimiento.
- **Debería:** "Siguiendo: Persona" y el cartel dice qué haría el dron ("giraría a la derecha…") **sin moverlo**. Si la persona camina de costado, el texto dice que giraría hacia ella.
- **Resultado:** ☐ Anduvo ☐ No anduvo — FPS en vuelo: ____ — Qué pasó: ____________________

### F2. Control real (experimental)
- **Hacer:** bajá hasta "01 — Seguimiento" y activá **Control real (experimental)**. Leé la confirmación y aceptá. La persona camina despacio de costado, 1 m para cada lado.
- **Debería:**
  - el cartel sobre el video dice "CONTROL REAL · … · rc …" y la tarjeta "Mandando al dron: rc 0 X Y Z";
  - el dron gira despacio para mirar a la persona (giro hasta 20 de 100), sube o baja un poco y avanza o retrocede despacio (hasta 15) para mantener la distancia (~3 m); nunca se mueve de costado.
- **Si no se deja activar:** anotá el motivo que dice (por ejemplo, poca batería, altura fuera de 80 a 250 cm, menos de 4 detecciones por segundo).
- **Resultado:** ☐ Anduvo ☐ No anduvo — Motivo si no se activó: ________ — Qué pasó: ____________________

### F3. Objetivo perdido = quieto
- **Hacer:** con el control real activo, que la persona salga de la imagen (o se tape la cara y se vaya).
- **Debería:** "Objetivo perdido" y "rc 0 0 0 0": el dron **se queda quieto** en el aire; no aterriza ni se mueve solo.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### F4. Tocar un botón devuelve el mando
- **Hacer:** con el control real activo, tocá cualquier botón de movimiento.
- **Debería:** avisa "Tocaste un botón de movimiento: el seguimiento volvió a ensayo", el interruptor se apaga y el dron responde al botón.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

### F5. Aterrizar con el seguimiento activo
- **Hacer:** con el control real activo, tocá Aterrizar.
- **Debería:** aterriza normalmente y el seguimiento se apaga.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

---

## G. Copiar registros y anotar (últimos 5 minutos)

Copiá y guardá (en un mensaje o un archivo de notas) lo que haya, aunque todo haya andado:

- [ ] Informe de **Prueba Tello** ("Copiar informe").
- [ ] **Diagnóstico** del seguimiento (C3), con la cámara del celular y, si se pudo, en la cabina con el video del Tello.
- [ ] Con el **modo técnico** prendido (Config. Dron → "Mostrar el modo técnico"), en la cabina: "Copiar registro de comandos" y "Copiar registro" del seguimiento.
- [ ] Lo que mostró el **monitor serie** del ESP32 en A4 y A5 (protocolos, bits y pulsos de los controles).
- [ ] FPS en el celular (C2, D3, F1).
- [ ] Si el relé es activo en alto o en bajo (A2).

---

## H. Luces con 220 V (solo con el profe, si sobra tiempo)

### H1. Revisión antes de enchufar
- **Hacer (con el profe):** todo desenchufado y con la térmica baja. Revisar: la HLK desconectada y aislada; la fase entra por un PG7 al COM del relé y sale del NO por el otro PG7 hacia la lámpara; NC libre; el neutro no entra a la caja; ningún cable de 220 V en el piso de arriba; tapa atornillada; prensacables ajustados.
- **Resultado:** ☐ Revisado por el profe — Observaciones: ____________________

### H2. Prender y apagar la lámpara
- **Hacer:** subir la térmica, enchufar el cargador del ESP32 y, desde la app, Encender y Apagar las luces.
- **Debería:** la lámpara se prende y se apaga. Al desenchufar el cargador, la lámpara queda apagada.
- **Resultado:** ☐ Anduvo ☐ No anduvo — Qué pasó: ____________________

---

## Qué copiarme si algo falla

| Si falla… | Copiame |
| :--- | :--- |
| La conexión con el Tello | "Copiar informe" de Prueba Tello, y si los datos móviles estaban prendidos o apagados |
| El despegue, los botones o el aterrizaje | Modo técnico → cabina → "Copiar registro de comandos" |
| El seguimiento ("Buscando" siempre, recuadros raros) | "Copiar diagnóstico" y, en modo técnico, "Copiar registro" del seguimiento; una captura de pantalla |
| El control real | El motivo que muestra, el texto "Mandando al dron: rc …" y "Copiar registro" del seguimiento |
| El ESP32 (no se conecta, no aprende, no emite) | Todo lo que sale en el monitor serie |
| La app del aula | El mensaje que aparece (toast) y una captura |
| Cualquier cosa | Qué tocaste, qué esperabas y qué pasó (aunque sea en una línea) |
