/**
 * Caras (BlazeFace) — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Detector de caras chico (BlazeFace "back", el de caras lejanas: entrada de 256×256, 270 KB en float16),
 * guardado en libs/blazeface/ porque en el WiFi del Tello no hay internet.
 * El modelo devuelve 4 salidas (puntajes y recuadros de dos grillas: 512 y 384 anclas); acá se juntan,
 * se decodifican y se quitan los repetidos (NMS). La decodificación es pura y se prueba en Node.
 *
 * Origen del modelo: BlazeFace de MediaPipe (Google, Apache 2.0), convertido a TensorFlow.js por
 * V. Mandic (paquete @vladmandic/human-models, MIT).
 *
 * Coordenadas de salida: normalizadas a [0, 1] respecto de la imagen que se le pasa.
 */

// eslint-disable-next-line no-unused-vars
const DronCaras = (() => {
    'use strict';

    const TAMANO_ENTRADA = 256;
    const URL_MODELO = './libs/blazeface/model.json';

    /** Anclas de BlazeFace para una entrada de n×n: grilla de n/16 con 2 por celda y de n/8 con 6 (896 en total). */
    function anclas(n = TAMANO_ENTRADA) {
        const pasos = [n / 16, n / 8];
        const porCelda = [2, 6];
        const lista = [];
        for (let i = 0; i < pasos.length; i++) {
            const paso = pasos[i];
            const celdas = Math.floor((n + paso - 1) / paso);
            for (let y = 0; y < celdas; y++) {
                for (let x = 0; x < celdas; x++) {
                    for (let k = 0; k < porCelda[i]; k++) lista.push([paso * (x + 0.5), paso * (y + 0.5)]);
                }
            }
        }
        return lista;
    }

    const _anclas = {};
    function anclasCache(n) {
        if (!_anclas[n]) _anclas[n] = anclas(n);
        return _anclas[n];
    }

    const sigmoide = v => 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, v))));

    /**
     * Decodifica la salida cruda (pura).
     * @param {ArrayLike<number>} logitos 896 puntajes sin sigmoide
     * @param {ArrayLike<number>} recuadros 896 × 16 (centro x, centro y, ancho, alto y 6 puntos de la cara)
     * @param {number} n tamaño de la entrada
     * @param {number} umbral probabilidad mínima
     * @returns {Array<{x:number, y:number, w:number, h:number, p:number}>}
     */
    function decodificar(logitos, recuadros, n, umbral) {
        const an = anclasCache(n);
        const salida = [];
        for (let i = 0; i < an.length; i++) {
            const p = sigmoide(logitos[i]);
            if (p < umbral) continue;
            const cx = (recuadros[i * 16] + an[i][0]) / n;
            const cy = (recuadros[i * 16 + 1] + an[i][1]) / n;
            const w = recuadros[i * 16 + 2] / n;
            const h = recuadros[i * 16 + 3] / n;
            if (!(w > 0 && h > 0)) continue;
            salida.push({ x: cx - w / 2, y: cy - h / 2, w, h, p });
        }
        return salida;
    }

    /** Intersección sobre unión de dos recuadros. */
    function iou(a, b) {
        const x0 = Math.max(a.x, b.x);
        const y0 = Math.max(a.y, b.y);
        const x1 = Math.min(a.x + a.w, b.x + b.w);
        const y1 = Math.min(a.y + a.h, b.y + b.h);
        const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
        const union = a.w * a.h + b.w * b.h - inter;
        return union > 0 ? inter / union : 0;
    }

    /** Quita recuadros repetidos: se queda con el de más probabilidad entre los que se superponen (pura). */
    function sinRepetidos(cajas, maxIou = 0.3, maximo = 10) {
        const orden = cajas.slice().sort((a, b) => b.p - a.p);
        const elegidas = [];
        for (const c of orden) {
            if (elegidas.length >= maximo) break;
            if (elegidas.every(e => iou(e, c) <= maxIou)) elegidas.push(c);
        }
        return elegidas;
    }

    let _modelo = null;

    /** Carga UNA vez el modelo (lo comparten la cabina y la pantalla de seguimiento). */
    function cargar() {
        if (!_modelo) {
            _modelo = (async () => {
                if (typeof tf === 'undefined') throw new Error('Falta TensorFlow.js (libs/).');
                const modelo = await tf.loadGraphModel(URL_MODELO);
                // Calentamiento: la primera ejecución compila los shaders
                const lienzo = document.createElement('canvas');
                lienzo.width = 32; lienzo.height = 32;
                await detectarCon(modelo, lienzo, 0.99);
                return modelo;
            })();
            _modelo.catch(() => { _modelo = null; }); // si falla, se puede reintentar
        }
        return _modelo;
    }

    /**
     * Busca caras en una imagen (canvas, video o img). La imagen se completa a un cuadrado con bordes
     * (sin deformarla) y se reduce a 256×256.
     * @returns {Promise<Array<{x:number, y:number, w:number, h:number, p:number}>>} normalizadas a la imagen
     */
    async function detectarCon(modelo, imagen, umbral = 0.5) {
        const salidas = tf.tidy(() => {
            const px = tf.browser.fromPixels(imagen);
            const [alto, ancho] = px.shape;
            const lado = Math.max(alto, ancho);
            const arriba = Math.floor((lado - alto) / 2);
            const izq = Math.floor((lado - ancho) / 2);
            const cuadrado = tf.pad(px, [[arriba, lado - alto - arriba], [izq, lado - ancho - izq], [0, 0]]);
            const entrada = tf.image.resizeBilinear(cuadrado, [TAMANO_ENTRADA, TAMANO_ENTRADA])
                .div(127.5).sub(1).expandDims(0);
            return { tensores: modelo.execute(entrada), alto, ancho, lado, arriba, izq };
        });
        const { tensores, alto, ancho, lado, arriba, izq } = salidas;
        try {
            // Las 4 salidas se reconocen por su forma: [1,512,1], [1,384,1], [1,512,16] y [1,384,16]
            const porForma = {};
            for (const t of tensores) porForma[`${t.shape[1]}x${t.shape[2]}`] = t;
            const partes = await Promise.all(['512x1', '384x1', '512x16', '384x16'].map(k => porForma[k].data()));
            const logitos = new Float32Array(896);
            logitos.set(partes[0]);
            logitos.set(partes[1], 512);
            const recuadros = new Float32Array(896 * 16);
            recuadros.set(partes[2]);
            recuadros.set(partes[3], 512 * 16);
            const caras = sinRepetidos(decodificar(logitos, recuadros, TAMANO_ENTRADA, umbral));
            // Del cuadrado con bordes a la imagen original
            return caras.map(c => {
                const x0 = Math.max(0, (c.x * lado - izq) / ancho);
                const y0 = Math.max(0, (c.y * lado - arriba) / alto);
                const x1 = Math.min(1, ((c.x + c.w) * lado - izq) / ancho);
                const y1 = Math.min(1, ((c.y + c.h) * lado - arriba) / alto);
                return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, p: c.p };
            }).filter(c => c.w > 0 && c.h > 0);
        } finally {
            tf.dispose(tensores);
        }
    }

    async function detectar(imagen, umbral = 0.5) {
        const modelo = await cargar();
        return detectarCon(modelo, imagen, umbral);
    }

    return { TAMANO_ENTRADA, anclas, decodificar, iou, sinRepetidos, cargar, detectar };
})();

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronCaras;
