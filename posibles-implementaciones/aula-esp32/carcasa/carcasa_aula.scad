// ============================================================
// Carcasa triangular del equipo del aula — Grupo 5: Control de Sistemas y Dron
// EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
//
// Prisma de base triangular (triángulo rectángulo isósceles visto desde arriba):
//  - el FRENTE es la hipotenusa (ahí van los prensacables, el portafusible, el USB, el receptor IR
//    y los conectores de las cápsulas);
//  - los dos lados CORTOS forman un ángulo de 90°: la caja entra justo en una esquina del aula.
// Se apoya en una mesa, se atornilla a la pared por el piso o se atornilla en una esquina por los lados.
//
// Adentro, una pared separa la zona de 220 V (derecha: fuente HLK-5M05, relé, borneras) de la
// zona de baja tensión (izquierda: ESP32, KY-022, plaquita con el BC337 y las resistencias).
//
// Piezas (elegir con la variable "pieza" o desde la línea de comandos: -D 'pieza="tapa"'):
//   "cuerpo", "tapa", "capsula" (cápsula del LED IR), "soporte" (base para una cápsula alejada),
//   "ensamble" (vista de todo armado, solo para mirar), "interior" (el cuerpo con los componentes de
//   referencia: verde = baja tensión, rojo = 220 V) y "plano" (todas las piezas juntas).
//
// Todas las medidas están en milímetros. Las que dicen (CALIBRE) hay que confirmarlas con un calibre.
// ============================================================

pieza = "ensamble";
imprimir = false;  // true: gira el cuerpo y la tapa 135° para que los lados cortos queden sobre los ejes de la cama
                   // (así la caja entra en una cama de 220 x 220 mm). Los .stl ya vienen girados.

// ---------------- Medidas generales ----------------
L        = 120;   // mitad del ancho interior del frente (el frente interior mide 2*L)
alto     = 40;    // alto interior útil (del piso a la tapa)
pared    = 3;     // espesor de las paredes
piso     = 3;     // espesor del piso
tapa_t   = 3;     // espesor de la tapa
holgura  = 0.3;   // tolerancia de impresión para todo lo que encastra
radio_ext = 3;    // redondeo de las esquinas exteriores

// ---------------- Componentes (CALIBRE) ----------------
// ESP32 NodeMCU de 30 pines: la placa apoya en dos rieles, con el USB contra el frente
esp32       = [28.3, 51.5];  // ancho y largo de la placa (CALIBRE)
esp32_pines = 9;             // alto de las patas por debajo de la placa: altura de los rieles (CALIBRE)
esp32_x     = -22;           // centro de la placa en X (zona de baja tensión: X negativo)
usb_ventana = [12, 8];       // ancho y alto de la ventana para la ficha USB (CALIBRE la ficha)

// Receptor KY-022: la plaquita va parada en una ranura, con el receptor contra una ventana del frente
ky022       = [18.5, 15];    // ancho y alto de la plaquita (CALIBRE)
ky022_x     = -50;           // centro en X
ky022_z     = 9;             // altura del centro del receptor sobre el piso interior (CALIBRE)
ky022_ventana = 7;           // diámetro de la ventana del receptor
ky022_separacion = 5;        // distancia del frente a la cara de la plaquita (lo que sobresale el receptor) (CALIBRE)

// Plaquita perforada con el BC337 y las resistencias (va sobre 4 postes)
perf        = [30, 20];      // ancho (X) y profundidad (Y) de la plaquita (CALIBRE)
perf_pos    = [-70, 24];     // esquina delantera izquierda
perf_inset  = 2.5;           // distancia de los agujeros a los bordes
poste_alto  = 5;

// Conectores JST-XH de 2 pines de las cápsulas, accesibles desde afuera en el frente
jst_ventana = [8.2, 6.8];    // hueco del encapsulado del conector (CALIBRE)
jst_x       = [-72, -88];    // J1 y J2
jst_z       = 10;            // altura del centro sobre el piso interior

// Zona de 220 V
hlk         = [34, 20, 15];  // fuente HLK-5M05: largo, ancho y alto (CALIBRE)
hlk_pos     = [40, 20];      // esquina delantera izquierda
rele        = [26, 50];      // módulo relé de 1 canal: ancho (X) y largo (Y) (CALIBRE)
rele_pos    = [5, 37];       // esquina delantera izquierda (las borneras de 220 V del lado del frente)
rele_agujeros = [[3, 3], [23, 3], [3, 47], [23, 47]]; // agujeros del módulo, desde su esquina (CALIBRE)
rele_tornillo = 2.6;         // agujero guía para tornillo autorroscante M3
pg7         = 12.7;          // agujero para prensacables PG7 (rosca de 12,5 mm) (CALIBRE)
pg7_x       = [48, 74];      // entrada de 220 V y salida a la lámpara
portafusible = 12.5;         // agujero del portafusible de chasis 5x20 (CALIBRE el tuyo)
portafusible_x = 18;
paso_cables = [20, 8];       // muesca arriba de la pared separadora para los cables de baja tensión (largo y alto)
paso_cables_y = 76;          // dónde empieza la muesca (cerca del conector de baja tensión del relé)

