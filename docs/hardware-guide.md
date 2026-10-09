# ESP32 finger-rest hardware guide

## Bill of materials

| Part | Quantity | Purpose |
|---|---:|---|
| ESP32 development board | 1 | Processing, Wi-Fi, and HTTPS |
| MAX30102 breakout | 1 | Red/IR PPG for estimated SpO₂, heart rate, and respiratory experiment |
| Waterproof or probe DS18B20 | 1 | Contact skin-temperature prototype |
| 4.7 kΩ resistor | 1 | DS18B20 data pull-up |
| Momentary push button | 1 | Start a reading |
| LED + 220–330 Ω resistor | 1 | Optional external state indicator; onboard GPIO 2 LED may be used |
| Breadboard and jumper wires | 1 set | Prototype assembly |
| Stable USB power/data cable | 1 | Power and flashing |

Confirm the voltage requirements printed on the exact breakout boards before wiring. Use 3.3 V logic with the ESP32.

## Default wiring

| ESP32 | MAX30102 | DS18B20 | Control |
|---|---|---|---|
| 3V3 | VIN | VDD | — |
| GND | GND | GND | Button side 1 and LED cathode |
| GPIO 21 | SDA | — | — |
| GPIO 22 | SCL | — | — |
| GPIO 18 | — | DATA | 4.7 kΩ from DATA to 3V3 |
| GPIO 4 | — | — | Button side 2; internal pull-up is enabled |
| GPIO 2 | — | — | Status LED through resistor, if no suitable onboard LED |

## Interaction

1. Power the device and wait for `IDLE`.
2. Press the button once.
3. Place one finger steadily over the MAX30102 and keep the DS18B20 in consistent skin contact.
4. Slow blinking means waiting for contact; fast blinking means acquiring or uploading; steady light means success; rapid error blinking means retry is needed.
5. Keep still for the complete 30-second acquisition.

This arrangement is a university prototype, not an ergonomic or electrically certified enclosure. Do not connect it to a patient while it is powered from questionable mains equipment, and do not interpret its values clinically.
