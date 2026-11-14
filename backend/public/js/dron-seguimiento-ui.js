/**
 * Pantalla de seguimiento estilo RAC — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Las tarjetas de la pantalla de seguimiento, iguales para las dos fuentes:
 *  - "Cámara del celular" (#/seguimiento): para probar sin dron; nunca se manda nada al dron.
 *  - "Video del dron" (cabina): con el interruptor "Control real (experimental)".
 * Tiene: Seguir persona / Seguir objeto (con la lista de objetos y "Agregar objeto propio") / Detener,
 * tarjeta de Estado, Análisis de confianza e Historial de detección (últimos 20, con Limpiar).
 * El comando calculado y el Diagnóstico de la detección son del modo técnico.
 * El video con los recuadros lo dibuja DronSeguimiento; acá solo se escucha el toque para elegir.
 *
 * Depende de: App (app.js) y DronSeguimiento (dron-seguimiento.js).
 */

// eslint-disable-next-line no-unused-vars
const DronPantallaSeguimiento = (() => {
    'use strict';

    const MAX_HISTORIAL = 20;

    /**
     * Pasa un toque sobre la caja del video a coordenadas de la imagen (0 a 1), teniendo en cuenta
     * los bordes que deja object-fit: contain. null si se tocó fuera de la imagen.
     */
    function puntoEnImagen(evento, caja, anchoImagen, altoImagen) {
        const r = caja.getBoundingClientRect();
        if (!r.width || !r.height || !anchoImagen || !altoImagen) return null;
        const escala = Math.min(r.width / anchoImagen, r.height / altoImagen);
        const w = anchoImagen * escala;
        const h = altoImagen * escala;
        const x = (evento.clientX - r.left - (r.width - w) / 2) / w;
        const y = (evento.clientY - r.top - (r.height - h) / 2) / h;
        return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
    }

    const hora = () => new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const pc = v => `${Math.round((v || 0) * 100)} %`;

    class Pantalla {
        /**
         * @param {Object} o
         * @param {HTMLElement} o.contenedor donde van las tarjetas
         * @param {HTMLElement} o.cajaVideo caja que contiene el video y el lienzo de los recuadros (para tocar)
         * @param {HTMLElement} [o.chipFps] insignia de FPS sobre el video
         * @param {'camara'|'dron'} o.fuente
         * @param {Function} o.onIniciar (meta) => Promise|void; meta: {tipo:'persona'} | {tipo:'clase', clase} | {tipo:'mio', id}
         * @param {Function} o.onDetener () => void
         * @param {Function} o.onTocar (x, y) => {ok:boolean, nombre?:string}
         * @param {Function} o.onDiagnosticar () => Promise<{items:Array, conclusion:string}>
         * @param {Function} [o.onControlReal] (activar) => Promise<boolean>: solo con el dron
         * @param {Function} [o.fuenteTamano] () => [ancho, alto] de la imagen
         */
        constructor(o) {
            this.o = o;
            this.activo = false;
            this.controlReal = false;
            this.historial = [];
            this._ultimo = 0;
            this._diagnostico = null;
            this._metaPedida = null;
            this._render();
            this.setObjetos([]);
            this._eventos();
        }

        _q(sel) { return this.o.contenedor.querySelector(sel); }

        _render() {
            const dron = this.o.fuente === 'dron';
            this.o.contenedor.innerHTML = `
                <div class="rac d-grid gap-3">
                    ${dron ? '' : '<p class="small text-body-secondary mb-0">Fuente: cámara del celular. Con esta fuente nunca se manda nada al dron.</p>'}
                    <div class="row g-2">
                        <div class="col-6"><button class="btn btn-primary btn-lg w-100 h-100" data-rac="seguir-persona" aria-pressed="false">Seguir persona</button></div>
                        <div class="col-6"><button class="btn btn-primary btn-lg w-100 h-100" data-rac="seguir-objeto" aria-expanded="false">Seguir objeto</button></div>
                    </div>
                    <div class="border rounded p-3" data-rac="panel-objeto" hidden>
                        <label class="form-label small text-body-secondary mb-1" for="rac-objeto-${dron ? 'dron' : 'camara'}">¿Qué objeto?</label>
                        <select class="form-select" id="rac-objeto-${dron ? 'dron' : 'camara'}" data-rac="objeto"></select>
                        <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
                            <button class="btn btn-primary flex-fill" data-rac="seguir-este">Seguir este objeto</button>
                            <a href="#/objetos" class="btn btn-sm btn-link" data-rac="agregar-objeto">Agregar objeto propio</a>
                        </div>
                    </div>
                    <button class="btn btn-outline-secondary" data-rac="detener" disabled>Detener</button>
                    <p class="form-text mt-0">También podés tocar un recuadro del video para elegir qué seguir.</p>
                    ${dron ? `
                    <div class="border border-warning-subtle rounded p-3 rac-real">
                        <div class="form-check form-switch m-0">
                            <input class="form-check-input" type="checkbox" role="switch" id="rac-control-real" data-rac="control-real">
                            <label class="form-check-label fw-semibold" for="rac-control-real">Control real (experimental)</label>
                        </div>
                        <div class="form-text">Apagado, solo muestra lo que haría (ensayo). Prendido, el dron sigue de verdad, despacio.
                            Cualquier botón de movimiento, Frenar o EMERGENCIA lo apagan.</div>
                    </div>` : ''}
                    <div class="border rounded p-3 rac-estado" data-color="">
                        <p class="etiqueta">Estado</p>
                        <h2 class="h5 fw-bold text-uppercase mb-1 rac-estado__titulo" data-rac="estado-titulo">Seguimiento detenido</h2>
                        <p class="small text-body-secondary mb-2" data-rac="estado-texto">Tocá Seguir persona o Seguir objeto.</p>
                        <p class="small fw-semibold text-primary-emphasis mb-1" data-rac="modo">${dron ? 'Modo ensayo: no se manda nada al dron.' : 'Cámara del celular: no se manda nada al dron.'}</p>
                        <p class="small font-monospace mb-0 solo-tecnico" data-rac="comando">Comando: rc 0 0 0 0</p>
                    </div>
                    <div class="border rounded p-3">
                        <p class="etiqueta">Análisis de confianza</p>
                        <div class="d-grid gap-2" data-rac="barras"><p class="small text-body-secondary mb-0">Sin detecciones todavía.</p></div>
                    </div>
                    <div class="border rounded p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <p class="etiqueta mb-0">Historial de detección</p>
                            <button class="btn btn-sm btn-outline-secondary" data-rac="limpiar">Limpiar</button>
                        </div>
                        <ol class="list-group list-group-flush rac-historial" data-rac="historial"></ol>
                        <p class="small text-body-secondary mb-0" data-rac="historial-vacio">Todavía no hay nada.</p>
                    </div>
                    <div class="border-top pt-3 solo-tecnico">
                        <p class="etiqueta">Diagnóstico</p>
                        <p class="small text-body-secondary">Si queda siempre "Buscando", tocá Diagnosticar: revisa la imagen, la placa de video y el detector, y dice qué falla.</p>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-outline-secondary" data-rac="diagnosticar">Diagnosticar</button>
                            <button class="btn btn-outline-secondary" data-rac="copiar-diagnostico" hidden>Copiar diagnóstico</button>
                        </div>
                        <ul class="list-unstyled d-grid gap-2 small mt-3 mb-0" data-rac="diag-lista"></ul>
                        <p class="alert alert-info small mt-3 mb-0 rac-diag-conclusion" data-rac="diag-conclusion" hidden></p>
                    </div>
                </div>`;
        }

        _eventos() {
            this._q('[data-rac="seguir-persona"]').addEventListener('click', () => this._pedir({ tipo: 'persona' }));
            this._q('[data-rac="seguir-objeto"]').addEventListener('click', () => this._mostrarPanelObjeto(this._q('[data-rac="panel-objeto"]').hidden));
            this._q('[data-rac="seguir-este"]').addEventListener('click', () => {
                const v = this._q('[data-rac="objeto"]').value || '';
                const [tipo, ...resto] = v.split(':');
                const valor = resto.join(':');
                if (!valor) return;
                this._pedir(tipo === 'mio' ? { tipo: 'mio', id: valor } : { tipo: 'clase', clase: valor });
            });
            this._q('[data-rac="detener"]').addEventListener('click', () => this.o.onDetener());
            this._q('[data-rac="limpiar"]').addEventListener('click', () => this.limpiarHistorial());
            this._q('[data-rac="diagnosticar"]').addEventListener('click', () => this._diagnosticar());
            this._q('[data-rac="copiar-diagnostico"]').addEventListener('click', () => this._copiarDiagnostico());
            const sw = this._q('[data-rac="control-real"]');
            sw?.addEventListener('change', async () => {
                sw.disabled = true;
                let quedo = false;
                try {
                    quedo = !!(await this.o.onControlReal?.(sw.checked));
                } finally {
                    sw.disabled = false;
                }
                // Si no se pudo activar (o se canceló la confirmación), vuelve a apagado
                this.setControlReal(sw.checked && quedo);
            });
            this._onToque = (e) => {
                if (!this.activo) return;
                const [w, h] = this.o.fuenteTamano?.() || [0, 0];
                const p = puntoEnImagen(e, this.o.cajaVideo, w, h);
                if (!p) return;
                const r = this.o.onTocar(p.x, p.y);
                if (r?.ok) {
                    this.agregarHistorial('advertencia', `Elegido: ${r.nombre}`, '');
                    App.mostrarToast(`Elegido: ${r.nombre}. Confirmando...`, 'info');
                }
            };
            this.o.cajaVideo?.addEventListener('click', this._onToque);
        }

        /** Tocaron "Seguir persona" o "Seguir este objeto": se anota qué se pidió y se avisa a quien usa la pantalla. */
        _pedir(meta) {
            this._metaPedida = meta;
            this.o.onIniciar(meta);
        }

        _mostrarPanelObjeto(visible) {
            this._q('[data-rac="panel-objeto"]').hidden = !visible;
            this._q('[data-rac="seguir-objeto"]').setAttribute('aria-expanded', visible ? 'true' : 'false');
        }

        /**
         * Llena la lista de "Seguir objeto": primero los objetos propios ("Mis objetos") y después
         * los que reconoce la app (COCO-SSD, en español).
         * @param {Array<{id:string, nombre:string}>} objetos
         */
        setObjetos(objetos) {
            const sel = this._q('[data-rac="objeto"]');
            const anterior = sel.value;
            const grupo = (etiqueta, opciones) => {
                const g = document.createElement('optgroup');
                g.label = etiqueta;
                g.append(...opciones);
                return g;
            };
            const grupos = [];
            if (objetos.length) grupos.push(grupo('Mis objetos', objetos.map(o => new Option(o.nombre, `mio:${o.id}`))));
            grupos.push(grupo('Objetos que reconoce la app', DronSeguimiento.clasesParaSeguir().map(c => new Option(c.nombre, `clase:${c.clase}`))));
            sel.replaceChildren(...grupos);
            if (anterior && [...sel.options].some(o => o.value === anterior)) sel.value = anterior;
        }

        /** Marca qué botón corresponde a lo que se sigue (por ejemplo, si se arrancó desde otro lado). */
        marcarObjetivo(meta) {
            this._metaPedida = meta;
            this._marcarBotones();
        }

        _marcarBotones() {
            const meta = this.activo ? this._metaPedida : null;
            const persona = this._q('[data-rac="seguir-persona"]');
            const objeto = this._q('[data-rac="seguir-objeto"]');
            persona.setAttribute('aria-pressed', meta?.tipo === 'persona' ? 'true' : 'false');
            persona.classList.toggle('active', meta?.tipo === 'persona');
            objeto.classList.toggle('active', !!meta && meta.tipo !== 'persona');
        }

        /** Iniciado o detenido: habilita los botones. */
        setActivo(activo) {
            this.activo = activo;
            this._q('[data-rac="detener"]').disabled = !activo;
            if (this.o.chipFps) this.o.chipFps.hidden = !activo;
            this._marcarBotones();
            if (!activo) {
                this._pintarEstado({ titulo: 'Seguimiento detenido', texto: 'Tocá Seguir persona o Seguir objeto.', color: '' });
                this._q('[data-rac="barras"]').innerHTML = '<p class="small text-body-secondary mb-0">Sin detecciones todavía.</p>';
                this._q('[data-rac="comando"]').textContent = 'Comando: rc 0 0 0 0';
            }
        }

        /** Mientras carga el modelo: los botones de seguir quedan apagados y el estado dice que está preparando. */
        setCargando(cargando) {
            for (const r of ['seguir-persona', 'seguir-objeto', 'seguir-este']) this._q(`[data-rac="${r}"]`).disabled = cargando;
            if (cargando) this._pintarEstado({ titulo: 'Preparando...', texto: 'Cargando el detector (la primera vez tarda unos segundos).', color: '' });
            else if (!this.activo) this.setActivo(false);
        }

        /** Sincroniza el interruptor (por ejemplo, si la cabina volvió a ensayo sola). */
        setControlReal(activo) {
            this.controlReal = !!activo;
            const sw = this._q('[data-rac="control-real"]');
            if (sw) sw.checked = this.controlReal;
            const modo = this._q('[data-rac="modo"]');
            modo.textContent = this.controlReal ? 'CONTROL REAL: el dron sigue de verdad (despacio).'
                : (this.o.fuente === 'dron' ? 'Modo ensayo: no se manda nada al dron.' : 'Cámara del celular: no se manda nada al dron.');
            modo.classList.toggle('rac-modo--real', this.controlReal);
        }

        _pintarEstado(e) {
            const tarjeta = this._q('.rac-estado');
            tarjeta.dataset.color = e.color || '';
            this._q('[data-rac="estado-titulo"]').textContent = e.titulo;
            this._q('[data-rac="estado-texto"]').textContent = e.texto;
        }

        /**
         * Actualiza las tarjetas (hasta 5 veces por segundo).
         * @param {Object} info de DronSeguimiento.info()
         * @param {string} textoComando lo que se manda (o "no se manda nada")
         */
        actualizar(info, textoComando) {
            const ahora = performance.now();
            if (ahora - this._ultimo < 200) return;
            this._ultimo = ahora;
            this._pintarEstado(DronSeguimiento.estadoTarjeta(info));
            this._q('[data-rac="comando"]').textContent = textoComando;
            if (this.o.chipFps) this.o.chipFps.textContent = `${info.fps || 0} FPS`;
            const barras = this._q('[data-rac="barras"]');
            const lista = info.analisis || [];
            barras.replaceChildren(...(lista.length ? lista.map(b => this._barra(b)) : [Object.assign(document.createElement('p'), { className: 'small text-body-secondary mb-0', textContent: 'No ve nada todavía.' })]));
        }

        _barra(b) {
            const fila = document.createElement('div');
            fila.className = b.objetivo ? 'fw-semibold' : '';
            const etq = document.createElement('div');
            etq.className = 'd-flex justify-content-between small mb-1';
            const nombre = document.createElement('span');
            nombre.textContent = b.tipo === 'cara' ? `${b.nombre} (cara)` : b.nombre;
            const valor = document.createElement('span');
            valor.textContent = pc(b.conf);
            etq.append(nombre, valor);
            const pista = document.createElement('div');
            pista.className = 'progress';
            pista.style.height = '0.5rem';
            const relleno = document.createElement('div');
            relleno.className = 'progress-bar';
            relleno.style.width = `${Math.round(Math.max(0, Math.min(1, b.conf)) * 100)}%`;
            relleno.dataset.cuenta = b.conf >= 0.75 ? 'si' : 'no';
            pista.appendChild(relleno);
            fila.append(etq, pista);
            return fila;
        }

        /** Agrega una línea al historial (lo más nuevo arriba; como mucho 20). */
        agregarHistorial(color, texto, porcentaje) {
            this.historial.unshift({ color, texto, porcentaje, hora: hora() });
            if (this.historial.length > MAX_HISTORIAL) this.historial.length = MAX_HISTORIAL;
            this._pintarHistorial();
        }

        /** Cambió el estado del selector: se anota en el historial lo importante. */
        cambioDeEstado(nuevo, anterior, info) {
            if (nuevo === 'siguiendo' && anterior !== 'perdiendo') {
                this.agregarHistorial('exito', `Siguiendo: ${info.nombre}${info.objetivo?.tipo === 'cara' ? ' (cara)' : ''}`, pc(info.objetivo?.conf));
            } else if (nuevo === 'perdido') {
                this.agregarHistorial('error', 'Objetivo perdido', '');
            }
        }

        limpiarHistorial() {
            this.historial = [];
            this._pintarHistorial();
        }

        _pintarHistorial() {
            const ol = this._q('[data-rac="historial"]');
            ol.replaceChildren(...this.historial.map(h => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex gap-2 align-items-center px-0 small';
                const estado = document.createElement('span');
                estado.className = 'flex-grow-1 text-truncate';
                App.textoConPunto(estado, h.color, h.texto);
                const pct = document.createElement('span');
                pct.className = 'text-body-secondary';
                pct.textContent = h.porcentaje;
                const t = document.createElement('time');
                t.className = 'text-body-secondary';
                t.textContent = h.hora;
                li.append(estado, pct, t);
                return li;
            }));
            this._q('[data-rac="historial-vacio"]').hidden = this.historial.length > 0;
        }

        async _diagnosticar() {
            const btn = this._q('[data-rac="diagnosticar"]');
            const lista = this._q('[data-rac="diag-lista"]');
            const concl = this._q('[data-rac="diag-conclusion"]');
            btn.disabled = true;
            App.textoConIcono(btn, '', 'Diagnosticando...');
            lista.replaceChildren();
            concl.hidden = false;
            concl.textContent = 'Revisando la imagen, la placa de video y el detector (puede tardar unos segundos)...';
            let r;
            try {
                r = await this.o.onDiagnosticar();
            } catch (e) {
                r = { items: [], conclusion: `El diagnóstico falló: ${e?.message || e}` };
            }
            this._diagnostico = r;
            lista.replaceChildren(...r.items.map(i => {
                const li = document.createElement('li');
                const titulo = document.createElement('b');
                App.textoConPunto(titulo, i.ok === false ? 'error' : i.ok ? 'exito' : 'advertencia', i.titulo);
                const det = document.createElement('span');
                det.className = 'd-block text-body-secondary';
                det.textContent = i.detalle;
                li.append(titulo, det);
                return li;
            }));
            concl.textContent = r.conclusion;
            concl.dataset.ok = r.items.every(i => i.ok !== false) ? 'si' : 'no';
            this._q('[data-rac="copiar-diagnostico"]').hidden = false;
            btn.disabled = false;
            App.textoConIcono(btn, '', 'Diagnosticar');
        }

        async _copiarDiagnostico() {
            const r = this._diagnostico;
            if (!r) return;
            const texto = [`Diagnóstico de la detección (${this.o.fuente === 'dron' ? 'video del dron' : 'cámara del celular'}, ${new Date().toLocaleString('es-AR')})`,
                ...r.items.map(i => `${i.ok === false ? 'FALLA' : 'ok'} · ${i.titulo}: ${i.detalle}`), `Conclusión: ${r.conclusion}`].join('\n');
            const ok = await DronSeguimiento.copiarTexto(texto);
            App.mostrarToast(ok ? 'Diagnóstico copiado.' : 'No se pudo copiar.', ok ? 'exito' : 'advertencia');
        }

        destruir() {
            this.o.cajaVideo?.removeEventListener('click', this._onToque);
            this.o.contenedor.innerHTML = '';
        }
    }

    return { Pantalla, puntoEnImagen };
})();
