<!-- Vista de Seguimiento con la cámara del celular — Grupo 5: Control de Sistemas y Dron -->
<div class="seguimiento-pagina">
    <header class="mb-4">
        <p class="etiqueta">Sin volar</p>
        <h1 class="h3 fw-bold text-uppercase">Seguimiento</h1>
        <p class="text-body-secondary mb-0">Probá el seguimiento con la cámara del celular. Con esta fuente nunca se manda nada al dron.</p>
    </header>

    <div class="rac-layout">
        <!-- 01 — Transmisión en vivo -->
        <section class="mb-4">
            <p class="etiqueta">01 — Transmisión en vivo</p>
            <div id="seg-caja" class="caja-video rounded border">
                <video id="seg-video" playsinline muted></video>
                <canvas id="seg-canvas"></canvas>
                <div class="sobre-imagen">
                    <div class="sobre-imagen__grupo">
                        <span id="seg-chip-estado" class="badge" hidden></span>
                    </div>
                    <div class="sobre-imagen__grupo sobre-imagen__grupo--der">
                        <span id="seg-chip-fps" class="badge" hidden></span>
                    </div>
                </div>
                <div id="seg-aviso" class="caja-video__aviso">Tocá Seguir persona o Seguir objeto para prender la cámara.</div>
                <div id="seg-cartel" class="cartel-ensayo"></div>
            </div>
            <p id="seg-estado" class="small text-body-secondary mt-2"></p>

            <!-- Modo técnico: lo que ve el modelo, el detalle, la prueba en CPU y el registro -->
            <div class="solo-tecnico mt-3">
                <ul class="small text-body-secondary ps-3">
                    <li><b>Lo que ve el modelo:</b> la imagen que analiza el detector, con todo lo que encuentra y su puntaje (desde el 10 %), y las caras.</li>
                    <li><b>Probar este cuadro en CPU:</b> analiza la misma imagen con la placa de video (WebGL) y con el procesador (CPU) para ver si la placa analiza mal.</li>
                    <li><b>Copiar registro:</b> copia una tabla (CSV) con cada imagen analizada, para mandarla y revisarla.</li>
                </ul>
                <div class="d-flex flex-wrap gap-3 align-items-start">
                    <figure class="miniatura-modelo m-0">
                        <canvas id="seg-miniatura" width="160" height="120"></canvas>
                        <figcaption class="small text-body-secondary mt-1">Lo que ve el modelo</figcaption>
                    </figure>
                    <div id="seg-panel" class="detalle-seguimiento__panel" data-vacio="Iniciá el seguimiento para ver el detalle."></div>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-2">
                    <button id="btn-seg-cpu" class="btn btn-outline-secondary">Probar este cuadro en CPU</button>
                    <button id="btn-seg-copiar" class="btn btn-outline-secondary">Copiar registro</button>
                </div>
                <pre id="seg-resultado-cpu" class="panel-seguimiento mt-2" hidden></pre>
            </div>
        </section>

        <!-- 02 — Estado, confianza, historial y diagnóstico (los arma dron-seguimiento-ui.js) -->
        <section class="mb-4">
            <p class="etiqueta">02 — Seguimiento</p>
            <div id="seg-tarjetas"></div>
        </section>
    </div>

    <!-- La foto de prueba del diagnóstico (dominio público: NASA) -->
    <img id="seg-foto-prueba" src="/img/prueba-persona.jpg" alt="" hidden>
</div>
