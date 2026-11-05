/**
 * Implementación del Gestor de Relés de Potencia
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#include "relay_manager.h"
#include "config.h"

RelayManager relayManager;

RelayManager::RelayManager() : estadoCanal1(false), estadoCanal2(false) {}

void RelayManager::iniciar() {
    Serial.println("[Relé] Configurando pines de salida para módulos de relé...");

    // IMPORTANTE: Escribir el estado inactivo ANTES de configurar como OUTPUT
    // para evitar cualquier pulso espurio que cierre el relé durante el arranque.
    // Canal 1 (GPIO 25): Relé principal del aula (220V)
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELAY_1, OUTPUT);
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE_LEVEL);
    estadoCanal1 = false;

    // Canal 2: Deshabilitado (sin pin asignado)
    #if defined(PIN_RELAY_2) && (PIN_RELAY_2 >= 0)
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELAY_2, OUTPUT);
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE_LEVEL);
    #endif
    estadoCanal2 = false;

    Serial.printf("[Relé] Canal 1 (GPIO %d): APAGADO (Estado por defecto al inicio)\n", PIN_RELAY_1);
    Serial.printf("[Relé] Canal 2 (GPIO %d): APAGADO (Estado por defecto al inicio)\n", PIN_RELAY_2);
    Serial.printf("[Relé] Nivel activo configurado: %s\n", 
                  (RELAY_ACTIVE_LEVEL == LOW) ? "ACTIVO-BAJO (LOW)" : "ACTIVO-ALTO (HIGH)");
}

int RelayManager::obtenerPin(int canal) {
    if (canal == 1) return PIN_RELAY_1;
    #if defined(PIN_RELAY_2) && (PIN_RELAY_2 >= 0)
    if (canal == 2) return PIN_RELAY_2;
    #endif
    return -1;
}

bool RelayManager::activar(int canal) {
    int pin = obtenerPin(canal);
    if (pin == -1) {
        Serial.printf("[Relé] ⚠️ Canal inválido solicitado: %d (solo 1 o 2 permitidos)\n", canal);
        return false;
    }

    digitalWrite(pin, RELAY_ACTIVE_LEVEL);
    if (canal == 1) estadoCanal1 = true;
    if (canal == 2) estadoCanal2 = true;

    Serial.printf("[Relé] ⚡ Canal %d (GPIO %d) -> ACTIVADO\n", canal, pin);
    return true;
}

bool RelayManager::desactivar(int canal) {
    int pin = obtenerPin(canal);
    if (pin == -1) {
        Serial.printf("[Relé] ⚠️ Canal inválido solicitado: %d\n", canal);
        return false;
    }

    digitalWrite(pin, RELAY_INACTIVE_LEVEL);
    if (canal == 1) estadoCanal1 = false;
    if (canal == 2) estadoCanal2 = false;

    Serial.printf("[Relé] ⭕ Canal %d (GPIO %d) -> DESACTIVADO / APAGADO\n", canal, pin);
    return true;
}

bool RelayManager::conmutar(int canal) {
    if (estaActivo(canal)) {
        return desactivar(canal);
    } else {
        return activar(canal);
    }
}

bool RelayManager::estaActivo(int canal) {
    if (canal == 1) return estadoCanal1;
    if (canal == 2) return estadoCanal2;
    return false;
}