// Ventilación (solo en la zona de 220 V): ranuras de 2 mm (no entra un dedo ni un alambre grueso)
vent_ancho  = 2;
vent_alto   = 18;
vent_n      = 6;

// Fijación
tornillo_pared = 4.5;        // agujeros para tornillos de pared (y tarugos de 6 mm)
tornillo_tapa  = 3.4;        // agujero de la tapa para tornillo M3
tornillo_tapa_cabeza = 6.5;  // avellanado de la tapa
torre_d     = 9;             // torres para los tornillos de la tapa
torre_guia  = 2.5;           // agujero guía de las torres (M3 autorroscante)

// Cápsula del LED IR (rótula)
bola_d      = 20;            // diámetro de la bola
led_d       = 5;             // LED IR de 5 mm (CALIBRE)
led_pestana = 5.8;           // diámetro de la pestaña del LED (CALIBRE)
bola_abajo  = 7;             // la bola se corta plana 7 mm debajo del centro (imprime sin soportes)
bola_arriba = 8;             // y 8 mm arriba del centro
rotula_centro = 8;           // altura del centro de la bola sobre la base de la rótula
rotula_labio  = 4;           // cuánto sube el borde de la rótula sobre el centro de la bola (lo que la retiene)
rotula_ext    = 26;          // diámetro exterior de la rótula
capsulas_tapa = [[-50, 40], [-85, 18]]; // dónde van las dos rótulas en la tapa

$fn = 64;

// ============================================================
// Geometría base
// ============================================================

module triangulo_interior() {
    polygon([[-L, 0], [L, 0], [0, L]]);
}

module triangulo_exterior() {
    offset(r = radio_ext) offset(delta = pared - radio_ext) triangulo_interior();
}

alto_total = piso + alto + tapa_t;

// Agujero horizontal en forma de gota: la punta arriba imprime sin soportes
module gota(d, largo) {
    rotate([90, 0, 0]) linear_extrude(largo, center = true)
        union() {
            circle(d = d);
            rotate(45) square(d / 2);
        }
}

// Agujero en el frente (y = 0) a la altura z, atravesando la pared
module agujero_frente(x, z, d) {
    translate([x, -pared / 2, z]) gota(d, pared * 3);
}

module ventana_frente(x, z, ancho, alto_v) {
    translate([x - ancho / 2, -pared * 2, z - alto_v / 2]) cube([ancho, pared * 3, alto_v]);
}

// Posiciones de las torres de la tapa (en los tres rincones)
// (un poco metidas en las paredes, para que queden bien pegadas)
function torres() = let(r = torre_d / 2 - 0.6, d45 = r / sin(22.5), d90 = r / sin(45))
    [[-L + d45 * cos(22.5), d45 * sin(22.5)],
     [ L - d45 * cos(22.5), d45 * sin(22.5)],
     [0, L - d90]];

// ============================================================
// Cuerpo
// ============================================================

