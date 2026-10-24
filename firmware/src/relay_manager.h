/**
 * Gestor de Relés de Potencia 220V — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#ifndef RELAY_MANAGER_H
#define RELAY_MANAGER_H

#include <Arduino.h>

class RelayManager {
public:
    RelayManager();
    void iniciar();
    bool activar(int canal);
    bool desactivar(int canal);
    bool conmutar(int canal);
    bool estaActivo(int canal);

private:
    bool estadoCanal1;
    bool estadoCanal2;
    int obtenerPin(int canal);
};

extern RelayManager relayManager;

#endif // RELAY_MANAGER_H
