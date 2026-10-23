import bundledStrings from '@content/strings.json';

/** Template `text` option over a strings table; the bundled table serves screens shown before content loads. */
export function textFor(strings: Record<string, string> = bundledStrings as Record<string, string>) {
  return (key: string): string => strings[key] ?? `[${key}]`;
}
