/**
 * Pruebas automáticas de los botones de mantener apretado (DronBotonesMovimiento, dron-joystick.js):
 * ejes por botón, combinaciones, velocidades y frenado al soltar, al salir del botón, al cancelar el
 * toque, al pasar a segundo plano y al perder el foco. Los eventos del puntero se simulan.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DronBotonesMovimiento } = require('../backend/public/js/dron-joystick.js');

const { ejesDesdeBotones, VELOCIDADES } = DronBotonesMovimiento;
const CERO = { lr: 0, fb: 0, ud: 0, yaw: 0 };

/** Botón falso: 60x60 px en (x, y), con lo mínimo que usa la clase. */
class BotonFalso extends EventTarget {
    constructor(accion, x, y) {
        super();
        this.dataset = { mover: accion };
        this.disabled = false;
        this.capturas = new Set();
        const clases = new Set();
        this.classList = { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) };
        this.rect = { left: x, top: y, right: x + 60, bottom: y + 60 };
    }
    getBoundingClientRect() { return this.rect; }
    setPointerCapture(id) { this.capturas.add(id); }
    releasePointerCapture(id) { this.capturas.delete(id); }
}

function armar(velocidad) {
    const acciones = Object.keys(DronBotonesMovimiento.EJES_BOTON);
    const botones = Object.fromEntries(acciones.map((a, i) => [a, new BotonFalso(a, i * 100, 0)]));
    const contenedor = { querySelectorAll: () => Object.values(botones) };
    const documento = new EventTarget();
    documento.visibilityState = 'visible';
    const ventana = new EventTarget();
    const mando = new DronBotonesMovimiento({ contenedor, velocidad, documento, ventana });
    const cambios = [];
    mando.onCambio = (ejes, acc) => cambios.push({ ejes, acc });
    const ultimo = () => cambios[cambios.length - 1]?.ejes;
    return { mando, botones, documento, ventana, cambios, ultimo };
}

function puntero(tipo, boton, pointerId, dx = 30, dy = 30) {
    const e = new Event(tipo, { cancelable: true });
    Object.assign(e, { pointerId, clientX: boton.rect.left + dx, clientY: boton.rect.top + dy });
    boton.dispatchEvent(e);
    return e;
}

test('cada botón mueve solo su eje, con el sentido del joystick', () => {
    const v = 0.2;
    assert.deepEqual(ejesDesdeBotones(['adelante'], v), { ...CERO, fb: 0.2 });
    assert.deepEqual(ejesDesdeBotones(['atras'], v), { ...CERO, fb: -0.2 });
    assert.deepEqual(ejesDesdeBotones(['izquierda'], v), { ...CERO, lr: -0.2 });
    assert.deepEqual(ejesDesdeBotones(['derecha'], v), { ...CERO, lr: 0.2 });
    assert.deepEqual(ejesDesdeBotones(['subir'], v), { ...CERO, ud: 0.2 });
    assert.deepEqual(ejesDesdeBotones(['bajar'], v), { ...CERO, ud: -0.2 });
    assert.deepEqual(ejesDesdeBotones(['girar-izq'], v), { ...CERO, yaw: -0.2 });
    assert.deepEqual(ejesDesdeBotones(['girar-der'], v), { ...CERO, yaw: 0.2 });
});

test('combinaciones: dos ejes a la vez; opuestos se anulan; nombres desconocidos no hacen nada', () => {
    assert.deepEqual(ejesDesdeBotones(['adelante', 'subir'], 0.35), { ...CERO, fb: 0.35, ud: 0.35 });
    assert.deepEqual(ejesDesdeBotones(['adelante', 'atras'], 0.5), CERO);
    assert.deepEqual(ejesDesdeBotones(['volar-solo'], 0.5), CERO);
    assert.deepEqual(ejesDesdeBotones(['adelante', 'adelante'], 0.2), { ...CERO, fb: 0.2 });
    assert.deepEqual(ejesDesdeBotones(['adelante'], 7), { ...CERO, fb: 1 });
});

test('velocidades: lenta 20 %, normal 35 %, rápida 50 %; arranca en lenta', () => {
    assert.deepEqual({ ...VELOCIDADES }, { lenta: 0.2, normal: 0.35, rapida: 0.5 });
    const { mando } = armar();
    assert.equal(mando.velocidad, 'lenta');
});

