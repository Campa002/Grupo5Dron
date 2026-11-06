/**
 * Joystick Virtual Táctil — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Implementa un joystick circular multitouch con retorno automático al centro.
 * Se instancian dos: izquierdo (Throttle / Yaw) y derecho (Pitch / Roll).
 *
 * Uso:
 *   const j = new DronJoystick({ contenedor: document.getElementById('joy-izq'), etiqueta: 'THR/YAW' });
 *   j.onChange = ({ x, y }) => { ... };   // x,y en [-1, 1]
 *   j.destruir();
 */

// eslint-disable-next-line no-unused-vars
class DronJoystick {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.contenedor   - Elemento que recibirá el canvas del joystick.
     * @param {string}  [config.etiqueta]       - Texto que se dibuja en el joystick (ej. 'ALTURA / GIRO').
     * @param {number}  [config.tamano]         - Tamaño del canvas en px (por defecto 160).
     * @param {string}  [config.colorBase]      - Color del anillo exterior.
     * @param {string}  [config.colorPalo]      - Color de la palanca móvil.
     */
    constructor({
        contenedor,
        etiqueta = '',
        tamano = 160,
        colorBase = 'rgba(0, 102, 204, 0.25)',
        colorPalo = 'rgba(0, 153, 255, 0.9)',
    }) {
        if (!contenedor) throw new Error('[Joystick] Se requiere un elemento contenedor.');

        this.contenedor = contenedor;
        this.etiqueta = etiqueta;
        this.tamano = tamano;
        this.colorBase = colorBase;
        this.colorPalo = colorPalo;

        // Posición normalizada actual en [-1, 1]
        this.x = 0;
        this.y = 0;

        // Posición del palo en píxeles relativos al centro
        this._paloX = 0;
        this._paloY = 0;

        // Identificador del toque activo (multitouch)
        this._touchId = null;

        // Radio máximo que puede moverse el palo
        this._radio = (tamano / 2) * 0.60;

        // Callback de cambio de valor
        this.onChange = null;

        // Callback cuando se suelta (útil para detener motores)
        this.onRelease = null;

        this._crearCanvas();
        this._agregarEventos();
        this._dibujar();
    }

    // ----------------------------------------------------------------
    // Inicialización del canvas
    // ----------------------------------------------------------------

