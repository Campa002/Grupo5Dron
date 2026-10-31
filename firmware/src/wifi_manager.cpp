/**
 * Implementación del Gestor de Conexión WiFi
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#include "wifi_manager.h"
#include "config.h"

WifiManager wifiManager;

WifiManager::WifiManager() : ultimaVerificacion(0), estadoAnteriorConectado(false) {}

void WifiManager::iniciar() {
    Serial.println("\n[WiFi] Inicializando adaptador de red inalámbrica...");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    intentarConexion();
}

void WifiManager::intentarConexion() {
    Serial.printf("[WiFi] Conectando a red SSID: \"%s\"...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long inicio = millis();
    int intentos = 0;

    while (WiFi.status() != WL_CONNECTED && (millis() - inicio) < WIFI_TIMEOUT_MS) {
        delay(500);
        Serial.print(".");
        intentos++;
        if (intentos % 40 == 0) {
            Serial.println();
        }
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] ✓ Conexión establecida con éxito!");
        Serial.printf("[WiFi] Dirección IP asignada: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WiFi] Intensidad de señal (RSSI): %d dBm\n", WiFi.RSSI());
        Serial.printf("[WiFi] Puerta de enlace: %s\n", WiFi.gatewayIP().toString().c_str());
        estadoAnteriorConectado = true;

        // Sincronización horaria NTP requerida para validación de fechas en certificados HTTPS (TLS)
        Serial.println("[NTP] Sincronizando fecha y hora con servidores de tiempo...");
        configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com");
        time_t now = time(nullptr);
        unsigned long ntpInicio = millis();
        while (now < 1672531199 && (millis() - ntpInicio) < 6000) { // Esperar año >= 2023
            delay(300);
            now = time(nullptr);
            Serial.print("#");
        }
        Serial.println();
        if (now >= 1672531199) {
            struct tm timeinfo;
            localtime_r(&now, &timeinfo);
            char bufferFecha[64];
            strftime(bufferFecha, sizeof(bufferFecha), "%d/%m/%Y %H:%M:%S", &timeinfo);
            Serial.printf("[NTP] ✓ Hora sincronizada para HTTPS: %s (UTC-3)\n", bufferFecha);
        } else {
            Serial.println("[NTP] ⚠️ Timeout de sincronización NTP. Si VERIFY_SSL está activo, verificar conexión a internet.");
        }
    } else {
        Serial.println("[WiFi] ⚠️ Tiempo de espera agotado. Se continuará reintentando en segundo plano.");
        estadoAnteriorConectado = false;
    }
}

void WifiManager::verificarConexion() {
    unsigned long ahora = millis();
    if (ahora - ultimaVerificacion < WIFI_RECONNECT_INTERVAL_MS) {
        return;
    }
    ultimaVerificacion = ahora;

    bool conectadoActual = (WiFi.status() == WL_CONNECTED);

    if (!conectadoActual && estadoAnteriorConectado) {
        Serial.println("[WiFi] ⚠️ Conexión perdida. Intentando reconectar automáticamente...");
        WiFi.disconnect();
        WiFi.reconnect();
    } else if (conectadoActual && !estadoAnteriorConectado) {
        Serial.println("[WiFi] ✓ Reconexión exitosa!");
        Serial.printf("[WiFi] Dirección IP: %s | RSSI: %d dBm\n", 
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }

    estadoAnteriorConectado = conectadoActual;
}

bool WifiManager::estaConectado() {
    return WiFi.status() == WL_CONNECTED;
}

String WifiManager::obtenerIP() {
    if (estaConectado()) {
        return WiFi.localIP().toString();
    }
    return "0.0.0.0";
}

int WifiManager::obtenerRSSI() {
    if (estaConectado()) {
        return WiFi.RSSI();
    }
    return 0;
}
