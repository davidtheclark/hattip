'use strict';

function hattipBackoff({
  limit = 3,
  minDelay = 100,
  maxDelay = 1000,
  jitter = true,
  fastFirst = false,
} = {}) {
  return ({ retryIndex }) => {
    if (retryIndex > limit - 1) return false;
    if (retryIndex === 0 && fastFirst) return 1;
    const jitterFactor = jitter ? Math.random() + 1 : 1;
    return Math.min(
      maxDelay,
      Math.pow(2, retryIndex) * minDelay * jitterFactor,
    );
  };
}

exports.hattipBackoff = hattipBackoff;
