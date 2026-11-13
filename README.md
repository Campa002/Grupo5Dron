# Grupo 5: Control de Sistemas y Dron

**EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°**
Materia: Proyecto de Desarrollo de Software para Plataformas Móviles. Profesores: Eduardo Piris y Figueroa.
Integrantes: Demian Barreto, Luciano Campanelli, Ramiro Caballero y Owen Olea.

## Qué es

Dos apps para Android hechas con HTML, CSS y JavaScript y empaquetadas con Capacitor:

| App | Para qué | Cómo se conecta |
| :--- | :--- | :--- |
| **Grupo 5 — Dron** | Volar un DJI Ryze Tello desde el celular: video, botones de mando, inclinación del celular, pasos, misiones y **seguimiento** de una persona u objeto (estilo RAC: recuadro en la cara, con el cuerpo de respaldo). | Directo al WiFi del Tello, sin internet y sin cuenta. |
| **Grupo 5 Aula** | Manejar las **luces** (relé), el **proyector** y el **aire acondicionado** (infrarrojo) de un aula, y **aprender** los códigos de sus controles remotos. | Con internet, contra un servidor PHP + MySQL; el ESP32 del aula consulta ese servidor. |

```
App del DRON ── WiFi del Tello (UDP) ──> Tello 192.168.10.1
App del AULA ── HTTPS + sesión ──> Servidor PHP + MySQL <── consulta cada 2 s ── ESP32 del aula
                                                                 ├─ relé (luces, 220 V)
                                                                 ├─ 2 LEDs IR (proyector y aire)
                                                                 └─ receptor KY-022 (aprender)
```

## Documentación

| Documento | Para quién |
| :--- | :--- |
| [Guía de pruebas en clase](docs/guia-pruebas-en-clase.md) | Para probar todo junto en una clase de 80 minutos |
| [Manual de usuario: app del dron](docs/manual-usuario-dron.md) | Quien vuela |
| [Manual de usuario: app del aula](docs/manual-usuario-aula.md) | Docentes y administradores |
| [Manual del programador](docs/manual-programador.md) | Quien va a cambiar el código |
| [API del servidor](docs/api.md) | Cada endpoint con ejemplo |
| [Plan de pruebas](docs/plan-de-pruebas.md) | Lista de pruebas con la columna de resultados |
| [Seguimiento: diagnóstico y modelos](docs/seguimiento-diagnostico-y-modelos.md) | IA del Tello, YOLO o COCO-SSD, por qué el A06 quedaba "buscando" |
| [Limitaciones y mejoras futuras](docs/limitaciones-y-mejoras.md) | Lo que falta o se puede mejorar |
| [Correcciones del informe](docs/correcciones-informe.md) | Lo que el informe dice distinto a lo que se hizo |
| [Despliegue en el hosting](docs/despliegue-hosting.md) | Subir el servidor (cPanel) |
| [Firmware del ESP32](posibles-implementaciones/aula-esp32/firmware/README.md) | Circuito, alimentación y primer arranque |
| [Carcasa del equipo del aula](posibles-implementaciones/aula-esp32/carcasa/README.md) | Piezas impresas, armado y lista de compras |

## Estructura

```
backend/
  public/        app del dron (index.php, js/, css/, pages/, libs/ con los modelos de visión)
  public-aula/   app del aula
  api/           API PHP (la usa solo el aula)
  config/        config.example.php (el config.php real no va al repo)
  includes/      sesión, CORS, ayudas
  sql/schema.sql base de datos y datos iniciales
capacitor/       proyecto del APK del dron (con el plugin nativo DronNative para UDP)
capacitor-aula/  proyecto del APK del aula
posibles-implementaciones/aula-esp32/  firmware del ESP32 y carcasa imprimible
scripts/         armado de los APK, chequeos y generador de contraseñas
tests/           pruebas automáticas (node --test)
docs/            documentación
```

## Cómo compilar

Los APK se compilan solos en **GitHub Actions** en cada push a `main` y en cada pull request. Al terminar, en la corrida del workflow (pestaña Actions, o Checks del PR) quedan dos artefactos:

- `Grupo5Dron-app-debug` → APK del dron;
- `Grupo5Aula-app-debug` → APK del aula.

El mismo workflow verifica la sintaxis, corre las pruebas automáticas y compila el firmware del ESP32 con PlatformIO.

Para compilar a mano hace falta Node 20, JDK 17 y el SDK de Android:

```bash
node scripts/build-apk.js dron
```

```bash
cd capacitor && npm install && npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug
```

(Para el aula, lo mismo con `aula` y la carpeta `capacitor-aula`. El workflow `.github/workflows/android.yml` tiene los pasos exactos, incluido el registro del plugin del dron.)

## Cómo instalar

1. Bajá el `.zip` del artefacto y sacá el `.apk`.
2. Abrilo en el celular y permití "instalar apps desconocidas".
3. Si ya había una versión firmada con otra clave, desinstalala primero.

La app del dron funciona sola. La del aula necesita el servidor ([despliegue](docs/despliegue-hosting.md)) y el ESP32 ([firmware](posibles-implementaciones/aula-esp32/firmware/README.md)).

## Pruebas rápidas en la PC

```bash
node --test tests/seguimiento.test.js tests/rac.test.js tests/control-real.test.js tests/inclinacion.test.js tests/objetos.test.js tests/botones.test.js
```

```bash
php -S 127.0.0.1:8088 -t backend/public
```

(La segunda sirve la app del dron en `http://127.0.0.1:8088`; sin el plugin nativo se puede usar el perfil "Simulador".)

## Usuarios iniciales (seed)

`admin@grupo5dron.local` (administrador), `piris@grupo5dron.local` (docente), `demian@grupo5dron.local` y `luciano@grupo5dron.local` (usuarios). La contraseña inicial de todos es `password` y la app obliga a cambiarla en el primer ingreso. Antes de usarlo en serio, cambialas (ver [despliegue](docs/despliegue-hosting.md)).

## Seguridad

- Dron: botón de EMERGENCIA siempre visible, confirmación antes de despegar, aterrizaje automático si se corta la conexión y seguimiento en ensayo por defecto (el control real es experimental y pide confirmación). Volar con protectores y espacio libre.
- Aula: el relé de 220 V se habilita solo desde la administración y el armado se hace con supervisión docente.
