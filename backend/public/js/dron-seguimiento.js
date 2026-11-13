/**
 * Seguimiento visual — estilo RAC
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Una sola tubería para la cámara del celular y para el video del Tello:
 *   imagen reducida → DETECCIÓN (COCO-SSD: personas y objetos; BlazeFace: caras) a 5-10 FPS, sin superponerse
 *   → CANDIDATOS (a cada persona se le busca la cara: si se ve, el recuadro es la cara; si no, el cuerpo)
 *   → SELECTOR con las reglas de RAC: se confirma con 8 detecciones seguidas de 75 % o más y se pierde
 *     con 3 fallas en las últimas 5 (tocar un recuadro elige el objetivo)
 *   → CONTROLADOR (puro: yaw centra, throttle altura, pitch distancia por el tamaño del recuadro; nunca roll;
 *     el tamaño ideal es distinto para la cara y para el cuerpo)
 *   → bucle de control a 15 Hz: último comando vigente, que vence y decae a 0 si la detección se atrasa,
 *     con aceleración gradual.
 *
 * Modo ensayo (por defecto): calcula y muestra el comando, no lo manda.
 * Control real (S3, experimental): lo activa la cabina, con confirmación; el comando pasa por
 * comandoControlReal (límites bajos, nunca roll, zona muerta) y, sin objetivo, es "rc 0 0 0 0".
 *
 * Las partes puras (Selector, Seguidor, Controlador, combinarPersonas, comandoControlReal,
 * condicionesControlReal, conclusionDiagnostico) no usan el DOM ni timers: se prueban en Node.
 *
 * Coordenadas: todo normalizado a [0, 1] respecto de la imagen (x, y = esquina superior izquierda).
 * Comandos: yaw, ud (throttle) y fb (pitch) en [-1, 1] (×100 = valor del comando "rc" del Tello).
 */

