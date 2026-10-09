#include <cmath>
#include <vector>

#include <unity.h>

#include "signal_processing.h"

void test_detects_respiratory_rate_from_ppg_baseline() {
  constexpr float sample_rate = 25.0F;
  constexpr float expected_bpm = 15.0F;
  std::vector<float> samples(static_cast<std::size_t>(sample_rate * 30.0F));
  for (std::size_t index = 0; index < samples.size(); ++index) {
    const float seconds = static_cast<float>(index) / sample_rate;
    samples[index] = 50000.0F + 1800.0F * std::sin(2.0F * 3.14159265F * expected_bpm / 60.0F * seconds);
  }
  const auto estimate = estimate_respiratory_rate(samples.data(), samples.size(), sample_rate);
  TEST_ASSERT_TRUE(estimate.available);
  TEST_ASSERT_FLOAT_WITHIN(1.0F, expected_bpm, estimate.breaths_per_minute);
  TEST_ASSERT_GREATER_THAN(0.8F, estimate.quality);
}

void test_rejects_flat_signal() {
  std::vector<float> samples(750, 50000.0F);
  const auto estimate = estimate_respiratory_rate(samples.data(), samples.size(), 25.0F);
  TEST_ASSERT_FALSE(estimate.available);
}

void run_tests() {
  UNITY_BEGIN();
  RUN_TEST(test_detects_respiratory_rate_from_ppg_baseline);
  RUN_TEST(test_rejects_flat_signal);
  UNITY_END();
}

#ifdef ARDUINO
#include <Arduino.h>
void setup() { delay(1000); run_tests(); }
void loop() {}
#else
int main(int, char**) { run_tests(); return 0; }
#endif
