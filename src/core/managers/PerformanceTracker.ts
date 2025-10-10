// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

// Performance metrics tracking
export class PerformanceTracker {
  private startTime: number;
  private milestones: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(milestone: string) {
    this.milestones.set(milestone, Date.now() - this.startTime);
    console.log(`Performance: ${milestone} took ${this.milestones.get(milestone)}ms`);
  }

  getMetrics() {
    return Object.fromEntries(this.milestones);
  }
}
