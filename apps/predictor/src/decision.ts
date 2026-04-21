import { ChunkSizeHint, StabilityRegime } from "@streambridge/shared";
import { WindowFeatures } from "./ewma.js";
import { config } from "./config.js";

interface DecisionState {
  lastRegime: StabilityRegime;
  lastChangeAt: number;
  consecutiveLow: number;
  consecutiveHigh: number;
}

const HYSTERESIS_SAMPLES = 3;
const MIN_CHANGE_INTERVAL_MS = 10_000;

const CV_LOW_THRESHOLD = 0.4;
const CV_HIGH_THRESHOLD = 0.1;
const RETRY_RATE_LOW_THRESHOLD = 1;
const LAG_SLOPE_LOW_THRESHOLD = 50;

const scoreStability = (features: WindowFeatures): number => {
  const cvPenalty = Math.min(1, features.throughputCv / CV_LOW_THRESHOLD);
  const retryPenalty = Math.min(1, features.retryRatePerMin / RETRY_RATE_LOW_THRESHOLD);
  const errorPenalty = Math.min(1, features.errorRatePerMin / 1);
  const lagPenalty = Math.max(0, Math.min(1, features.consumerLagSlope / LAG_SLOPE_LOW_THRESHOLD));
  const combined = 1 - (0.4 * cvPenalty + 0.3 * retryPenalty + 0.2 * errorPenalty + 0.1 * lagPenalty);
  return Math.max(0, Math.min(1, combined));
};

const classify = (features: WindowFeatures, score: number): StabilityRegime => {
  if (
    features.throughputCv >= CV_LOW_THRESHOLD ||
    features.retryRatePerMin >= RETRY_RATE_LOW_THRESHOLD ||
    score < 0.4
  ) {
    return "low";
  }
  if (features.throughputCv <= CV_HIGH_THRESHOLD && features.retryRatePerMin < 0.1 && score > 0.8) {
    return "high";
  }
  return "medium";
};

const regimeToChunkSize = (regime: StabilityRegime): number => {
  switch (regime) {
    case "low":
      return config.lowStabilityChunk;
    case "high":
      return config.highStabilityChunk;
    default:
      return config.mediumStabilityChunk;
  }
};

export class DecisionPolicy {
  private state: DecisionState = {
    lastRegime: "medium",
    lastChangeAt: 0,
    consecutiveLow: 0,
    consecutiveHigh: 0
  };

  decide(features: WindowFeatures, now: number): ChunkSizeHint {
    const score = scoreStability(features);
    const proposed = classify(features, score);

    if (proposed === "low") {
      this.state.consecutiveLow += 1;
      this.state.consecutiveHigh = 0;
    } else if (proposed === "high") {
      this.state.consecutiveHigh += 1;
      this.state.consecutiveLow = 0;
    } else {
      this.state.consecutiveLow = 0;
      this.state.consecutiveHigh = 0;
    }

    let nextRegime: StabilityRegime = this.state.lastRegime;
    const rateLimitOk = now - this.state.lastChangeAt >= MIN_CHANGE_INTERVAL_MS;

    if (rateLimitOk) {
      if (this.state.consecutiveLow >= HYSTERESIS_SAMPLES && this.state.lastRegime !== "low") {
        nextRegime = "low";
      } else if (
        this.state.consecutiveHigh >= HYSTERESIS_SAMPLES &&
        this.state.lastRegime !== "high"
      ) {
        nextRegime = "high";
      } else if (
        proposed === "medium" &&
        this.state.lastRegime !== "medium" &&
        this.state.consecutiveLow === 0 &&
        this.state.consecutiveHigh === 0
      ) {
        nextRegime = "medium";
      }
    }

    if (nextRegime !== this.state.lastRegime) {
      this.state.lastRegime = nextRegime;
      this.state.lastChangeAt = now;
    }

    return {
      source: "ewma",
      stabilityScore: Number(score.toFixed(3)),
      regime: this.state.lastRegime,
      recommendedChunkSize: regimeToChunkSize(this.state.lastRegime),
      featureSnapshot: features,
      timestamp: new Date(now).toISOString()
    };
  }

  current(): StabilityRegime {
    return this.state.lastRegime;
  }
}
