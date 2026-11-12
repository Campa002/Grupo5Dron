// ============================================================
// Carcasa triangular del equipo del aula, de DOS PISOS — Grupo 5: Control de Sistemas y Dron
// EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
//
// Prisma de base triangular (triángulo rectángulo isósceles visto desde arriba):
//  - el FRENTE es la hipotenusa (prensacables, portafusible, USB y receptor IR);
//  - los dos lados CORTOS forman 90°: la caja entra justo en una esquina.
// Todas las piezas entran en un círculo de 160 mm (cama redonda de 170 mm con 5 mm de margen):
// el frente va sobre el diámetro.
//
// Dos pisos:
//  - ABAJO, 220 V: fuente HLK-5M05 (parada), relé, portafusible de chasis y 2 prensacables PG7.
//  - En el medio, la BANDEJA (se saca para armar): separa los pisos y hace de pared de 220 V,
//    con un solo paso chico para los cables de baja tensión (5 V, GND y la señal del relé).
//  - ARRIBA, baja tensión: ESP32 (con lugar para las fichas hembra), plaquita del BC337 y KY-022.
//  - La TAPA, con las dos rótulas de los LEDs IR. El cable de cada cápsula entra por un agujero
//    chico de la tapa, justo debajo de su rótula (zona de baja tensión).
//
// Piezas (variable "pieza" o desde la consola: -D 'pieza="tapa"'):
//   "cuerpo", "bandeja", "tapa", "capsula", "tapon", "soporte",
//   "ensamble" (todo armado, despiezado en altura), "interior" (cuerpo + bandeja con los componentes
//   de referencia: verde = baja tensión, rojo = 220 V), "corte" (corte por el centro) y "choques"
//   (lo que choca entre componentes de 220 V: tiene que salir vacío).
//
// Todas las medidas en milímetros. Las marcadas (CALIBRE) hay que confirmarlas con un calibre.
// ============================================================

pieza = "ensamble";
// (Vista "rotula_giro": corte de una rótula de la tapa con la bola girada 45°, el LED y el cable.)
// Para imprimir, cada pieza ya queda con el centro de su círculo en (0,0): en las triangulares es el
// medio del frente (el frente va sobre un diámetro de la cama redonda).

// ---------------- Medidas generales ----------------
L        = 76;    // mitad del ancho interior del frente (frente exterior = 2*(L+pared) = 158 mm)
pared    = 3;
piso     = 3;
alto_220 = 28;    // piso de abajo (220 V): del piso a la bandeja
bandeja_t = 3;    // espesor de la bandeja
alto_bt  = 33;    // piso de arriba (baja tensión): de la bandeja a la tapa
tapa_t   = 3;
holgura  = 0.3;   // tolerancia de impresión para todo lo que encastra
radio_ext = 3;    // redondeo de las esquinas exteriores
repisa   = 2;     // ancho de la repisa donde apoya la bandeja

z_bandeja = piso + alto_220;               // apoyo de la bandeja
z_bt      = z_bandeja + bandeja_t;         // arriba de la bandeja
z_tapa    = z_bt + alto_bt;                // debajo de la tapa
alto_total = z_tapa + tapa_t;              // altura del cuerpo

// ---------------- Piso de abajo: 220 V (CALIBRE) ----------------
rele        = [26, 50];       // módulo relé de 1 canal: ancho (X) y largo (Y)
rele_alto   = 17;             // alto del relé sobre su placa
rele_pos    = [-13, 8];       // esquina delantera izquierda (borneras de 220 V hacia el frente)
rele_agujeros = [[3, 3], [23, 3], [3, 47], [23, 47]]; // agujeros desde su esquina
poste_alto  = 5;
tornillo_guia = 2.6;          // agujero guía para autorroscante M3
hlk         = [34, 20, 15];   // HLK-5M05: largo, ancho y alto. Va PARADA (apoyada en un costado de 34 x 15)
hlk_pos     = [16.5, 4];      // esquina delantera izquierda de la HLK parada (ocupa 15 en X y 34 en Y)
pg7         = 12.7;           // agujero para prensacables PG7 (rosca de 12,5 mm)
pg7_tuerca  = 22;             // tuerca del PG7: medida entre puntas (19 mm entre caras)
pg7_largo   = 9;              // cuánto entra el PG7 con su tuerca desde la cara interior del frente
pg7_x       = [-46, 46];      // entrada de 220 V y salida a la lámpara
portafusible   = 12.5;        // agujero del portafusible de chasis 5x20
portafusible_cuerpo = [13, 38]; // diámetro y largo hacia adentro (cuerpo de ~30 mm + terminales)
portafusible_x = -26;
z_220       = piso + alto_220 / 2;  // altura de los agujeros del frente de 220 V

