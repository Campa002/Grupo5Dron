/**
 * Pruebas automáticas de la inclinación (dron-giroscopio.js): cálculo con el acelerómetro y
 * elección del sensor, simulando los eventos de un celular con y sin giroscopio.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const DronGiroscopio = require('../backend/public/js/dron-giroscopio.js');

const { inclinacionDesdeGravedad, inclinacionEnPantalla, arribaDesdeInclinacion, LectorInclinacion } = DronGiroscopio;
const G = 9.81;
const cerca = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const esperar = ms => new Promise(r => setTimeout(r, ms));

/** Gravedad que mide el acelerómetro con el teléfono en beta y gamma (convención de deviceorientation). */
function gravedad(beta, gamma) {
    const v = arribaDesdeInclinacion(beta, gamma);
    return { x: G * v.x, y: G * v.y, z: G * v.z };
}

/**
 * beta y gamma del TELÉFONO cuando, respecto de la pantalla girada `angulo`, está en (betaP, gammaP).
 * Es lo que mandaría el sensor si sostenés el celular así (la inversa de inclinacionEnPantalla).
 */
function telefonoDesdePantalla(betaP, gammaP, angulo) {
    const s = arribaDesdeInclinacion(betaP, gammaP);
    const t = angulo * Math.PI / 180;
    const c = Math.round(Math.cos(t));
    const n = Math.round(Math.sin(t));
    return inclinacionDesdeGravedad(s.x * c + s.y * n, -s.x * n + s.y * c, s.z);
}

function evento(tipo, datos) {
    const ev = new Event(tipo);
    Object.assign(ev, datos);
    return ev;
}

test('acelerómetro: apoyado boca arriba → beta 0 y gamma 0', () => {
    const r = inclinacionDesdeGravedad(0, 0, G);
    assert.ok(cerca(r.beta, 0) && cerca(r.gamma, 0), JSON.stringify(r));
});

test('acelerómetro: parado con la pantalla hacia vos → beta 90 (igual que deviceorientation)', () => {
    const r = inclinacionDesdeGravedad(0, G, 0);
    assert.ok(cerca(r.beta, 90), JSON.stringify(r));
});

test('acelerómetro: bajar el costado derecho → gamma positivo', () => {
    const g = gravedad(0, 20);
    const r = inclinacionDesdeGravedad(g.x, g.y, g.z);
    assert.ok(cerca(r.gamma, 20), JSON.stringify(r));
});

test('acelerómetro: recupera beta y gamma combinados', () => {
    for (const [b, c] of [[30, 0], [-25, 10], [45, -15], [10, 35]]) {
        const g = gravedad(b, c);
        const r = inclinacionDesdeGravedad(g.x, g.y, g.z);
        assert.ok(cerca(r.beta, b) && cerca(r.gamma, c), `${b},${c} → ${JSON.stringify(r)}`);
    }
});

test('celular SIN giroscopio: orientación vacía → usa el acelerómetro, sin giro vertical', async () => {
    const objetivo = new EventTarget();
    const fuentes = [];
    const lecturas = [];
    const lector = new LectorInclinacion({ objetivo, esperaMs: 30, sinDatosMs: 1000, onFuente: f => fuentes.push(f), onLectura: l => lecturas.push(l) });
    lector.iniciar();
    // Chrome sin giroscopio: deviceorientation con todo en null
    objetivo.dispatchEvent(evento('deviceorientation', { alpha: null, beta: null, gamma: null }));
    objetivo.dispatchEvent(evento('devicemotion', { accelerationIncludingGravity: gravedad(20, -10), rotationRate: null }));
    await esperar(50);
    for (let i = 0; i < 40; i++) objetivo.dispatchEvent(evento('devicemotion', { accelerationIncludingGravity: gravedad(20, -10), rotationRate: null }));
    lector.detener();
    assert.deepEqual(fuentes, ['acelerometro']);
    const ultima = lecturas.at(-1);
    assert.equal(ultima.fuente, 'acelerometro');
    assert.equal(ultima.alpha, null, 'sin giroscopio no hay giro sobre el eje vertical');
    assert.ok(cerca(ultima.beta, 20, 1) && cerca(ultima.gamma, -10, 1), JSON.stringify(ultima));
});

