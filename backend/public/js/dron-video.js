/**
 * Decodificador de Video H.264 del DJI Tello vía WebCodecs
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * IMPORTANTE: REQUIERE VALIDACIÓN CON EL DRON REAL.
 *
 * Flujo:
 *  1. El plugin nativo agrupa los datagramas UDP del puerto 11111 (~30 ms) y los manda en Base64.
 *  2. Se acumulan los bytes y se separan las unidades NAL (Annex B, códigos 00 00 01 / 00 00 00 01).
 *  3. Las NAL se agrupan en "access units" (un cuadro completo): un cuadro nuevo empieza cuando
 *     llega un slice con first_mb_in_slice = 0, o un SPS/PPS/AUD.
 *  4. A cada cuadro clave (IDR) se le antepone el último SPS y PPS, como exige WebCodecs en modo Annex B.
 *  5. Si el decodificador falla, se recrea y se espera el próximo cuadro clave.
 */

// eslint-disable-next-line no-unused-vars
class DronVideoDecoder {
    constructor({ canvasEl, onFrameRendered = null, onError = null }) {
        if (!canvasEl) throw new Error('[DronVideo] Se requiere un elemento <canvas>.');
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.onFrameRendered = onFrameRendered;
        this.onError = onError;

        this.decoder = null;
        this.codec = null;
        this.sps = null;
        this.pps = null;
        this.buffer = new Uint8Array(0);
        this.nalsCuadro = [];        // NAL del cuadro que se está armando
        this.esperandoClave = true;  // no se decodifican deltas hasta tener un cuadro clave
        this.timestamp = 0;
        this.frameCount = 0;
        this.bytesRecibidos = 0;
        this.errores = 0;
        this.soportaWebCodecs = typeof window.VideoDecoder === 'function';

        if (!this.soportaWebCodecs) {
            this._dibujarMensaje('Este WebView no soporta WebCodecs: no se puede mostrar el video.');
        }
    }

    _dibujarMensaje(texto) {
        const w = this.canvas.width || 640;
        const h = this.canvas.height || 480;
        this.ctx.fillStyle = '#0a0e14';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(texto, w / 2, h / 2);
    }