// ---------------- Bandeja ----------------
paso_cables   = 7;            // el único paso entre pisos (5 V, GND y la señal del relé)
paso_pos      = [21, 40];
columna_d     = 7;            // columnas que apoyan contra la tapa y traban la bandeja
columnas      = [[-32, 34], [32, 34], [0, 58]];

// ---------------- Piso de arriba: baja tensión (CALIBRE) ----------------
esp32       = [28.3, 51.5];   // placa NodeMCU de 30 pines
esp32_bajo  = 25;             // lugar debajo de la placa para las fichas hembra y el cable doblado
esp32_x     = 0;
usb_ventana = [12, 8];
perf        = [30, 20];       // plaquita del BC337 y las resistencias
perf_pos    = [-46, 4];
perf_inset  = 2.5;
ky022       = [18.5, 15];
ky022_x     = 30;
ky022_z     = 9;              // altura del centro del receptor sobre la bandeja
ky022_separacion = 5;         // distancia del frente a la cara de la plaquita
ky022_ventana = 7;

// ---------------- Rótulas y cápsulas ----------------
bola_d      = 20;
led_d       = 5;
led_pestana = 5.8;
bola_abajo  = 7;              // la bola se corta plana 7 mm debajo del centro (imprime sin soportes)
bola_arriba = 8;
rotula_centro = 17;           // centro de la bola sobre la base: deja ~10 mm para que el cable se curve suave
rotula_labio  = 4;            // borde que retiene la bola, sobre su centro
rotula_ext    = 26;
rotula_embudo = 7.5;          // el embudo del cable empieza 7,5 mm debajo del centro de la bola
rotula_apriete = 0.1;         // en la mitad de arriba el hueco es 0,1 mm más chico que la bola: la frena
                              // para que quede apuntando (si queda muy dura o muy floja, cambiá esto)
cable_agujero = 6;            // agujero de la tapa para el cable de cada cápsula
capsulas_tapa = [[-30, 22], [30, 22]];

// ---------------- Fijación ----------------
tornillo_pared = 4.5;
tornillo_tapa  = 3.4;
tornillo_tapa_cabeza = 6.5;
torre_d     = 9;
ventilacion = [2, 14, 5];     // ranuras del piso de 220 V: ancho, alto y cantidad por lado

$fn = 64;

// ============================================================
// Geometría base
// ============================================================

module triangulo_interior() { polygon([[-L, 0], [L, 0], [0, L]]); }
module triangulo_exterior() { offset(r = radio_ext) offset(delta = pared - radio_ext) triangulo_interior(); }

// Agujero horizontal en forma de gota (la punta arriba imprime sin soportes)
module gota(d, largo) {
    rotate([90, 0, 0]) linear_extrude(largo, center = true)
        union() { circle(d = d); rotate(45) square(d / 2); }
}
module agujero_frente(x, z, d) { translate([x, -pared / 2, z]) gota(d, pared * 3); }
module ventana_frente(x, z, ancho, alto_v) {
    translate([x - ancho / 2, -pared * 2, z - alto_v / 2]) cube([ancho, pared * 3, alto_v]);
}

// Torres de los tornillos de la tapa (en los tres rincones, un poco metidas en las paredes)
function torres() = let(r = torre_d / 2 - 0.6, d45 = r / sin(22.5), d90 = r / sin(45))
    [[-L + d45 * cos(22.5), d45 * sin(22.5)], [L - d45 * cos(22.5), d45 * sin(22.5)], [0, L - d90]];

