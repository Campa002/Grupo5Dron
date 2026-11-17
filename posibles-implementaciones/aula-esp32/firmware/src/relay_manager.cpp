/**
 * Implementación del Gestor del Relé de las luces del aula
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Un solo relé (canal 1, PIN_RELE_LUCES). Corta solo la fase de la lámpara.
 * El nivel activo (alto o bajo) se elige con RELE_ACTIVO_EN_BAJO en config.h.
 */

#include "relay_manager.h"
#include "config.h"

RelayManager relayManager;

RelayManager::RelayManager() : estadoLuces(false) {}

void RelayManager::iniciar() {
    Serial.println("[Relé] Configurando el pin del relé de las luces...");

    // IMPORTANTE: escribir el nivel "apagado" ANTES de configurar el pin como salida,
    // para que no haya ningún pulso que cierre el relé durante el arranque.
    digitalWrite(PIN_RELE_LUCES, RELAY_INACTIVE_LEVEL);
    pinMode(PIN_RELE_LUCES, OUTPUT);
    digitalWrite(PIN_RELE_LUCES, RELAY_INACTIVE_LEVEL);
    estadoLuces = false;

    Serial.printf("[Relé] Luces (GPIO %d): APAGADO al iniciar\n", PIN_RELE_LUCES);
    Serial.printf("[Relé] Nivel activo: %s\n", RELE_ACTIVO_EN_BAJO ? "BAJO (LOW)" : "ALTO (HIGH)");
}

int RelayManager::obtenerPin(int canal) {
    // Hay un solo relé: el canal 1
    return canal == 1 ? PIN_RELE_LUCES : -1;
}

bool RelayManager::activar(int canal) {
    int pin = obtenerPin(canal);
    if (pin == -1) {
        Serial.printf("[Relé] Canal inválido: %d (solo existe el canal 1, luces)\n", canal);
        return false;
    }
    digitalWrite(pin, RELAY_ACTIVE_LEVEL);
    estadoLuces = true;
    Serial.printf("[Relé] Luces (GPIO %d) -> ENCENDIDAS\n", pin);
    return true;
}

bool RelayManager::desactivar(int canal) {
    int pin = obtenerPin(canal);
    if (pin == -1) {
        Serial.printf("[Relé] Canal inválido: %d (solo existe el canal 1, luces)\n", canal);
        return false;
    }
    digitalWrite(pin, RELAY_INACTIVE_LEVEL);
    estadoLuces = false;
    Serial.printf("[Relé] Luces (GPIO %d) -> APAGADAS\n", pin);
    return true;
}

bool RelayManager::conmutar(int canal) {
    return estaActivo(canal) ? desactivar(canal) : activar(canal);
}

bool RelayManager::estaActivo(int canal) {
    return canal == 1 && estadoLuces;
}