    _crearDecoder() {
        try { if (this.decoder && this.decoder.state !== 'closed') this.decoder.close(); } catch (_) { /* nada */ }
        this.decoder = new VideoDecoder({
            output: (frame) => {
                if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
                    this.canvas.width = frame.displayWidth;
                    this.canvas.height = frame.displayHeight;
                }
                this.ctx.drawImage(frame, 0, 0);
                this.frameCount++;
                frame.close();
                if (this.onFrameRendered) this.onFrameRendered(this.frameCount);
            },
            error: (e) => {
                this.errores++;
                console.warn('[DronVideo] Error del decodificador, se reinicia:', e?.message || e);
                if (this.onError) this.onError(e);
                // Se recrea en el próximo SPS/PPS y se espera un cuadro clave
                this.decoder = null;
                this.codec = null;
                this.esperandoClave = true;
            },
        });
    }

    _configurarSiHaceFalta() {
        if (!this.sps || !this.pps || this.sps.length < 4) return;
        const hex = b => b.toString(16).padStart(2, '0');
        // avc1.PPCCLL: profile_idc, constraint flags y level_idc del SPS (bytes 1 a 3)
        const codec = `avc1.${hex(this.sps[1])}${hex(this.sps[2])}${hex(this.sps[3])}`;
        if (this.decoder && this.decoder.state === 'configured' && this.codec === codec) return;
        try {
            if (!this.decoder || this.decoder.state === 'closed') this._crearDecoder();
            this.decoder.configure({ codec, optimizeForLatency: true });
            this.codec = codec;
            this.esperandoClave = true;
        } catch (e) {
            this.errores++;
            console.warn('[DronVideo] No se pudo configurar el códec', codec, e?.message || e);
            if (this.onError) this.onError(e);
        }
    }

    /**
     * Procesa datos recibidos del plugin.
     * @param {string|Uint8Array|ArrayBuffer} payload Base64 o bytes crudos.
     */
    procesarChunk(payload) {
        if (!this.soportaWebCodecs || !payload) return;
        let bytes;
        if (typeof payload === 'string') {
            const bin = atob(payload);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else if (payload instanceof ArrayBuffer) {
            bytes = new Uint8Array(payload);
        } else {
            bytes = payload;
        }
        this.bytesRecibidos += bytes.length;

        const nuevo = new Uint8Array(this.buffer.length + bytes.length);
        nuevo.set(this.buffer);
        nuevo.set(bytes, this.buffer.length);
        this.buffer = nuevo;
        // Protección: si se acumula basura sin códigos de inicio, descartar
        if (this.buffer.length > 4 * 1024 * 1024) this.buffer = new Uint8Array(0);

        this._extraerNALs();
    }

    _extraerNALs() {
        const buf = this.buffer;
        const inicios = [];
        for (let i = 0; i + 2 < buf.length; i++) {
            if (buf[i] === 0 && buf[i + 1] === 0) {
                if (buf[i + 2] === 1) { inicios.push({ pos: i, len: 3 }); i += 2; }
                else if (buf[i + 2] === 0 && i + 3 < buf.length && buf[i + 3] === 1) { inicios.push({ pos: i, len: 4 }); i += 3; }
            }
        }
        if (inicios.length < 2) return; // la última NAL puede estar incompleta: esperar más datos

        for (let j = 0; j < inicios.length - 1; j++) {
            const nal = buf.slice(inicios[j].pos + inicios[j].len, inicios[j + 1].pos);
            if (nal.length) this._procesarNAL(nal);
        }
        this.buffer = buf.slice(inicios[inicios.length - 1].pos);
    }

    _procesarNAL(nal) {
        const tipo = nal[0] & 0x1f;
        const esSlice = tipo === 1 || tipo === 5;
        // first_mb_in_slice == 0 (primer bit después del encabezado en 1) => empieza un cuadro nuevo
        const empiezaCuadro = (esSlice && nal.length > 1 && (nal[1] & 0x80)) || tipo === 7 || tipo === 8 || tipo === 9;
        if (empiezaCuadro && this.nalsCuadro.some(n => ((n[0] & 0x1f) === 1 || (n[0] & 0x1f) === 5))) {
            this._decodificarCuadro();
        }
        if (tipo === 7) { this.sps = nal; this._configurarSiHaceFalta(); return; }
        if (tipo === 8) { this.pps = nal; this._configurarSiHaceFalta(); return; }
        if (esSlice) this.nalsCuadro.push(nal);
    }

    _decodificarCuadro() {
        const nals = this.nalsCuadro;
        this.nalsCuadro = [];
        if (!this.decoder || this.decoder.state !== 'configured') return;
        const esClave = nals.some(n => (n[0] & 0x1f) === 5);
        if (this.esperandoClave && !esClave) return;
        // Si el decodificador se atrasa, descartar deltas hasta el próximo cuadro clave
        if (!esClave && this.decoder.decodeQueueSize > 8) { this.esperandoClave = true; return; }

        const partes = esClave ? [this.sps, this.pps, ...nals] : nals;
        let total = 0;
        for (const p of partes) total += 4 + p.length;
        const datos = new Uint8Array(total);
        let off = 0;
        for (const p of partes) { datos.set([0, 0, 0, 1], off); datos.set(p, off + 4); off += 4 + p.length; }

        try {
            this.decoder.decode(new EncodedVideoChunk({ type: esClave ? 'key' : 'delta', timestamp: this.timestamp, data: datos }));
            this.timestamp += 33333; // ~30 cuadros por segundo, en microsegundos
            if (esClave) this.esperandoClave = false;
        } catch (e) {
            this.errores++;
            this.esperandoClave = true;
            if (this.onError) this.onError(e);
        }
    }

    destruir() {
        try { if (this.decoder && this.decoder.state !== 'closed') this.decoder.close(); } catch (_) { /* nada */ }
        this.decoder = null;
        this.buffer = new Uint8Array(0);
        this.nalsCuadro = [];
    }
}