// eslint-disable-next-line no-unused-vars
const DronSeguimiento = (() => {
    'use strict';

    // ================================================================
    // Ajustes (los editables se guardan en el teléfono)
    // ================================================================
    const CLAVE_AJUSTES = 'grupo5dron_seguimiento_ajustes';

    const AJUSTES_POR_DEFECTO = Object.freeze({
        // Detección
        umbralConfianza: 0.5,          // score mínimo para mostrar un recuadro y tenerlo en cuenta
        umbralCara: 0.5,               // probabilidad mínima de una cara (BlazeFace)
        anchoAnalisis: 480,            // ancho de la imagen que se le pasa al modelo (el modelo la reduce a 300×300 igual)
        fpsMin: 5,
        fpsMax: 10,
        // Reglas de RAC (personas, objetos y "Mis objetos")
        confirmacionUmbral: 0.75,      // confianza mínima para que una detección cuente
        confirmacionVentana: 8,        // detecciones seguidas para confirmar el objetivo
        perdidaVentana: 5,             // se mira esta cantidad de detecciones...
        perdidaMinimo: 3,              // ...y con estas fallas se da por perdido
        // Selector
        alturaMinimaFijar: 0.12,       // no se fija un cuerpo más chico que esto (lejano): avanzaría a fondo hacia él
        alturaMinimaCara: 0.02,        // ni una cara más chica que esto
        costoMaxAsociacion: 1.0,       // distancia (en altos de recuadro) + diferencia de tamaño para aceptar el mismo objetivo
        toleranciaPerdidaMs: 1500,     // sin detecciones nuevas del objetivo más que esto → perdido (por ejemplo, si se traba)
        ventanaReadquisicionMs: 5000,  // después de perderlo, solo se retoma algo cerca de donde estaba, durante este tiempo
        suavizadoPosicion: 0.5,        // EMA: peso de la detección nueva (0 = no se mueve, 1 = sin suavizado)
        suavizadoTamano: 0.3,
        // Controlador
        alturaObjetivo: 0.55,          // altura deseada del recuadro del CUERPO (fracción de la imagen): ~3 m
        alturaObjetivoCara: 0.075,     // altura deseada del recuadro de la CARA: la misma distancia (~3 m)
        zonaMuertaX: 0.05,
        zonaMuertaY: 0.07,
        zonaMuertaTamano: 0.05,
        gananciaYaw: 0.6,
        gananciaAltura: 0.5,
        gananciaDistancia: 0.8,
        velMaxYaw: 0.30,
        velMaxAltura: 0.20,
        velMaxAvance: 0.20,
        aceleracionMax: 0.6,           // cambio máximo por segundo al AUMENTAR un comando (aceleración gradual)
        desaceleracionMax: 1.5,        // cambio máximo por segundo al REDUCIR un comando (frena más rápido)
        vencimientoComandoMs: 400,     // si la última detección es más vieja, el comando empieza a decaer
        decaimientoMs: 300,            // y llega a 0 en este tiempo
        margenBorde: 0.02,             // un recuadro a menos de esto del borde superior/inferior está cortado
        // Condiciones para el control real
        alturaMinCm: 80,
        alturaMaxCm: 250,
        bateriaMin: 30,
        fpsMinReal: 4,
        // "Mis objetos": rendimiento en el celular (no editables)
        maxComparar: 3,                // como mucho 3 candidatos comparados por cuadro (buscando)
        reverificarMs: 1000,           // siguiendo: se vuelve a comparar el objetivo cada ~1 s
        avisoNoEncuentraMs: 3000,      // sin nada parecido durante este tiempo → "No encuentro ..."
    });

    /**
     * Límites del CONTROL REAL (S3). Conservadores a propósito: se cambian acá, en el código.
     * Valores en [-1, 1] (×100 = "rc" del Tello). El roll nunca se usa.
     */
    const LIMITES_CONTROL_REAL = Object.freeze({
        yaw: 0.20,         // girar: como mucho 20 de 100
        ud: 0.15,          // subir y bajar: como mucho 15
        fb: 0.15,          // avanzar y retroceder: como mucho 15
        zonaMuerta: 0.04,  // por debajo de 4 se manda 0 (para que no tiemble)
    });

    /**
     * Ajustes editables en pantalla (Config. del dron). Valores internos; "escala" es solo para mostrarlos
     * (por ejemplo 0,45 se muestra como 45 %).
     */
    const RANGOS = Object.freeze({
        umbralConfianza:      { grupo: 'Detección', etiqueta: 'Confianza mínima para mostrar un recuadro', unidad: '%', escala: 100, min: 0.3, max: 0.9, paso: 0.05 },
        umbralCara:           { grupo: 'Detección', etiqueta: 'Confianza mínima de una cara', unidad: '%', escala: 100, min: 0.3, max: 0.95, paso: 0.05 },
        anchoAnalisis:        { grupo: 'Detección', etiqueta: 'Ancho de la imagen analizada', unidad: 'px', min: 240, max: 960, paso: 80 },
        fpsMax:               { grupo: 'Detección', etiqueta: 'Detecciones por segundo (máximo)', unidad: 'FPS', min: 5, max: 15, paso: 1 },
        alturaMinimaFijar:    { grupo: 'Detección', etiqueta: 'Tamaño mínimo de un cuerpo para fijarlo', unidad: '% del alto', escala: 100, min: 0.05, max: 0.5, paso: 0.01 },
        confirmacionUmbral:   { grupo: 'Reglas (como RAC)', etiqueta: 'Confianza para que una detección cuente', unidad: '%', escala: 100, min: 0.5, max: 0.99, paso: 0.01 },
        confirmacionVentana:  { grupo: 'Reglas (como RAC)', etiqueta: 'Detecciones seguidas para confirmar', unidad: '', min: 2, max: 20, paso: 1 },
        perdidaVentana:       { grupo: 'Reglas (como RAC)', etiqueta: 'Ventana para darlo por perdido', unidad: 'detecciones', min: 2, max: 15, paso: 1 },
        perdidaMinimo:        { grupo: 'Reglas (como RAC)', etiqueta: 'Fallas dentro de la ventana para perderlo', unidad: '', min: 1, max: 15, paso: 1 },
        alturaObjetivo:       { grupo: 'Control', etiqueta: 'Distancia objetivo: alto del cuerpo', unidad: '% del alto', escala: 100, min: 0.15, max: 0.9, paso: 0.05 },
        alturaObjetivoCara:   { grupo: 'Control', etiqueta: 'Distancia objetivo: alto de la cara', unidad: '% del alto', escala: 100, min: 0.03, max: 0.4, paso: 0.005 },
        gananciaYaw:          { grupo: 'Control', etiqueta: 'Ganancia de giro', unidad: '', min: 0, max: 2, paso: 0.05 },
        gananciaAltura:       { grupo: 'Control', etiqueta: 'Ganancia de altura', unidad: '', min: 0, max: 2, paso: 0.05 },
        gananciaDistancia:    { grupo: 'Control', etiqueta: 'Ganancia de distancia', unidad: '', min: 0, max: 2, paso: 0.05 },
        zonaMuertaX:          { grupo: 'Control', etiqueta: 'Zona muerta horizontal', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        zonaMuertaY:          { grupo: 'Control', etiqueta: 'Zona muerta vertical', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        zonaMuertaTamano:     { grupo: 'Control', etiqueta: 'Zona muerta de distancia', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        velMaxYaw:            { grupo: 'Control', etiqueta: 'Velocidad máxima de giro (ensayo)', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        velMaxAltura:         { grupo: 'Control', etiqueta: 'Velocidad máxima de altura (ensayo)', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        velMaxAvance:         { grupo: 'Control', etiqueta: 'Velocidad máxima de avance (ensayo)', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        aceleracionMax:       { grupo: 'Control', etiqueta: 'Aceleración máxima', unidad: '%/s', escala: 100, min: 0.1, max: 2, paso: 0.1 },
        toleranciaPerdidaMs:  { grupo: 'Pérdida', etiqueta: 'Tiempo sin detecciones antes de darlo por perdido', unidad: 'ms', min: 500, max: 5000, paso: 100 },
        vencimientoComandoMs: { grupo: 'Pérdida', etiqueta: 'Vencimiento del comando (detección atrasada)', unidad: 'ms', min: 100, max: 2000, paso: 50 },
        alturaMinCm:          { grupo: 'Control real', etiqueta: 'Altura mínima', unidad: 'cm', min: 30, max: 500, paso: 10 },
        alturaMaxCm:          { grupo: 'Control real', etiqueta: 'Altura máxima', unidad: 'cm', min: 50, max: 1000, paso: 10 },
        bateriaMin:           { grupo: 'Control real', etiqueta: 'Batería mínima', unidad: '%', min: 10, max: 90, paso: 5 },
    });

    /**
     * Valida ajustes en unidades internas.
     * @returns {{ok:boolean, ajustes:Object, errores:string[]}}
     */
    function validarAjustes(valores) {
        const errores = [];
        const ajustes = {};
        for (const [clave, valor] of Object.entries(valores || {})) {
            const r = RANGOS[clave];
            if (!r) continue;
            const n = Number(valor);
            const mostrar = v => `${Math.round(v * (r.escala || 1) * 100) / 100}${r.unidad ? ' ' + r.unidad : ''}`;
            if (valor === '' || valor === null || !Number.isFinite(n)) { errores.push(`${r.etiqueta}: no es un número.`); continue; }
            if (n < r.min - 1e-9 || n > r.max + 1e-9) { errores.push(`${r.etiqueta}: tiene que estar entre ${mostrar(r.min)} y ${mostrar(r.max)}.`); continue; }
            ajustes[clave] = n;
        }
        const final = { ...AJUSTES_POR_DEFECTO, ...ajustes };
        if (final.alturaMinCm >= final.alturaMaxCm) errores.push('La altura mínima tiene que ser menor que la máxima.');
        if (final.perdidaMinimo > final.perdidaVentana) errores.push('Las fallas para perderlo no pueden ser más que la ventana.');
        return { ok: errores.length === 0, ajustes, errores };
    }

    function guardarAjustes(ajustes) {
        globalThis.localStorage?.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
    }

    function restaurarAjustes() {
        globalThis.localStorage?.removeItem(CLAVE_AJUSTES);
    }

    function leerAjustesGuardados() {
        try {
            const datos = JSON.parse(globalThis.localStorage?.getItem(CLAVE_AJUSTES) || 'null');
            if (!datos || typeof datos !== 'object') return {};
            // Solo claves conocidas y numéricas
            const limpios = {};
            for (const [k, v] of Object.entries(datos)) {
                if (typeof AJUSTES_POR_DEFECTO[k] === 'number' && Number.isFinite(Number(v))) limpios[k] = Number(v);
            }
            return limpios;
        } catch (_) {
            return {};
        }
    }

    function ajustesActuales(extra = {}) {
        return { ...AJUSTES_POR_DEFECTO, ...leerAjustesGuardados(), ...extra };
    }

    // ================================================================
    // Utilidades puras
    // ================================================================
    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

    /** Zona muerta continua: 0 dentro de la zona; afuera crece desde 0 (sin saltos). */
    function zonaMuerta(error, zona) {
        const a = Math.abs(error);
        return a <= zona ? 0 : Math.sign(error) * (a - zona);
    }

    /** Recuadro con su centro. */
    function caja(b) {
        return b ? { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : null;
    }

    function mover(b, dx, dy) {
        return b ? { ...b, x: b.x + dx, y: b.y + dy, cx: b.cx + dx, cy: b.cy + dy } : null;
    }

    /** Costo entre dos recuadros del mismo tipo: distancia (en altos) + diferencia de tamaño. */
    function costoCajas(a, b, escalaMin = 0.1) {
        const escala = Math.max(a.h, escalaMin);
        return Math.hypot(b.cx - a.cx, b.cy - a.cy) / escala + Math.abs(Math.log(b.h / a.h));
    }

    /** ¿Esta cara es de este cuerpo? 0 = centrada arriba del cuerpo; crece si está corrida o abajo. */
    function costoCaraCuerpo(cara, cuerpo) {
        const dx = Math.abs(cara.cx - cuerpo.cx) / Math.max(cuerpo.w, 0.05);
        const arriba = cara.cy >= cuerpo.y - 0.05 && cara.cy <= cuerpo.y + 0.5 * cuerpo.h;
        return 2 * dx + (arriba ? 0 : 1);
    }

    // ================================================================
    // Nombres en español (clases de COCO-SSD)
    // ================================================================
    const NOMBRES_COCO = Object.freeze({
        person: 'persona', bicycle: 'bicicleta', car: 'auto', motorcycle: 'moto', airplane: 'avión', bus: 'colectivo',
        train: 'tren', truck: 'camión', boat: 'bote', 'traffic light': 'semáforo', 'fire hydrant': 'hidrante',
        'stop sign': 'cartel de pare', 'parking meter': 'parquímetro', bench: 'banco', bird: 'pájaro', cat: 'gato',
        dog: 'perro', horse: 'caballo', sheep: 'oveja', cow: 'vaca', elephant: 'elefante', bear: 'oso', zebra: 'cebra',
        giraffe: 'jirafa', backpack: 'mochila', umbrella: 'paraguas', handbag: 'cartera', tie: 'corbata',
        suitcase: 'valija', frisbee: 'frisbee', skis: 'esquíes', snowboard: 'snowboard', 'sports ball': 'pelota',
        kite: 'barrilete', 'baseball bat': 'bate', 'baseball glove': 'guante', skateboard: 'patineta',
        surfboard: 'tabla de surf', 'tennis racket': 'raqueta', bottle: 'botella', 'wine glass': 'copa', cup: 'taza',
        fork: 'tenedor', knife: 'cuchillo', spoon: 'cuchara', bowl: 'bol', banana: 'banana', apple: 'manzana',
        sandwich: 'sándwich', orange: 'naranja', broccoli: 'brócoli', carrot: 'zanahoria', 'hot dog': 'pancho',
        pizza: 'pizza', donut: 'dona', cake: 'torta', chair: 'silla', couch: 'sillón', 'potted plant': 'planta',
        bed: 'cama', 'dining table': 'mesa', toilet: 'inodoro', tv: 'televisor', laptop: 'notebook', mouse: 'mouse',
        remote: 'control remoto', keyboard: 'teclado', 'cell phone': 'celular', microwave: 'microondas', oven: 'horno',
        toaster: 'tostadora', sink: 'pileta', refrigerator: 'heladera', book: 'libro', clock: 'reloj', vase: 'florero',
        scissors: 'tijera', 'teddy bear': 'oso de peluche', 'hair drier': 'secador de pelo', toothbrush: 'cepillo de dientes',
    });

    const mayuscula = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

    /** Nombre en español para mostrar ("Persona", "Botella"). */
    function nombreEspanol(clase) {
        return mayuscula(NOMBRES_COCO[clase] || clase);
    }

    // ================================================================
    // Candidatos: a cada persona se le busca la cara (pura)
    // ================================================================
    /**
     * Junta las detecciones de COCO-SSD con las caras de BlazeFace.
     * - Persona con cara visible: el recuadro es la CARA; la confianza, la mayor entre cara y cuerpo.
     * - Persona sin cara (de espaldas o lejos): el recuadro es el CUERPO.
     * - Cara sin cuerpo (alguien muy cerca: el cuerpo no entra): una persona con solo la cara.
     * - Otros objetos: su recuadro, con el nombre en español.
     * @param {Array<{clase:string, score:number, x:number, y:number, w:number, h:number, bbox?:number[]}>} detecciones
     * @param {Array<{x:number, y:number, w:number, h:number, p:number}>} caras
     * @returns {Array} candidatos {clase, score, conf, tipo:'cara'|'cuerpo'|'objeto', x, y, w, h, cara, cuerpo, bbox}
     */
    function combinarPersonas(detecciones, caras, a) {
        const personas = detecciones.filter(d => d.clase === 'person');
        const carasValidas = (caras || []).filter(f => f.p >= a.umbralCara);
        // Pares cara-cuerpo posibles, del más claro al menos claro; cada cara y cada cuerpo se usan una vez
        const pares = [];
        personas.forEach((d, i) => carasValidas.forEach((f, j) => {
            const k = costoCaraCuerpo(caja(f), caja(d));
            if (k < 0.6) pares.push({ i, j, k });
        }));
        pares.sort((p, q) => p.k - q.k);
        const caraDe = new Map();
        const carasUsadas = new Set();
        for (const p of pares) {
            if (caraDe.has(p.i) || carasUsadas.has(p.j)) continue;
            caraDe.set(p.i, p.j);
            carasUsadas.add(p.j);
        }
        const salida = [];
        personas.forEach((d, i) => {
            const cuerpo = { x: d.x, y: d.y, w: d.w, h: d.h, score: d.score };
            const f = caraDe.has(i) ? carasValidas[caraDe.get(i)] : null;
            const base = f || d;
            salida.push({
                clase: 'person', score: d.score, conf: Math.max(d.score, f ? f.p : 0), tipo: f ? 'cara' : 'cuerpo',
                x: base.x, y: base.y, w: base.w, h: base.h,
                cara: f ? { x: f.x, y: f.y, w: f.w, h: f.h, p: f.p } : null, cuerpo, bbox: d.bbox,
            });
        });
        carasValidas.forEach((f, j) => {
            if (carasUsadas.has(j)) return;
            salida.push({
                clase: 'person', score: f.p, conf: f.p, tipo: 'cara', x: f.x, y: f.y, w: f.w, h: f.h,
                cara: { x: f.x, y: f.y, w: f.w, h: f.h, p: f.p }, cuerpo: null,
            });
        });
        for (const d of detecciones) {
            if (d.clase === 'person') continue;
            salida.push({
                clase: d.clase, score: d.score, conf: d.score, tipo: 'objeto', x: d.x, y: d.y, w: d.w, h: d.h,
                cara: null, cuerpo: { x: d.x, y: d.y, w: d.w, h: d.h, score: d.score }, bbox: d.bbox,
            });
        }
        return salida;
    }

    /** Normaliza un candidato (los de las pruebas pueden venir sin tipo, conf, cara ni cuerpo). */
    function normalizarCandidato(c) {
        const tipo = c.tipo || (c.clase === 'person' ? 'cuerpo' : 'objeto');
        const cara = c.cara ? caja(c.cara) : null;
        const cuerpo = c.cuerpo ? caja(c.cuerpo) : (tipo === 'cara' ? null : caja(c));
        return { ...c, ...caja(c), tipo, conf: typeof c.conf === 'number' ? c.conf : c.score, cara, cuerpo };
    }

    // ================================================================
    // Controlador (puro)
    // ================================================================
    const Controlador = {
        /**
         * Comando deseado para llevar el objetivo al centro y al tamaño de recuadro buscado.
         * El tamaño ideal depende del tipo de recuadro: la cara es mucho más chica que el cuerpo.
         * @param {{cx:number, cy:number, h:number, tipo?:string}} ob objetivo suavizado
         * @param {Object} a ajustes
         * @returns {{yaw:number, ud:number, fb:number}}
         */
        comandoDeseado(ob, a) {
            // Horizontal → yaw (girar hacia el objetivo). ex en [-0,5; 0,5]
            const ex = zonaMuerta(ob.cx - 0.5, a.zonaMuertaX);
            const yaw = limitar(ex * 2 * a.gananciaYaw, -a.velMaxYaw, a.velMaxYaw);

            // Vertical → throttle. Si el recuadro está cortado arriba o abajo, el centro no es confiable: no se sube ni se baja
            const y = ob.cy - ob.h / 2;
            const cortado = y <= a.margenBorde || y + ob.h >= 1 - a.margenBorde;
            const ey = zonaMuerta(0.5 - ob.cy, a.zonaMuertaY);
            const ud = cortado ? 0 : limitar(ey * 2 * a.gananciaAltura, -a.velMaxAltura, a.velMaxAltura);

            // Distancia → pitch, por la altura del recuadro (chico = lejos → avanzar; grande = cerca → retroceder)
            const ideal = Controlador.alturaIdeal(ob, a);
            const eh = zonaMuerta(ideal - ob.h, a.zonaMuertaTamano * (ideal / a.alturaObjetivo));
            const fb = limitar((eh / ideal) * a.gananciaDistancia, -a.velMaxAvance, a.velMaxAvance);

            return { yaw, ud, fb };
        },

        /** Alto ideal del recuadro: el de la cara si se sigue la cara; si no, el del cuerpo (u objeto). */
        alturaIdeal(ob, a) {
            return ob.tipo === 'cara' ? a.alturaObjetivoCara : a.alturaObjetivo;
        },

        /**
         * Aceleración gradual: limita cuánto puede cambiar un eje en dt segundos.
         * Aumentar usa aceleracionMax; reducir (o ir hacia 0) usa desaceleracionMax, que es mayor.
         * Si el comando cambia de sentido, primero frena hasta 0.
         */
        limitarCambio(actual, deseado, dtSeg, a) {
            if (actual !== 0 && Math.sign(deseado) !== Math.sign(actual)) {
                const restante = Math.abs(actual) - a.desaceleracionMax * dtSeg;
                return restante > 0 ? Math.sign(actual) * restante : 0;
            }
            const max = (Math.abs(deseado) > Math.abs(actual) ? a.aceleracionMax : a.desaceleracionMax) * dtSeg;
            return actual + limitar(deseado - actual, -max, max);
        },

        /** 1 mientras la detección es reciente; decae linealmente a 0 cuando se atrasa. */
        factorVencimiento(edadMs, a) {
            if (edadMs <= a.vencimientoComandoMs) return 1;
            if (a.decaimientoMs <= 0) return 0;
            return limitar(1 - (edadMs - a.vencimientoComandoMs) / a.decaimientoMs, 0, 1);
        },
    };

    // ================================================================
    // Control real (puro): lo que de verdad se le manda al dron
    // ================================================================
    /**
     * Pasa el comando del seguidor por los límites del control real.
     * Sin objetivo (buscando, confirmando o perdido) → todo en 0: el dron queda quieto (rc 0 0 0 0).
     * Nunca roll. Por debajo de la zona muerta, 0.
     * @returns {{lr:number, fb:number, ud:number, yaw:number}}
     */
    function comandoControlReal(cmd, estado, lim = LIMITES_CONTROL_REAL) {
        const conObjetivo = estado === 'siguiendo' || estado === 'perdiendo';
        const eje = (v, max) => {
            if (!conObjetivo || !Number.isFinite(v)) return 0;
            const x = limitar(v, -max, max);
            return Math.abs(x) < lim.zonaMuerta ? 0 : x;
        };
        return { lr: 0, fb: eje(cmd?.fb, lim.fb), ud: eje(cmd?.ud, lim.ud), yaw: eje(cmd?.yaw, lim.yaw) };
    }

    /** Texto del comando como lo recibe el Tello: "rc roll pitch throttle yaw" (de -100 a 100). */
    function textoRc(e) {
        const r = v => Math.round((Number(v) || 0) * 100) + 0; // + 0 evita "-0"
        return `rc ${r(e.lr)} ${r(e.fb)} ${r(e.ud)} ${r(e.yaw)}`;
    }

    // ================================================================
    // Selector de objetivo (puro), con las reglas de RAC
    // Qué se busca (meta): {tipo:'persona'} | {tipo:'clase', clase:'bottle'} | {tipo:'mio', nombre:'Taza'}
    // Estados: 'buscando' → 'confirmando' (n/8) → 'siguiendo' <-> 'perdiendo' → 'perdido'
    //  - Una detección CUENTA si su confianza es de 75 % o más (en "Mis objetos", el parecido con las fotos).
    //  - Se confirma con 8 detecciones seguidas que cuentan, del mismo candidato.
    //  - Siguiendo, se pierde con 3 fallas en las últimas 5 detecciones (falla: no aparece o no cuenta).
    //  - Perdido: el control queda en 0. Se retoma solo algo cerca de donde estaba y dentro de 5 s
    //    (confirmando otra vez); después hay que volver a elegir. En "Mis objetos" se lo busca en cualquier lugar.
    //  - Tocar un recuadro (sembrar) elige ese candidato.
    // ================================================================
    class Selector {
        constructor(ajustes, meta = { tipo: 'persona' }) {
            this.a = ajustes;
            this.meta = meta;
            this.estado = 'buscando';
            this.objetivo = null;          // {cx, cy, w, h, tipo, conf, ref:{cara, cuerpo}, vx, vy, t, sim?}
            this.ultimaVista = 0;
            this.perdidoDesde = 0;
            this.ultimaPosicion = null;
            this.confirmaciones = 0;       // detecciones seguidas que cuentan (para "Confirmando n/8")
            this.semilla = null;           // punto tocado {x, y}
            this.coincidencias = 0;        // "Mis objetos": candidatos parecidos en el último cuadro
            this.noEncuentra = false;      // "Mis objetos": sin nada parecido durante avisoNoEncuentraMs
            this._previo = null;
            this._tPrevio = 0;
            this._ventana = [];
            this._perdido = false;
            this._ultimaVerificacion = 0;
            this._tSinCoincidencia = null;
        }

        /** Nombre del objetivo para mostrar. */
        get nombre() {
            if (this.meta.tipo === 'mio') return this.meta.nombre;
            if (this.meta.tipo === 'clase') return nombreEspanol(this.meta.clase);
            return 'Persona';
        }

        _coincide(c) {
            if (this.meta.tipo === 'persona') return c.clase === 'person';
            if (this.meta.tipo === 'clase') return c.clase === this.meta.clase;
            return true; // "Mis objetos": cualquier clase; decide el parecido
        }

        /** Confianza que se usa para las reglas (en "Mis objetos", el parecido; null si no se comparó). */
        _conf(c) {
            if (this.meta.tipo === 'mio') return typeof c.sim === 'number' ? c.sim : null;
            return c.conf;
        }

        _validos(candidatos) {
            return candidatos
                .filter(c => c.w > 0 && c.h > 0)
                .map(normalizarCandidato)
                .filter(c => this._coincide(c) && (this.meta.tipo === 'mio' || c.conf >= this.a.umbralConfianza));
        }

        _tamanoOk(c) {
            if (this.meta.tipo === 'mio') return true;
            return c.tipo === 'cara' ? c.h >= this.a.alturaMinimaCara : c.h >= this.a.alturaMinimaFijar;
        }

        /** Costo de asociar un candidato a una referencia: cara con cara, cuerpo con cuerpo o cara con cuerpo. */
        _costo(ref, c) {
            if (ref.cara && c.cara) return costoCajas(ref.cara, c.cara, 0.05);
            if (ref.cuerpo && c.cuerpo) return costoCajas(ref.cuerpo, c.cuerpo);
            if (ref.cara && c.cuerpo) return costoCaraCuerpo(ref.cara, c.cuerpo);
            if (ref.cuerpo && c.cara) return costoCaraCuerpo(c.cara, ref.cuerpo);
            return Infinity;
        }

        _mejor(ref, candidatos, costoMax) {
            let mejor = null;
            let costoMin = Infinity;
            for (const c of candidatos) {
                const costo = this._costo(ref, c);
                if (costo < costoMin) { costoMin = costo; mejor = c; }
            }
            return costoMin <= costoMax ? mejor : null;
        }

        /** Elige el candidato tocado: el más chico que contiene el punto o, si no, el más cercano (hasta 0,15). */
        static enPunto(candidatos, p) {
            const contiene = b => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
            const adentro = candidatos.filter(c => contiene(c) || contiene(c.cara) || contiene(c.cuerpo));
            if (adentro.length) return adentro.reduce((m, c) => (c.w * c.h < m.w * m.h ? c : m));
            let mejor = null;
            let dMin = 0.15;
            for (const c of candidatos) {
                const d = Math.hypot(c.x + c.w / 2 - p.x, c.y + c.h / 2 - p.y);
                if (d < dMin) { dMin = d; mejor = c; }
            }
            return mejor;
        }

        /** Tocaron un recuadro: se empieza a confirmar ese (olvida el objetivo anterior). */
        sembrar(punto) {
            this.semilla = punto;
            this.estado = 'buscando';
            this.objetivo = null;
            this.ultimaPosicion = null;
            this._perdido = false;
            this._ventana = [];
            this._reiniciarConfirmacion();
        }

        _reiniciarConfirmacion() {
            this.confirmaciones = 0;
            this._previo = null;
        }

        /** Revisa la tolerancia de pérdida por tiempo (también entre detecciones). */
        revisarTiempo(t) {
            if ((this.estado === 'siguiendo' || this.estado === 'perdiendo') && t - this.ultimaVista > this.a.toleranciaPerdidaMs) {
                this._perder(t);
            }
        }

        /**
         * Procesa las detecciones de un cuadro.
         * @param {Array} candidatos (ver combinarPersonas; también sirven {clase, score, x, y, w, h})
         * @param {number} t tiempo en ms
         */
        actualizar(candidatos, t) {
            const validos = this._validos(candidatos);
            if (this.estado === 'siguiendo' || this.estado === 'perdiendo') this._seguir(validos, t);
            else this._buscar(validos, t);
        }

        _buscar(validos, t) {
            let elegibles = validos.filter(c => this._tamanoOk(c));
            if (this._perdido && this.meta.tipo !== 'mio') {
                // Perdido: solo algo cerca de donde estaba y dentro de la ventana; si no, hay que volver a elegir
                if (!this.ultimaPosicion || t - this.perdidoDesde > this.a.ventanaReadquisicionMs) {
                    this.estado = 'perdido';
                    this._reiniciarConfirmacion();
                    return;
                }
                elegibles = elegibles.filter(c => this._costo(this.ultimaPosicion.ref, c) <= this.a.costoMaxAsociacion);
            }
            const cuentan = elegibles.filter(c => (this._conf(c) ?? -1) >= this.a.confirmacionUmbral);

            if (this.meta.tipo === 'mio') {
                this.coincidencias = cuentan.length;
                if (!cuentan.length) {
                    if (this._tSinCoincidencia === null) this._tSinCoincidencia = t;
                    this.noEncuentra = t - this._tSinCoincidencia >= this.a.avisoNoEncuentraMs;
                } else {
                    this._tSinCoincidencia = null;
                    this.noEncuentra = false;
                }
            }

            const sinCandidato = () => {
                this._reiniciarConfirmacion();
                this.estado = this._perdido ? 'perdido' : 'buscando';
            };
            if (!cuentan.length) { sinCandidato(); return; }

            let c = null;
            if (this._previo) c = this._mejor(this._previo, cuentan, this.a.costoMaxAsociacion);
            if (!c && this.semilla) c = Selector.enPunto(cuentan, this.semilla);
            if (!c && !this.semilla) c = this._preferido(cuentan);
            if (!c) { sinCandidato(); return; }

            const mismo = this._previo && this._costo(this._previo, c) <= this.a.costoMaxAsociacion;
            this.confirmaciones = mismo ? this.confirmaciones + 1 : 1;
            const previo = this._previo;
            const dt = mismo ? (t - this._tPrevio) / 1000 : 0;
            this._previo = c;
            this._tPrevio = t;
            if (this.confirmaciones >= this.a.confirmacionVentana) this._fijar(c, t, previo, dt);
            else this.estado = 'confirmando';
        }

        /** Sin elección del usuario: la persona u objeto más grande (más cerca), con premio por estar centrado; en "Mis objetos", el más parecido. */
        _preferido(cuentan) {
            if (this.meta.tipo === 'mio') return cuentan.reduce((m, v) => (v.sim > m.sim ? v : m));
            // Para comparar caras con cuerpos, una cara vale como un cuerpo ~7 veces más alto
            const alto = v => (v.tipo === 'cara' ? v.h * 7 : v.h);
            const puntaje = v => alto(v) * (1 - 0.5 * Math.min(1, Math.abs(v.cx - 0.5) / 0.5));
            return cuentan.reduce((m, v) => (puntaje(v) > puntaje(m) ? v : m));
        }

        _fijar(c, t, previo, dt) {
            const vx = previo && dt > 0 && previo.tipo === c.tipo ? (c.cx - previo.cx) / dt : 0;
            const vy = previo && dt > 0 && previo.tipo === c.tipo ? (c.cy - previo.cy) / dt : 0;
            this.objetivo = {
                cx: c.cx, cy: c.cy, w: c.w, h: c.h, tipo: c.tipo, clase: c.clase, conf: this._conf(c) ?? c.conf,
                ref: { cara: c.cara, cuerpo: c.cuerpo }, vx, vy, t, sim: c.sim,
            };
            this.ultimaVista = t;
            this._ultimaVerificacion = t;
            this._ventana = [];
            this.estado = 'siguiendo';
            this.semilla = null;
            this._perdido = false;
            this._reiniciarConfirmacion();
        }

        _seguir(validos, t) {
            const c = this._mejor(this._prevista(t), validos, this.a.costoMaxAsociacion);
            let acierto;
            if (this.meta.tipo === 'mio') {
                // Entre re-verificaciones se lo sigue por posición; cuando se lo compara, cuenta el parecido
                acierto = !!c;
                if (c && typeof c.sim === 'number') {
                    this._ultimaVerificacion = t;
                    acierto = c.sim >= this.a.confirmacionUmbral;
                }
                this.coincidencias = acierto ? 1 : 0;
            } else {
                acierto = !!c && c.conf >= this.a.confirmacionUmbral;
            }
            this._ventana.push(acierto);
            if (this._ventana.length > this.a.perdidaVentana) this._ventana.shift();
            if (acierto) {
                this._actualizarObjetivo(c, t);
                this.ultimaVista = t;
                this.estado = 'siguiendo';
            } else {
                this.estado = 'perdiendo';
            }
            if (this._ventana.filter(x => !x).length >= this.a.perdidaMinimo) this._perder(t);
        }

        _perder(t) {
            this.estado = 'perdido';
            this.perdidoDesde = t;
            this.ultimaPosicion = this.objetivo;
            this.objetivo = null;
            this._ventana = [];
            this._perdido = true;
            this._tSinCoincidencia = t;
            this._reiniciarConfirmacion();
        }

        /** Posición prevista del objetivo en t (extrapolación limitada a 1 s). */
        _prevista(t) {
            const ob = this.objetivo;
            const dt = Math.min(Math.max(0, (t - ob.t) / 1000), 1);
            const dx = ob.vx * dt;
            const dy = ob.vy * dt;
            return { cara: mover(ob.ref.cara, dx, dy), cuerpo: mover(ob.ref.cuerpo, dx, dy) };
        }

        /** Suaviza el objetivo con la detección asociada `c`. Si cambia de cara a cuerpo (o al revés), arranca de nuevo. */
        _actualizarObjetivo(c, t) {
            const ob = this.objetivo;
            const dt = Math.max(0, (t - ob.t) / 1000);
            const mismoTipo = ob.tipo === c.tipo;
            const ap = mismoTipo ? this.a.suavizadoPosicion : 1;
            const at = mismoTipo ? this.a.suavizadoTamano : 1;
            const refPrevia = ob.tipo === 'cara' ? ob.ref.cara : ob.ref.cuerpo;
            const vxInst = mismoTipo && dt > 0 && refPrevia ? (c.cx - refPrevia.cx) / dt : ob.vx;
            const vyInst = mismoTipo && dt > 0 && refPrevia ? (c.cy - refPrevia.cy) / dt : ob.vy;
            this.objetivo = {
                cx: ob.cx + ap * (c.cx - ob.cx),
                cy: ob.cy + ap * (c.cy - ob.cy),
                w: ob.w + at * (c.w - ob.w),
                h: ob.h + at * (c.h - ob.h),
                tipo: c.tipo,
                clase: c.clase,
                conf: this._conf(c) ?? ob.conf,
                ref: { cara: c.cara, cuerpo: c.cuerpo },
                vx: 0.5 * ob.vx + 0.5 * vxInst,
                vy: 0.5 * ob.vy + 0.5 * vyInst,
                t,
                sim: typeof c.sim === 'number' ? c.sim : ob.sim,
            };
        }

        /**
         * "Mis objetos": qué candidatos hay que comparar con las fotos en este cuadro (índices de `candidatos`).
         * Buscando: los 3 de más confianza. Siguiendo: el asociado al objetivo, si pasó ~1 s de la última vez.
         */
        aVerificar(candidatos, t) {
            const validos = candidatos
                .map((c, i) => ({ ...normalizarCandidato(c), i }))
                .filter(c => c.conf >= this.a.umbralConfianza && c.w > 0 && c.h > 0);
            if (this.estado === 'siguiendo' || this.estado === 'perdiendo') {
                if (t - this._ultimaVerificacion < this.a.reverificarMs) return [];
                const c = this._mejor(this._prevista(t), validos, this.a.costoMaxAsociacion);
                return c ? [c.i] : [];
            }
            return validos.sort((x, y) => y.conf - x.conf).slice(0, this.a.maxComparar).map(c => c.i);
        }
    }

    // ================================================================
    // Seguidor (puro): selector + controlador + vencimiento + aceleración gradual
    // ================================================================
    class Seguidor {
        /** @param {Object} ajustes @param {Selector} [selector] por defecto, el de personas */
        constructor(ajustes, selector = null) {
            this.a = ajustes;
            this.selector = selector || new Selector(ajustes);
            this.comando = { yaw: 0, ud: 0, fb: 0 };
            this._tUltimoTick = null;
        }

        get estado() { return this.selector.estado; }

        procesarDeteccion(candidatos, t) {
            this.selector.actualizar(candidatos, t);
        }

        /**
         * Paso del bucle de control (15 Hz). Devuelve el comando a aplicar.
         * @param {number} t tiempo en ms
         */
        tickControl(t) {
            this.selector.revisarTiempo(t);
            const s = this.selector;
            let deseado = { yaw: 0, ud: 0, fb: 0 };
            if ((s.estado === 'siguiendo' || s.estado === 'perdiendo') && s.objetivo) {
                const f = Controlador.factorVencimiento(t - s.ultimaVista, this.a);
                const c = Controlador.comandoDeseado(s.objetivo, this.a);
                deseado = { yaw: c.yaw * f, ud: c.ud * f, fb: c.fb * f };
            }
            const dt = this._tUltimoTick === null ? 0 : Math.max(0, (t - this._tUltimoTick) / 1000);
            this._tUltimoTick = t;
            for (const eje of ['yaw', 'ud', 'fb']) {
                this.comando[eje] = Controlador.limitarCambio(this.comando[eje], deseado[eje], dt, this.a);
            }
            // Sin objetivo, el comando es 0 en el acto (no decae de a poco): el dron queda quieto
            if (s.estado !== 'siguiendo' && s.estado !== 'perdiendo') this.comando = { yaw: 0, ud: 0, fb: 0 };
            return { comando: { ...this.comando }, estado: s.estado };
        }
    }

    // ================================================================
    // Condiciones para el control real (pura)
    // ================================================================
    function condicionesControlReal(e, a) {
        const motivos = [];
        if (!e.enVuelo) motivos.push('el dron no está en vuelo');
        if (e.alturaCm === null || e.alturaCm === undefined) motivos.push('no se conoce la altura');
        else if (e.alturaCm < a.alturaMinCm) motivos.push(`altura menor a ${a.alturaMinCm} cm`);
        else if (e.alturaCm > a.alturaMaxCm) motivos.push(`altura mayor a ${a.alturaMaxCm} cm`);
        if (e.bateria === null || e.bateria === undefined || e.bateria < a.bateriaMin) motivos.push(`batería menor a ${a.bateriaMin} %`);
        if (!e.telemetriaOk) motivos.push('no llegan datos del dron');
        if (e.backend !== 'webgl') motivos.push(`la detección no usa la placa de video (usa ${e.backend || 'nada'})`);
        if (!(e.fps >= a.fpsMinReal)) motivos.push(`menos de ${a.fpsMinReal} detecciones por segundo`);
        return { ok: motivos.length === 0, motivos };
    }

    // ================================================================
    // Diagnóstico (puro): qué falla, en palabras
    // ================================================================
    /**
     * Arma el resultado del diagnóstico a partir de lo medido.
     * @param {Object} d
     *  imagenOk, congelada, brillo, backend, float32,
     *  pruebaPersona, pruebaCara (puntajes con la foto de prueba, WebGL), pruebaPersonaCpu (o null si no se probó),
     *  personaCuadro, caraCuadro, altoPersonaCuadro (lo mejor del cuadro actual), ms (por análisis)
     * @returns {{items:Array<{ok:boolean|null, titulo:string, detalle:string}>, conclusion:string}}
     */
    function conclusionDiagnostico(d, a = AJUSTES_POR_DEFECTO) {
        const pc = v => `${Math.round((v || 0) * 100)} %`;
        const items = [];
        const add = (ok, titulo, detalle) => items.push({ ok, titulo, detalle });

        add(!!d.imagenOk, 'Llega imagen', d.imagenOk ? 'La cámara manda imagen.' : 'No llega imagen de la cámara o del dron.');
        if (d.imagenOk) {
            add(!d.congelada, 'La imagen se mueve', d.congelada ? 'La imagen no cambia: el video está congelado.' : 'Llegan cuadros nuevos.');
            const oscura = d.brillo !== null && d.brillo !== undefined && d.brillo < 15;
            add(!oscura, 'Brillo', oscura ? `La imagen está casi negra (brillo ${d.brillo} de 255).` : `Brillo ${d.brillo ?? '?'} de 255.`);
        }
        const gpu = d.backend === 'webgl';
        add(gpu ? true : false, 'Placa de video',
            gpu ? `Usa la placa de video (WebGL)${d.float32 === false ? ', con precisión reducida (float16)' : ''}.`
                : `No usa la placa de video (usa ${d.backend || 'nada'}): va a ser muy lento.`);
        const modeloOk = d.pruebaPersona >= a.umbralConfianza;
        add(modeloOk, 'Foto de prueba',
            `Con una foto conocida encuentra persona ${pc(d.pruebaPersona)} y cara ${pc(d.pruebaCara)}` +
            (d.pruebaPersonaCpu !== null && d.pruebaPersonaCpu !== undefined ? ` (con el procesador: persona ${pc(d.pruebaPersonaCpu)})` : '') + '.');
        if (d.imagenOk) {
            const cuenta = Math.max(d.personaCuadro || 0, d.caraCuadro || 0);
            add(cuenta >= a.confirmacionUmbral, 'Persona en la imagen',
                cuenta > 0 ? `En la imagen actual: persona ${pc(d.personaCuadro)}, cara ${pc(d.caraCuadro)} (para seguir hace falta ${pc(a.confirmacionUmbral)}).`
                    : 'En la imagen actual no encuentra ninguna persona ni cara.');
        }
        if (d.ms) {
            const fps = 1000 / d.ms;
            add(fps >= a.fpsMinReal, 'Velocidad', `${Math.round(d.ms)} ms por análisis (unas ${Math.round(fps * 10) / 10} por segundo).`);
        }

        // Conclusión: la primera causa, en orden
        let conclusion;
        if (!d.imagenOk) conclusion = 'No llega imagen: revisá el permiso de la cámara o la conexión del video del dron.';
        else if (d.congelada) conclusion = 'El video está congelado: el detector analiza siempre la misma imagen.';
        else if (d.brillo !== null && d.brillo !== undefined && d.brillo < 15) conclusion = 'Al detector le llega una imagen negra: revisá la cámara o la luz.';
        else if (!modeloOk && d.pruebaPersonaCpu >= a.umbralConfianza) conclusion = 'La placa de video de este celular calcula mal: con el procesador la foto de prueba sí da bien. Pasale este diagnóstico a Claude.';
        else if (!modeloOk) conclusion = 'El detector no reconoce ni la foto de prueba: el modelo no cargó bien.';
        else if (!(Math.max(d.personaCuadro || 0, d.caraCuadro || 0) > 0)) conclusion = 'El detector anda (reconoce la foto de prueba), pero no ve a nadie en la imagen: apuntá a una persona de frente, con buena luz.';
        else if (Math.max(d.personaCuadro || 0, d.caraCuadro || 0) < a.confirmacionUmbral) conclusion = `Ve una persona, pero con poca confianza (hace falta ${pc(a.confirmacionUmbral)}): acercate, mirá a la cámara o mejorá la luz.`;
        else if (d.ms && 1000 / d.ms < a.fpsMinReal) conclusion = 'Todo anda, pero lento: el control real no se va a poder activar.';
        else conclusion = 'Todo anda: si igual queda buscando, quedate quieto unos segundos de frente a la cámara (necesita 8 detecciones seguidas).';
        return { items, conclusion };
    }

    // ================================================================
    // Marco de la imagen analizada (puro)
    // COCO-SSD reduce TODA imagen a 300×300 sin respetar la proporción. Una imagen vertical del celular
    // (9:16) le llegaba aplastada casi al doble y las personas bajaban mucho de confianza. Por eso:
    //  - vertical o cuadrada → se completa a un cuadrado con bordes negros a los costados;
    //  - entre 1:1 y 4:3 (el Tello es 4:3) → se usa tal cual;
    //  - más ancha que 4:3 → bordes arriba y abajo hasta 4:3.
    // Medido el 6/11 en la PC con fotos verticales: confianza 81 % → 95 % y 82 % → 87 %, sin perder personas.
    // ================================================================
    function marcoAnalisis(fw, fh, anchoMax) {
        const a = fw / fh;
        const t = limitar(a, 1, 4 / 3);                       // proporción del lienzo
        const cw = Math.max(1, Math.round(Math.min(anchoMax, Math.max(fw, fh * t))));
        const ch = Math.max(1, Math.round(cw / t));
        let dw = cw;
        let dh = ch;
        if (a < t) dw = Math.round(ch * a);                     // bordes a los costados
        else if (a > t) dh = Math.round(cw / a);                // bordes arriba y abajo
        return { cw, ch, dx: Math.round((cw - dw) / 2), dy: Math.round((ch - dh) / 2), dw, dh, bordes: dw !== cw || dh !== ch };
    }

    /** Pasa un recuadro del lienzo analizado (px) a coordenadas normalizadas de la imagen original, recortado a [0, 1]. */
    function recuadroEnFuente([bx, by, bw, bh], m) {
        const x0 = limitar((bx - m.dx) / m.dw, 0, 1);
        const y0 = limitar((by - m.dy) / m.dh, 0, 1);
        const x1 = limitar((bx + bw - m.dx) / m.dw, 0, 1);
        const y1 = limitar((by + bh - m.dy) / m.dh, 0, 1);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    // ================================================================
    // Visión (navegador): COCO-SSD y BlazeFace sobre una imagen reducida
    // ================================================================
    // Flags de empaquetado de WebGL: guardan 4 valores por píxel de textura. En GPUs que no pueden escribir
    // texturas float32 (muchas Mali), TensorFlow usa float16 y el empaquetado suma error y fallas de algunos
    // drivers. El arreglo conocido es apagarlo (más lento, pero preciso). Solo se aplica en esas GPUs.
    const FLAGS_EMPAQUETADO = ['WEBGL_PACK', 'WEBGL_PACK_DEPTHWISECONV', 'WEBGL_PACK_BINARY_OPERATIONS', 'WEBGL_PACK_UNARY_OPERATIONS',
        'WEBGL_PACK_ARRAY_OPERATIONS', 'WEBGL_PACK_IMAGE_OPERATIONS', 'WEBGL_PACK_REDUCE', 'WEBGL_PACK_CLIP', 'WEBGL_PACK_NORMALIZATION',
        'WEBGL_LAZILY_UNPACK', 'WEBGL_CONV_IM2COL'];

    // Puntaje mínimo de lo que devuelve el detector: bajo, para mostrar TODO en la miniatura y en el diagnóstico.
    // Las reglas (75 %) se aplican después y no cambian.
    const PUNTAJE_MINIMO_CRUDO = 0.1;

    let _detector = null;

    /**
     * Carga UNA vez el detector (COCO-SSD) para toda la app: la cabina, la pantalla de seguimiento y "Mis objetos".
     * @returns {Promise<{modelo:Object, backend:string, gpu:Object|null}>}
     */
    function cargarDetector() {
        if (!_detector) {
            _detector = (async () => {
                if (typeof tf === 'undefined' || typeof cocoSsd === 'undefined') {
                    throw new Error('Faltan TensorFlow.js o COCO-SSD (libs/).');
                }
                // Preferir WebGL; si no está, queda el que haya (CPU es inutilizable para controlar)
                try { if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl'); } catch (_) { /* sin WebGL */ }
                await tf.ready();
                const backend = tf.getBackend();
                let gpu = null;
                if (backend === 'webgl') {
                    try {
                        const float32 = tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE');
                        // Antes de cargar el modelo (los shaders se compilan con estos flags)
                        if (!float32) FLAGS_EMPAQUETADO.forEach(f => tf.env().set(f, false));
                        gpu = { version: tf.env().getNumber('WEBGL_VERSION'), float32, empaquetado: tf.env().getBool('WEBGL_PACK') };
                    } catch (_) { /* sin datos */ }
                }
                const modelo = await cocoSsd.load({ modelUrl: './libs/coco-ssd/model.json' });
                // Calentamiento: la primera inferencia compila los shaders y es lenta
                const c = document.createElement('canvas');
                c.width = 64; c.height = 48;
                await modelo.detect(c);
                return { modelo, backend, gpu };
            })();
            _detector.catch(() => { _detector = null; }); // si falla, se puede reintentar
        }
        return _detector;
    }

    class Vision {
        constructor(ajustes) {
            this.a = ajustes;
            this.modelo = null;
            this.backend = null;
            this.gpu = null;          // datos de WebGL para el modo técnico
            this.conCaras = false;    // BlazeFace cargado
            this.canvas = null;
            this.marco = null;        // último marco usado (para la miniatura y el panel)
            this.fuenteW = 0;
            this.fuenteH = 0;
            this.brillo = null;       // brillo medio (0-255) de la imagen analizada: ~0 = le llega negro
            this._muestra = null;
            this._cuadros = 0;
        }

        async cargar() {
            const d = await cargarDetector();
            this.modelo = d.modelo;
            this.backend = d.backend;
            this.gpu = d.gpu;
            // Caras: si no se puede cargar, se sigue con el cuerpo (el recuadro de respaldo)
            if (typeof DronCaras !== 'undefined') {
                try { await DronCaras.cargar(); this.conCaras = true; } catch (_) { this.conCaras = false; }
            }
            this.canvas = document.createElement('canvas');
            this._muestra = document.createElement('canvas');
            this._muestra.width = 16; this._muestra.height = 16;
            return { backend: this.backend, conCaras: this.conCaras };
        }

        /** Brillo medio de una parte de un lienzo (cada 5 cuadros: leer píxeles frena la GPU). */
        _medirBrillo(m, forzar = false) {
            if (!forzar && this._cuadros++ % 5 !== 0) return;
            this.brillo = brilloMedio(this.canvas, m, this._muestra);
        }

        /** Dibuja la fuente en `lienzo` con el marco de análisis (bordes si hace falta). @returns marco o null */
        prepararLienzo(fuente, lienzo) {
            const fw = fuente.videoWidth || fuente.naturalWidth || fuente.width || 0;
            const fh = fuente.videoHeight || fuente.naturalHeight || fuente.height || 0;
            if (fw < 32 || fh < 32) return null;
            const m = marcoAnalisis(fw, fh, this.a.anchoAnalisis);
            if (lienzo.width !== m.cw || lienzo.height !== m.ch) { lienzo.width = m.cw; lienzo.height = m.ch; }
            const ctx = lienzo.getContext('2d');
            if (m.bordes) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, m.cw, m.ch);
            }
            ctx.drawImage(fuente, m.dx, m.dy, m.dw, m.dh);
            return m;
        }

        /**
         * @param {Object} fuente video, canvas o img
         * @param {boolean} caras buscar caras (solo hace falta con personas)
         * @returns {Promise<{ms:number, crudos:Array, detecciones:Array, caras:Array}|null>} null si la fuente no tiene imagen.
         * crudos: en píxeles del lienzo analizado (miniatura); detecciones y caras: normalizadas a la imagen original.
         */
        async detectar(fuente, caras = true) {
            const m = this.prepararLienzo(fuente, this.canvas);
            if (!m) return null;
            this.marco = m;
            this.fuenteW = fuente.videoWidth || fuente.naturalWidth || fuente.width;
            this.fuenteH = fuente.videoHeight || fuente.naturalHeight || fuente.height;
            this._medirBrillo(m);
            const t0 = performance.now();
            const preds = await this.modelo.detect(this.canvas, 20, Math.min(PUNTAJE_MINIMO_CRUDO, this.a.umbralConfianza));
            let listaCaras = [];
            if (caras && this.conCaras) {
                // Las caras salen normalizadas al lienzo (con bordes): se pasan a la imagen original
                const enLienzo = await DronCaras.detectar(this.canvas, Math.min(PUNTAJE_MINIMO_CRUDO, this.a.umbralCara));
                listaCaras = enLienzo.map(f => ({ ...recuadroEnFuente([f.x * m.cw, f.y * m.ch, f.w * m.cw, f.h * m.ch], m), p: f.p }))
                    .filter(f => f.w > 0 && f.h > 0);
            }
            const ms = performance.now() - t0;
            return {
                ms,
                crudos: preds,
                detecciones: preds.map(p => ({ clase: p.class, score: p.score, bbox: p.bbox, ...recuadroEnFuente(p.bbox, m) })),
                caras: listaCaras,
            };
        }
    }

    /** Brillo medio (0-255) de la parte con imagen de un lienzo, con un lienzo de muestra de 16×16. */
    function brilloMedio(lienzo, m, muestra) {
        try {
            const c = muestra.getContext('2d', { willReadFrequently: true });
            c.drawImage(lienzo, m.dx, m.dy, m.dw, m.dh, 0, 0, 16, 16);
            const d = c.getImageData(0, 0, 16, 16).data;
            let suma = 0;
            for (let i = 0; i < d.length; i += 4) suma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            return Math.round(suma / (d.length / 4));
        } catch (_) {
            return null;
        }
    }

    // ================================================================
    // Orquestador (navegador): ritmos de inferencia y de control, dibujo y estado
    // ================================================================
    class Seguimiento {
        /**
         * @param {Object} opciones
         * @param {HTMLCanvasElement|HTMLVideoElement} opciones.videoEl fuente de imagen
         * @param {HTMLCanvasElement} [opciones.canvasDebug] canvas superpuesto para dibujar los recuadros
         * @param {Object} [opciones.ajustes] ajustes que pisan los guardados
         * @param {Function} [opciones.obtenerContexto] () => {enVuelo, alturaCm, bateria, telemetriaOk} (para el registro y las condiciones)
         * @param {HTMLCanvasElement} [opciones.miniatura] canvas donde se dibuja "lo que ve el modelo" (solo si está visible)
         */
        constructor({ videoEl, canvasDebug = null, ajustes = {}, obtenerContexto = null, miniatura = null }) {
            if (!videoEl) throw new Error('[Seguimiento] Se requiere un elemento <video> o <canvas>.');
            this.fuente = videoEl;
            this.canvasDebug = canvasDebug;
            this.miniatura = miniatura;
            this._ajustesExtra = ajustes;
            this.ajustes = ajustesActuales(ajustes);
            this.obtenerContexto = obtenerContexto;
            /** Registro por cuadro (detección, comando y telemetría); se reinicia al activar */
            this.registro = [];
            this._tActivacion = 0;
            this.vision = new Vision(this.ajustes);
            this.seguidor = null;
            this.activo = false;
            this.modeloCargado = false;
            this.cargando = false;
            /** Si el comando de verdad va al dron (lo pone la cabina; solo cambia lo que se muestra) */
            this.controlReal = false;
            /** @type {Function|null} ({yaw, ud, fb}, info) en cada paso de control (15 Hz) */
            this.onComando = null;
            /** @type {Function|null} (estadoNuevo, estadoAnterior, info) cuando cambia el estado del selector */
            this.onEstado = null;
            this._timerInferencia = null;
            this._timerControl = null;
            this._estadoAnterior = 'apagado';
            this._msInferencia = null;   // EMA del tiempo de inferencia
            this._fps = 0;
            this._tUltimaInferencia = null;
            this._ultimosCandidatos = [];
            /** Objeto de "Mis objetos" a seguir ({id, nombre, huellas}); null = una persona (o lo tocado) */
            this.objeto = null;
            /** Lo elegido tocando un recuadro ({tipo:'persona'} o {tipo:'clase', clase}); null = lo de "¿Qué seguir?" */
            this._metaTocada = null;
        }

        /** Qué se busca ahora. */
        _meta() {
            if (this.objeto) return { tipo: 'mio', nombre: this.objeto.nombre };
            return this._metaTocada || { tipo: 'persona' };
        }

        /**
         * Elige qué seguir: null = una persona; o un objeto de "Mis objetos" (carga MobileNet para las huellas).
         * Vale desde la próxima activación (o enseguida, si se reinicia).
         * @returns {Promise<{ok:boolean, error?:string}>}
         */
        async elegirObjeto(objeto) {
            this._metaTocada = null;
            if (!objeto) { this.objeto = null; return { ok: true }; }
            if (typeof DronObjetos === 'undefined') return { ok: false, error: 'Falta el módulo de Mis objetos.' };
            if (!Array.isArray(objeto.huellas) || !objeto.huellas.length) return { ok: false, error: 'El objeto no tiene fotos analizadas.' };
            try {
                await DronObjetos.cargarModelo();
            } catch (e) {
                return { ok: false, error: `No se pudo cargar el modelo de huellas: ${e?.message || e}` };
            }
            this.objeto = objeto;
            return { ok: true };
        }

        /**
         * Tocaron la imagen en (x, y) normalizados: se elige el recuadro de ahí como objetivo (vuelve a confirmar).
         * @returns {{ok:boolean, nombre?:string}}
         */
        elegirEnPunto(x, y) {
            if (!this.activo || !this.seguidor) return { ok: false };
            const visibles = this._ultimosCandidatos.filter(c => c.conf >= this.ajustes.umbralConfianza);
            const c = Selector.enPunto(visibles.map(normalizarCandidato), { x, y });
            if (!c) return { ok: false };
            if (!this.objeto) this._metaTocada = c.clase === 'person' ? { tipo: 'persona' } : { tipo: 'clase', clase: c.clase };
            const selector = new Selector(this.ajustes, this._meta());
            selector.sembrar({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
            this.seguidor = new Seguidor(this.ajustes, selector);
            this._estadoAnterior = 'buscando';
            return { ok: true, nombre: selector.nombre };
        }

        async inicializar() {
            if (this.modeloCargado) return { ok: true, backend: this.vision.backend };
            if (this.cargando) return { ok: false, error: 'El modelo se está cargando.' };
            this.cargando = true;
            try {
                const { backend, conCaras } = await this.vision.cargar();
                this.modeloCargado = true;
                const avisos = [];
                if (backend !== 'webgl') avisos.push(`La detección usa "${backend}" en vez de la placa de video: va a ser muy lenta y el control real no se va a poder activar.`);
                if (!conCaras) avisos.push('No se pudo cargar el detector de caras: se usa solo el recuadro del cuerpo.');
                return { ok: true, backend, aviso: avisos.join(' ') || null };
            } catch (e) {
                return { ok: false, error: e.message };
            } finally {
                this.cargando = false;
            }
        }

        activar() {
            if (!this.modeloCargado || this.activo) return;
            // Los ajustes se releen al activar: lo que se cambie en Config. del dron vale desde la próxima activación
            this.ajustes = ajustesActuales(this._ajustesExtra);
            this.vision.a = this.ajustes;
            this.seguidor = new Seguidor(this.ajustes, new Selector(this.ajustes, this._meta()));
            this.registro = [];
            this._tActivacion = performance.now();
            this.activo = true;
            this._estadoAnterior = 'buscando';
            this._fps = 0;
            this._tUltimaInferencia = null;
            this._cicloInferencia();
            this._timerControl = setInterval(() => this._tickControl(), Math.round(1000 / 15));
        }

        desactivar() {
            this.activo = false;
            clearTimeout(this._timerInferencia);
            clearInterval(this._timerControl);
            this._timerInferencia = null;
            this._timerControl = null;
            if (this.seguidor) this.seguidor.comando = { yaw: 0, ud: 0, fb: 0 };
            if (typeof this.onComando === 'function') this.onComando({ yaw: 0, ud: 0, fb: 0 }, this.info('apagado'));
            this._ultimosCandidatos = [];
            this._limpiarDebug();
        }

        /** Estado para la pantalla y el registro. */
        info(estado = this.seguidor?.estado || 'apagado') {
            const ahora = performance.now();
            const s = this.seguidor?.selector;
            return {
                estado,
                nombre: s ? s.nombre : (this.objeto ? this.objeto.nombre : 'Persona'),
                confirmaciones: s ? s.confirmaciones : 0,
                confirmacionVentana: this.ajustes.confirmacionVentana,
                backend: this.vision.backend,
                conCaras: this.vision.conCaras,
                fps: Math.round(this._fps * 10) / 10,
                inferenciaMs: this._msInferencia === null ? null : Math.round(this._msInferencia),
                edadMs: s?.ultimaVista ? Math.round(ahora - s.ultimaVista) : null,
                comando: this.seguidor ? { ...this.seguidor.comando } : { yaw: 0, ud: 0, fb: 0 },
                objetivo: s?.objetivo ? { ...s.objetivo } : null,
                candidatos: this._contarValidos(this._ultimosCandidatos),
                analisis: this._analisis(),
                objeto: this.objeto ? this.objeto.nombre : null,
                noEncuentra: !!s?.noEncuentra,
                condiciones: this.condiciones(),
                imagen: this._infoImagen(),
                imagenNegra: this.vision.brillo !== null && this.vision.brillo < 6,
                gpu: this.vision.gpu,
                controlReal: this.controlReal,
            };
        }

        /**
         * "Análisis de confianza": el objetivo (si hay) y los 3 candidatos más fuertes del último cuadro.
         * @returns {Array<{nombre:string, conf:number, objetivo:boolean}>}
         */
        _analisis() {
            const s = this.seguidor?.selector;
            const visibles = this._ultimosCandidatos.filter(c => c.conf >= this.ajustes.umbralConfianza && !(s?.objetivo && this._esObjetivo(c, s.objetivo)))
                .sort((x, y) => y.conf - x.conf).slice(0, 3)
                .map(c => ({ nombre: this.objeto && typeof c.sim === 'number' ? `«${this.objeto.nombre}»` : nombreEspanol(c.clase),
                    conf: this.objeto && typeof c.sim === 'number' ? c.sim : c.conf, tipo: c.tipo, objetivo: false }));
            if (s?.objetivo) {
                visibles.unshift({ nombre: `Objetivo: ${s.nombre}`, conf: s.objetivo.conf ?? 0, tipo: s.objetivo.tipo, objetivo: true });
            }
            return visibles.slice(0, 4);
        }

        /** Tamaño de la cámara, del lienzo analizado y brillo (para el modo técnico). */
        _infoImagen() {
            const v = this.vision;
            if (!v.marco) return null;
            return { fuente: `${v.fuenteW}×${v.fuenteH}`, analizada: `${v.marco.cw}×${v.marco.ch}`, bordes: v.marco.bordes, brillo: v.brillo };
        }

        /** Candidatos de lo que se busca con la confianza que cuenta (en "Mis objetos", los parecidos). */
        _contarValidos(candidatos) {
            if (this.objeto) return this.seguidor?.selector.coincidencias ?? 0;
            const meta = this._meta();
            return candidatos.filter(c => (meta.tipo === 'persona' ? c.clase === 'person' : c.clase === meta.clase)
                && c.conf >= this.ajustes.confirmacionUmbral).length;
        }

        /** Condiciones del control real con el contexto actual del dron (sin dron: no se cumplen). */
        condiciones() {
            const ctx = (typeof this.obtenerContexto === 'function' && this.obtenerContexto()) || {};
            return condicionesControlReal({ ...ctx, backend: this.vision.backend, fps: this._fps }, this.ajustes);
        }

        _registrar(t, r) {
            const ob = this.seguidor.selector.objetivo;
            const cmd = this.seguidor.comando;
            const ctx = (typeof this.obtenerContexto === 'function' && this.obtenerContexto()) || {};
            this.registro.push({
                t: Math.round(t - this._tActivacion),
                estado: this.seguidor.estado,
                candidatos: r ? this._contarValidos(this._ultimosCandidatos) : 0,
                inferenciaMs: r ? Math.round(r.ms) : null,
                fps: Math.round(this._fps * 10) / 10,
                objetivo: ob ? { cx: ob.cx, cy: ob.cy, h: ob.h, conf: ob.conf, tipo: ob.tipo } : null,
                comando: { ...cmd },
                real: this.controlReal,
                enVuelo: ctx.enVuelo ?? null,
                alturaCm: Number.isFinite(ctx.alturaCm) ? Math.round(ctx.alturaCm) : null,
                bateria: Number.isFinite(ctx.bateria) ? Math.round(ctx.bateria) : null,
                brillo: this.vision.brillo,
            });
            if (this.registro.length > 3000) this.registro.shift(); // ~5 min a 10 FPS
        }

        /** Registro en CSV (para "Copiar registro"). */
        registroCSV() {
            const r3 = v => (v === null || v === undefined ? '' : Math.round(v * 1000) / 1000);
            const img = this._infoImagen();
            const filas = [
                // Primera línea: con qué imagen se trabajó (para leer el registro de un celular a distancia)
                `# camara ${img?.fuente || '?'} · analizada ${img?.analizada || '?'}${img?.bordes ? ' con bordes' : ''} · backend ${this.vision.backend || '?'}`
                    + (this.vision.gpu ? ` · WebGL ${this.vision.gpu.version} float32 ${this.vision.gpu.float32 ? 'sí' : 'no'}` : '')
                    + ` · caras ${this.vision.conCaras ? 'sí' : 'no'} · sigue: ${this.seguidor?.selector.nombre || 'una persona'}`,
                't_ms;estado;cuentan;inferencia_ms;fps;obj_tipo;obj_cx;obj_cy;obj_alto;obj_conf;cmd_giro;cmd_altura;cmd_avance;control_real;en_vuelo;altura_cm;bateria;brillo',
            ];
            for (const e of this.registro) {
                filas.push([
                    e.t, e.estado, e.candidatos, e.inferenciaMs ?? '', e.fps,
                    e.objetivo?.tipo || '', r3(e.objetivo?.cx), r3(e.objetivo?.cy), r3(e.objetivo?.h), r3(e.objetivo?.conf),
                    r3(e.comando.yaw), r3(e.comando.ud), r3(e.comando.fb), e.real ? 1 : 0,
                    e.enVuelo === null ? '' : (e.enVuelo ? 1 : 0), e.alturaCm ?? '', e.bateria ?? '', e.brillo ?? '',
                ].join(';'));
            }
            return filas.join('\n');
        }

        async _cicloInferencia() {
            if (!this.activo) return;
            // Pausado mientras corre el diagnóstico o "Probar este cuadro en CPU" (no se pueden mezclar los dos backends)
            if (this._pausado) { this._timerInferencia = setTimeout(() => this._cicloInferencia(), 200); return; }
            const t0 = performance.now();
            try {
                const conCaras = this._meta().tipo === 'persona';
                this._inferenciaEnCurso = this.vision.detectar(this.fuente, conCaras);
                const r = await this._inferenciaEnCurso;
                if (!this.activo) return;
                const t = performance.now();
                if (r) {
                    this._msInferencia = this._msInferencia === null ? r.ms : 0.8 * this._msInferencia + 0.2 * r.ms;
                    const candidatos = combinarPersonas(r.detecciones, r.caras, this.ajustes);
                    if (this.objeto) await this._compararConObjeto(candidatos);
                    if (!this.activo) return;
                    this._ultimosCandidatos = candidatos;
                    this.seguidor.procesarDeteccion(candidatos, this.objeto ? performance.now() : t);
                    this._dibujar(candidatos);
                    this._dibujarMiniatura(r.crudos, r.caras);
                } else {
                    this._ultimosCandidatos = [];
                    this.seguidor.procesarDeteccion([], t);
                    this._limpiarDebug();
                }
                this._registrar(t, r);
                if (this._tUltimaInferencia !== null) {
                    const fpsInst = 1000 / Math.max(1, t - this._tUltimaInferencia);
                    this._fps = this._fps ? 0.8 * this._fps + 0.2 * fpsInst : fpsInst;
                }
                this._tUltimaInferencia = t;
            } catch (e) {
                console.warn('[Seguimiento] Error en la detección:', e?.message || e);
            }
            // FPS adaptativo: entre fpsMin y fpsMax según lo que tarde la inferencia (nunca se superponen)
            const a = this.ajustes;
            const objetivoMs = limitar((this._msInferencia || 100) * 1.2, 1000 / a.fpsMax, 1000 / a.fpsMin);
            const espera = Math.max(0, objetivoMs - (performance.now() - t0));
            this._timerInferencia = setTimeout(() => this._cicloInferencia(), espera);
        }

        /**
         * "Mis objetos": compara con las huellas guardadas solo los candidatos que pide el selector
         * (como mucho 3 buscando; el objetivo cada ~1 s siguiendo). Deja el parecido en `sim`.
         */
        async _compararConObjeto(candidatos) {
            const indices = this.seguidor.selector.aVerificar(candidatos, performance.now());
            for (const i of indices) {
                if (!candidatos[i].bbox) continue;
                const h = await DronObjetos.huella(this.vision.canvas, candidatos[i].bbox);
                candidatos[i].sim = DronObjetos.mejorParecido(h, this.objeto.huellas);
            }
        }

        /** Espera a que termine la inferencia en curso y pausa el ciclo (para el diagnóstico y la prueba en CPU). */
        async _pausar() {
            this._pausado = true;
            await this._inferenciaEnCurso?.catch(() => {});
        }

        /**
         * Modo técnico: analiza el cuadro actual con WebGL (GPU) y con el backend CPU de TensorFlow, para ver
         * si la GPU da otros puntajes. Pausa el ciclo mientras tanto. La CPU es lenta (segundos en el celular).
         * @returns {Promise<{ok:boolean, error?:string, webgl?:Array, cpu?:Array, msWebgl?:number, msCpu?:number, tamano?:string}>}
         */
        async probarCuadroEnCpu() {
            if (!this.modeloCargado) return { ok: false, error: 'Primero activá el seguimiento: el modelo no está cargado.' };
            if (typeof tf === 'undefined') return { ok: false, error: 'Falta TensorFlow.js.' };
            const lienzo = document.createElement('canvas');
            const anterior = tf.getBackend();
            await this._pausar();
            try {
                const m = this.vision.prepararLienzo(this.fuente, lienzo);
                if (!m) return { ok: false, error: 'No hay imagen para analizar.' };
                const resumen = preds => preds.map(p => ({ clase: p.class, score: p.score })).sort((a, b) => b.score - a.score);
                let t0 = performance.now();
                const webgl = resumen(await this.vision.modelo.detect(lienzo, 20, PUNTAJE_MINIMO_CRUDO));
                const msWebgl = Math.round(performance.now() - t0);
                await tf.setBackend('cpu');
                t0 = performance.now();
                const cpu = resumen(await this.vision.modelo.detect(lienzo, 20, PUNTAJE_MINIMO_CRUDO));
                const msCpu = Math.round(performance.now() - t0);
                return { ok: true, webgl, cpu, msWebgl, msCpu, tamano: `${m.cw}×${m.ch}`, backendAnterior: anterior };
            } catch (e) {
                return { ok: false, error: e?.message || String(e) };
            } finally {
                try { if (tf.getBackend() !== anterior) await tf.setBackend(anterior); } catch (_) { /* queda el que haya */ }
                this._pausado = false;
            }
        }

        /**
         * Diagnóstico para la clase: revisa la imagen, la placa de video, el modelo con una foto conocida y
         * lo que ve en el cuadro actual. Pausa el ciclo mientras tanto (unos segundos).
         * @param {HTMLImageElement} fotoPrueba foto conocida con una persona (img/prueba-persona.jpg)
         * @returns {Promise<{items:Array, conclusion:string}>}
         */
        async diagnosticar(fotoPrueba) {
            const ini = await this.inicializar();
            if (!ini.ok) return { items: [{ ok: false, titulo: 'Modelo', detalle: ini.error }], conclusion: `No se pudo cargar el detector: ${ini.error}` };
            const v = this.vision;
            const d = { backend: v.backend, float32: v.gpu ? v.gpu.float32 : null, pruebaPersonaCpu: null };
            const mejorPersona = preds => Math.max(0, ...preds.filter(p => p.class === 'person').map(p => p.score));
            const mejorCara = caras => Math.max(0, ...caras.map(c => c.p));
            const anterior = tf.getBackend();
            await this._pausar();
            try {
                // 1. Imagen: tamaño, brillo y si cambia
                const lienzo = document.createElement('canvas');
                const muestra = document.createElement('canvas');
                muestra.width = 16; muestra.height = 16;
                const m1 = v.prepararLienzo(this.fuente, lienzo);
                d.imagenOk = !!m1;
                if (m1) {
                    d.brillo = brilloMedio(lienzo, m1, muestra);
                    const huella = () => muestra.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 16, 16).data;
                    const antes = Array.from(huella());
                    await new Promise(r => setTimeout(r, 500));
                    const m2 = v.prepararLienzo(this.fuente, lienzo);
                    if (m2) brilloMedio(lienzo, m2, muestra);
                    const despues = huella();
                    d.congelada = antes.every((x, i) => x === despues[i]);
                    // 2. Lo que ve en el cuadro actual (todo desde el 10 %)
                    const t0 = performance.now();
                    const preds = await v.modelo.detect(lienzo, 20, PUNTAJE_MINIMO_CRUDO);
                    const caras = v.conCaras ? await DronCaras.detectar(lienzo, PUNTAJE_MINIMO_CRUDO) : [];
                    d.ms = performance.now() - t0;
                    d.personaCuadro = mejorPersona(preds);
                    d.caraCuadro = mejorCara(caras);
                }
                // 3. Foto de prueba con la placa de video y, si no da bien, con el procesador
                if (fotoPrueba) {
                    if (!fotoPrueba.complete) await new Promise(r => { fotoPrueba.onload = r; fotoPrueba.onerror = r; });
                    d.pruebaPersona = mejorPersona(await v.modelo.detect(fotoPrueba, 20, PUNTAJE_MINIMO_CRUDO));
                    d.pruebaCara = v.conCaras ? mejorCara(await DronCaras.detectar(fotoPrueba, PUNTAJE_MINIMO_CRUDO)) : 0;
                    if (d.pruebaPersona < this.ajustes.umbralConfianza && anterior !== 'cpu') {
                        await tf.setBackend('cpu');
                        d.pruebaPersonaCpu = mejorPersona(await v.modelo.detect(fotoPrueba, 20, PUNTAJE_MINIMO_CRUDO));
                    }
                } else {
                    d.pruebaPersona = 0;
                    d.pruebaCara = 0;
                }
            } catch (e) {
                return { items: [{ ok: false, titulo: 'Diagnóstico', detalle: e?.message || String(e) }], conclusion: `El diagnóstico falló: ${e?.message || e}` };
            } finally {
                try { if (tf.getBackend() !== anterior) await tf.setBackend(anterior); } catch (_) { /* queda el que haya */ }
                this._pausado = false;
            }
            return conclusionDiagnostico(d, this.ajustes);
        }

        _tickControl() {
            if (!this.activo || !this.seguidor) return;
            const { comando, estado } = this.seguidor.tickControl(performance.now());
            if (estado !== this._estadoAnterior) {
                const anterior = this._estadoAnterior;
                this._estadoAnterior = estado;
                if (typeof this.onEstado === 'function') this.onEstado(estado, anterior, this.info(estado));
            }
            if (typeof this.onComando === 'function') this.onComando(comando, this.info(estado));
        }

        /**
         * Recuadros como en RAC: cada candidato con su nombre y porcentaje, y el objetivo con el color del estado
         * (naranja confirmando, verde siguiendo). La etiqueta va arriba a la derecha del recuadro y NUNCA espejada.
         */
        _dibujar(candidatos) {
            const cv = this.canvasDebug;
            if (!cv) return;
            const fw = this.fuente.videoWidth || this.fuente.width || 0;
            const fh = this.fuente.videoHeight || this.fuente.height || 0;
            if (!fw || !fh) return;
            if (cv.width !== fw || cv.height !== fh) { cv.width = fw; cv.height = fh; }
            const ctx = cv.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0); // sin espejo
            ctx.clearRect(0, 0, fw, fh);
            const s = this.seguidor?.selector;
            const ob = s?.objetivo;
            const letra = Math.max(16, Math.round(fw / 26));
            ctx.font = `700 ${letra}px system-ui, sans-serif`;
            ctx.textBaseline = 'bottom';

            const etiqueta = (x, y, w, texto, color) => {
                const pad = Math.round(letra * 0.3);
                const ancho = ctx.measureText(texto).width + pad * 2;
                const alto = letra + pad;
                // Arriba a la derecha del recuadro; si no entra arriba, adentro
                const ex = Math.max(0, Math.min(fw - ancho, x + w - ancho));
                const ey = y - alto >= 0 ? y - alto : y;
                ctx.fillStyle = color;
                ctx.fillRect(ex, ey, ancho, alto);
                ctx.fillStyle = '#0b1220';
                ctx.fillText(texto, ex + pad, ey + alto - Math.round(pad / 2));
            };
            const pc = v => `${Math.round(v * 100)} %`;

            for (const c of candidatos) {
                if (c.conf < this.ajustes.umbralConfianza) continue;
                if (ob && this._esObjetivo(c, ob)) continue;
                const nombre = this.objeto && typeof c.sim === 'number' ? `«${this.objeto.nombre}»` : nombreEspanol(c.clase);
                const conf = this.objeto && typeof c.sim === 'number' ? c.sim : c.conf;
                ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)';
                ctx.lineWidth = Math.max(2, fw / 320);
                ctx.strokeRect(c.x * fw, c.y * fh, c.w * fw, c.h * fh);
                etiqueta(c.x * fw, c.y * fh, c.w * fw, `${nombre} ${pc(conf)}`, 'rgba(147, 197, 253, 0.95)');
            }
            if (ob) {
                const color = s.estado === 'siguiendo' ? '#22c55e' : '#f59e0b';
                const x = (ob.cx - ob.w / 2) * fw;
                const y = (ob.cy - ob.h / 2) * fh;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(3, fw / 160);
                ctx.strokeRect(x, y, ob.w * fw, ob.h * fh);
                etiqueta(x, y, ob.w * fw, `${s.nombre} ${pc(ob.conf || 0)}`, color);
            }
            // Cruz del centro
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fw / 2 - 12, fh / 2); ctx.lineTo(fw / 2 + 12, fh / 2);
            ctx.moveTo(fw / 2, fh / 2 - 12); ctx.lineTo(fw / 2, fh / 2 + 12);
            ctx.stroke();
        }

        /** ¿Este candidato es el objetivo? (para no dibujarlo dos veces) */
        _esObjetivo(c, ob) {
            const n = normalizarCandidato(c);
            return Math.abs(n.cx - ob.cx) < 0.05 + ob.w / 2 && Math.abs(n.cy - ob.cy) < 0.05 + ob.h / 2 && n.tipo === ob.tipo;
        }

        /**
         * Miniatura de "lo que ve el modelo": el lienzo analizado tal cual (con los bordes) y todas sus
         * detecciones, también las de otras clases y las de poca confianza, y las caras. Solo si está visible.
         */
        _dibujarMiniatura(crudos, caras = []) {
            const mini = this.miniatura;
            const v = this.vision;
            if (!mini || !mini.isConnected || mini.offsetParent === null || !v.marco) return;
            const ancho = Math.round(mini.clientWidth * (globalThis.devicePixelRatio || 1)) || 160;
            const escala = ancho / v.marco.cw;
            const alto = Math.max(1, Math.round(v.marco.ch * escala));
            if (mini.width !== ancho || mini.height !== alto) { mini.width = ancho; mini.height = alto; }
            const ctx = mini.getContext('2d');
            ctx.drawImage(v.canvas, 0, 0, ancho, alto);
            ctx.lineWidth = 2;
            ctx.font = `600 ${Math.max(10, Math.round(ancho / 22))}px system-ui, sans-serif`;
            for (const p of crudos || []) {
                const color = p.score >= this.ajustes.confirmacionUmbral ? '#22c55e' : p.score >= this.ajustes.umbralConfianza ? '#f59e0b' : 'rgba(203, 213, 225, 0.8)';
                ctx.strokeStyle = color;
                const [x, y, w, h] = p.bbox.map(n => n * escala);
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = color;
                ctx.fillText(`${nombreEspanol(p.class)} ${Math.round(p.score * 100)}%`, x + 2, Math.max(10, y - 3));
            }
            // Caras (en coordenadas de la imagen original → lienzo analizado)
            const m = v.marco;
            ctx.strokeStyle = '#38bdf8';
            ctx.fillStyle = '#38bdf8';
            for (const f of caras) {
                const x = (m.dx + f.x * m.dw) * escala;
                const y = (m.dy + f.y * m.dh) * escala;
                ctx.strokeRect(x, y, f.w * m.dw * escala, f.h * m.dh * escala);
                ctx.fillText(`cara ${Math.round(f.p * 100)}%`, x + 2, Math.max(10, y - 3));
            }
        }

        _limpiarDebug() {
            const cv = this.canvasDebug;
            if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }
    }

    // ================================================================
    // Textos (cabina y pantalla de seguimiento)
    // ================================================================
    const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100);

    /** Lo que haría el dron, en palabras ("avanzaría, giraría a la derecha"). */
    function describirComando(cmd) {
        const partes = [];
        const umbral = 0.03;
        if (Math.abs(cmd.fb) >= umbral) partes.push(cmd.fb > 0 ? 'avanzaría' : 'retrocedería');
        if (Math.abs(cmd.yaw) >= umbral) partes.push(cmd.yaw > 0 ? 'giraría a la derecha' : 'giraría a la izquierda');
        if (Math.abs(cmd.ud) >= umbral) partes.push(cmd.ud > 0 ? 'subiría' : 'bajaría');
        return partes.length ? partes.join(', ') : 'se quedaría quieto';
    }

    /** Comando en números (modo técnico): valores del "rc" del Tello, de -100 a 100. */
    function comandoEnNumeros(cmd) {
        return `giro ${pct(cmd.yaw)} · altura ${pct(cmd.ud)} · avance ${pct(cmd.fb)}`;
    }

    /** Cartel del ensayo (abajo de la imagen): qué haría el dron, sin moverlo. */
    function textoEnsayo(cmd, info) {
        const que = info.objeto ? `«${info.objeto}»` : (info.nombre || 'la persona');
        switch (info.estado) {
            case 'buscando':
                if (info.objeto && info.noEncuentra) return `No encuentro «${info.objeto}». Probá con más fotos o más luz.`;
                return `Ensayo: buscando ${info.objeto ? que : 'objetivo'}...`;
            case 'confirmando': return `Ensayo: confirmando ${que} (${info.confirmaciones}/${info.confirmacionVentana})`;
            case 'siguiendo': return `Ensayo (no mueve el dron): ${describirComando(cmd)}`;
            case 'perdiendo': return `Ensayo: se está perdiendo ${que}; el dron frenaría de a poco`;
            case 'perdido':
                if (info.objeto && info.noEncuentra) return `No encuentro «${info.objeto}». Probá con más fotos o más luz.`;
                return 'Ensayo: objetivo perdido; el dron se quedaría quieto';
            default: return '';
        }
    }

    /**
     * Estado como en la tarjeta de RAC: título, explicación y color (naranja buscando o confirmando,
     * verde siguiendo, rojo perdido).
     * @returns {{titulo:string, texto:string, color:string}}
     */
    function estadoTarjeta(info) {
        if (info.imagenNegra) return { titulo: 'Sin imagen', texto: 'Al detector le llega una imagen negra.', color: 'error' };
        const n = info.nombre || 'Persona';
        switch (info.estado) {
            case 'buscando':
                if (info.objeto && info.noEncuentra) return { titulo: `No encuentro «${info.objeto}»`, texto: 'Probá con más fotos o más luz.', color: 'error' };
                return { titulo: 'Buscando objetivo...', texto: 'Apuntá a una persona u objeto, o tocá un recuadro para elegirlo.', color: 'advertencia' };
            case 'confirmando':
                return { titulo: `Confirmando: ${n} (${info.confirmaciones}/${info.confirmacionVentana})`, texto: `Necesita ${info.confirmacionVentana} detecciones seguidas de 75 % o más.`, color: 'advertencia' };
            case 'siguiendo':
            case 'perdiendo':
                return { titulo: `Siguiendo: ${n}`, texto: info.objetivo?.tipo === 'cara' ? 'Sigue la cara.' : info.objetivo?.tipo === 'cuerpo' ? 'No ve la cara: sigue el cuerpo.' : 'Sigue el objeto.', color: 'exito' };
            case 'perdido':
                return { titulo: 'Objetivo perdido', texto: 'El dron queda quieto (rc 0 0 0 0). Tocá un recuadro o Iniciar seguimiento para volver a elegir.', color: 'error' };
            default:
                return { titulo: 'Seguimiento detenido', texto: 'Tocá Iniciar seguimiento.', color: '' };
        }
    }

    /**
     * Estado corto para la etiqueta sobre la imagen: texto y color del punto.
     * @returns {{texto:string, color:string}}
     */
    function estadoCorto(info) {
        if (info.imagenNegra) return { texto: 'Sin imagen de la cámara', color: 'error' };
        const n = info.objeto ? `«${info.objeto}»` : (info.nombre || 'Persona');
        switch (info.estado) {
            case 'buscando': return info.objeto && info.noEncuentra ? { texto: `No encuentro ${n}`, color: 'error' } : { texto: 'Buscando objetivo', color: 'advertencia' };
            case 'confirmando': return { texto: `Confirmando ${info.confirmaciones}/${info.confirmacionVentana}`, color: 'advertencia' };
            case 'siguiendo':
            case 'perdiendo': return { texto: `Siguiendo: ${n}`, color: 'exito' };
            case 'perdido': return { texto: 'Objetivo perdido', color: 'error' };
            default: return { texto: 'Seguimiento apagado', color: '' };
        }
    }

    /**
     * Panel detallado (modo técnico): backend, FPS, demora, estado, imagen analizada y condiciones del control real.
     * Se ubica con la clase .panel-seguimiento de app.css.
     */
    class Panel {
        constructor(contenedor) {
            this.el = document.createElement('div');
            this.el.className = 'panel-seguimiento';
            contenedor.appendChild(this.el);
            this._ultimo = 0;
        }

        actualizar(info, forzar = false) {
            const ahora = performance.now();
            if (!forzar && ahora - this._ultimo < 200) return; // 5 veces por segundo alcanza
            this._ultimo = ahora;
            const backend = info.backend === 'webgl' ? 'WebGL (placa de video)' : `${String(info.backend || '?').toUpperCase()} (lento)`;
            const cond = info.condiciones;
            const lineaReal = !cond ? '' : cond.ok ? 'Control real: se cumplen las condiciones'
                : `Control real: todavía no se puede (${cond.motivos[0]}${cond.motivos.length > 1 ? ` y ${cond.motivos.length - 1} más` : ''})`;
            const demora = info.edadMs !== null ? ` · hace ${info.edadMs} ms` : '';
            const img = info.imagen;
            const gpu = info.gpu ? ` · WebGL ${info.gpu.version}, float32 ${info.gpu.float32 ? 'sí' : 'no'}${info.gpu.empaquetado === false ? ', empaquetado apagado' : ''}` : '';
            const lineas = [
                `Visión (backend): ${backend} · ${info.fps} FPS (análisis por segundo) · ${info.inferenciaMs ?? '--'} ms por análisis${demora}`,
                `Caras (BlazeFace): ${info.conCaras ? 'sí' : 'no cargó'} · estado: ${info.estado} · que cuentan (75 % o más): ${info.candidatos}`,
                `Comando calculado (rc, de -100 a 100): ${comandoEnNumeros(info.comando)}`,
                img ? `Imagen: cámara ${img.fuente} → modelo ${img.analizada}${img.bordes ? ' con bordes' : ''} · brillo ${img.brillo ?? '--'}${gpu}` : '',
                info.imagenNegra ? 'ATENCIÓN: al modelo le llega una imagen negra' : '',
                lineaReal,
            ].filter(Boolean);
            this.el.textContent = lineas.join('\n');
        }

        destruir() {
            this.el.remove();
        }
    }

    /** Texto del resultado de "Probar este cuadro en CPU" (modo técnico). */
    function textoPruebaCpu(r, claseObjetivo = 'person') {
        if (!r.ok) return `No se pudo probar: ${r.error}`;
        const lista = l => (l.length ? l.map(d => `${nombreEspanol(d.clase)} ${Math.round(d.score * 100)} %`).join(', ') : 'nada');
        const mejor = l => Math.max(0, ...l.filter(d => d.clase === claseObjetivo).map(d => d.score));
        const g = mejor(r.webgl);
        const c = mejor(r.cpu);
        let conclusion = 'Los dos dan lo mismo: la GPU no es el problema (revisá la imagen, la luz o la distancia).';
        if (Math.abs(g - c) >= 0.15) {
            conclusion = c > g
                ? 'La CPU encuentra más que la GPU: el problema es la precisión de WebGL en este celular.'
                : 'La GPU encuentra más que la CPU: la diferencia no explica que no detecte.';
        }
        return [
            `Mismo cuadro (${r.tamano}), todo desde el 10 %:`,
            `WebGL (GPU, ${r.msWebgl} ms): ${lista(r.webgl)}`,
            `CPU (procesador, ${r.msCpu} ms): ${lista(r.cpu)}`,
            conclusion,
        ].join('\n');
    }

    /** Copia texto al portapapeles (con respaldo para WebViews sin API de portapapeles). */
    async function copiarTexto(texto) {
        try {
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true; }
        } catch (_) { /* se intenta el respaldo */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed; left:-9999px; opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) {
            return false;
        }
    }

    // Partes puras y de pantalla accesibles para la cabina, la pantalla de seguimiento y las pruebas
    Seguimiento.AJUSTES_POR_DEFECTO = AJUSTES_POR_DEFECTO;
    Seguimiento.CLAVE_AJUSTES = CLAVE_AJUSTES;
    Seguimiento.LIMITES_CONTROL_REAL = LIMITES_CONTROL_REAL;
    Seguimiento.ajustesActuales = ajustesActuales;
    Seguimiento.Controlador = Controlador;
    Seguimiento.Selector = Selector;
    Seguimiento.Seguidor = Seguidor;
    Seguimiento.combinarPersonas = combinarPersonas;
    Seguimiento.nombreEspanol = nombreEspanol;
    Seguimiento.comandoControlReal = comandoControlReal;
    Seguimiento.textoRc = textoRc;
    Seguimiento.condicionesControlReal = condicionesControlReal;
    Seguimiento.conclusionDiagnostico = conclusionDiagnostico;
    Seguimiento.RANGOS = RANGOS;
    Seguimiento.validarAjustes = validarAjustes;
    Seguimiento.guardarAjustes = guardarAjustes;
    Seguimiento.restaurarAjustes = restaurarAjustes;
    Seguimiento.textoEnsayo = textoEnsayo;
    Seguimiento.describirComando = describirComando;
    Seguimiento.cargarDetector = cargarDetector;
    Seguimiento.estadoCorto = estadoCorto;
    Seguimiento.estadoTarjeta = estadoTarjeta;
    Seguimiento.textoPruebaCpu = textoPruebaCpu;
    Seguimiento.marcoAnalisis = marcoAnalisis;
    Seguimiento.recuadroEnFuente = recuadroEnFuente;
    Seguimiento.Panel = Panel;
    Seguimiento.copiarTexto = copiarTexto;
    return Seguimiento;
})();

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronSeguimiento;
