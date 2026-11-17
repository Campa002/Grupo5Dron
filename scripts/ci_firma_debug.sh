#!/usr/bin/env bash
# Firma fija de los APK debug (dron y aula) en GitHub Actions — Grupo 5: Control de Sistemas y Dron
#
#   bash scripts/ci_firma_debug.sh instalar          instala la clave del secreto DEBUG_KEYSTORE_BASE64
#   bash scripts/ci_firma_debug.sh verificar <apk>   muestra con qué clave quedó firmado el APK
#
# Gradle firma los debug con ~/.android/debug.keystore (alias androiddebugkey, contraseña android).
# Si el secreto no existe o no es válido, se usa la clave por defecto (el build no se rompe).
set -u

instalar() {
  if [ -z "${DEBUG_KEYSTORE_BASE64:-}" ]; then
    echo "::notice::No existe el secreto DEBUG_KEYSTORE_BASE64: se usa la clave debug por defecto (cambia en cada build)."
    echo "### Firma: clave debug por defecto (cambia en cada build)" >> "$GITHUB_STEP_SUMMARY"
    return 0
  fi
  TMP="$RUNNER_TEMP/debug.keystore"
  if ! printf '%s' "$DEBUG_KEYSTORE_BASE64" | base64 -d > "$TMP" 2>/dev/null \
     || ! keytool -list -keystore "$TMP" -storepass android -alias androiddebugkey > /dev/null 2>&1; then
    echo "::warning::El secreto DEBUG_KEYSTORE_BASE64 no es un keystore válido (alias androiddebugkey, contraseña android): se usa la clave por defecto."
    echo "### AVISO: Firma: el secreto no es válido, se usó la clave por defecto" >> "$GITHUB_STEP_SUMMARY"
    rm -f "$TMP"
    return 0
  fi
  # Ubicación por defecto del keystore debug (y las alternativas, si el runner las define)
  DESTINOS="$HOME/.android"
  [ -n "${ANDROID_USER_HOME:-}" ] && DESTINOS="$DESTINOS $ANDROID_USER_HOME"
  [ -n "${ANDROID_SDK_HOME:-}" ] && DESTINOS="$DESTINOS $ANDROID_SDK_HOME/.android"
  for d in $DESTINOS; do mkdir -p "$d"; cp "$TMP" "$d/debug.keystore"; done
  HUELLA=$(keytool -list -v -keystore "$TMP" -storepass android -alias androiddebugkey | grep -m1 'SHA256:' | sed 's/.*SHA256: *//')
  rm -f "$TMP"
  echo "HUELLA_CLAVE=$HUELLA" >> "$GITHUB_ENV"
  echo "Clave fija instalada en: $DESTINOS"
  echo "SHA-256 de la clave: $HUELLA"
}

verificar() {
  APK="$1"
  BT=$(ls -d "$ANDROID_HOME"/build-tools/*/ 2>/dev/null | sort -V | tail -1)
  if [ -z "$BT" ] || [ ! -x "${BT}apksigner" ]; then
    echo "::notice::No se encontró apksigner: no se verifica la firma."
    return 0
  fi
  FIRMA=$("${BT}apksigner" verify --print-certs "$APK" | grep -m1 'SHA-256 digest' | sed 's/.*digest: *//')
  echo "SHA-256 del certificado del APK: $FIRMA"
  echo "### Certificado del APK (SHA-256): \`$FIRMA\`" >> "$GITHUB_STEP_SUMMARY"
  if [ -n "${HUELLA_CLAVE:-}" ]; then
    ESPERADA=$(printf '%s' "$HUELLA_CLAVE" | tr -d ':' | tr 'A-F' 'a-f')
    if [ "$FIRMA" = "$ESPERADA" ]; then
      echo "OK: El APK quedó firmado con la clave fija."
      echo "OK: Firmado con la clave fija: se instala encima del anterior sin desinstalar." >> "$GITHUB_STEP_SUMMARY"
    else
      echo "::warning::El APK NO quedó firmado con la clave fija (esperada $ESPERADA)."
      echo "AVISO: El APK no quedó firmado con la clave fija." >> "$GITHUB_STEP_SUMMARY"
    fi
  fi
}

case "${1:-}" in
  instalar) instalar ;;
  verificar) verificar "${2:?Falta la ruta del APK}" ;;
  *) echo "Uso: $0 instalar | verificar <apk>"; exit 2 ;;
esac
