class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  isBlocked(key) {
    const now = Date.now();
    const record = this.attempts.get(key);
    
    if (!record || now - record.startTime > this.windowMs) {
      this.attempts.set(key, { startTime: now, count: 1 });
      return false;
    }
    
    if (record.count >= this.maxAttempts) {
      return true;
    }
    
    record.count++;
    return false;
  }

  reset(key) {
    this.attempts.delete(key);
  }

  getRemainingTime(key) {
    const record = this.attempts.get(key);
    if (!record) return 0;
    const elapsed = Date.now() - record.startTime;
    return Math.max(0, this.windowMs - elapsed);
  }
}

export const loginRateLimiter = new RateLimiter(5, 60 * 1000);
export const apiRateLimiter = new RateLimiter(30, 60 * 1000);

export function checkRateLimit(limiter, key) {
  if (limiter.isBlocked(key)) {
    const remaining = Math.ceil(limiter.getRemainingTime(key) / 1000);
    return { blocked: true, remaining };
  }
  return { blocked: false };
}