// Punto sobre la cara interior de un lado corto, a distancia s del vértice del fondo (lado: -1 izq, +1 der)
function sobre_lado(lado, s) = [lado * s / sqrt(2), L - s / sqrt(2)];

// ============================================================
// Cuerpo
// ============================================================

module repisa_bandeja() {
    // Repisa escalonada (cada escalón 0,5 mm: imprime como un chaflán de 45°) en los dos lados cortos
    // y en el centro del frente (no en las puntas: ahí están las tuercas de los PG7)
    for (i = [1 : 4]) translate([0, 0, z_bandeja - 2.5 + i * 0.5 - 0.5])
        linear_extrude(0.5 + (i == 4 ? 0 : 0.01)) difference() {
            offset(delta = 0.5) triangulo_interior();   // se mete 0,5 mm en las paredes: queda pegada
            offset(delta = -repisa * i / 4) triangulo_interior();
            translate([-L, 0]) square([L - 20, 5]);
            translate([20, 0]) square([L - 20, 5]);
        }
}

module cuerpo() {
    difference() {
        union() {
            difference() {
                linear_extrude(alto_total) triangulo_exterior();
                translate([0, 0, piso]) linear_extrude(alto_total) triangulo_interior();
                // Rebaje donde apoya la tapa (queda al ras)
                translate([0, 0, z_tapa]) linear_extrude(tapa_t + 1) offset(r = pared / 2) triangulo_interior();
            }
            repisa_bandeja();
            // Torres de la tapa, rellenas hasta el rincón (sin huecos cerrados)
            for (i = [0 : 2]) linear_extrude(z_tapa) hull() {
                translate(torres()[i]) circle(d = torre_d);
                translate([[-L, 0], [L, 0], [0, L]][i]) circle(d = 1);
            }
            // Postes del relé
            for (a = rele_agujeros) translate([rele_pos[0] + a[0], rele_pos[1] + a[1], 0])
                cylinder(d = 6, h = piso + poste_alto);
            // Cuna de la HLK-5M05 parada: borde bajo; se sujeta con un precinto por las ranuras del piso
            translate([hlk_pos[0], hlk_pos[1], 0]) difference() {
                translate([-2, -2, 0]) cube([hlk[2] + 4 + 2 * holgura, hlk[0] + 4 + 2 * holgura, piso + 6]);
                translate([0, 0, piso]) cube([hlk[2] + 2 * holgura, hlk[0] + 2 * holgura, 20]);
                // costado abierto hacia +X: por ahí salen las patas
                translate([hlk[2] - 1, 4, piso]) cube([10, hlk[0] - 8, 20]);
            }
        }
        // Agujeros guía
        for (t = torres()) translate([t[0], t[1], z_tapa - 14]) cylinder(d = tornillo_guia, h = 20);
        for (a = rele_agujeros) translate([rele_pos[0] + a[0], rele_pos[1] + a[1], piso]) cylinder(d = tornillo_guia, h = 20);
        // Ranuras del piso para el precinto de la HLK
        for (y = [hlk[0] * 0.3, hlk[0] * 0.7]) translate([hlk_pos[0] - 4, hlk_pos[1] + y, -1]) cube([hlk[2] + 8, 3, piso + 2]);

        // ---- Frente, piso de abajo (220 V) ----
        for (x = pg7_x) agujero_frente(x, z_220, pg7 + holgura);
        agujero_frente(portafusible_x, z_220, portafusible + holgura);
        translate([10, -pared + 0.6, z_220]) rotate([90, 0, 0]) linear_extrude(1)
            text("220 V", size = 6, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");

        // ---- Frente, piso de arriba (baja tensión) ----
        ventana_frente(esp32_x, z_bt + esp32_bajo + 1.6 + 1.6, usb_ventana[0], usb_ventana[1]);
        agujero_frente(ky022_x, z_bt + ky022_z, ky022_ventana);

        // Ventilación: solo en los lados cortos del piso de 220 V
        for (lado = [-1, 1], i = [0 : ventilacion[2] - 1]) {
            p = sobre_lado(lado, 22 + i * 9);
            translate([p[0], p[1], piso + 6]) rotate([0, 0, -lado * 45])
                translate([-ventilacion[0] / 2, -pared * 2, 0]) cube([ventilacion[0], pared * 4, ventilacion[1]]);
        }

        // Fijación por el piso (mesa o pared): lejos de las piezas de 220 V
        for (p = [[-40, 20], [44, 18]]) translate([p[0], p[1], -1]) {
            cylinder(d = tornillo_pared, h = piso + 2);
            translate([0, 0, piso + 1 - 2.5]) cylinder(d1 = tornillo_pared, d2 = tornillo_pared + 5, h = 2.51);
        }
        // Fijación en una esquina, por los lados cortos del piso de arriba (baja tensión)
        for (lado = [-1, 1]) {
            p = sobre_lado(lado, 20);
            translate([p[0], p[1], z_bt + 20]) rotate([0, 0, -lado * 45]) rotate([-90, 0, 0])
                cylinder(d = tornillo_pared, h = pared * 4, center = true);
        }
    }
}

// ============================================================
// Bandeja (se imprime plana; los soportes salen hacia arriba)
// ============================================================

module bandeja() {
    difference() {
        union() {
            linear_extrude(bandeja_t) difference() {
                offset(delta = -holgura) triangulo_interior();
                // Muescas de las torres (hasta la punta: si no, las puntas quedarían sueltas)
                for (i = [0 : 2]) hull() {
                    translate(torres()[i]) circle(d = torre_d + 2 * holgura);
                    translate([[-L, 0], [L, 0], [0, L]][i]) circle(d = 1);
                }
            }
            // ESP32: dos apoyos en las puntas de la placa (las patas y las fichas quedan libres a los costados)
            for (y = [2, esp32[1] - 4.5]) translate([esp32_x - 5, y, 0]) cube([10, 4, bandeja_t + esp32_bajo]);
            // tope de atrás para que la placa no se corra
            translate([esp32_x - 5, esp32[1] + 1.5, 0]) cube([10, 2, bandeja_t + esp32_bajo + 3]);
            // Postes de la plaquita del BC337
            for (px = [perf_inset, perf[0] - perf_inset], py = [perf_inset, perf[1] - perf_inset])
                translate([perf_pos[0] + px, perf_pos[1] + py, 0]) cylinder(d = 6, h = bandeja_t + poste_alto);
            // Ranura del KY-022 (parado contra el frente)
            for (y = [ky022_separacion - 1.5, ky022_separacion + 1.6 + holgura])
                translate([ky022_x - ky022[0] / 2 - 2, y, 0]) cube([ky022[0] + 4, 1.5, bandeja_t + 5]);
            // Columnas: llegan justo a la tapa, así la tapa traba la bandeja contra la repisa
            for (c = columnas) translate([c[0], c[1], 0]) cylinder(d = columna_d, h = bandeja_t + alto_bt);
            // Borde alrededor del paso de cables
            translate([paso_pos[0], paso_pos[1], 0]) cylinder(d = paso_cables + 3, h = bandeja_t + 3);
        }
        translate([paso_pos[0], paso_pos[1], -1]) cylinder(d = paso_cables, h = 20);
        for (px = [perf_inset, perf[0] - perf_inset], py = [perf_inset, perf[1] - perf_inset])
            translate([perf_pos[0] + px, perf_pos[1] + py, bandeja_t]) cylinder(d = tornillo_guia, h = 20);
    }
}

// ============================================================
// Rótula: la bola gira en un hueco esférico (libre abajo, apenas apretada arriba para que quede
// apuntando) y la retiene un borde a presión. Debajo, un embudo de ~10 mm: el cable sale derecho de
// la bola y se curva suave hasta el agujero (sin doblarse a 90°). Gira 50° para cualquier lado, también
// derecho para arriba (comprobado en OpenSCAD: a 55° la cabeza del LED toca el borde).
// ============================================================

module rotula(salida_lateral = false) {
    alto = rotula_centro + rotula_labio;
    r_hueco = bola_d / 2 + holgura;
    r_embudo = sqrt(pow(r_hueco, 2) - pow(rotula_embudo, 2)) - 0.3;
    difference() {
        cylinder(d = rotula_ext, h = alto);
        // Hueco de la bola: con holgura abajo, apretado arriba del centro
        translate([0, 0, rotula_centro]) {
            intersection() { sphere(r = r_hueco); translate([-20, -20, -20]) cube([40, 40, 20]); }
            sphere(r = bola_d / 2 - rotula_apriete);
        }
        // Embudo del cable
        translate([0, 0, -0.01]) cylinder(d1 = cable_agujero, d2 = 2 * r_embudo, h = rotula_centro - rotula_embudo + 0.02);
        // Cortes para que el borde flexione al meter la bola
        for (a = [0, 120, 240]) rotate([0, 0, a])
            translate([-0.75, 0, rotula_centro - 3]) cube([1.5, rotula_ext, rotula_labio + 4]);
        // En el soporte de pared, el cable sale por un costado de la base
        if (salida_lateral) translate([-cable_agujero / 2, 0, -0.01]) cube([cable_agujero, rotula_ext, cable_agujero + 1]);
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
        // Agujero del cable de cada cápsula (zona de baja tensión: toda la tapa lo es)
        for (c = capsulas_tapa) translate([c[0], c[1], -1]) cylinder(d = cable_agujero, h = tapa_t + 2);
    }
    for (c = capsulas_tapa) translate([c[0], c[1], tapa_t]) rotula();
}

// ============================================================
// Cápsula del LED y tapón
// ============================================================

module bola_cortada() {
    intersection() {
        sphere(d = bola_d);
        translate([-bola_d, -bola_d, -bola_abajo]) cube([2 * bola_d, 2 * bola_d, bola_abajo + bola_arriba]);
    }
}

// El LED entra desde abajo hasta que la pestaña toca el escalón; el cable sale derecho por abajo
module capsula() {
    difference() {
        bola_cortada();
        translate([0, 0, 3]) cylinder(d = led_d + holgura, h = bola_d);
        translate([0, 0, -bola_abajo - 1]) cylinder(d = led_pestana + holgura + 0.5, h = bola_abajo + 1 + 3);
    }
}

// Tapón para una rótula sin cápsula. Tiene un agujero chico por si pasa el cable de una cápsula alejada.
module tapon() {
    difference() {
        bola_cortada();
        translate([0, 0, -bola_d]) cylinder(d = 4.5, h = 2 * bola_d);
    }
}

// Soporte para una cápsula alejada (con 2 tornillos o cinta doble faz)
module soporte() {
    difference() {
        hull() for (x = [-16, 16]) translate([x, 0, 0]) cylinder(d = 16, h = 3);
        for (x = [-16, 16]) translate([x, 0, -1]) {
            cylinder(d = 3.5, h = 5);
            translate([0, 0, 2]) cylinder(d1 = 3.5, d2 = 7, h = 2.01);
        }
        translate([0, 0, -1]) cylinder(d = cable_agujero, h = 5);
    }
    translate([0, 0, 3]) rotula(salida_lateral = true);
}

// ============================================================
// Componentes de referencia (no se imprimen) y control de choques
// ============================================================

module rele_ref() { translate([rele_pos[0], rele_pos[1], piso + poste_alto]) cube([rele[0], rele[1], 1.6 + rele_alto]); }
module hlk_ref() { translate([hlk_pos[0] + holgura, hlk_pos[1] + holgura, piso]) cube([hlk[2], hlk[0], hlk[1]]); }
module hlk_patas_ref() { translate([hlk_pos[0] + hlk[2], hlk_pos[1] + 6, piso + 3]) cube([6, hlk[0] - 12, hlk[1] - 6]); }
module portafusible_ref() {
    translate([portafusible_x, 0, z_220]) rotate([-90, 0, 0]) cylinder(d = portafusible_cuerpo[0], h = portafusible_cuerpo[1]);
}
module pg7_ref() {
    for (x = pg7_x) translate([x, 0, z_220]) rotate([-90, 0, 0]) cylinder(d = pg7_tuerca, h = pg7_largo, $fn = 6);
}

module componentes() {
    color("Firebrick", 0.85) { rele_ref(); hlk_ref(); hlk_patas_ref(); portafusible_ref(); pg7_ref(); }
    color("DarkGreen", 0.85) {
        translate([esp32_x - esp32[0] / 2, 1, z_bt + esp32_bajo]) cube([esp32[0], esp32[1], 1.6]);
        translate([perf_pos[0], perf_pos[1], z_bt + poste_alto]) cube([perf[0], perf[1], 1.6]);
        translate([ky022_x - ky022[0] / 2, ky022_separacion, z_bt]) cube([ky022[0], 1.6, ky022[1]]);
    }
}

// Lo que choca: cada par de componentes de 220 V, y cada uno contra el cuerpo (debe salir vacío)
module choques() {
    intersection() { portafusible_ref(); union() { rele_ref(); hlk_ref(); hlk_patas_ref(); pg7_ref(); } }
    intersection() { pg7_ref(); union() { rele_ref(); hlk_ref(); hlk_patas_ref(); } }
    intersection() { rele_ref(); union() { hlk_ref(); hlk_patas_ref(); } }
    // (subidos 0,05 mm: el relé y la fuente apoyan en sus postes y en el piso, eso no es un choque)
    intersection() {
        translate([0, 0, 0.05]) union() { rele_ref(); hlk_ref(); hlk_patas_ref(); portafusible_ref(); pg7_ref(); }
        union() { cuerpo(); translate([0, 0, z_bandeja]) bandeja(); }
    }
    // La bandeja dentro del cuerpo (apoyada 0,05 mm más arriba de la repisa)
    intersection() { cuerpo(); translate([0, 0, z_bandeja + 0.05]) bandeja(); }
}

// ============================================================
// Vistas
// ============================================================

module ensamble() {
    color("SteelBlue") cuerpo();
    color("LightSkyBlue") translate([0, 0, z_bandeja + 45]) bandeja();
    color("LightSteelBlue") translate([0, 0, z_tapa + 90]) tapa();
    for (c = capsulas_tapa)
        color("Orange") translate([c[0], c[1], z_tapa + 90 + tapa_t + rotula_centro]) rotate([-35, 0, 0]) capsula();
}

module interior() {
    color("SteelBlue") cuerpo();
    color("LightSkyBlue") translate([0, 0, z_bandeja]) bandeja();
    componentes();
}

module corte() {
    intersection() {
        union() {
            interior();
            color("LightSteelBlue") translate([0, 0, z_tapa]) tapa();
            for (c = capsulas_tapa) color("Orange") translate([c[0], c[1], z_tapa + tapa_t + rotula_centro]) capsula();
        }
        translate([-200, -50, -1]) cube([200 + 30, 200, 200]);
    }
}

module rotula_giro() {
    translate([0, 0, rotula_centro]) rotate([0, 45, 0]) {
        color("Orange") capsula();
        color("Gold") translate([0, 0, 3]) cylinder(d = led_d, h = 8.6);
    }
    // cable: sale derecho de la bola y baja curvándose hasta el agujero de la tapa
    color("Black") for (t = [0 : 0.05 : 1]) let(
        a = [-7 * sin(45), 0, rotula_centro - 7 * cos(45)], c = [0, 0, -tapa_t - 4],
        b = [0, 0, 3], p = (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c)
        translate(p) sphere(d = 3, $fn = 12);
    %color("LightSteelBlue", 0.35) { translate([-20, -20, -tapa_t]) cube([40, 40, tapa_t]); rotula(); }
}

if (pieza == "cuerpo") cuerpo();
else if (pieza == "bandeja") bandeja();
else if (pieza == "tapa") tapa();
else if (pieza == "capsula") translate([0, 0, bola_abajo]) capsula();
else if (pieza == "tapon") translate([0, 0, bola_abajo]) tapon();
else if (pieza == "soporte") soporte();
else if (pieza == "interior") interior();
else if (pieza == "corte") corte();
else if (pieza == "choques") choques();
else if (pieza == "rotula_giro") rotula_giro();
else ensamble();
