import type { Options, Store } from "express-rate-limit";
import { row, run } from "./db.js";

// Shared atomic counters keep login limits consistent across serverless instances.
export class DatabaseRateStore implements Store {
  localKeys = false;
  windowMs = 60000;
  constructor(public prefix: string) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string) {
    const time = Date.now();
    const result = (await row(
      `INSERT INTO rate_limit_buckets(key,hits,reset_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET
        hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,
        reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END
      RETURNING hits,reset_at`,
      this.prefix + key,
      time + this.windowMs,
      time,
      time,
    ))!;
    return { totalHits: result.hits, resetTime: new Date(result.reset_at) };
  }
  async decrement(key: string) {
    await run(
      "UPDATE rate_limit_buckets SET hits=max(0,hits-1) WHERE key=?",
      this.prefix + key,
    );
  }
  async resetKey(key: string) {
    await run("DELETE FROM rate_limit_buckets WHERE key=?", this.prefix + key);
  }
}