test('acelerómetro suavizado: un sacudón de un instante casi no mueve la lectura', () => {
    const objetivo = new EventTarget();
    const lecturas = [];
    const lector = new LectorInclinacion({ objetivo, esperaMs: 0, onLectura: l => lecturas.push(l) });
    lector.iniciar();
    for (let i = 0; i < 30; i++) objetivo.dispatchEvent(evento('devicemotion', { accelerationIncludingGravity: gravedad(0, 0) }));
    objetivo.dispatchEvent(evento('devicemotion', { accelerationIncludingGravity: { x: 15, y: 0, z: G } }));
    lector.detener();
    assert.ok(Math.abs(lecturas.at(-1).gamma) < 25, `un pico de 15 m/s² sin filtrar daría ~-57°: ${lecturas.at(-1).gamma}`);
});

test('celular CON giroscopio: se usa la orientación y se ignora el acelerómetro (como antes)', async () => {
    const objetivo = new EventTarget();
    const fuentes = [];
    const lecturas = [];
    const lector = new LectorInclinacion({ objetivo, esperaMs: 30, onFuente: f => fuentes.push(f), onLectura: l => lecturas.push(l) });
    lector.iniciar();
    objetivo.dispatchEvent(evento('deviceorientation', { alpha: 100, beta: 12, gamma: -4 }));
    await esperar(50);
    objetivo.dispatchEvent(evento('devicemotion', { accelerationIncludingGravity: gravedad(60, 30) }));
    objetivo.dispatchEvent(evento('deviceorientation', { alpha: 101, beta: 13, gamma: -5 }));
    lector.detener();
    assert.deepEqual(fuentes, ['giroscopio']);
    assert.ok(lecturas.every(l => l.fuente === 'giroscopio'));
    assert.deepEqual(lecturas.at(-1), { beta: 13, gamma: -5, alpha: 101, fuente: 'giroscopio' });
});

test('sin ningún sensor (PC): avisa "ninguno"', async () => {
    const objetivo = new EventTarget();
    const fuentes = [];
    const lector = new LectorInclinacion({ objetivo, sinDatosMs: 40, onFuente: f => fuentes.push(f) });
    lector.iniciar();
    await esperar(80);
    lector.detener();
    assert.deepEqual(fuentes, ['ninguno']);
});

test('DronGiroscopio: con giroscopio, misma calibración, zona muerta y escala que antes', () => {
    const cambios = [];
    const giro = new DronGiroscopio({ onChange: c => cambios.push(c), suavizado: 0 });
    // La primera lectura solo calibra
    giro._procesarLectura(10, 5);
    assert.equal(cambios.length, 0);
    // Dentro de la zona muerta (3°): nada
    giro._procesarLectura(12, 7);
    assert.equal(cambios.length, 0);
    // 15° de más adelante sobre 30° de límite → pitch 0,5
    giro._procesarLectura(25, 5);
    assert.deepEqual(cambios.at(-1), { pitch: 0.5, roll: 0 });
    // Más allá del límite → 1
    giro._procesarLectura(80, -40);
    assert.deepEqual(cambios.at(-1), { pitch: 1, roll: -1 });
});

// ---------------------------------------------------------------
// Inclinación respecto de la pantalla (vertical y las dos horizontales)
// ---------------------------------------------------------------

test('acelerómetro: inversa exacta de deviceorientation también con beta y gamma combinados grandes', () => {
    for (const [b, c] of [[60, 40], [-120, 30], [150, -70], [100, 10]]) {
        const v = arribaDesdeInclinacion(b, c);
        const r = inclinacionDesdeGravedad(v.x, v.y, v.z);
        assert.ok(cerca(r.beta, b, 0.01) && cerca(r.gamma, c, 0.01), `${b},${c} → ${JSON.stringify(r)}`);
    }
});

