export function renderDuration(ms: number): string {
  if (ms < 0) {
    return `-${renderDuration(-ms)}`;
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const s = Math.floor(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const minutes = Math.round(s / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h:${m.toString().padStart(2, '0')}m`;
}
