<div class="pagina-prueba-tello">
    <header class="mb-4">
        <p class="etiqueta">Antes de volar</p>
        <h1 class="h3 fw-bold text-uppercase">Prueba Tello</h1>
        <p class="text-body-secondary mb-0">
            Conectá el celular al WiFi del Tello (<code>TELLO-XXXXXX</code>) y dejá el dron apoyado en el piso.
            Esta prueba no lo hace despegar.
        </p>
    </header>

    <!-- Pasos numerados con un resultado claro -->
    <section class="mb-5">
        <p class="small text-body-secondary">Tocá "Probar conexión": la app revisa, una por una, las cosas que hacen falta para volar.</p>
        <ol class="list-group list-group-numbered mb-3">
            <li class="list-group-item d-flex justify-content-between align-items-start paso-prueba">
                <span class="ms-2 me-auto paso-prueba__nombre">App y WiFi del Tello</span><span class="small text-body-secondary text-end ms-3" id="paso-app">Sin probar</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-start paso-prueba">
                <span class="ms-2 me-auto paso-prueba__nombre">Respuesta del dron</span><span class="small text-body-secondary text-end ms-3" id="paso-command">Sin probar</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-start paso-prueba">
                <span class="ms-2 me-auto paso-prueba__nombre">Batería</span><span class="small text-body-secondary text-end ms-3" id="paso-bateria">Sin probar</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-start paso-prueba">
                <span class="ms-2 me-auto paso-prueba__nombre">Datos del dron</span><span class="small text-body-secondary text-end ms-3" id="paso-telemetria">Sin probar</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-start paso-prueba">
                <span class="ms-2 me-auto paso-prueba__nombre">Video</span><span class="small text-body-secondary text-end ms-3" id="paso-video">Sin probar</span>
            </li>
        </ol>
        <div id="resultado-prueba" class="alert alert-secondary" role="status">
            <span class="d-block fw-semibold">Sin probar</span>
            <span class="d-block small">Tocá "Probar conexión".</span>
        </div>
        <div class="d-flex flex-wrap gap-2">
            <button id="btn-probar-todo" class="btn btn-primary flex-fill">Probar conexión</button>
            <button id="btn-copiar-diagnostico" class="btn btn-outline-secondary flex-fill">Copiar informe</button>
        </div>
        <p class="small text-body-secondary mt-2 mb-1">"Copiar informe" copia el resultado para mandarlo si algo falla.</p>
        <p class="small text-body-secondary mb-0"><span id="tello-entorno-badge">Detectando...</span></p>
    </section>

    <!-- Modo técnico: destino, comandos sueltos, registro UDP, diagnóstico detallado y errores -->
    <div class="solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <ul class="small text-body-secondary ps-3">
            <li><b>Destino:</b> a qué dirección (IP) y puerto le habla la app. El Tello usa siempre 192.168.10.1 y el puerto 8889.</li>
            <li><b>Comandos de prueba:</b> manda una orden suelta del Tello (su "SDK") y muestra la respuesta, sin despegar.</li>
            <li><b>Respuestas UDP:</b> lo que se manda y lo que vuelve (UDP es el tipo de conexión que usa el Tello).</li>
            <li><b>Diagnóstico detallado:</b> el plugin (la parte de la app que usa el WiFi del dron), el video, los datos del dron (telemetría, por el puerto 8890) y los modelos.</li>
            <li><b>Archivos de los modelos:</b> revisa que lleguen completos los del detector y los de "Mis objetos".</li>
            <li><b>WebView:</b> el navegador interno del celular. <b>Errores:</b> los últimos 20 problemas, con la hora.</li>
        </ul>

        <section class="border-top pt-3 mb-4">
            <h2 class="h6 fw-bold text-uppercase">Destino</h2>
            <div class="row g-2">
                <div class="col-7">
                    <label class="form-label small" for="tello-ip-prueba">IP del Tello</label>
                    <input type="text" id="tello-ip-prueba" class="form-control" value="192.168.10.1" inputmode="decimal">
                </div>
                <div class="col-5">
                    <label class="form-label small" for="tello-puerto-prueba">Puerto</label>
                    <input type="number" id="tello-puerto-prueba" class="form-control" value="8889">
                </div>
            </div>
        </section>

        <section class="border-top pt-3 mb-4">
            <h2 class="h6 fw-bold text-uppercase">Comandos de prueba</h2>
            <div class="d-flex flex-wrap gap-2 mb-2">
                <button id="btn-tello-cmd" class="btn btn-outline-secondary">"command" (modo SDK)</button>
                <button id="btn-tello-bat" class="btn btn-outline-secondary">"battery?" (batería)</button>
                <button id="btn-tello-streamon" class="btn btn-outline-secondary">"streamon" (video)</button>
            </div>
            <div class="input-group">
                <input type="text" id="tello-cmd-custom" class="form-control" placeholder="Otro comando (ej: time?)" aria-label="Comando personalizado">
                <button id="btn-tello-custom" class="btn btn-outline-secondary">Enviar</button>
            </div>
        </section>

        <section class="border-top pt-3 mb-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h2 class="h6 fw-bold text-uppercase mb-0">Respuestas UDP</h2>
                <button id="btn-limpiar-log-tello" class="btn btn-sm btn-outline-secondary">Limpiar</button>
            </div>
            <pre id="tello-log-salida" class="consola-prueba bg-black border rounded p-2 small font-monospace text-success mb-0">Esperando comandos de prueba...</pre>
        </section>

        <section class="border-top pt-3 mb-4" id="panel-diagnostico-tello">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h2 class="h6 fw-bold text-uppercase mb-0">Diagnóstico detallado</h2>
                <button id="btn-ejecutar-diagnostico" class="btn btn-sm btn-outline-secondary">Diagnosticar</button>
            </div>
            <ul class="list-group mb-3 small">
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Plugin DronNative</span><strong id="diag-plugin-info">No detectado</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Red WiFi vinculada</span><strong id="diag-wifi-status">Pendiente</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Soporte de video (WebCodecs)</span><strong id="diag-webcodecs-status">Verificando...</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Respuestas ("command" / "battery?")</span><strong id="diag-latencia-cmd">Sin probar</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Datos del dron (telemetría, UDP 8890)</span><strong id="diag-telemetria-pps">0 pps</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Video (UDP 11111)</span><strong id="diag-video-bytes">0 bytes</strong></li>
                <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-body-secondary">Modelos (detector y Mis objetos)</span><strong id="diag-modelo">Sin verificar</strong></li>
            </ul>

            <div class="d-flex justify-content-between align-items-center mb-1 gap-2">
                <span class="small fw-semibold text-body-secondary">Archivos de los modelos (tamaño recibido y tipo)</span>
                <button id="btn-verificar-modelo" class="btn btn-sm btn-outline-secondary">Verificar modelos</button>
            </div>
            <pre id="diag-modelo-detalle" class="consola-prueba bg-black border rounded p-2 small font-monospace mb-3">Sin verificar.</pre>

            <span class="small text-body-secondary d-block">WebView / UserAgent</span>
            <code id="diag-user-agent" class="small d-block bg-black border rounded p-2 mb-3 text-break"></code>

            <div class="d-flex justify-content-between align-items-center mb-1 gap-2">
                <span class="small fw-semibold text-body-secondary">Últimos 20 errores</span>
                <button id="btn-limpiar-errores-diag" class="btn btn-sm btn-outline-secondary">Borrar</button>
            </div>
            <pre id="diag-errores-salida" class="consola-prueba bg-black border rounded p-2 small font-monospace text-danger mb-0">Sin errores registrados.</pre>
        </section>
    </div>

    <!-- Área de texto oculta para copiar el informe si el portapapeles falla -->
    <textarea id="diag-textarea-respaldo" aria-hidden="true" tabindex="-1" class="position-absolute opacity-0" style="left:-9999px;"></textarea>
</div>
