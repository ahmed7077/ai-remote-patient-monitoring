#include <Arduino.h>
#include <ArduinoJson.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <MAX30105.h>
#include <OneWire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <spo2_algorithm.h>
#include <time.h>

#if __has_include("pulsebridge_config.h")
#include "pulsebridge_config.h"
#else
#include "config.example.h"
#endif

#include "signal_processing.h"

#ifndef PIO_UNIT_TESTING
namespace {
constexpr float kSampleRateHz = 25.0F;
constexpr std::size_t kSampleCount = 750;
constexpr std::size_t kOximetryWindow = 100;
constexpr uint32_t kFingerThreshold = 50000;
constexpr uint32_t kSampleIntervalMs = 1000U / static_cast<uint32_t>(kSampleRateHz);
constexpr int kUploadAttempts = 3;
constexpr char kAlgorithmVersion[] = "max30102-ds18b20-ppg-resp-0.1";

enum class DeviceState { IDLE, WAITING_FOR_FINGER, ACQUIRING, PROCESSING, UPLOADING, SUCCESS, ERROR };

MAX30105 optical_sensor;
OneWire one_wire(DS18B20_PIN);
DallasTemperature temperature_sensor(&one_wire);
DeviceState state = DeviceState::IDLE;
uint32_t ir_samples[kSampleCount];
uint32_t red_samples[kSampleCount];
float respiratory_samples[kSampleCount];
char session_id[37] = {};

struct Result {
  bool heart_available = false;
  bool spo2_available = false;
  bool temperature_available = false;
  bool respiratory_available = false;
  int32_t heart_rate = 0;
  int32_t spo2 = 0;
  float temperature = 0.0F;
  float respiratory_rate = 0.0F;
  float respiratory_quality = 0.0F;
  float finger_quality = 0.0F;
};

const char* state_name(DeviceState value) {
  switch (value) {
    case DeviceState::IDLE: return "IDLE";
    case DeviceState::WAITING_FOR_FINGER: return "WAITING_FOR_FINGER";
    case DeviceState::ACQUIRING: return "ACQUIRING";
    case DeviceState::PROCESSING: return "PROCESSING";
    case DeviceState::UPLOADING: return "UPLOADING";
    case DeviceState::SUCCESS: return "SUCCESS";
    case DeviceState::ERROR: return "ERROR";
  }
  return "UNKNOWN";
}

void set_state(DeviceState next) {
  state = next;
  Serial.printf("State: %s\n", state_name(next));
}

void update_led() {
  const uint32_t now = millis();
  bool on = false;
  if (state == DeviceState::WAITING_FOR_FINGER) on = (now / 500U) % 2U;
  if (state == DeviceState::ACQUIRING || state == DeviceState::UPLOADING) on = (now / 125U) % 2U;
  if (state == DeviceState::SUCCESS) on = true;
  if (state == DeviceState::ERROR) on = (now / 80U) % 2U;
  digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

bool configuration_ready() {
  return strstr(WIFI_SSID, "replace-with") == nullptr && strstr(API_URL, "replace-with") == nullptr &&
         strstr(DEVICE_UID, "replace-with") == nullptr && strstr(DEVICE_CREDENTIAL, "replace-with") == nullptr &&
         strstr(ROOT_CA_PEM, "replace-with") == nullptr;
}

bool button_pressed() {
  static bool previous = HIGH;
  static uint32_t changed_at = 0;
  const bool current = digitalRead(START_BUTTON_PIN);
  if (current != previous && millis() - changed_at > 40U) {
    previous = current;
    changed_at = millis();
    return current == LOW;
  }
  return false;
}

void create_session_id() {
  const uint32_t a = esp_random();
  const uint32_t b = esp_random();
  const uint32_t c = esp_random();
  const uint32_t d = esp_random();
  snprintf(session_id, sizeof(session_id), "%08lx-%04lx-4%03lx-a%03lx-%08lx%04lx",
           static_cast<unsigned long>(a), static_cast<unsigned long>(b >> 16),
           static_cast<unsigned long>(b & 0x0FFF), static_cast<unsigned long>(c & 0x0FFF),
           static_cast<unsigned long>(d), static_cast<unsigned long>(c >> 16));
}

bool utc_timestamp(char* output, std::size_t length) {
  struct tm time_info {};
  if (!getLocalTime(&time_info, 5000U)) return false;
  return strftime(output, length, "%Y-%m-%dT%H:%M:%SZ", &time_info) > 0;
}

bool ensure_wifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t deadline = millis() + 15000U;
  while (WiFi.status() != WL_CONNECTED && static_cast<int32_t>(deadline - millis()) > 0) {
    update_led();
    delay(100);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool acquire_samples() {
  set_state(DeviceState::WAITING_FOR_FINGER);
  const uint32_t deadline = millis() + 20000U;
  while (optical_sensor.getIR() < kFingerThreshold) {
    update_led();
    if (static_cast<int32_t>(deadline - millis()) <= 0) return false;
    delay(50);
  }

  set_state(DeviceState::ACQUIRING);
  temperature_sensor.requestTemperatures();
  for (std::size_t index = 0; index < kSampleCount; ++index) {
    const uint32_t started = millis();
    red_samples[index] = optical_sensor.getRed();
    ir_samples[index] = optical_sensor.getIR();
    respiratory_samples[index] = static_cast<float>(ir_samples[index]);
    if (ir_samples[index] < kFingerThreshold) return false;
    while (millis() - started < kSampleIntervalMs) {
      update_led();
      delay(1);
    }
  }
  return true;
}

Result process_samples() {
  set_state(DeviceState::PROCESSING);
  Result result;
  int32_t heart_rate = 0;
  int32_t spo2 = 0;
  int8_t heart_valid = 0;
  int8_t spo2_valid = 0;
  maxim_heart_rate_and_oxygen_saturation(
      &ir_samples[kSampleCount - kOximetryWindow], static_cast<int32_t>(kOximetryWindow),
      &red_samples[kSampleCount - kOximetryWindow], &spo2, &spo2_valid, &heart_rate, &heart_valid);
  result.heart_available = heart_valid == 1 && heart_rate >= 25 && heart_rate <= 240;
  result.spo2_available = spo2_valid == 1 && spo2 >= 50 && spo2 <= 100;
  result.heart_rate = heart_rate;
  result.spo2 = spo2;

  const float temperature = temperature_sensor.getTempCByIndex(0);
  result.temperature_available = temperature != DEVICE_DISCONNECTED_C && temperature > 20.0F && temperature < 45.0F;
  result.temperature = temperature;

  const auto respiratory = estimate_respiratory_rate(respiratory_samples, kSampleCount, kSampleRateHz);
  result.respiratory_available = respiratory.available;
  result.respiratory_rate = respiratory.breaths_per_minute;
  result.respiratory_quality = respiratory.quality;

  double ir_mean = 0.0;
  for (const uint32_t sample : ir_samples) ir_mean += sample;
  result.finger_quality = static_cast<float>(min(1.0, ir_mean / static_cast<double>(kSampleCount) / 120000.0));
  return result;
}

void add_measurement(JsonArray measurements, const char* type, float value, const char* unit) {
  JsonObject measurement = measurements.add<JsonObject>();
  measurement["type"] = type;
  measurement["value"] = value;
  measurement["unit"] = unit;
}

bool upload(const Result& result) {
  set_state(DeviceState::UPLOADING);
  if (!ensure_wifi()) return false;
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  char recorded_at[25] = {};
  if (!utc_timestamp(recorded_at, sizeof(recorded_at))) return false;

  JsonDocument document;
  document["device_uid"] = DEVICE_UID;
  document["recorded_at"] = recorded_at;
  document["device_session_id"] = session_id;
  document["acquisition_duration_seconds"] = static_cast<float>(kSampleCount) / kSampleRateHz;
  document["algorithm_version"] = kAlgorithmVersion;
  JsonObject quality = document["signal_quality"].to<JsonObject>();
  quality["finger_contact"] = result.finger_quality;
  quality["respiratory_confidence"] = result.respiratory_quality;
  JsonObject availability = document["measurement_availability"].to<JsonObject>();
  availability["HEART_RATE"] = result.heart_available;
  availability["SPO2"] = result.spo2_available;
  availability["TEMPERATURE"] = result.temperature_available;
  availability["RESPIRATORY_RATE"] = result.respiratory_available;
  JsonArray measurements = document["measurements"].to<JsonArray>();
  if (result.heart_available) add_measurement(measurements, "HEART_RATE", result.heart_rate, "bpm");
  if (result.spo2_available) add_measurement(measurements, "SPO2", result.spo2, "%");
  if (result.temperature_available) add_measurement(measurements, "TEMPERATURE", result.temperature, "°C");
  if (result.respiratory_available) add_measurement(measurements, "RESPIRATORY_RATE", result.respiratory_rate, "breaths/min");
  if (measurements.size() == 0) return false;

  String payload;
  serializeJson(document, payload);
  for (int attempt = 0; attempt < kUploadAttempts; ++attempt) {
    WiFiClientSecure client;
    client.setCACert(ROOT_CA_PEM);
    HTTPClient http;
    if (!http.begin(client, API_URL)) return false;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Credential", DEVICE_CREDENTIAL);
    const int response_code = http.POST(payload);
    http.end();
    Serial.printf("Upload attempt %d returned HTTP %d\n", attempt + 1, response_code);
    if (response_code >= 200 && response_code < 300) return true;
    if (response_code == 409) return true;
    if (response_code >= 400 && response_code < 500) return false;
    delay(1000U << attempt);
  }
  return false;
}
}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  if (!configuration_ready()) {
    Serial.println("Configuration placeholders detected; copy config.example.h to pulsebridge_config.h and provision the device.");
    set_state(DeviceState::ERROR);
    return;
  }
  if (!optical_sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 was not detected.");
    set_state(DeviceState::ERROR);
    return;
  }
  optical_sensor.setup(60, 4, 2, 100, 411, 4096);
  optical_sensor.setSampleRate(100);
  temperature_sensor.begin();
  set_state(DeviceState::IDLE);
}

void loop() {
  update_led();
  if (state == DeviceState::ERROR) {
    if (button_pressed()) set_state(DeviceState::IDLE);
    delay(10);
    return;
  }
  if (state == DeviceState::SUCCESS && button_pressed()) set_state(DeviceState::IDLE);
  if (state != DeviceState::IDLE || !button_pressed()) {
    delay(10);
    return;
  }
  create_session_id();
  if (!acquire_samples()) {
    Serial.println("Acquisition stopped because finger contact was not stable.");
    set_state(DeviceState::ERROR);
    return;
  }
  const Result result = process_samples();
  set_state(upload(result) ? DeviceState::SUCCESS : DeviceState::ERROR);
}
#endif
