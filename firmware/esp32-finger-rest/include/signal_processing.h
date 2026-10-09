#pragma once

#include <cstddef>

struct RespiratoryEstimate {
  bool available;
  float breaths_per_minute;
  float quality;
};

RespiratoryEstimate estimate_respiratory_rate(const float* samples,
                                              std::size_t count,
                                              float sample_rate_hz,
                                              float minimum_bpm = 6.0F,
                                              float maximum_bpm = 40.0F);
