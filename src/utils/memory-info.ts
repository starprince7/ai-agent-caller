export const logMemoryUsage = (context: string = '') => {
  const usage = process.memoryUsage();
  const formatMB = (bytes: number) => Math.round(bytes / 1024 / 1024) + 'MB';

  console.log(`Memory usage ${context}:`, {
    rss: formatMB(usage.rss),
    heapUsed: formatMB(usage.heapUsed),
    heapTotal: formatMB(usage.heapTotal),
    external: formatMB(usage.external),
    timestamp: new Date().toISOString(),
  });
};
