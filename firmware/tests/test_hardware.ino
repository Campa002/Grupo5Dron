/**
 * Sketch de Prueba de Hardware Autónomo (Sin Servidor ni WiFi)
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 * 
 * Permite probar de forma interactiva y aislada:
 *   [1] Relé Canal 1 (GPIO 25)
 *   [2] Relé Canal 2 (GPIO 27)
 *   [3] LED Emisor IR (GPIO 19)
 *   [4] Sensor Receptor IR (GPIO 4)
 *   [5] Prueba Secuencial Completa
 */

#include <Arduino.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

// Definición de pines bajo prueba
#define PIN_IR_LED         19
#define PIN_IR_RECV        4
#define PIN_RELAY_1        25
#define PIN_RELAY_2        -1
#define PIN_LED_ESTADO     2

// Configuración del módulo de relé (ajustar si tu placa es activo-alto)
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH

IRsend irSend(PIN_IR_LED);
IRrecv irRecv(PIN_IR_RECV);
decode_results results;

bool modoMonitoreoReceptor = false;

void mostrarMenu() {
    Serial.println("\n============================================================");
    Serial.println("  🛠️ BANCO DE PRUEBAS DE HARDWARE — GRUPO 5");
    Serial.println("  EEST N° 1 de Vicente López \"Eduardo Ader\"");
    Serial.println("============================================================");
    Serial.println("Seleccioná una prueba enviando el número por el Monitor Serie:");
    Serial.println("  [1] Probar Relé 1 (GPIO 25) -> Conmutar 2 segundos");
    Serial.println("  [2] Probar Relé 2 (GPIO 27) -> Conmutar 2 segundos");
    Serial.println("  [3] Probar Emisor IR (GPIO 19) -> Emitir 5 ráfagas NEC");
    Serial.println("  [4] Probar Receptor IR (GPIO 4) -> Modo escucha en vivo");
    Serial.println("  [5] Prueba Integral Secuencial de todos los componentes");
    Serial.println("  [M] Volver a mostrar este menú");
    Serial.println("============================================================\n");
    Serial.print("Ingresá tu opción: ");
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    // 1. Configurar Relés (inician estrictamente apagados)
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELAY_1, OUTPUT);
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE_LEVEL);

    #if defined(PIN_RELAY_2) && (PIN_RELAY_2 >= 0)
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELAY_2, OUTPUT);
    #endif
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE_LEVEL);

    // 2. Configurar LED indicador
    pinMode(PIN_LED_ESTADO, OUTPUT);
    digitalWrite(PIN_LED_ESTADO, LOW);

    // 3. Configurar IR
    irSend.begin();
    irRecv.setUnknownThreshold(12);

    mostrarMenu();
}

void probarRele1() {
    Serial.println("\n[TEST] ⚡ Probando Relé 1 (GPIO 25)...");
    Serial.println("[TEST] Encendiendo Relé 1...");
    digitalWrite(PIN_RELAY_1, RELAY_ACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, HIGH);
    delay(2000);

    Serial.println("[TEST] Apagando Relé 1...");
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, LOW);
    Serial.println("[TEST] ✓ Prueba de Relé 1 finalizada con éxito.");
}

void probarRele2() {
    Serial.println("\n[TEST] ⚡ Probando Relé 2 (GPIO 27)...");
    Serial.println("[TEST] Encendiendo Relé 2...");
    digitalWrite(PIN_RELAY_2, RELAY_ACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, HIGH);
    delay(2000);

    Serial.println("[TEST] Apagando Relé 2...");
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE_LEVEL);
    digitalWrite(PIN_LED_ESTADO, LOW);
    Serial.println("[TEST] ✓ Prueba de Relé 2 finalizada con éxito.");
}

void probarEmisorIR() {
    Serial.println("\n[TEST] 📡 Probando Emisor Infrarrojo (GPIO 19)...");
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
    Serial.println("[TEST] 🎯 MODO ESCUCHA RECEPTOR IR (GPIO 4) INICIADO");
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
    probarRele1();
    delay(1000);
    probarRele2();
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
            case '1': probarRele1(); break;
            case '2': probarRele2(); break;
            case '3': probarEmisorIR(); break;
            case '4': iniciarReceptorIR(); break;
            case '5': pruebaSecuencial(); break;
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
