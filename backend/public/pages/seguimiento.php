<!-- Vista de Seguimiento con la cámara del celular — Grupo 5: Control de Sistemas y Dron -->
<div class="seguimiento-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Sin volar</p>
        <h2 class="titulo-grande">Seguimiento</h2>
        <p class="bajada">Probá el seguimiento con la cámara del celular. Con esta fuente nunca se manda nada al dron.</p>
    </header>

    <div class="rac-layout">
        <!-- 01 — Transmisión en vivo -->
        <section class="bloque">
            <p class="etiqueta">01 — Transmisión en vivo</p>
            <div id="seg-caja" class="caja-video">
                <video id="seg-video" playsinline muted></video>
                <canvas id="seg-canvas"></canvas>
                <div class="sobre-imagen">
                    <div class="sobre-imagen__grupo">
                        <span id="seg-chip-estado" class="chip" hidden></span>
                    </div>
                    <div class="sobre-imagen__grupo sobre-imagen__grupo--der">
                        <span id="seg-chip-fps" class="chip chip--dato" hidden></span>
                    </div>
                </div>
                <div id="seg-aviso" class="caja-video__aviso">Tocá Iniciar seguimiento para prender la cámara.</div>
                <div id="seg-cartel" class="cartel-ensayo"></div>
            </div>
            <p id="seg-estado" class="texto-xs texto-secundario"></p>

            <!-- Modo técnico: lo que ve el modelo, el detalle, la prueba en CPU y el registro -->
            <div class="solo-tecnico mt-sm">
                <ul class="ayuda-tecnica">
                    <li><b>Lo que ve el modelo:</b> la imagen que analiza el detector, con todo lo que encuentra y su puntaje (desde el 10 %), y las caras.</li>
                    <li><b>Probar este cuadro en CPU:</b> analiza la misma imagen con la placa de video (WebGL) y con el procesador (CPU) para ver si la placa analiza mal.</li>
                    <li><b>Copiar registro:</b> copia una tabla (CSV) con cada imagen analizada, para mandarla y revisarla.</li>
                </ul>
                <div class="detalle-seguimiento">
                    <figure class="miniatura-modelo">
                        <canvas id="seg-miniatura" width="160" height="120"></canvas>
                        <figcaption>Lo que ve el modelo</figcaption>
                    </figure>
                    <div id="seg-panel" class="detalle-seguimiento__panel" data-vacio="Iniciá el seguimiento para ver el detalle."></div>
                </div>
                <div class="par-botones mt-sm">
                    <button id="btn-seg-cpu" class="btn btn--secundario"><span class="ico ico--probeta" aria-hidden="true"></span> Probar este cuadro en CPU</button>
                    <button id="btn-seg-copiar" class="btn btn--secundario"><span class="ico ico--copiar" aria-hidden="true"></span> Copiar registro</button>
                </div>
                <pre id="seg-resultado-cpu" class="panel-seguimiento mt-sm" hidden></pre>
            </div>
        </section>

        <!-- 02 — Estado, confianza, historial y diagnóstico (los arma dron-seguimiento-ui.js) -->
        <section class="bloque">
            <p class="etiqueta">02 — Seguimiento</p>
            <div id="seg-tarjetas"></div>
        </section>
    </div>

    <!-- La foto de prueba del diagnóstico (dominio público: NASA) -->
    <img id="seg-foto-prueba" src="/img/prueba-persona.jpg" alt="" hidden>
</div>
