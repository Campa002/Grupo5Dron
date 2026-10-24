# Capacitor — Empaquetado Android APK
## Grupo 5: Control de Sistemas y Dron — EEST N° 1 Eduardo Ader

Este directorio contiene la configuración necesaria para compilar el APK Android
mediante [Capacitor](https://capacitorjs.com/).

---

## ¿Por qué Capacitor?

El APK **empaqueta el frontend localmente** (`webDir: '../backend/public'`), lo que permite:
1. Que la app abra aunque el teléfono esté conectado al WiFi del dron (sin internet).
2. Evitar bloqueos de contenido mixto (HTTPS del hosting vs HTTP del dron).

---

## Estructura

```
capacitor/
├── capacitor.config.ts        ← Configuración principal de Capacitor
├── package.json               ← Dependencias NPM (Capacitor CLI y plugins)
├── android/
│   └── network_security_config.xml  ← Cleartext HTTP sólo para IPs del dron
└── README.md                  ← Este archivo
```

El proyecto Android generado (`android/`) se crea corriendo `npx cap add android`
y **no se versiona en git** (ver `.gitignore`).

---

## Requisitos Previos

- Node.js ≥ 18 y npm ≥ 9
- Android Studio (Hedgehog o superior) con SDK 34
- JDK 17+

---

## Pasos para compilar el APK

### 1. Instalar dependencias

```bash
cd capacitor
npm install
```

### 2. Inicializar el proyecto Android (primera vez)

```bash
npx cap add android
```

### 3. Copiar el Network Security Config

Copiar el archivo de configuración de red al proyecto Android generado:

```bash
# Windows PowerShell
Copy-Item android\network_security_config.xml `
  android\app\src\main\res\xml\network_security_config.xml -Force
```

Luego, referenciar en `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

### 4. Sincronizar los assets del frontend

```bash
npx cap sync android
```

Este comando copia el contenido de `../backend/public` al WebView del proyecto Android.

### 5. Compilar el APK de debug

```bash
npx cap run android
```

O abrirlo en Android Studio:

```bash
npx cap open android
```

Desde Android Studio: **Build → Generate Signed Bundle / APK → APK → Release**.

---

## Configuración de la URL de la API

La URL de la API del hosting se configura en:
`backend/public/js/api.js`, línea:

```js
const BASE_URL = window.location.origin + '/api';
```

En el APK, `window.location.origin` será `https://localhost` (Capacitor).
**Editá esa constante** con la URL real del hosting HTTPS antes de compilar:

```js
// Ejemplo:
const BASE_URL = 'https://grupo5dron.mihosting.com/api';
```

---

## Problema de red WiFi del dron en Android

Android prioriza los datos móviles cuando el WiFi no tiene acceso a internet
(comportamiento de "WiFi sin internet detectado").

**Solución implementada:**
- El módulo del dron no depende de la API para volar.
- Los perfiles se cachean en `localStorage` la última vez que hubo conexión.
- El `network_security_config.xml` permite HTTP a la IP del dron sin necesitar internet.

**Lo que requiere validación con hardware real:**
- Confirmar que Android 12+ mantiene la ruta WiFi cuando el usuario acepta
  "Usar red sin internet" en el diálogo del sistema.
- Probar paquetes UDP hacia el Tello (requiere plugin nativo si el WebView bloquea UDP).

---

## Plugin UDP (para DJI Tello)

El Tello usa UDP 8889 (comandos) y 8890 (estado). Los WebViews de Android **no pueden
enviar paquetes UDP** desde JavaScript sin un plugin nativo.

**Opciones a evaluar con el dron real:**
1. [`capacitor-udp-socket`](https://github.com/nicktastic/capacitor-udp-socket) — plugin open source.
2. Plugin Capacitor propio (requiere Java/Kotlin).
3. Usar el `HttpDroneAdapter` si el dron soporta HTTP (no el Tello estándar).

> ⚠ **REQUIERE VALIDACIÓN CON EL DRON REAL** antes de publicar en Google Play.

---

## Seguridad

- El `network_security_config.xml` **no** habilita cleartext global.
  Sólo permite HTTP a IPs específicas del dron (192.168.10.x por defecto).
- La API del hosting siempre se accede por HTTPS.
- Las credenciales de firma del APK (keystore) NO deben committearse al repositorio.

---

*Proyecto escolar — EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°*
