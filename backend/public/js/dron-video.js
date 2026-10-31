/**
 * Decodificador de Video H.264 para DJI Ryze Tello vía WebCodecs
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * ⚠ REQUIERE VALIDACIÓN CON EL DRON REAL.
 *
 * Arquitectura:
 *  1. Recibe datagramas UDP (puerto 11111) emitidos en Base64 por el plugin nativo Capacitor 'DronNative'.
 *  2. Acumula bytes y reensambla unidades NAL (Network Abstraction Layer) H.264 (Annex B).
 *  3. Extrae SPS/PPS para configurar el códec avc1.42001f (Baseline).
 *  4. Alimenta VideoDecoder (WebCodecs API) y dibuja cada VideoFrame directamente sobre el <canvas>.
 *  5. Si WebCodecs no está soportado en el WebView, muestra el aviso y propone fallback nativo MediaCodec.
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
        this.sps = null;
        this.pps = null;
        this.buffer = new Uint8Array(0);
        this.configurado = false;
        this.soportaWebCodecs = typeof window.VideoDecoder === 'function';
        this.frameCount = 0;

        if (!this.soportaWebCodecs) {
            console.warn('[DronVideo] ⚠ WebCodecs no disponible en este entorno.');
            this._dibujarMensajeNoSoportado();
        } else {
            this._inicializarDecoder();
        }
    }

    _dibujarMensajeNoSoportado() {
        const w = this.canvas.width || 640;
        const h = this.canvas.height || 360;
        this.ctx.fillStyle = '#0a0e14';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('⚠ WebCodecs no disponible en este WebView', w / 2, h / 2 - 15);
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '11px sans-serif';
        this.ctx.fillText('Alternativa propuesta: decodificación nativa con MediaCodec en Android', w / 2, h / 2 + 10);
        this.ctx.fillText('(Requiere validación con el dron real)', w / 2, h / 2 + 28);
    }

    _inicializarDecoder() {
        try {
            this.decoder = new VideoDecoder({
                output: (videoFrame) => {
                    if (this.canvas.width !== videoFrame.displayWidth || this.canvas.height !== videoFrame.displayHeight) {
                        this.canvas.width = videoFrame.displayWidth;
                        this.canvas.height = videoFrame.displayHeight;
                    }
                    this.ctx.drawImage(videoFrame, 0, 0);
                    this.frameCount++;
                    if (this.onFrameRendered) this.onFrameRendered(videoFrame);
                    videoFrame.close();
                },
                error: (e) => {
                    console.error('[DronVideo] Error en VideoDecoder:', e);
                    if (this.onError) this.onError(e);
                }
            });
            console.log('[DronVideo] WebCodecs VideoDecoder inicializado correctamente.');
        } catch (e) {
            console.error('[DronVideo] Error creando VideoDecoder:', e);
            this.soportaWebCodecs = false;
            this._dibujarMensajeNoSoportado();
        }
    }

    /**
     * Procesa un fragmento de datos binarios recibido por UDP.
     * @param {Uint8Array|ArrayBuffer|string} payload - Bytes crudos o string Base64.
     */
    procesarChunk(payload) {
        if (!this.soportaWebCodecs || !this.decoder) return;

        let bytes;
        if (typeof payload === 'string') {
            // Decodificar Base64
            const binStr = atob(payload);
            bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) {
                bytes[i] = binStr.charCodeAt(i);
            }
        } else if (payload instanceof ArrayBuffer) {
            bytes = new Uint8Array(payload);
        } else {
            bytes = payload;
        }

        // Concatenar al acumulador
        const nuevoBuffer = new Uint8Array(this.buffer.length + bytes.length);
        nuevoBuffer.set(this.buffer);
        nuevoBuffer.set(bytes, this.buffer.length);
        this.buffer = nuevoBuffer;

        // Extraer NAL units delimitadas por 0x00 0x00 0x00 0x01 o 0x00 0x00 0x01
        this._extraerYDecodificarNALs();
    }

    _extraerYDecodificarNALs() {
        const startCodes = [];
        const buf = this.buffer;

        for (let i = 0; i < buf.length - 3; i++) {
            if (buf[i] === 0 && buf[i + 1] === 0) {
                if (buf[i + 2] === 1) {
                    startCodes.push({ offset: i, len: 3 });
                } else if (buf[i + 2] === 0 && buf[i + 3] === 1) {
                    startCodes.push({ offset: i, len: 4 });
                }
            }
        }

        if (startCodes.length < 2) return; // Esperar al menos 2 códigos para tener una NAL completa

        for (let j = 0; j < startCodes.length - 1; j++) {
            const inicio = startCodes[j].offset + startCodes[j].len;
            const fin = startCodes[j + 1].offset;
            const nal = buf.subarray(inicio, fin);
            if (nal.length > 0) {
                this._procesarNALUnit(nal);
            }
        }

        // Conservar remanente
        const ultimoInicio = startCodes[startCodes.length - 1].offset;
        this.buffer = buf.subarray(ultimoInicio);
    }

    _procesarNALUnit(nal) {
        const nalType = nal[0] & 0x1F;

        if (nalType === 7) {
            // SPS (Sequence Parameter Set)
            this.sps = nal;
            this._configurarDecoderSiListo();
        } else if (nalType === 8) {
            // PPS (Picture Parameter Set)
            this.pps = nal;
            this._configurarDecoderSiListo();
        } else if (nalType === 5 || nalType === 1) {
            // IDR Slice (5: keyframe) o Non-IDR Slice (1: delta frame)
            if (!this.configurado) return; // No decodificar sin configuración SPS/PPS

            try {
                // Reconstruir Annex B start code
                const chunkData = new Uint8Array(4 + nal.length);
                chunkData.set([0, 0, 0, 1], 0);
                chunkData.set(nal, 4);

                const chunk = new EncodedVideoChunk({
                    type: nalType === 5 ? 'key' : 'delta',
                    timestamp: performance.now() * 1000,
                    data: chunkData
                });

                if (this.decoder.state === 'configured') {
                    this.decoder.decode(chunk);
                }
            } catch (e) {
                // Ignorar drop de frame durante sintonización inicial
            }
        }
    }

    _configurarDecoderSiListo() {
        if (!this.sps || !this.pps) return;
        if (this.sps.length < 4) {
            console.warn('[DronVideo] SPS recibido demasiado corto para extraer parámetros.');
            return;
        }

        // Extracción dinámica estricta según RFC 6184 / RFC 6381:
        // Byte 1: profile_idc
        // Byte 2: constraint_set_flags
        // Byte 3: level_idc
        const profileIdc      = this.sps[1];
        const constraintFlags = this.sps[2];
        const levelIdc        = this.sps[3];

        const hexProfile = profileIdc.toString(16).padStart(2, '0').toLowerCase();
        const hexFlags   = constraintFlags.toString(16).padStart(2, '0').toLowerCase();
        const hexLevel   = levelIdc.toString(16).padStart(2, '0').toLowerCase();

        const codecStr = `avc1.${hexProfile}${hexFlags}${hexLevel}`;
        console.log(`[DronVideo] Derivado códec WebCodecs desde SPS: ${codecStr} (profile_idc=0x${hexProfile}, constraints=0x${hexFlags}, level_idc=0x${hexLevel})`);

        try {
            this.decoder.configure({
                codec: codecStr,
                optimizeForLatency: true,
                hardwareAcceleration: 'prefer-hardware'
            });
            this.configurado = true;
            console.log(`[DronVideo] ✅ VideoDecoder configurado dinámicamente con códec: ${codecStr}`);
        } catch (err) {
            console.warn('[DronVideo] Fallo al configurar códec derivado:', err);
        }
    }

    destruir() {
        if (this.decoder && this.decoder.state !== 'closed') {
            try { this.decoder.close(); } catch (e) {}
        }
        this.buffer = new Uint8Array(0);
        this.configurado = false;
    }
}

