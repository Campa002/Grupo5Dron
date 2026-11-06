<!-- Vista de Sensores — Grupo 5: Control de Sistemas y Dron -->
<div class="sensores-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Sensores del celular</p>
        <h2 class="titulo-grande">Sensores</h2>
        <p class="bajada">Probá la inclinación y la detección de personas antes de volar. No hace falta el dron.</p>
    </header>

    <!-- 01 — Inclinación en vivo (giroscopio o, si no hay, acelerómetro) -->
    <section class="bloque" id="panel-giro-vivo">
        <p class="etiqueta">01 — Inclinación</p>
        <h3 class="bloque__titulo">🧭 Inclinación en vivo</h3>
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

    <!-- 02 — Demo de detección con la cámara (misma lógica que la cabina, en ensayo) -->
    <section class="bloque" id="panel-demo-seguimiento">
        <p class="etiqueta">02 — Detección</p>
        <h3 class="bloque__titulo">Detección con la cámara</h3>
        <p class="bloque__texto">
            Detecta a la persona y calcula lo que haría el dron, en ensayo: muestra el comando, no lo envía.
        </p>
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
        <!-- Modo técnico: lo que ve el modelo y el detalle -->
        <div class="detalle-seguimiento solo-tecnico mb-sm">
            <figure class="miniatura-modelo">
                <canvas id="demo-seg-miniatura" width="160" height="120"></canvas>
                <figcaption>Lo que ve el modelo</figcaption>
            </figure>
            <div id="demo-seg-panel" class="detalle-seguimiento__panel" data-vacio="Probá con la cámara para ver el detalle."></div>
        </div>
        <div class="par-botones">
            <button id="btn-demo-seg" class="btn btn--primario"><span class="ico ico--play" aria-hidden="true"></span> Probar con la cámara</button>
            <button id="btn-demo-seg-copiar" class="btn btn--secundario solo-tecnico" hidden><span class="ico ico--copiar" aria-hidden="true"></span> Copiar registro</button>
        </div>
        <p id="demo-seg-estado" class="texto-xs texto-secundario mt-sm"></p>
    </section>

    <!-- Modo técnico: diagnóstico de los sensores -->
    <section class="bloque solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <h3 class="bloque__titulo">Diagnóstico de sensores</h3>
        <p class="bloque__texto">Escucha los sensores de verdad: que el navegador tenga la función no alcanza.</p>
        <button id="btn-diagnosticar-sensores" class="btn btn--secundario mb-md">
            <span class="ico ico--buscar" aria-hidden="true"></span> Ejecutar diagnóstico
        </button>
        <div id="panel-resultados-sensores">
            <p class="texto-xs texto-secundario">Sin diagnosticar.</p>
        </div>
    </section>
</div>
