<div class="pagina-prueba-tello">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Antes de volar</p>
        <h2 class="titulo-grande">Prueba Tello</h2>
        <p class="bajada">
            Conectá el celular al WiFi del Tello (<code>TELLO-XXXXXX</code>) y dejá el dron apoyado en el piso.
            Esta prueba no lo hace despegar.
        </p>
    </header>

    <!-- Pasos numerados con un resultado claro -->
    <section class="bloque">
        <ol class="pasos-prueba">
            <li class="paso-prueba">
                <span class="paso-prueba__num" aria-hidden="true">01</span>
                <div><span class="paso-prueba__nombre">App y WiFi del Tello</span><span class="paso-prueba__estado" id="paso-app">Sin probar</span></div>
            </li>
            <li class="paso-prueba">
                <span class="paso-prueba__num" aria-hidden="true">02</span>
                <div><span class="paso-prueba__nombre">Respuesta del dron</span><span class="paso-prueba__estado" id="paso-command">Sin probar</span></div>
            </li>
            <li class="paso-prueba">
                <span class="paso-prueba__num" aria-hidden="true">03</span>
                <div><span class="paso-prueba__nombre">Batería</span><span class="paso-prueba__estado" id="paso-bateria">Sin probar</span></div>
            </li>
            <li class="paso-prueba">
                <span class="paso-prueba__num" aria-hidden="true">04</span>
                <div><span class="paso-prueba__nombre">Telemetría</span><span class="paso-prueba__estado" id="paso-telemetria">Sin probar</span></div>
            </li>
            <li class="paso-prueba">
                <span class="paso-prueba__num" aria-hidden="true">05</span>
                <div><span class="paso-prueba__nombre">Video</span><span class="paso-prueba__estado" id="paso-video">Sin probar</span></div>
            </li>
        </ol>
        <div id="resultado-prueba" class="resultado-prueba" role="status">
            <span class="resultado-prueba__titulo">Sin probar</span>
            <span class="resultado-prueba__detalle">Tocá "Probar conexión".</span>
        </div>
        <div class="par-botones">
            <button id="btn-probar-todo" class="btn btn--primario"><span class="ico ico--play" aria-hidden="true"></span> Probar conexión</button>
            <button id="btn-copiar-diagnostico" class="btn btn--secundario"><span class="ico ico--copiar" aria-hidden="true"></span> Copiar informe</button>
        </div>
        <p class="texto-xs texto-secundario mt-sm"><span id="tello-entorno-badge">Detectando...</span></p>
    </section>

    <!-- Modo técnico: destino, comandos sueltos, registro UDP, diagnóstico detallado y errores -->
    <div class="solo-tecnico">
        <p class="etiqueta">Modo técnico</p>

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
            </div>
        </div>

        <div class="tarjeta mb-md">
            <h3 class="tarjeta__titulo">Comandos de prueba</h3>
            <div class="grilla-prueba-tello mb-md">
                <button id="btn-tello-cmd" class="btn btn--secundario">"command" (modo SDK)</button>
                <button id="btn-tello-bat" class="btn btn--secundario">"battery?" (batería)</button>
                <button id="btn-tello-streamon" class="btn btn--secundario">"streamon" (video)</button>
            </div>
            <div class="flex gap-sm items-center">
                <input type="text" id="tello-cmd-custom" class="campo__input" placeholder="Otro comando (ej: time?)" style="flex:1; min-width:0;" aria-label="Comando personalizado">
                <button id="btn-tello-custom" class="btn btn--secundario">Enviar</button>
            </div>
        </div>

        <div class="tarjeta mb-md">
            <div class="flex justify-between items-center mb-sm gap-sm">
                <h3 class="tarjeta__titulo" style="margin:0;">Respuestas UDP</h3>
                <button id="btn-limpiar-log-tello" class="btn btn--secundario">Limpiar</button>
            </div>
            <pre id="tello-log-salida" class="consola-prueba">Esperando comandos de prueba...</pre>
        </div>

        <div class="tarjeta mb-md" id="panel-diagnostico-tello">
            <div class="flex justify-between items-center mb-sm flex-wrap gap-sm">
                <h3 class="tarjeta__titulo" style="margin:0;">Diagnóstico detallado</h3>
                <button id="btn-ejecutar-diagnostico" class="btn btn--secundario"><span class="ico ico--recargar" aria-hidden="true"></span> Diagnosticar</button>
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

            <div class="mt-md">
                <div class="flex justify-between items-center mb-xs gap-sm">
                    <span class="texto-sm font-semibold texto-secundario">Últimos 20 errores</span>
                    <button id="btn-limpiar-errores-diag" class="btn btn--secundario">Borrar</button>
                </div>
                <pre id="diag-errores-salida" class="consola-prueba consola-prueba--errores">Sin errores registrados.</pre>
            </div>
        </div>
    </div>

    <!-- Área de texto oculta para copiar el informe si el portapapeles falla -->
    <textarea id="diag-textarea-respaldo" aria-hidden="true" tabindex="-1" style="position:absolute; left:-9999px; opacity:0;"></textarea>
</div>
