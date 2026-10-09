# Firmware setup and provisioning

The PlatformIO project is in `firmware/esp32-finger-rest` and targets a standard ESP32 development board using Arduino.

## Provision a device

1. Sign in as a healthcare professional and open **Devices**.
2. Select an assigned patient, enter a unique device UID, and register the ESP32.
3. Copy the displayed credential immediately. The server stores only its hash and will not show the value again.
4. Copy `include/config.example.h` to `include/pulsebridge_config.h`.
5. Replace the Wi-Fi, HTTPS API URL, device UID, device credential, and root CA placeholders.
6. Never commit `pulsebridge_config.h`; it is ignored by Git.

The API URL must end with `/api/v1/ingestion/vitals`. Use the root CA for that HTTPS host. The firmware intentionally has no insecure-TLS option.

## Build and flash

```bash
cd firmware/esp32-finger-rest
platformio run -e esp32dev
platformio run -e esp32dev --target upload
platformio device monitor --baud 115200
```

Serial output reports state changes and HTTP status codes, not credentials or measurements.

## Acquisition and upload behavior

- A button press creates one stable session ID.
- The device waits up to 20 seconds for sustained finger contact.
- It samples for 30 seconds, rejecting the session if contact is lost.
- MAX30102 processing produces heart rate and estimated SpO₂ when valid.
- DS18B20 produces the temperature value when connected and plausible.
- A smoothed PPG-baseline autocorrelation estimates respiratory rate only when confidence is sufficient.
- Unavailable parameters are marked false and omitted rather than sent as zero.
- HTTPS upload retries three times for transport/server failures; a duplicate-session `409` is treated as already delivered.
- Authentication and other client errors are not repeatedly retried.

## Tests

```bash
platformio test -e native
platformio run -e esp32dev
```

The native tests check a known 15-breath/minute waveform and reject a flat signal. They do not establish physiological validity. Real-board validation must cover sensor detection, finger placement, repeatability, Wi-Fi loss, expired/revoked credentials, TLS, and comparison with reference instruments.