module cuerpo() {
    difference() {
        union() {
            difference() {
                linear_extrude(alto_total) triangulo_exterior();
                // Interior
                translate([0, 0, piso]) linear_extrude(alto_total) triangulo_interior();
                // Rebaje donde apoya la tapa (queda al ras)
                translate([0, 0, piso + alto]) linear_extrude(tapa_t + 1)
                    offset(r = pared / 2) triangulo_interior();
            }
            // Pared separadora 220 V | baja tensión (llega hasta la tapa)
            translate([-pared / 2, 0, 0]) cube([pared, L, piso + alto]);
            // Torres de los tornillos de la tapa
            for (t = torres()) translate([t[0], t[1], 0]) cylinder(d = torre_d, h = piso + alto);
            // Rieles del ESP32 (la placa apoya sobre ellos; las patas quedan entre los rieles)
            for (s = [-1, 1])
                translate([esp32_x + s * (esp32[0] / 2 - 1.5) - 1.5, 4, 0])
                    cube([3, esp32[1] - 6, piso + esp32_pines]);
            // Ranura de la plaquita del KY-022 (parada contra el frente)
            for (y = [ky022_separacion - 1.5, ky022_separacion + 1.6 + holgura])
                translate([ky022_x - ky022[0] / 2 - 2, y, 0])
                    cube([ky022[0] + 4, 1.5, piso + 5]);
            // Postes de la plaquita perforada
            for (px = [perf_inset, perf[0] - perf_inset], py = [perf_inset, perf[1] - perf_inset])
                translate([perf_pos[0] + px, perf_pos[1] + py, 0]) cylinder(d = 6, h = piso + poste_alto);
            // Postes del relé
            for (a = rele_agujeros)
                translate([rele_pos[0] + a[0], rele_pos[1] + a[1], 0]) cylinder(d = 6, h = piso + poste_alto);
            // Cuna de la fuente HLK-5M05: borde bajo y 4 apoyos (las patas y las soldaduras quedan libres)
            translate([hlk_pos[0], hlk_pos[1], 0]) difference() {
                translate([-2, -2, 0]) cube([hlk[0] + 4 + 2 * holgura, hlk[1] + 4 + 2 * holgura, piso + 10]);
                translate([0, 0, piso]) cube([hlk[0] + 2 * holgura, hlk[1] + 2 * holgura, 20]);
                // ranuras para un precinto que la sujeta
                for (x = [hlk[0] * 0.3, hlk[0] * 0.7]) translate([x, -5, piso + 6]) cube([4, hlk[1] + 10, 2.5]);
            }
            translate([hlk_pos[0], hlk_pos[1], 0])
                for (x = [2, hlk[0] - 4], y = [2, hlk[1] - 4]) translate([x, y, 0]) cube([2.6, 2.6, piso + 6]);
        }

        // Agujeros guía de las torres, de los postes y del relé
        for (t = torres()) translate([t[0], t[1], piso + alto - 14]) cylinder(d = torre_guia, h = 20);
        for (px = [perf_inset, perf[0] - perf_inset], py = [perf_inset, perf[1] - perf_inset])
            translate([perf_pos[0] + px, perf_pos[1] + py, piso]) cylinder(d = torre_guia, h = 20);
        for (a = rele_agujeros)
            translate([rele_pos[0] + a[0], rele_pos[1] + a[1], piso]) cylinder(d = rele_tornillo, h = 20);

        // ---- Frente, zona de 220 V ----
        agujero_frente(portafusible_x, piso + alto / 2, portafusible + holgura);
        for (x = pg7_x) agujero_frente(x, piso + alto / 2, pg7 + holgura);
        // Leyenda "220 V" grabada arriba del portafusible y los prensacables
        translate([(portafusible_x + pg7_x[1]) / 2, -pared + 0.6, piso + alto - 3.5])
            rotate([90, 0, 0]) linear_extrude(1)
                text("220 V", size = 5, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");

        // ---- Frente, zona de baja tensión ----
        // USB del ESP32 (la ficha queda sobre la placa)
        ventana_frente(esp32_x, piso + esp32_pines + 1.6 + 1.6, usb_ventana[0], usb_ventana[1]);
        // Receptor IR
        agujero_frente(ky022_x, piso + ky022_z, ky022_ventana);
        // Conectores de las cápsulas (J1 y J2)
        for (x = jst_x) ventana_frente(x, piso + jst_z, jst_ventana[0], jst_ventana[1]);

        // Muesca arriba de la pared separadora: cables de baja tensión (control del relé y 5 V de la fuente)
        translate([-pared, paso_cables_y, piso + alto - paso_cables[1]]) cube([pared * 2, paso_cables[0], paso_cables[1] + 1]);

        // Ventilación en el lado corto de la zona de 220 V
        for (i = [0 : vent_n - 1]) {
            s = 45 + i * 9; // distancia desde el vértice del fondo, sobre la pared
            translate([s / sqrt(2), L - s / sqrt(2), piso + 6]) rotate([0, 0, -45])
                translate([-vent_ancho / 2, -pared * 2, 0]) cube([vent_ancho, pared * 4, vent_alto]);
        }

        // Fijación: piso (mesa o pared) y lados cortos (esquina), lejos de las piezas de 220 V
        for (p = [[-100, 9], [-25, 75], [12, 100]])
            translate([p[0], p[1], -1]) {
                cylinder(d = tornillo_pared, h = piso + 2);
                translate([0, 0, piso + 1 - 2.5]) cylinder(d1 = tornillo_pared, d2 = tornillo_pared + 5, h = 2.51);
            }
        for (s = [-1, 1])
            translate([s * 25 / sqrt(2), L - 25 / sqrt(2), piso + alto / 2])
                rotate([0, 0, -s * 45]) rotate([-90, 0, 0]) cylinder(d = tornillo_pared, h = pared * 4, center = true);
    }
}

// ============================================================
// Tapa (se imprime boca arriba, plana sobre la cama; las rótulas salen hacia arriba)
// ============================================================

module rotula() {
    difference() {
        cylinder(d = rotula_ext, h = rotula_centro + rotula_labio);
        // Hueco esférico de la bola, con holgura
        translate([0, 0, rotula_centro]) sphere(d = bola_d + 2 * holgura);
        // Ranura por donde sale el cable (también deja que el borde flexione)
        translate([-3, -rotula_ext, -0.01]) cube([6, rotula_ext, rotula_centro + rotula_labio + 1]);
        // Dos cortes más para que el borde flexione al meter la bola
        for (a = [60, 120]) rotate([0, 0, a])
            translate([-0.75, 0, rotula_centro - 2]) cube([1.5, rotula_ext, rotula_labio + 3]);
    }
}

module tapa() {
    difference() {
        linear_extrude(tapa_t) offset(r = pared / 2 - holgura) triangulo_interior();
        for (t = torres()) translate([t[0], t[1], -1]) {
            cylinder(d = tornillo_tapa, h = tapa_t + 2);
            translate([0, 0, tapa_t + 1 - (tornillo_tapa_cabeza - tornillo_tapa) / 2])
                cylinder(d1 = tornillo_tapa, d2 = tornillo_tapa_cabeza, h = (tornillo_tapa_cabeza - tornillo_tapa) / 2 + 0.01);
        }
    }
    for (c = capsulas_tapa) translate([c[0], c[1], tapa_t]) rotula();
}

// ============================================================
// Cápsula del LED (bola cortada arriba y abajo: imprime parada sobre la cara de abajo, sin soportes)
// El LED entra desde abajo hasta que la pestaña toca el escalón; el cable sale por abajo.
// ============================================================

module capsula() {
    difference() {
        intersection() {
            sphere(d = bola_d);
            translate([-bola_d, -bola_d, -bola_abajo]) cube([2 * bola_d, 2 * bola_d, bola_abajo + bola_arriba]);
        }
        // Hueco del cuerpo del LED (sale arriba)
        translate([0, 0, 3]) cylinder(d = led_d + holgura, h = bola_d);
        // Hueco de abajo: pasa la pestaña del LED, las patas y el cable
        translate([0, 0, -bola_abajo - 1]) cylinder(d = led_pestana + holgura + 0.5, h = bola_abajo + 1 + 3);
    }
}

// Apoyo plano en la base de la bola (la cara que va sobre la cama)
module capsula_imprimir() { translate([0, 0, bola_abajo]) capsula(); }

// ============================================================
// Soporte para una cápsula alejada (se atornilla o se pega donde haga falta)
// ============================================================

module soporte() {
    difference() {
        hull() for (x = [-14, 14]) translate([x, 0, 0]) cylinder(d = 16, h = 3);
        for (x = [-14, 14]) translate([x, 0, -1]) {
            cylinder(d = 3.5, h = 5);
            translate([0, 0, 2]) cylinder(d1 = 3.5, d2 = 7, h = 2.01);
        }
    }
    translate([0, 0, 3]) rotula();
}

// ============================================================
// Vistas
// ============================================================

module componentes() {
    color("DarkGreen", 0.8) {
        translate([esp32_x - esp32[0] / 2, 1, piso + esp32_pines]) cube([esp32[0], esp32[1], 1.6]);
        translate([perf_pos[0], perf_pos[1], piso + poste_alto]) cube([perf[0], perf[1], 1.6]);
        translate([ky022_x - ky022[0] / 2, ky022_separacion, piso]) cube([ky022[0], 1.6, ky022[1]]);
    }
    color("Firebrick", 0.8) {
        translate([rele_pos[0], rele_pos[1], piso + poste_alto]) cube([rele[0], rele[1], 18.5]);
        translate([hlk_pos[0] + holgura, hlk_pos[1] + holgura, piso + 6]) cube(hlk);
    }
}

// Cuerpo sin tapa, con los componentes de referencia (verde: baja tensión; rojo: 220 V)
module interior() {
    color("SteelBlue") cuerpo();
    componentes();
}

module ensamble() {
    color("SteelBlue") cuerpo();
    color("LightSteelBlue") translate([0, 0, piso + alto + 25]) tapa();
    for (c = capsulas_tapa)
        color("Orange") translate([c[0], c[1], piso + alto + 25 + tapa_t + rotula_centro]) rotate([25, 0, 0]) capsula();
    // Componentes de referencia (no se imprimen)
    componentes();
}

module plano() {
    cuerpo();
    translate([0, -25, 0]) rotate([0, 0, 180]) tapa();
    for (i = [0, 1]) translate([-L + 15 + i * 26, -L - 10, 0]) capsula_imprimir();
    translate([L - 20, -L - 10, 0]) soporte();
}

module girar_para_imprimir() {
    if (imprimir) rotate([0, 0, 135]) children(); else children();
}

if (pieza == "cuerpo") girar_para_imprimir() cuerpo();
else if (pieza == "tapa") girar_para_imprimir() tapa();
else if (pieza == "capsula") capsula_imprimir();
else if (pieza == "soporte") soporte();
else if (pieza == "plano") plano();
else if (pieza == "interior") interior();
else ensamble();
