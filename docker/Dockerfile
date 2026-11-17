# Servidor web de Grupo 5: PHP 8.2 + Apache con MySQL por PDO.
# El código no va dentro de la imagen: se monta desde ./sitio (lo que arma scripts/armar-paquete-servidor.py).
FROM php:8.2-apache

RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers expires deflate \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
    && printf 'date.timezone=America/Argentina/Buenos_Aires\nexpose_php=Off\ndisplay_errors=Off\nlog_errors=On\n' \
        > /usr/local/etc/php/conf.d/grupo5.ini
