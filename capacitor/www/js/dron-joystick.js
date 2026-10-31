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
    'use strict';

    /**
     * @param {Object} config
     * @param {HTMLElement} config.contenedor   - Elemento que recibirá el canvas del joystick.
     * @param {string}  [config.etiqueta]       - Texto que se dibuja en el joystick (ej. 'THR/YAW').
     * @param {boolean} [config.throttleFijo]   - Si es true, el eje Y no vuelve al centro (modo throttle acumulativo).
     * @param {number}  [config.tamano]         - Tamaño del canvas en px (por defecto 160).
     * @param {string}  [config.colorBase]      - Color del anillo exterior.
     * @param {string}  [config.colorPalo]      - Color de la palanca móvil.
     */
    constructor({
        contenedor,
        etiqueta = '',
        throttleFijo = false,
        tamano = 160,
        colorBase = 'rgba(0, 102, 204, 0.25)',
        colorPalo = 'rgba(0, 153, 255, 0.9)',
    }) {
        if (!contenedor) throw new Error('[Joystick] Se requiere un elemento contenedor.');

        this.contenedor = contenedor;
        this.etiqueta = etiqueta;
        this.throttleFijo = throttleFijo;
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

        if (this.throttleFijo) {
            // En modo throttle fijo, sólo centra el eje X
            this._paloX = 0;
            this.x = 0;
        } else {
            this._paloX = 0;
            this._paloY = 0;
            this.x = 0;
            this.y = 0;
        }

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
            ctx.font = `bold 10px Inter, sans-serif`;
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
     * Devuelve los valores actuales normalizados.
     * @returns {{ x: number, y: number }}
     */
    obtenerValores() {
        return { x: this.x, y: this.y };
    }

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
