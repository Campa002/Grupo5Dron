<?php
/**
 * Generador de Hashes de Contraseña Segura — CLI
 * Grupo 5: Control de Sistemas y Dron
 * 
 * Uso desde línea de comandos:
 *   php scripts/generar_hash.php "TuNuevaContraseñaSegura123!"
 * 
 * Si no se pasa argumento, genera un hash interactivo o para una clave por defecto.
 */

if (php_sapi_name() !== 'cli') {
    die("Este script solo debe ejecutarse desde la terminal (CLI).\n");
}

$password = $argv[1] ?? null;

if (!$password) {
    echo "============================================================\n";
    echo "  Grupo 5: Generador de Hash Bcrypt (PASSWORD_DEFAULT)\n";
    echo "============================================================\n\n";
    echo "Ingresá la nueva contraseña: ";
    $password = trim(fgets(STDIN));
}

if (strlen($password) < 8) {
    die("⚠️ Error: La contraseña debe tener al menos 8 caracteres.\n");
}

$hash = password_hash($password, PASSWORD_DEFAULT);

echo "\n------------------------------------------------------------\n";
echo "Contraseña ingresada: $password\n";
echo "Hash generado (Bcrypt): $hash\n";
echo "------------------------------------------------------------\n\n";
echo "Comando SQL para actualizar el usuario Administrador:\n\n";
echo "UPDATE `usuarios` \n";
echo "SET `password_hash` = '$hash', \n";
echo "    `debe_cambiar_password` = 0 \n";
echo "WHERE `email` = 'admin@grupo5dron.local';\n\n";
echo "Para otro usuario, reemplazá el email correspondiente.\n";
