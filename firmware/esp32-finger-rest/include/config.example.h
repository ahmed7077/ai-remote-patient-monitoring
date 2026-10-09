#pragma once

// Copy this file to pulsebridge_config.h and replace every placeholder before flashing.
// pulsebridge_config.h is ignored by Git and must never be committed.
#define WIFI_SSID "replace-with-wifi-name"
#define WIFI_PASSWORD "replace-with-wifi-password"
#define API_URL "https://replace-with-api-host/api/v1/ingestion/vitals"
#define DEVICE_UID "replace-with-registered-device-uid"
#define DEVICE_CREDENTIAL "replace-with-one-time-device-credential"

// PEM-encoded root CA that validates API_URL. Do not disable TLS verification.
#define ROOT_CA_PEM \
  "-----BEGIN CERTIFICATE-----\n" \
  "replace-with-api-root-ca-certificate\n" \
  "-----END CERTIFICATE-----\n"

#define FIRMWARE_VERSION "0.1.0"
#define STATUS_LED_PIN 2
#define START_BUTTON_PIN 4
#define DS18B20_PIN 18