test('pantalla vertical (ángulo 0): devuelve exactamente lo mismo de siempre', () => {
    for (const [b, c] of [[45, 0], [12.345, -7.5], [89, 60]]) {
        assert.deepEqual(inclinacionEnPantalla(b, c, 0), { beta: b, gamma: c });
    }
});

test('horizontal: celular acostado y parado frente a vos → 90° adelante/atrás respecto de la pantalla', () => {
    // Girado antihorario (90): el borde derecho del teléfono queda arriba → gamma del teléfono -90
    const r90 = inclinacionEnPantalla(0, -90, 90);
    assert.ok(cerca(r90.beta, 90) && cerca(r90.gamma, 0), JSON.stringify(r90));
    // Girado horario (270): el borde izquierdo queda arriba → gamma del teléfono +90
    const r270 = inclinacionEnPantalla(0, 90, 270);
    assert.ok(cerca(r270.beta, 90) && cerca(r270.gamma, 0), JSON.stringify(r270));
});

test('horizontal y vertical invertida: la inclinación vuelve a quedar en los ejes de la pantalla', () => {
    for (const angulo of [90, 180, 270]) {
        for (const [b, c] of [[45, 0], [60, 0], [45, 15], [30, -20]]) {
            const tel = telefonoDesdePantalla(b, c, angulo);
            const r = inclinacionEnPantalla(tel.beta, tel.gamma, angulo);
            assert.ok(cerca(r.beta, b, 0.01) && cerca(r.gamma, c, 0.01), `${angulo}°: ${b},${c} → ${JSON.stringify(r)}`);
        }
    }
});

for (const angulo of [0, 90, 270]) {
    test(`DronGiroscopio a ${angulo}°: inclinar hacia el borde de arriba de la pantalla es avanzar, y al costado es lateral`, () => {
        const cambios = [];
        const giro = new DronGiroscopio({ onChange: c => cambios.push(c), suavizado: 0, obtenerAngulo: () => angulo });
        giro.activo = true;
        giro.angulo = angulo;
        const leer = (b, c) => { const t = telefonoDesdePantalla(b, c, angulo); giro._procesarLectura(t.beta, t.gamma); };
        leer(45, 0);                 // calibra: celular a 45° respecto de la pantalla
        leer(60, 0);                 // 15° más → pitch 0,5 y nada de lateral
        assert.deepEqual(cambios.at(-1), { pitch: 0.5, roll: 0 });
        leer(45, 15);                // 15° al costado derecho → roll 0,5 y nada de avance
        assert.deepEqual(cambios.at(-1), { pitch: 0, roll: 0.5 });
    });
}

test('DronGiroscopio: si la pantalla gira con la inclinación activada, se apaga con ejes en 0 y avisa', () => {
    let angulo = 90;
    const cambios = [];
    const avisos = [];
    const giro = new DronGiroscopio({ onChange: c => cambios.push(c), suavizado: 0, obtenerAngulo: () => angulo });
    giro.onCambioOrientacion = a => avisos.push(a);
    giro.activo = true;
    giro.angulo = 90;
    let t = telefonoDesdePantalla(45, 0, 90);
    giro._procesarLectura(t.beta, t.gamma);
    t = telefonoDesdePantalla(60, 0, 90);
    giro._procesarLectura(t.beta, t.gamma);
    assert.deepEqual(cambios.at(-1), { pitch: 0.5, roll: 0 });
    angulo = 270;                    // el celular dio vuelta
    t = telefonoDesdePantalla(60, 0, 270);
    giro._procesarLectura(t.beta, t.gamma);
    assert.equal(giro.activo, false);
    assert.deepEqual(cambios.at(-1), { pitch: 0, roll: 0 });
    assert.deepEqual(avisos, [270]);
});
