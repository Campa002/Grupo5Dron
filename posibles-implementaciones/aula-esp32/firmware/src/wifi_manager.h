/**
 * Gestor de Conexión WiFi — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>

class WifiManager {
public:
    WifiManager();
    void iniciar();
    void verificarConexion();
    bool estaConectado();
    String obtenerIP();
    int obtenerRSSI();

private:
    unsigned long ultimaVerificacion;
    bool estadoAnteriorConectado;
    void intentarConexion();
};

extern WifiManager wifiManager;

#endif // WIFI_MANAGER_H