    _crearCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.tamano;
        this.canvas.height = this.tamano;
        this.canvas.style.cssText = `
            display: block;
            touch-action: none;
            user-select: none;
            cursor: pointer;
            border-radius: 50%;
        `;
        this.ctx = this.canvas.getContext('2d');
        this.contenedor.appendChild(this.canvas);
    }

    // ----------------------------------------------------------------
    // Gestión de eventos (táctil y mouse)
    // ----------------------------------------------------------------

    _agregarEventos() {
        this._boundTouchStart  = this._onTouchStart.bind(this);
        this._boundTouchMove   = this._onTouchMove.bind(this);
        this._boundTouchEnd    = this._onTouchEnd.bind(this);
        this._boundMouseDown   = this._onMouseDown.bind(this);
        this._boundMouseMove   = this._onMouseMove.bind(this);
        this._boundMouseUp     = this._onMouseUp.bind(this);

        // Eventos táctiles
        this.canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove',  this._boundTouchMove,  { passive: false });
        this.canvas.addEventListener('touchend',   this._boundTouchEnd,   { passive: false });
        this.canvas.addEventListener('touchcancel',this._boundTouchEnd,   { passive: false });

        // Eventos de mouse (para pruebas en escritorio)
        this.canvas.addEventListener('mousedown', this._boundMouseDown);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup',   this._boundMouseUp);
    }

    _coordenadasRelativas(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const escalaX = this.tamano / rect.width;
        const escalaY = this.tamano / rect.height;
        return {
            x: (clientX - rect.left) * escalaX - this.tamano / 2,
            y: (clientY - rect.top)  * escalaY - this.tamano / 2,
        };
    }

    _moverPalo(rx, ry) {
        const distancia = Math.sqrt(rx * rx + ry * ry);
        const ratio = Math.min(1, distancia / this._radio);
        const angulo = Math.atan2(ry, rx);

        this._paloX = Math.cos(angulo) * ratio * this._radio;
        this._paloY = Math.sin(angulo) * ratio * this._radio;

        this.x = parseFloat((this._paloX / this._radio).toFixed(3));
        this.y = parseFloat((-this._paloY / this._radio).toFixed(3)); // Y invertido: arriba = positivo

        this._dibujar();
        if (typeof this.onChange === 'function') {
            this.onChange({ x: this.x, y: this.y });
        }
    }

    _soltar() {
        this._touchId = null;
        this._mousePulsado = false;

        this._paloX = 0;
        this._paloY = 0;
        this.x = 0;
        this.y = 0;

        this._dibujar();
        if (typeof this.onChange === 'function') {
            this.onChange({ x: this.x, y: this.y });
        }
        if (typeof this.onRelease === 'function') {
            this.onRelease();
        }
    }

    // ---- Táctil ----

    _onTouchStart(e) {
        e.preventDefault();
        if (this._touchId !== null) return;
        const toque = e.changedTouches[0];
        this._touchId = toque.identifier;
        const { x, y } = this._coordenadasRelativas(toque.clientX, toque.clientY);
        this._moverPalo(x, y);
    }

    _onTouchMove(e) {
        e.preventDefault();
        const toque = Array.from(e.changedTouches).find(t => t.identifier === this._touchId);
        if (!toque) return;
        const { x, y } = this._coordenadasRelativas(toque.clientX, toque.clientY);
        this._moverPalo(x, y);
    }

    _onTouchEnd(e) {
        e.preventDefault();
        const toque = Array.from(e.changedTouches).find(t => t.identifier === this._touchId);
        if (!toque) return;
        this._soltar();
    }

    // ---- Mouse ----

    _onMouseDown(e) {
        this._mousePulsado = true;
        const { x, y } = this._coordenadasRelativas(e.clientX, e.clientY);
        this._moverPalo(x, y);
    }

    _onMouseMove(e) {
        if (!this._mousePulsado) return;
        const { x, y } = this._coordenadasRelativas(e.clientX, e.clientY);
        this._moverPalo(x, y);
    }

    _onMouseUp() {
        if (!this._mousePulsado) return;
        this._soltar();
    }

    // ----------------------------------------------------------------
    // Dibujo
    // ----------------------------------------------------------------

    _dibujar() {
        const ctx = this.ctx;
        const cx = this.tamano / 2;
        const cy = this.tamano / 2;
        const radioBase = (this.tamano / 2) - 4;
        const radioPalo = this._radio * 0.38;

        ctx.clearRect(0, 0, this.tamano, this.tamano);

        // Anillo exterior
        ctx.beginPath();
        ctx.arc(cx, cy, radioBase, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 153, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Área de fondo
        ctx.beginPath();
        ctx.arc(cx, cy, radioBase, 0, Math.PI * 2);
        ctx.fillStyle = this.colorBase;
        ctx.fill();

        // Líneas de referencia (cruces)
        ctx.strokeStyle = 'rgba(0, 153, 255, 0.20)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - radioBase + 8, cy);
        ctx.lineTo(cx + radioBase - 8, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - radioBase + 8);
        ctx.lineTo(cx, cy + radioBase - 8);
        ctx.stroke();

        // Círculo del palo (con gradiente)
        const paloX = cx + this._paloX;
        const paloY = cy + this._paloY;
        const gradiente = ctx.createRadialGradient(
            paloX - radioPalo * 0.3, paloY - radioPalo * 0.3, radioPalo * 0.1,
            paloX, paloY, radioPalo
        );
        gradiente.addColorStop(0, 'rgba(100, 200, 255, 1)');
        gradiente.addColorStop(1, this.colorPalo);

        ctx.beginPath();
        ctx.arc(paloX, paloY, radioPalo, 0, Math.PI * 2);
        ctx.fillStyle = gradiente;
        ctx.fill();

        // Borde del palo
        ctx.beginPath();
        ctx.arc(paloX, paloY, radioPalo, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Etiqueta
        if (this.etiqueta) {
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(180, 210, 255, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this.etiqueta, cx, this.tamano - 4);
        }
    }

    // ----------------------------------------------------------------
    // API pública
    // ----------------------------------------------------------------

    /**
     * Centra el joystick sin disparar eventos.
     */
    centrar() {
        this._paloX = 0;
        this._paloY = 0;
        this.x = 0;
        this.y = 0;
        this._dibujar();
    }

    /**
     * Elimina los listeners y el canvas del DOM.
     */
    destruir() {
        if (this._boundMouseMove) window.removeEventListener('mousemove', this._boundMouseMove);
        if (this._boundMouseUp)   window.removeEventListener('mouseup',   this._boundMouseUp);

        if (this.canvas) {
            if (this._boundTouchStart) this.canvas.removeEventListener('touchstart', this._boundTouchStart);
            if (this._boundTouchMove)  this.canvas.removeEventListener('touchmove',  this._boundTouchMove);
            if (this._boundTouchEnd)   {
                this.canvas.removeEventListener('touchend',    this._boundTouchEnd);
                this.canvas.removeEventListener('touchcancel', this._boundTouchEnd);
            }
            if (this._boundMouseDown)  this.canvas.removeEventListener('mousedown',  this._boundMouseDown);

            if (this.canvas.parentNode) {
                this.canvas.parentNode.removeChild(this.canvas);
            }
        }
    }
}

// ================================================================
// Botones de mantener apretado (mando por defecto de la cabina)
// ================================================================
//
// Mientras un botón está apretado, su eje vale la velocidad elegida; al soltarlo, ese eje vuelve a 0.
// Se pueden combinar (un dedo por botón): Adelante + Subir mueve los dos ejes a la vez; dos opuestos se anulan.
// Frena igual que al soltar si el dedo sale del botón, si se cancela el toque, si la app pasa a segundo
// plano o si la ventana pierde el foco.

/** Velocidad de cada nivel, en fracción del máximo del rc (0,2 = rc 20). */
const VELOCIDADES_MANDO = Object.freeze({ lenta: 0.2, normal: 0.35, rapida: 0.5 });

/** Eje (como en DroneAdapter.actualizarEjes) y sentido de cada botón. */
const EJES_BOTON = Object.freeze({
    adelante: ['fb', 1], atras: ['fb', -1],
    izquierda: ['lr', -1], derecha: ['lr', 1],
    subir: ['ud', 1], bajar: ['ud', -1],
    'girar-izq': ['yaw', -1], 'girar-der': ['yaw', 1],
});

/**
 * Ejes en [-1, 1] para los botones apretados (función pura).
 * @param {Iterable<string>} acciones nombres de EJES_BOTON
 * @param {number} velocidad fracción del máximo (0 a 1)
 * @returns {{lr:number, fb:number, ud:number, yaw:number}}
 */
function ejesDesdeBotones(acciones, velocidad) {
    const v = Math.max(0, Math.min(1, Number(velocidad) || 0));
    const ejes = { lr: 0, fb: 0, ud: 0, yaw: 0 };
    for (const accion of new Set(acciones)) {
        const def = EJES_BOTON[accion];
        if (def) ejes[def[0]] += def[1] * v;
    }
    for (const k of Object.keys(ejes)) ejes[k] = Math.max(-1, Math.min(1, ejes[k])) || 0; // sin -0
    return ejes;
}

// eslint-disable-next-line no-unused-vars
class DronBotonesMovimiento {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.contenedor  Contiene los botones con data-mover="adelante" (etc.).
     * @param {string} [config.velocidad]      'lenta' | 'normal' | 'rapida'
     * @param {Document} [config.documento]    Para las pruebas (por defecto, document).
     * @param {Window} [config.ventana]        Para las pruebas (por defecto, window).
     */
    constructor({ contenedor, velocidad = 'lenta', documento = document, ventana = window }) {
        if (!contenedor) throw new Error('[Botones] Se requiere un elemento contenedor.');
        this.contenedor = contenedor;
        this.documento = documento;
        this.ventana = ventana;
        this.velocidad = VELOCIDADES_MANDO[velocidad] ? velocidad : 'lenta';
        this.habilitado = true;
        /** (ejes, acciones) => void. Se llama en cada cambio, también al soltar todo. */
        this.onCambio = null;
        this._toques = new Map(); // pointerId -> {accion, boton}
        this._botones = Array.from(contenedor.querySelectorAll('[data-mover]'));

        this._alApretar = (e) => this._apretar(e);
        this._alMover = (e) => this._mover(e);
        this._alSoltar = (e) => this._soltar(e.pointerId);
        this._sinMenu = (e) => e.preventDefault();
        this._alOcultar = () => { if (this.documento.visibilityState === 'hidden') this.soltarTodo(); };
        this._alPerderFoco = () => this.soltarTodo();

        for (const b of this._botones) {
            b.addEventListener('pointerdown', this._alApretar);
            b.addEventListener('pointermove', this._alMover);
            for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, this._alSoltar);
            b.addEventListener('contextmenu', this._sinMenu);
        }
        this.documento.addEventListener('visibilitychange', this._alOcultar);
        this.ventana.addEventListener('blur', this._alPerderFoco);
        this.ventana.addEventListener('pagehide', this._alPerderFoco);
    }

    /** Acciones apretadas ahora (sin repetir). */
    acciones() {
        return [...new Set([...this._toques.values()].map(t => t.accion))];
    }

    _apretar(e) {
        const boton = e.currentTarget;
        if (!this.habilitado || boton.disabled || this._toques.has(e.pointerId)) return;
        e.preventDefault();
        try { boton.setPointerCapture?.(e.pointerId); } catch (_) { /* el toque ya terminó */ }
        this._toques.set(e.pointerId, { accion: boton.dataset.mover, boton });
        boton.classList.add('cab-mantener--activo');
        this._avisar();
    }

    /** Si el dedo sale del botón, frena igual que al soltar. */
    _mover(e) {
        const t = this._toques.get(e.pointerId);
        if (!t) return;
        const r = t.boton.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this._soltar(e.pointerId);
    }

    _soltar(pointerId) {
        const t = this._toques.get(pointerId);
        if (!t) return;
        this._toques.delete(pointerId);
        try { t.boton.releasePointerCapture?.(pointerId); } catch (_) { /* ya liberado */ }
        if (![...this._toques.values()].some(x => x.boton === t.boton)) t.boton.classList.remove('cab-mantener--activo');
        this._avisar();
    }

    /** Suelta todos los botones (todos los ejes del mando a 0) y avisa. */
    soltarTodo() {
        const habia = this._toques.size > 0;
        for (const id of [...this._toques.keys()]) {
            const t = this._toques.get(id);
            this._toques.delete(id);
            try { t.boton.releasePointerCapture?.(id); } catch (_) { /* ya liberado */ }
        }
        for (const b of this._botones) b.classList.remove('cab-mantener--activo');
        if (habia) this._avisar();
    }

    setVelocidad(nombre) {
        if (!VELOCIDADES_MANDO[nombre]) return;
        this.velocidad = nombre;
        if (this._toques.size) this._avisar();
    }

    /** Sin habilitar (por ejemplo, en tierra), los botones no se pueden apretar. */
    habilitar(si) {
        this.habilitado = !!si;
        if (!this.habilitado) this.soltarTodo();
        for (const b of this._botones) {
            if (b.dataset.bloqueado !== 'si') b.disabled = !this.habilitado;
        }
    }

    /** Deshabilita estos botones (por ejemplo, los de avance mientras manda la inclinación) y los suelta. */
    setBloqueados(lista = []) {
        const bloqueados = new Set(lista);
        for (const id of [...this._toques.keys()]) {
            if (bloqueados.has(this._toques.get(id).accion)) this._soltar(id);
        }
        for (const b of this._botones) {
            const bloq = bloqueados.has(b.dataset.mover);
            b.dataset.bloqueado = bloq ? 'si' : 'no';
            b.disabled = bloq || !this.habilitado;
        }
    }

    _avisar() {
        if (typeof this.onCambio !== 'function') return;
        const acciones = this.acciones();
        this.onCambio(ejesDesdeBotones(acciones, VELOCIDADES_MANDO[this.velocidad]), acciones);
    }

    destruir() {
        this.soltarTodo();
        this.onCambio = null;
        for (const b of this._botones) {
            b.removeEventListener('pointerdown', this._alApretar);
            b.removeEventListener('pointermove', this._alMover);
            for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.removeEventListener(ev, this._alSoltar);
            b.removeEventListener('contextmenu', this._sinMenu);
        }
        this.documento.removeEventListener('visibilitychange', this._alOcultar);
        this.ventana.removeEventListener('blur', this._alPerderFoco);
        this.ventana.removeEventListener('pagehide', this._alPerderFoco);
    }
}
DronBotonesMovimiento.VELOCIDADES = VELOCIDADES_MANDO;
DronBotonesMovimiento.EJES_BOTON = EJES_BOTON;
DronBotonesMovimiento.ejesDesdeBotones = ejesDesdeBotones;

// En Node (pruebas automáticas) se exporta como módulo; en el navegador quedan como globales
if (typeof module !== 'undefined' && module.exports) module.exports = { DronJoystick, DronBotonesMovimiento };
