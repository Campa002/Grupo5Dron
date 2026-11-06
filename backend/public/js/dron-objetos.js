/**
 * Mis objetos — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Objetos propios para el seguimiento, sin entrenar nada:
 *  - El usuario carga de 3 a 15 fotos de un objeto y le pone nombre.
 *  - En cada foto, el detector (COCO-SSD, el mismo del seguimiento) busca el objeto: se usa el recuadro más
 *    grande; si no encuentra ninguno, la foto entera.
 *  - De cada recorte se calcula una "huella": 256 números de MobileNet v1 0.25 (local, libs/mobilenet),
 *    normalizados. Dos huellas se comparan con el producto escalar (parecido de 0 a 1).
 *  - Se guarda en el teléfono (IndexedDB) con una miniatura.
 *
 * Las partes puras (validarFotos, parecido, mejorParecido) se prueban en Node (tests/objetos.test.js).
 */

// eslint-disable-next-line no-unused-vars
const DronObjetos = (() => {
    'use strict';

    const MIN_FOTOS = 3;
    const MAX_FOTOS = 15;
    const LADO_HUELLA = 224;              // entrada de MobileNet
    const CAPA_HUELLA = 'global_average_pooling2d_1';
    const LADO_MAX_FOTO = 640;            // las fotos se achican antes de analizarlas
    const LADO_MINIATURA = 96;

    // ================================================================
    // Partes puras
    // ================================================================

    /** @returns {{ok:boolean, mensaje:string}} */
    function validarFotos(cantidad) {
        if (cantidad < MIN_FOTOS) {
            const faltan = MIN_FOTOS - cantidad;
            return { ok: false, mensaje: `Faltan fotos: cargá al menos ${MIN_FOTOS} (te ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}).` };
        }
        if (cantidad > MAX_FOTOS) {
            const sobran = cantidad - MAX_FOTOS;
            return { ok: false, mensaje: `Hay demasiadas fotos: el máximo es ${MAX_FOTOS} (sacá ${sobran}).` };
        }
        return { ok: true, mensaje: `${cantidad} fotos: listo para guardar.` };
    }

    /** Parecido entre dos huellas normalizadas (producto escalar; 1 = iguales). */
    function parecido(a, b) {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }

    /** El mayor parecido entre una huella y las guardadas de un objeto. */
    function mejorParecido(h, huellas) {
        let mejor = -1;
        for (const g of huellas) mejor = Math.max(mejor, parecido(h, g));
        return mejor;
    }

    /** El recuadro de mayor área (o null). @param {Array<{bbox:number[]}>} predicciones */
    function recuadroMasGrande(predicciones) {
        let mejor = null;
        for (const p of predicciones) {
            if (!mejor || p.bbox[2] * p.bbox[3] > mejor.bbox[2] * mejor.bbox[3]) mejor = p;
        }
        return mejor;
    }

    // ================================================================
    // Huella (MobileNet local)
    // ================================================================
    let _modelo = null;
    let _lienzo = null;

    /** Carga MobileNet una sola vez (sin la parte que clasifica: termina en la huella de 256 números). */
    function cargarModelo() {
        if (!_modelo) {
            _modelo = (async () => {
                if (typeof tf === 'undefined') throw new Error('Falta TensorFlow.js (libs/).');
                const m = await tf.loadLayersModel('./libs/mobilenet/model.json');
                const salida = m.getLayer(CAPA_HUELLA).output;
                const modelo = salida === m.outputs[0] ? m : tf.model({ inputs: m.inputs, outputs: salida });
                tf.tidy(() => modelo.predict(tf.zeros([1, LADO_HUELLA, LADO_HUELLA, 3]))); // calentamiento
                return modelo;
            })();
            _modelo.catch(() => { _modelo = null; });
        }
        return _modelo;
    }

    /**
     * Huella de una parte de una imagen.
     * @param {CanvasImageSource} fuente
     * @param {number[]|null} bbox [x, y, ancho, alto] en píxeles de la fuente; null = la imagen entera
     * @returns {Promise<Float32Array>} 256 números, normalizados
     */
    async function huella(fuente, bbox = null) {
        const modelo = await cargarModelo();
        if (!_lienzo) {
            _lienzo = document.createElement('canvas');
            _lienzo.width = LADO_HUELLA;
            _lienzo.height = LADO_HUELLA;
        }
        const ctx = _lienzo.getContext('2d', { willReadFrequently: false });
        const fw = fuente.videoWidth || fuente.naturalWidth || fuente.width;
        const fh = fuente.videoHeight || fuente.naturalHeight || fuente.height;
        const [x, y, w, h] = bbox || [0, 0, fw, fh];
        ctx.drawImage(fuente, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, LADO_HUELLA, LADO_HUELLA);
        const t = tf.tidy(() => {
            const img = tf.browser.fromPixels(_lienzo).toFloat().div(127.5).sub(1).expandDims(0);
            const v = modelo.predict(img).reshape([-1]);
            return v.div(v.norm().add(1e-8));
        });
        const datos = await t.data();
        t.dispose();
        return Float32Array.from(datos);
    }

    // ================================================================
    // Guardado en el teléfono (IndexedDB)
    // ================================================================
    const BASE = 'grupo5dron-objetos';
    const ALMACEN = 'objetos';

    function abrir() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar objetos.')); return; }
            const pedido = indexedDB.open(BASE, 1);
            pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN, { keyPath: 'id' });
            pedido.onsuccess = () => resolve(pedido.result);
            pedido.onerror = () => reject(pedido.error || new Error('No se pudo abrir el almacenamiento.'));
        });
    }

    async function operar(modo, accion) {
        const db = await abrir();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(ALMACEN, modo);
                const pedido = accion(tx.objectStore(ALMACEN));
                tx.oncomplete = () => resolve(pedido?.result);
                tx.onerror = () => reject(tx.error || new Error('No se pudo guardar.'));
                tx.onabort = () => reject(tx.error || new Error('No se pudo guardar (¿falta espacio?).'));
            });
        } finally {
            db.close();
        }
    }

    /** @returns {Promise<Array>} objetos guardados, por nombre */
    async function listar() {
        const lista = await operar('readonly', a => a.getAll());
        return (lista || []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    function guardar(objeto) {
        return operar('readwrite', a => a.put(objeto));
    }

    function borrar(id) {
        return operar('readwrite', a => a.delete(id));
    }

    // ================================================================
    // Alta de un objeto a partir de sus fotos
    // ================================================================

    /** Abre un archivo de imagen y lo pasa a un canvas de 640 px como máximo. */
    async function abrirFoto(archivo) {
        const url = URL.createObjectURL(archivo);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const escala = Math.min(1, LADO_MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * escala));
            c.height = Math.max(1, Math.round(img.naturalHeight * escala));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return c;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function miniatura(lienzo, bbox) {
        const [x, y, w, h] = bbox || [0, 0, lienzo.width, lienzo.height];
        const escala = LADO_MINIATURA / Math.max(w, h);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * escala));
        c.height = Math.max(1, Math.round(h * escala));
        c.getContext('2d').drawImage(lienzo, x, y, w, h, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.8);
    }

    /**
     * Analiza las fotos y guarda el objeto.
     * @param {string} nombre
     * @param {File[]} archivos de 3 a 15 fotos
     * @param {Function} [onProgreso] (n, total) mientras analiza
     * @returns {Promise<{objeto:Object, detalle:Array<{encontrado:string|null}>}>}
     */
    async function crearObjeto(nombre, archivos, onProgreso = null) {
        const limpio = String(nombre || '').trim();
        if (!limpio) throw new Error('Ponele un nombre al objeto.');
        const v = validarFotos(archivos.length);
        if (!v.ok) throw new Error(v.mensaje);
        const detector = await DronSeguimiento.cargarDetector();
        const umbral = DronSeguimiento.ajustesActuales().umbralConfianza;
        const huellas = [];
        const detalle = [];
        let mini = null;
        for (let i = 0; i < archivos.length; i++) {
            if (typeof onProgreso === 'function') onProgreso(i + 1, archivos.length);
            const lienzo = await abrirFoto(archivos[i]);
            const predicciones = (await detector.modelo.detect(lienzo, 20, umbral));
            const mayor = recuadroMasGrande(predicciones);
            const bbox = mayor ? mayor.bbox : null;
            huellas.push(Array.from(await huella(lienzo, bbox)));
            detalle.push({ encontrado: mayor ? `${mayor.class === 'person' ? 'persona' : mayor.class} ${Math.round(mayor.score * 100)} %` : null });
            if (!mini) mini = miniatura(lienzo, bbox);
        }
        const objeto = {
            id: `obj_${Date.now()}`,
            nombre: limpio,
            huellas,
            miniatura: mini,
            fotos: archivos.length,
            creado: new Date().toISOString(),
        };
        await guardar(objeto);
        return { objeto, detalle };
    }

    return {
        MIN_FOTOS,
        MAX_FOTOS,
        validarFotos,
        parecido,
        mejorParecido,
        recuadroMasGrande,
        cargarModelo,
        huella,
        listar,
        borrar,
        crearObjeto,
    };
})();

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronObjetos;
