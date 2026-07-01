export function usePerformancePath() {
  const basePath = '/fdmperformance';

  const performancePath = (path: string) => `${basePath}${path}`;

  return {
    basePath,
    performancePath,
  };
}
