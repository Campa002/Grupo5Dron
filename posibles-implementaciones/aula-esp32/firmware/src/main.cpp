/**
 * Firmware Principal ESP32 — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 * 
 * Hardware:
 *   - Microcontrolador: ESP32 DevKit v1
 *   - LED Emisor IR:    GPIO 4
 *   - Receptor IR:      GPIO 15
 *   - Relé Canal 1:     GPIO 26 (Iluminación / 220V)
 *   - Relé Canal 2:     GPIO 27 (Auxiliar)
 *   - LED Indicador:    GPIO 2 (Onboard)
 */

#include <Arduino.h>
#include "config.h"
#include "wifi_manager.h"
#include "relay_manager.h"
#include "ir_manager.h"
#include "api_client.h"

// Temporizadores no bloqueantes
unsigned long tiempoUltimoPoll = 0;
unsigned long tiempoUltimoHeartbeat = 0;
unsigned long tiempoUltimoLedParpadeo = 0;
bool estadoLedOnboard = false;

void imprimirBannerInicio() {
    Serial.println("\n");
    Serial.println("============================================================");
    Serial.println("  ⚡ GRUPO 5: CONTROL DE SISTEMAS Y DRON");
    Serial.println("  EEST N° 1 de Vicente López \"Eduardo Ader\" — 7° 2°");
    Serial.printf("  Firmware ESP32 v%s | Compilación: %s %s\n", FIRMWARE_VERSION, __DATE__, __TIME__);
    Serial.println("============================================================");
    Serial.println("Configuración de hardware:");
    Serial.printf("  • Emisor IR:   GPIO %d\n", PIN_IR_LED);
    Serial.printf("  • Receptor IR: GPIO %d\n", PIN_IR_RECV);
    Serial.printf("  • Relé 1:      GPIO %d (220V)\n", PIN_RELAY_1);
    Serial.printf("  • Relé 2:      GPIO %d (Auxiliar)\n", PIN_RELAY_2);
    Serial.println("============================================================\n");
}

void setup() {
    // 1. Inicializar puerto serie
    Serial.begin(SERIAL_BAUD_RATE);
    delay(1000);

    imprimirBannerInicio();

    // 2. Configurar LED de estado en placa
    pinMode(PIN_LED_ESTADO, OUTPUT);
    digitalWrite(PIN_LED_ESTADO, LOW);

    // 3. Inicializar módulos de hardware
    // IMPORTANTE: Los relés inician inmediatamente apagados
    relayManager.iniciar();
    irManager.iniciar();

    // 4. Iniciar conectividad WiFi
    wifiManager.iniciar();

    // 5. Iniciar cliente HTTPS
    apiClient.iniciar();

    // 6. Primer latido si hay conexión
    if (wifiManager.estaConectado()) {
        apiClient.enviarHeartbeat();
    }

    Serial.println("\n[SISTEMA] ✓ Inicialización completada. Entrando al bucle principal.");
    Serial.printf("[SISTEMA] Intervalo de Polling: %d ms | Intervalo de Heartbeat: %d ms\n\n",
                  POLLING_INTERVAL_MS, HEARTBEAT_INTERVAL_MS);
}

void loop() {
    unsigned long ahora = millis();

    // 1. Mantener y verificar conexión WiFi en segundo plano
    wifiManager.verificarConexion();

    // 2. Procesar aprendizaje IR si está activo
    irManager.verificarAprendizaje();

    // 3. Polling de comandos pendientes a la API (cada POLLING_INTERVAL_MS)
    // No hacer polling mientras se está capturando una señal en modo aprendizaje
    if (ahora - tiempoUltimoPoll >= POLLING_INTERVAL_MS) {
        tiempoUltimoPoll = ahora;
        if (wifiManager.estaConectado() && !irManager.estaEnModoAprendizaje()) {
            apiClient.pollComandos();
        }
    }

    // 4. Envío de latido de vida / presencia (cada HEARTBEAT_INTERVAL_MS)
    if (ahora - tiempoUltimoHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        tiempoUltimoHeartbeat = ahora;
        if (wifiManager.estaConectado()) {
            apiClient.enviarHeartbeat();
        }
    }

    // 5. Parpadeo sutil del LED de estado para indicar que el microcontrolador está vivo
    // Parpadeo rápido (200ms) si está en modo aprendizaje, lento (1000ms) si está normal
    unsigned long intervaloLed = irManager.estaEnModoAprendizaje() ? 200 : 1000;
    if (ahora - tiempoUltimoLedParpadeo >= intervaloLed) {
        tiempoUltimoLedParpadeo = ahora;
        estadoLedOnboard = !estadoLedOnboard;
        digitalWrite(PIN_LED_ESTADO, estadoLedOnboard ? HIGH : LOW);
    }

    // Ceder tiempo al sistema operativo en tiempo real (FreeRTOS) del ESP32
    delay(10);
}
