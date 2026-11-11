/**
 * Sketch de Prueba de Hardware Autónomo (Sin Servidor ni WiFi)
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 * 
 * Permite probar de forma interactiva y aislada (mismos pines que config.h.example):
 *   [1] Relé de las luces (GPIO 26)
 *   [2] Emisor IR: BC337 con 2 LEDs IR en serie (GPIO 18)
 *   [3] Receptor IR KY-022 (GPIO 15)
 *   [4] Prueba secuencial completa
 */

#include <Arduino.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

// Pines del circuito soldado
#define PIN_IR_SEND        18
#define PIN_IR_RECV        15
#define PIN_RELE_LUCES     26
#define PIN_LED_ESTADO     2

// Nivel del módulo relé: 1 = activo en BAJO, 0 = activo en ALTO (cómo averiguarlo: ver config.h.example)
#define RELE_ACTIVO_EN_BAJO  1
#if RELE_ACTIVO_EN_BAJO
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH
#else
#define RELAY_ACTIVE_LEVEL   HIGH
#define RELAY_INACTIVE_LEVEL LOW
#endif

IRsend irSend(PIN_IR_SEND);
IRrecv irRecv(PIN_IR_RECV);
decode_results results;

bool modoMonitoreoReceptor = false;

void mostrarMenu() {
    Serial.println("\n============================================================");
    Serial.println("  🛠️ BANCO DE PRUEBAS DE HARDWARE — GRUPO 5");
    Serial.println("  EEST N° 1 de Vicente López \"Eduardo Ader\"");
    Serial.println("============================================================");
    Serial.println("Seleccioná una prueba enviando el número por el Monitor Serie:");
    Serial.println("  [1] Probar el relé de las luces (GPIO 26) -> prender 2 segundos");
    Serial.println("  [2] Probar el emisor IR (GPIO 18) -> emitir 5 ráfagas NEC");
    Serial.println("  [3] Probar el receptor IR (GPIO 15) -> modo escucha en vivo");
    Serial.println("  [4] Prueba secuencial (relé y emisor)");
    Serial.println("  [M] Volver a mostrar este menú");
    Serial.println("============================================================\n");
    Serial.print("Ingresá tu opción: ");
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    // 1. Relé (arranca apagado: se escribe el nivel "apagado" antes de configurar el pin)
    digitalWrite(PIN_RELE_LUCES, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELE_LUCES, OUTPUT);
    digitalWrite(PIN_RELE_LUCES, RELAY_INACTIVE_LEVEL);

    // 2. Configurar LED indicador
    pinMode(PIN_LED_ESTADO, OUTPUT);
    digitalWrite(PIN_LED_ESTADO, LOW);

    // 3. Configurar IR
    irSend.begin();
    irRecv.setUnknownThreshold(12);

    mostrarMenu();
}

void probarRele() {
    Serial.println("\n[TEST] Probando el relé de las luces (GPIO 26)...");
    Serial.println("[TEST] Prendiendo...");
    digitalWrite(PIN_RELE_LUCES, RELAY_ACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, HIGH);
    delay(2000);

    Serial.println("[TEST] Apagando...");
    digitalWrite(PIN_RELE_LUCES, RELAY_INACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, LOW);
    Serial.println("[TEST] Prueba del relé terminada (tuvo que hacer clic dos veces).");
}

void probarEmisorIR() {
    Serial.println("\n[TEST] Probando el emisor IR (GPIO 18)...");
    Serial.println("[TEST] Emitiendo 5 códigos NEC de prueba (0x00FF00FF)...");

    for (int i = 1; i <= 5; i++) {
        digitalWrite(PIN_LED_ESTADO, HIGH);
        irSend.sendNEC(0x00FF00FF, 32);
        digitalWrite(PIN_LED_ESTADO, LOW);
        Serial.printf("  -> Ráfaga %d/5 enviada.\n", i);
        delay(600);
    }
    Serial.println("[TEST] ✓ Emisión IR completada (verificá con la cámara de un celular el parpadeo del LED).");
}

void iniciarReceptorIR() {
    modoMonitoreoReceptor = true;
    irRecv.enableIRIn();
    Serial.println("\n============================================================");
    Serial.println("[TEST] MODO ESCUCHA DEL RECEPTOR IR (GPIO 15)");
    Serial.println("Apuntá cualquier control remoto (TV, Aire, etc.) al receptor.");
    Serial.println("Enviá 'X' o cualquier letra por consola para salir de este modo.");
    Serial.println("============================================================\n");
}

void detenerReceptorIR() {
    if (modoMonitoreoReceptor) {
        irRecv.disableIRIn();
        modoMonitoreoReceptor = false;
        Serial.println("\n[TEST] Receptor IR desactivado.");
        mostrarMenu();
    }
}

void pruebaSecuencial() {
    Serial.println("\n[TEST] >>> INICIANDO PRUEBA INTEGRAL SECUENCIAL <<<");
    probarRele();
    delay(1000);
    probarEmisorIR();
    delay(1000);
    Serial.println("[TEST] >>> FIN DE LA PRUEBA INTEGRAL <<<");
    mostrarMenu();
}

void loop() {
    // Si estamos en modo escucha del receptor IR
    if (modoMonitoreoReceptor) {
        if (irRecv.decode(&results)) {
            digitalWrite(PIN_LED_ESTADO, HIGH);
            Serial.println("------------------------------------------------------------");
            Serial.printf("✓ SEÑAL DETECTADA -> Protocolo: %s\n", typeToString(results.decode_type).c_str());
            Serial.printf("  Código Hex: 0x%s\n", resultToHexidecimal(&results).c_str());
            Serial.printf("  Bits:       %u\n", results.bits);
            Serial.println("------------------------------------------------------------");
            irRecv.resume();
            delay(100);
            digitalWrite(PIN_LED_ESTADO, LOW);
        }

        // Salir si el usuario envía algo
        if (Serial.available()) {
            Serial.readString(); // Limpiar buffer
            detenerReceptorIR();
        }
        return;
    }

    // Menú principal por Serial
    if (Serial.available()) {
        char opcion = Serial.read();

        // Ignorar saltos de línea
        if (opcion == '\r' || opcion == '\n' || opcion == ' ') {
            return;
        }

        switch (opcion) {
            case '1': probarRele(); break;
            case '2': probarEmisorIR(); break;
            case '3': iniciarReceptorIR(); break;
            case '4': pruebaSecuencial(); break;
            case 'm':
            case 'M': mostrarMenu(); break;
            default:
                Serial.printf("\n⚠️ Opción '%c' no válida.\n", opcion);
                mostrarMenu();
                break;
        }
    }

    delay(20);
}
