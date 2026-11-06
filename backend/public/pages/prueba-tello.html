<div class="pagina-prueba-tello">
    <div class="flex justify-between items-center mb-md flex-wrap gap-sm">
        <div>
            <h2 class="seccion-titulo" style="margin-bottom: var(--espacio-xs);">Prueba y diagnóstico del Tello</h2>
            <p class="texto-sm texto-secundario">Probá la conexión UDP con el dron antes de volar.</p>
        </div>
        <a href="#/dron" class="btn btn--secundario"><span class="ico ico--volver" aria-hidden="true"></span> Volver a la cabina</a>
    </div>

    <div class="alerta alerta--info mb-md">
        <span class="ico ico--alerta" aria-hidden="true"></span>
        <span>Conectá el celular al WiFi del Tello (<code>TELLO-XXXXXX</code>, IP <code>192.168.10.1</code>) y dejá el dron apoyado en el piso. Estos comandos no lo hacen despegar.</span>
    </div>

    <!-- Destino -->
    <div class="tarjeta mb-md">
        <h3 class="tarjeta__titulo">Destino</h3>
        <div class="flex gap-md flex-wrap items-center">
            <div class="campo" style="flex: 1 1 9rem; margin-bottom: 0;">
                <label class="campo__label" for="tello-ip-prueba">IP del Tello</label>
                <input type="text" id="tello-ip-prueba" class="campo__input" value="192.168.10.1" inputmode="decimal">
            </div>
            <div class="campo" style="flex: 0 1 7rem; margin-bottom: 0;">
                <label class="campo__label" for="tello-puerto-prueba">Puerto</label>
                <input type="number" id="tello-puerto-prueba" class="campo__input" value="8889">
            </div>
            <div style="flex: 1 1 100%;">
                <span class="campo__label">Entorno</span>
                <span id="tello-entorno-badge" class="badge">Detectando...</span>
            </div>
        </div>
    </div>

    <!-- Comandos -->
    <div class="tarjeta mb-md">
        <h3 class="tarjeta__titulo">Comandos de prueba</h3>
        <div class="grilla-prueba-tello mb-md">
            <button id="btn-tello-cmd" class="btn btn--primario">1. "command" (modo SDK)</button>
            <button id="btn-tello-bat" class="btn btn--secundario">2. "battery?" (batería)</button>
            <button id="btn-tello-streamon" class="btn btn--secundario">3. "streamon" (video)</button>
        </div>
        <div class="flex gap-sm items-center">
            <input type="text" id="tello-cmd-custom" class="campo__input" placeholder="Otro comando (ej: time?)" style="flex:1; min-width:0;" aria-label="Comando personalizado">
            <button id="btn-tello-custom" class="btn btn--secundario">Enviar</button>
        </div>
    </div>

    <!-- Consola de respuestas -->
    <div class="tarjeta mb-md">
        <div class="flex justify-between items-center mb-sm gap-sm">
            <h3 class="tarjeta__titulo" style="margin:0;">Respuestas UDP</h3>
            <button id="btn-limpiar-log-tello" class="btn btn--secundario">Limpiar</button>
        </div>
        <pre id="tello-log-salida" class="consola-prueba">Esperando comandos de prueba...</pre>
    </div>

    <!-- Diagnóstico -->
    <div class="tarjeta mb-md" id="panel-diagnostico-tello">
        <div class="flex justify-between items-center mb-sm flex-wrap gap-sm">
            <h3 class="tarjeta__titulo" style="margin:0;">Diagnóstico para la prueba de campo</h3>
            <div class="flex gap-sm flex-wrap">
                <button id="btn-ejecutar-diagnostico" class="btn btn--primario"><span class="ico ico--recargar" aria-hidden="true"></span> Diagnosticar</button>
                <button id="btn-copiar-diagnostico" class="btn btn--secundario"><span class="ico ico--copiar" aria-hidden="true"></span> Copiar informe</button>
            </div>
        </div>

        <div class="grilla-diagnostico">
            <div class="dato-diagnostico"><span>Plugin DronNative</span><strong id="diag-plugin-info">No detectado</strong></div>
            <div class="dato-diagnostico"><span>Red WiFi vinculada</span><strong id="diag-wifi-status">Pendiente</strong></div>
            <div class="dato-diagnostico"><span>Soporte de video (WebCodecs)</span><strong id="diag-webcodecs-status">Verificando...</strong></div>
            <div class="dato-diagnostico"><span>Respuestas ("command" / "battery?")</span><strong id="diag-latencia-cmd">Sin probar</strong></div>
            <div class="dato-diagnostico"><span>Telemetría (UDP 8890)</span><strong id="diag-telemetria-pps">0 pps</strong></div>
            <div class="dato-diagnostico"><span>Video (UDP 11111)</span><strong id="diag-video-bytes">0 bytes</strong></div>
            <div class="dato-diagnostico"><span>URL de la API</span><strong id="diag-api-url" style="word-break:break-all;">—</strong></div>
            <div class="dato-diagnostico"><span>Sesión</span><strong id="diag-conexion-estado">—</strong></div>
            <div class="dato-diagnostico"><span>Modelo de seguimiento (COCO-SSD)</span><strong id="diag-modelo">Sin verificar</strong></div>
        </div>

        <div class="mt-sm">
            <div class="flex justify-between items-center mb-xs gap-sm">
                <span class="texto-sm font-semibold texto-secundario">Archivos del modelo (tamaño recibido y tipo)</span>
                <button id="btn-verificar-modelo" class="btn btn--secundario">Verificar modelo</button>
            </div>
            <pre id="diag-modelo-detalle" class="consola-prueba consola-prueba--errores" style="color:#cbd5e1;">Sin verificar.</pre>
        </div>

        <div class="mt-sm">
            <span class="texto-xs texto-secundario block">WebView / UserAgent</span>
            <code id="diag-user-agent" class="texto-xs" style="display:block; padding: var(--espacio-xs); background: var(--color-fondo); border-radius: var(--radio-sm); word-break: break-all;"></code>
        </div>

        <!-- Área de texto oculta para copiar el informe si el portapapeles falla -->
        <textarea id="diag-textarea-respaldo" aria-hidden="true" tabindex="-1" style="position:absolute; left:-9999px; opacity:0;"></textarea>

        <div class="mt-md">
            <div class="flex justify-between items-center mb-xs gap-sm">
                <span class="texto-sm font-semibold texto-secundario">Últimos 20 errores</span>
                <button id="btn-limpiar-errores-diag" class="btn btn--secundario">Borrar</button>
            </div>
            <pre id="diag-errores-salida" class="consola-prueba consola-prueba--errores">Sin errores registrados.</pre>
        </div>
    </div>
</div>
