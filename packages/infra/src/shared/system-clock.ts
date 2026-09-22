import type { Clock } from '@norde/core/shared';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
