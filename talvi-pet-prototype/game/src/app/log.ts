export type LogLine = { type: string; t: number; [key: string]: unknown };
export const logs: LogLine[] = [];
export function log(type: string, fields: Record<string, unknown> = {}): void {
  const line = { type, t: performance.now(), ...fields };
  logs.push(line);
  if (logs.length > 5000) logs.shift();
  console.info(JSON.stringify(line));
}
