#include "signal_processing.h"

#include <algorithm>
#include <cmath>
#include <vector>

RespiratoryEstimate estimate_respiratory_rate(const float* samples,
                                              std::size_t count,
                                              float sample_rate_hz,
                                              float minimum_bpm,
                                              float maximum_bpm) {
  if (samples == nullptr || count < static_cast<std::size_t>(sample_rate_hz * 20.0F) ||
      sample_rate_hz <= 0.0F || minimum_bpm <= 0.0F || maximum_bpm <= minimum_bpm) {
    return {false, 0.0F, 0.0F};
  }

  const std::size_t smoothing_window = std::max<std::size_t>(1, static_cast<std::size_t>(sample_rate_hz));
  std::vector<float> smoothed(count);
  double rolling_sum = 0.0;
  for (std::size_t index = 0; index < count; ++index) {
    rolling_sum += samples[index];
    if (index >= smoothing_window) rolling_sum -= samples[index - smoothing_window];
    const std::size_t width = std::min(index + 1, smoothing_window);
    smoothed[index] = static_cast<float>(rolling_sum / static_cast<double>(width));
  }

  double mean = 0.0;
  for (std::size_t index = smoothing_window; index < count; ++index) mean += smoothed[index];
  mean /= static_cast<double>(count - smoothing_window);

  double energy = 0.0;
  for (std::size_t index = smoothing_window; index < count; ++index) {
    const double centered = smoothed[index] - mean;
    energy += centered * centered;
  }
  if (energy < 1e-6) return {false, 0.0F, 0.0F};

  const std::size_t minimum_lag = std::max<std::size_t>(1, static_cast<std::size_t>(sample_rate_hz * 60.0F / maximum_bpm));
  const std::size_t maximum_lag = std::min<std::size_t>(count / 2, static_cast<std::size_t>(sample_rate_hz * 60.0F / minimum_bpm));
  double best_correlation = -1.0;
  std::size_t best_lag = 0;
  for (std::size_t lag = minimum_lag; lag <= maximum_lag; ++lag) {
    double numerator = 0.0;
    double left_energy = 0.0;
    double right_energy = 0.0;
    for (std::size_t index = smoothing_window; index + lag < count; ++index) {
      const double left = smoothed[index] - mean;
      const double right = smoothed[index + lag] - mean;
      numerator += left * right;
      left_energy += left * left;
      right_energy += right * right;
    }
    const double denominator = std::sqrt(left_energy * right_energy);
    const double correlation = denominator > 0.0 ? numerator / denominator : 0.0;
    if (correlation > best_correlation) {
      best_correlation = correlation;
      best_lag = lag;
    }
  }

  const float quality = static_cast<float>(std::max(0.0, std::min(1.0, best_correlation)));
  if (best_lag == 0 || quality < 0.35F) return {false, 0.0F, quality};
  return {true, 60.0F * sample_rate_hz / static_cast<float>(best_lag), quality};
}
