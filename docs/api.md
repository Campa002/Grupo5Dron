# API del servidor

Base: `https://tu-dominio.com/api/`. Todas las respuestas son JSON con `error` (true/false) y, si hay error, `mensaje`. Cada archivo elige la acción con `?action=`.

**Autenticación:**
- App: encabezado `Authorization: Bearer <token>` (el token sale del login y dura 8 horas).
- ESP32: encabezado `X-ESP32-Token: <esp32_token de config.php>`.

Roles: `admin`, `docente`, `usuario`. Errores típicos: 400 (datos inválidos), 401 (sin sesión o vencida), 403 (sin permiso), 404, 500.

## auth.php

### POST `auth.php?action=login`
```json
{ "email": "piris@grupo5dron.local", "password": "password" }
```
Respuesta:
```json
{ "error": false, "token": "eyJ...", "usuario": { "id": 2, "nombre": "Profesor Piris", "email": "piris@grupo5dron.local", "rol": "docente", "debe_cambiar_password": true } }
```
Después de 5 intentos fallidos, la cuenta se bloquea 15 minutos.

### POST `auth.php?action=cambiar_mi_password` (con sesión)
```json
{ "password_actual": "password", "password_nueva": "UnaClaveNueva2026!" }
```
Responde `"mensaje": "Contraseña actualizada."` (el mismo token sigue valiendo).

### GET `auth.php?action=sesion` (con sesión)
Datos del usuario actual.

### POST `auth.php?action=logout`
Cierra la sesión del lado de la app.

### POST `auth.php?action=registro` (admin)
```json
{ "nombre": "Ramiro Caballero", "email": "ramiro@grupo5dron.local", "password": "Temporal2026!", "rol": "docente" }
```

## usuarios.php (admin)

| Método | Acción | Ejemplo |
| :--- | :--- | :--- |
| GET | `listar` | `usuarios.php?action=listar` |
| GET | `obtener&id=X` | `usuarios.php?action=obtener&id=3` |
| PUT | `actualizar&id=X` | `{ "nombre": "Demian B.", "rol": "docente", "activo": 1 }` |
| PUT | `cambiar_password&id=X` | `{ "password": "OtraClave2026!" }` |
| DELETE | `eliminar&id=X` | desactiva la cuenta |

## dispositivos.php (con sesión)

Los aparatos por infrarrojo: solo el proyector y el aire (las luces van por el relé). Son fijos.

### GET `dispositivos.php?action=listar`
```json
{ "error": false, "dispositivos": [
  { "id": 1, "nombre": "Proyector", "tipo": "proyector", "icono": "proyector", "orden": 1,
    "botones": [ { "id": 1, "accion": "encender", "nombre": "Encender", "tiene_codigo_ir": true,
                   "codigo_ir_id": 5, "protocolo": "NEC", "bits": 32, "codigo_actualizado_en": "2026-11-13 10:05:12" },
                 { "id": 2, "accion": "apagar", "nombre": "Apagar", "tiene_codigo_ir": false, "codigo_ir_id": null, "protocolo": null, "bits": null, "codigo_actualizado_en": null } ] },
  { "id": 2, "nombre": "Aire acondicionado", "tipo": "aire", "botones": [ "…encender, apagar, subir_temp, bajar_temp…" ] }
] }
```

### GET `dispositivos.php?action=obtener&id=2`
Un aparato con sus acciones (mismo formato).

## botones.php

### GET `botones.php?action=listar&dispositivo_id=2` (con sesión)
Las acciones de un aparato con su código: `id`, `accion`, `nombre`, `codigo_ir_id`, `protocolo`, `codigo`, `bits`, `tiene_crudo`, `codigo_actualizado_en`.

### DELETE `botones.php?action=eliminar_codigo_ir&id=5` (docente o admin)
Borra un código aprendido (`id` = `codigo_ir_id`).

## comandos.php (con sesión)

### POST `comandos.php?action=enviar`

Proyector o aire (la acción tiene que tener código):
```json
{ "tipo": "ir", "boton_id": 3 }
```
Luces (el relé tiene que estar habilitado en la configuración; si no, 403):
```json
{ "tipo": "rele", "parametros": { "accion": "encender" } }
```
Aprender un código (docente o admin):
```json
{ "tipo": "aprendizaje", "boton_id": 3 }
```
Respuesta (201):
```json
{ "error": false, "mensaje": "Comando enviado a la cola.", "comando_id": 17, "estado": "pendiente" }
```

### GET `comandos.php?action=estado&id=17`
```json
{ "error": false, "comando": { "id": 17, "estado": "ejecutado", "resultado": "Comando IR (NEC 0xC1AA09F6) emitido con éxito." } }
```
Estados: `pendiente` → `enviado` (lo tomó el ESP32) → `ejecutado` o `error`.

### GET `comandos.php?action=historial&limite=50`
Lista con `dispositivo`, `boton`, `tipo`, `estado`, `resultado`, `usuario_nombre` y `ejecutado_en`. Las luces aparecen como dispositivo "Luces".

### GET `comandos.php?action=pendientes`
Los comandos que el ESP32 todavía no tomó.

## esp32.php (lo usa el ESP32, con `X-ESP32-Token`)

### GET `esp32.php?action=poll`
```json
{ "error": false, "cantidad": 1, "comandos": [
  { "id": 17, "boton_id": 3, "tipo": "ir", "parametros": null,
    "protocolo": "DAIKIN", "codigo": "0x11DA2700C5…", "bits": 280, "raw_data": [430, 1270, 430, "…"], "frecuencia": 38000 } ] }
```
Para `rele`: `parametros` = `{ "accion": "encender", "canal": 1 }`. Para `aprendizaje`: `boton_id` es la acción que se aprende.

### POST `esp32.php?action=heartbeat`
```json
{ "dispositivo_id": "esp32-principal", "ip_local": "192.168.0.50", "rssi": -60, "version_fw": "1.1.0", "modo_aprendizaje": 0 }
```

### POST `esp32.php?action=resultado`
```json
{ "comando_id": 17, "estado": "ejecutado", "resultado": "Comando IR emitido." }
```

### POST `esp32.php?action=codigo_ir`
```json
{ "boton_id": 3, "protocolo": "DAIKIN", "codigo": "0x11DA2700C5…", "bits": 280, "raw_data": [430, 1270, "…"], "frecuencia": 38000 }
```
Guarda (o reemplaza) el código de esa acción, con la trama cruda completa.

### GET `esp32.php?action=estado` (con sesión o con el token del ESP32)
```json
{ "error": false, "estado": { "en_linea": true, "ip_local": "192.168.0.50", "rssi": -60, "version_fw": "1.1.0", "modo_aprendizaje": 0, "ultimo_heartbeat": "2026-11-13 10:05:40" } }
```
`en_linea` es falso si pasaron más de 30 s sin latido.

## config.php

### GET `config.php?action=obtener` (con sesión)
```json
{ "error": false, "valores": { "rele_habilitado": "0", "nombre_proyecto": "…", "escuela": "…" } }
```

### PUT `config.php?action=actualizar` (admin)
```json
{ "rele_habilitado": "1" }
```

## dron-perfiles.php

Queda en el servidor sin uso: la app del dron tiene sus dos perfiles fijos y no usa la API.
