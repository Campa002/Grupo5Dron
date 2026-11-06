<!-- Vista de Sensores — Grupo 5: Control de Sistemas y Dron -->
<div class="sensores-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Sensores del celular</p>
        <h2 class="titulo-grande">Sensores</h2>
        <p class="bajada">Probá la inclinación y el seguimiento con la cámara del celular. No hace falta el dron.</p>
    </header>

    <!-- 01 — Inclinación en vivo (giroscopio o, si no hay, acelerómetro) -->
    <section class="bloque" id="panel-giro-vivo">
        <p class="etiqueta">01 — Inclinación</p>
        <h3 class="bloque__titulo">🧭 Inclinación en vivo</h3>
        <p class="bloque__texto">Inclinate con el celular y mirá cómo cambian los números: así se va a mover el dron.</p>
        <div class="datos-grandes">
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-beta">--</span>
                <span class="dato-grande__etq">Adelante / atrás</span>
            </div>
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-gamma">--</span>
                <span class="dato-grande__etq">Costados</span>
            </div>
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-alpha">--</span>
                <span class="dato-grande__etq">Giro (brújula)</span>
            </div>
        </div>
        <p id="giro-fuente" class="texto-sm mb-xs">Buscando el sensor de inclinación...</p>
        <p id="giro-estado" class="texto-xs texto-secundario mb-sm">Preparando el sensor...</p>
        <button id="btn-giro-vivo" class="btn btn--secundario" hidden><span class="ico ico--play" aria-hidden="true"></span> Ver lectura en vivo</button>
    </section>

    <!-- 02 — Seguimiento con la cámara (misma lógica que la cabina, en ensayo) -->
    <section class="bloque" id="panel-demo-seguimiento">
        <p class="etiqueta">02 — Seguimiento</p>
        <h3 class="bloque__titulo">Seguimiento con la cámara</h3>
        <p class="bloque__texto">
            Apuntá la cámara: la app busca lo que elijas y muestra qué haría el dron para seguirlo. Es un ensayo: no necesita el dron.
        </p>
        <div class="cab-opciones mb-sm">
            <label class="campo__label" for="demo-que-seguir" style="margin:0;">¿Qué seguir?</label>
            <select id="demo-que-seguir" class="cab-select"><option value="persona">Una persona</option></select>
        </div>
        <div id="demo-seg-caja" class="caja-video" hidden>
            <video id="demo-seg-video" playsinline muted></video>
            <canvas id="demo-seg-canvas"></canvas>
            <div class="sobre-imagen">
                <div class="sobre-imagen__grupo">
                    <span id="demo-seg-chip" class="chip" hidden></span>
                </div>
            </div>
            <div id="demo-seg-cartel" class="cartel-ensayo"></div>
        </div>
        <!-- Modo técnico: lo que ve el modelo, el detalle y la prueba en CPU -->
        <div class="solo-tecnico mb-sm">
            <ul class="ayuda-tecnica">
                <li><b>Lo que ve el modelo:</b> la imagen que analiza el detector, con todo lo que encuentra y su puntaje (desde el 10 %).</li>
                <li><b>Probar este cuadro en CPU:</b> analiza la misma imagen con la placa de video (WebGL) y con el procesador (CPU) para ver si la placa analiza mal.</li>
                <li><b>Copiar registro:</b> copia una tabla (CSV) con cada imagen analizada, para mandarla y revisarla.</li>
            </ul>
            <div class="detalle-seguimiento">
                <figure class="miniatura-modelo">
                    <canvas id="demo-seg-miniatura" width="160" height="120"></canvas>
                    <figcaption>Lo que ve el modelo</figcaption>
                </figure>
                <div id="demo-seg-panel" class="detalle-seguimiento__panel" data-vacio="Probá con la cámara para ver el detalle."></div>
            </div>
            <pre id="demo-resultado-cpu" class="panel-seguimiento mt-sm" hidden></pre>
        </div>
        <div class="par-botones">
            <button id="btn-demo-seg" class="btn btn--primario"><span class="ico ico--play" aria-hidden="true"></span> Probar con la cámara</button>
            <button id="btn-demo-cpu" class="btn btn--secundario solo-tecnico" hidden><span class="ico ico--probeta" aria-hidden="true"></span> Probar este cuadro en CPU</button>
            <button id="btn-demo-seg-copiar" class="btn btn--secundario solo-tecnico" hidden><span class="ico ico--copiar" aria-hidden="true"></span> Copiar registro</button>
        </div>
        <p id="demo-seg-estado" class="texto-xs texto-secundario mt-sm"></p>
    </section>

    <!-- Modo técnico: diagnóstico de los sensores -->
    <section class="bloque solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <h3 class="bloque__titulo">Diagnóstico de sensores</h3>
        <p class="bloque__texto">Escucha los sensores de verdad durante un segundo y medio (que el navegador tenga la función no alcanza).</p>
        <button id="btn-diagnosticar-sensores" class="btn btn--secundario mb-md">
            <span class="ico ico--buscar" aria-hidden="true"></span> Ejecutar diagnóstico
        </button>
        <div id="panel-resultados-sensores">
            <p class="texto-xs texto-secundario">Sin diagnosticar.</p>
        </div>
    </section>
</div>