test('apretar mueve, soltar frena ese eje, y dos dedos combinan', () => {
    const { botones, ultimo, cambios } = armar('lenta');
    const e = puntero('pointerdown', botones.adelante, 1);
    assert.ok(e.defaultPrevented);
    assert.deepEqual(ultimo(), { ...CERO, fb: 0.2 });
    assert.ok(botones.adelante.classList.contains('cab-mantener--activo'));
    puntero('pointerdown', botones.subir, 2);
    assert.deepEqual(ultimo(), { ...CERO, fb: 0.2, ud: 0.2 });
    puntero('pointerup', botones.adelante, 1);
    assert.deepEqual(ultimo(), { ...CERO, ud: 0.2 });
    assert.ok(!botones.adelante.classList.contains('cab-mantener--activo'));
    puntero('pointerup', botones.subir, 2);
    assert.deepEqual(ultimo(), CERO);
    assert.equal(cambios.length, 4);
});

test('el dedo que sale del botón frena; moverse adentro no', () => {
    const { botones, ultimo } = armar();
    puntero('pointerdown', botones.derecha, 7);
    puntero('pointermove', botones.derecha, 7, 55, 5);
    assert.deepEqual(ultimo(), { ...CERO, lr: 0.2 });
    puntero('pointermove', botones.derecha, 7, 75, 30);
    assert.deepEqual(ultimo(), CERO);
    assert.equal(botones.derecha.capturas.size, 0);
});

test('toque cancelado o captura perdida frenan', () => {
    const { botones, ultimo } = armar();
    puntero('pointerdown', botones.bajar, 3);
    puntero('pointercancel', botones.bajar, 3);
    assert.deepEqual(ultimo(), CERO);
    puntero('pointerdown', botones['girar-der'], 4);
    assert.deepEqual(ultimo(), { ...CERO, yaw: 0.2 });
    puntero('lostpointercapture', botones['girar-der'], 4);
    assert.deepEqual(ultimo(), CERO);
});

test('segundo plano, pérdida de foco y salida de la página frenan todo', () => {
    for (const disparar of [
        ({ documento }) => { documento.visibilityState = 'hidden'; documento.dispatchEvent(new Event('visibilitychange')); },
        ({ ventana }) => ventana.dispatchEvent(new Event('blur')),
        ({ ventana }) => ventana.dispatchEvent(new Event('pagehide')),
    ]) {
        const m = armar();
        puntero('pointerdown', m.botones.adelante, 1);
        puntero('pointerdown', m.botones['girar-izq'], 2);
        assert.deepEqual(m.ultimo(), { ...CERO, fb: 0.2, yaw: -0.2 });
        disparar(m);
        assert.deepEqual(m.ultimo(), CERO);
        assert.deepEqual(m.mando.acciones(), []);
    }
});

test('volver a primer plano no mueve nada (hay que apretar de nuevo)', () => {
    const m = armar();
    m.documento.visibilityState = 'visible';
    m.documento.dispatchEvent(new Event('visibilitychange'));
    assert.equal(m.cambios.length, 0);
});

test('cambiar la velocidad con un botón apretado actualiza el eje', () => {
    const { mando, botones, ultimo } = armar();
    puntero('pointerdown', botones.adelante, 1);
    mando.setVelocidad('rapida');
    assert.deepEqual(ultimo(), { ...CERO, fb: 0.5 });
    mando.setVelocidad('turbo');
    assert.equal(mando.velocidad, 'rapida');
});

test('deshabilitado (en tierra) no se puede apretar; al deshabilitar se suelta todo', () => {
    const { mando, botones, ultimo, cambios } = armar();
    puntero('pointerdown', botones.subir, 1);
    mando.habilitar(false);
    assert.deepEqual(ultimo(), CERO);
    assert.ok(Object.values(botones).every(b => b.disabled));
    const n = cambios.length;
    puntero('pointerdown', botones.subir, 2);
    assert.equal(cambios.length, n);
    mando.habilitar(true);
    assert.ok(Object.values(botones).every(b => !b.disabled));
});

test('bloqueados (inclinación activa): se sueltan y siguen bloqueados al habilitar', () => {
    const { mando, botones, ultimo } = armar();
    puntero('pointerdown', botones.adelante, 1);
    puntero('pointerdown', botones.subir, 2);
    mando.setBloqueados(['adelante', 'atras', 'izquierda', 'derecha']);
    assert.deepEqual(ultimo(), { ...CERO, ud: 0.2 });
    assert.ok(botones.adelante.disabled && !botones.subir.disabled);
    mando.habilitar(false);
    mando.habilitar(true);
    assert.ok(botones.adelante.disabled && !botones.subir.disabled);
    mando.setBloqueados([]);
    assert.ok(!botones.adelante.disabled);
});

test('destruir frena y deja de escuchar', () => {
    const { mando, botones, ultimo, cambios } = armar();
    puntero('pointerdown', botones.atras, 1);
    mando.destruir();
    assert.deepEqual(ultimo(), CERO); // frena antes de dejar de avisar
    assert.equal(mando.onCambio, null);
    const n = cambios.length;
    puntero('pointerdown', botones.atras, 2);
    assert.equal(cambios.length, n);
});
