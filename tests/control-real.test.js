/**
 * Pruebas del control real del seguimiento (S3): límites bajos, nunca roll, zona muerta,
 * y "objetivo perdido = quieto" (rc 0 0 0 0). Sin navegador ni dron.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Seguimiento = require('../backend/public/js/dron-seguimiento.js');

const A = { ...Seguimiento.AJUSTES_POR_DEFECTO };
const L = Seguimiento.LIMITES_CONTROL_REAL;
const real = Seguimiento.comandoControlReal;

function persona(cx, cy, h, score = 0.9) {
    const w = h * 0.4;
    return { clase: 'person', score, x: cx - w / 2, y: cy - h / 2, w, h };
}

test('límites conservadores en una constante: 20 de giro, 15 de altura y de avance, sin roll', () => {
    assert.equal(L.yaw, 0.20);
    assert.equal(L.ud, 0.15);
    assert.equal(L.fb, 0.15);
    assert.ok(L.zonaMuerta > 0);
    assert.ok(Object.isFrozen(L), 'no se puede cambiar desde la app');
});

test('el comando nunca pasa los límites y el roll siempre es 0', () => {
    const r = real({ yaw: 0.9, ud: -0.8, fb: 0.5 }, 'siguiendo');
    assert.deepEqual(r, { lr: 0, fb: 0.15, ud: -0.15, yaw: 0.20 });
    const r2 = real({ yaw: -0.9, ud: 0.8, fb: -0.5, lr: 0.7 }, 'siguiendo');
    assert.deepEqual(r2, { lr: 0, fb: -0.15, ud: 0.15, yaw: -0.20 });
});

test('zona muerta: valores chicos se mandan como 0 (para que no tiemble)', () => {
    assert.deepEqual(real({ yaw: 0.03, ud: -0.02, fb: 0.039 }, 'siguiendo'), { lr: 0, fb: 0, ud: 0, yaw: 0 });
    assert.equal(real({ yaw: 0.05, ud: 0, fb: 0 }, 'siguiendo').yaw, 0.05);
});

test('objetivo perdido (o sin objetivo) = quieto: rc 0 0 0 0, aunque el comando calculado no sea 0', () => {
    for (const estado of ['perdido', 'buscando', 'confirmando', 'apagado', undefined]) {
        const r = real({ yaw: 0.3, ud: 0.2, fb: 0.2 }, estado);
        assert.deepEqual(r, { lr: 0, fb: 0, ud: 0, yaw: 0 }, String(estado));
        assert.equal(Seguimiento.textoRc(r), 'rc 0 0 0 0');
    }
    assert.deepEqual(real({ yaw: NaN, ud: undefined, fb: null }, 'siguiendo'), { lr: 0, fb: 0, ud: 0, yaw: 0 });
});

test('texto del comando como lo recibe el Tello (rc roll avance altura giro), sin "-0"', () => {
    assert.equal(Seguimiento.textoRc({ lr: 0, fb: 0.15, ud: -0.1, yaw: -0.2 }), 'rc 0 15 -10 -20');
    assert.equal(Seguimiento.textoRc({ lr: -0, fb: -0.001, ud: 0, yaw: 0 }), 'rc 0 0 0 0');
});

test('recorrido completo: sigue a una persona a la derecha dentro de los límites y, al perderla, queda quieto', () => {
    const seg = new Seguimiento.Seguidor(A);
    const enviados = [];
    let tDet = 0;
    for (let t = 0; t <= 6000; t += 1000 / 15) {
        while (tDet <= t) {
            // Visible los primeros 3 s, lejos y a la derecha; después desaparece
            seg.procesarDeteccion(tDet < 3000 ? [persona(0.9, 0.3, 0.2)] : [], tDet);
            tDet += 125;
        }
        const { comando, estado } = seg.tickControl(t);
        enviados.push({ t, estado, rc: real(comando, estado) });
    }
    assert.ok(enviados.every(e => e.rc.lr === 0), 'nunca roll');
    assert.ok(enviados.every(e => Math.abs(e.rc.yaw) <= L.yaw + 1e-12 && Math.abs(e.rc.ud) <= L.ud + 1e-12 && Math.abs(e.rc.fb) <= L.fb + 1e-12));
    const siguiendo = enviados.filter(e => e.t > 2000 && e.t < 3000);
    assert.ok(siguiendo.every(e => e.rc.yaw > 0 && e.rc.fb > 0 && e.rc.ud > 0), 'gira, avanza y sube hacia ella');
    assert.ok(siguiendo.some(e => e.rc.yaw === L.yaw), 'llega al límite de giro');
    const perdidos = enviados.filter(e => e.estado === 'perdido');
    assert.ok(perdidos.length > 0, 'se pierde');
    assert.ok(perdidos.every(e => e.rc.yaw === 0 && e.rc.ud === 0 && e.rc.fb === 0), 'perdido: rc 0 0 0 0');
    assert.equal(enviados[enviados.length - 1].estado, 'perdido', 'no vuelve a moverse solo');
});
