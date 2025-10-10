// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

// Memory and performance monitoring utilities
const logMemoryUsage = (context: string = '') => {
  const usage = process.memoryUsage();
  const formatMB = (bytes: number) => Math.round(bytes / 1024 / 1024) + 'MB';
  
  console.log(`Memory usage ${context}:`, {
    rss: formatMB(usage.rss),
    heapUsed: formatMB(usage.heapUsed),
    heapTotal: formatMB(usage.heapTotal),
    external: formatMB(usage.external),
    timestamp: new Date().toISOString()
  });
};

// Enhanced resource cleanup manager
export class ResourceManager {
  private resources: Array<() => Promise<void> | void> = [];
  private isCleaningUp = false;

  constructor() {}

  register(cleanupFn: () => Promise<void> | void) {
    this.resources.push(cleanupFn);
  }

  async cleanup(reason: string = 'unknown') {
    if (this.isCleaningUp) {
      console.log('Cleanup already in progress, skipping...');
      return;
    }

    this.isCleaningUp = true;
    console.log(`Starting resource cleanup: ${reason}`);
    
    const cleanupPromises = this.resources.map(async (cleanupFn, index) => {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn(`Cleanup function ${index} failed:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    
    // Force garbage collection if available
    if ((global as any).gc) {
      (global as any).gc();
      logMemoryUsage('after GC');
    }

    console.log('Resource cleanup completed');
    this.isCleaningUp = false;
  }

  isActive() {
    return !this.isCleaningUp;
  }
}
