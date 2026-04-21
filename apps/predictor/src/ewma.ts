export interface MetricSample {
  transferId: string;
  throughput: number;
  retryCount: number;
  errorCount: number;
  consumerLag: number;
  timestamp: string;
}

export interface WindowFeatures {
  throughputEwmaBytesPerSec: number;
  throughputCv: number;
  retryRatePerMin: number;
  errorRatePerMin: number;
  consumerLagSlope: number;
  windowSeconds: number;
}

export class EwmaWindow {
  private throughputEwma = 0;
  private throughputVarEwma = 0;
  private lastLag = 0;
  private lagSlopeEwma = 0;
  private retrySum = 0;
  private errorSum = 0;
  private firstSampleAt: number | null = null;
  private lastSampleAt: number | null = null;
  private samples = 0;

  constructor(private readonly alpha: number) {}

  ingest(sample: MetricSample): void {
    const timestampMs = Date.parse(sample.timestamp);

    if (this.samples === 0) {
      this.throughputEwma = sample.throughput;
      this.throughputVarEwma = 0;
      this.lastLag = sample.consumerLag;
      this.firstSampleAt = timestampMs;
    } else {
      const delta = sample.throughput - this.throughputEwma;
      this.throughputEwma += this.alpha * delta;
      this.throughputVarEwma =
        (1 - this.alpha) * (this.throughputVarEwma + this.alpha * delta * delta);

      const lagDelta = sample.consumerLag - this.lastLag;
      this.lagSlopeEwma += this.alpha * (lagDelta - this.lagSlopeEwma);
      this.lastLag = sample.consumerLag;
    }

    this.retrySum += sample.retryCount;
    this.errorSum += sample.errorCount;
    this.lastSampleAt = timestampMs;
    this.samples += 1;
  }

  hasData(): boolean {
    return this.samples > 0;
  }

  snapshot(): WindowFeatures {
    const windowSeconds =
      this.firstSampleAt !== null && this.lastSampleAt !== null
        ? Math.max(1, (this.lastSampleAt - this.firstSampleAt) / 1000)
        : 1;

    const mean = this.throughputEwma;
    const stddev = Math.sqrt(this.throughputVarEwma);
    const cv = mean > 1 ? stddev / mean : 0;

    return {
      throughputEwmaBytesPerSec: mean,
      throughputCv: cv,
      retryRatePerMin: (this.retrySum / windowSeconds) * 60,
      errorRatePerMin: (this.errorSum / windowSeconds) * 60,
      consumerLagSlope: this.lagSlopeEwma,
      windowSeconds
    };
  }
}
