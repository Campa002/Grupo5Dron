# Posibles Implementaciones y Módulos Desacoplados

Este directorio contiene código y herramientas que no forman parte del núcleo activo del módulo Dron, preservados para consulta y futuras etapas del proyecto.

## Contenido

1. **`aula-esp32/firmware/`**: Firmware PlatformIO en C++ para microcontrolador ESP32 (control IR y relés 220V del aula). Se preserva intacto para el módulo Aula.
2. **`herramientas/`**: Scripts auxiliares históricos (`build_www.py`, `generate_icons.ps1`). El empaquetado activo para Capacitor se realiza exclusivamente con `scripts/build-apk.js`.
3. **`adaptadores-genericos/`**: Implementaciones de referencia para adaptadores de dron genéricos sobre protocolos HTTP y UDP/TCP.
4. **`pasos-y-misiones/`**: lo que salió de la cabina del dron el 26/11/2026 (movimientos por paso, misiones, botón Calibrar e interruptor "Control real (experimental)"). Ver su `README.md`.
