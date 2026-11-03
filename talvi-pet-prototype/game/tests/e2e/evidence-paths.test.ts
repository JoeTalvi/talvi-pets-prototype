import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Review WORK-035-2-1 A7: the M5 trace scripts write their loops, stills, captures and rows under TPP_EVIDENCE itself,
 * never one folder above it (a lane-root TPP_EVIDENCE would otherwise write into the run's shared evidence root). */
const SCRIPTS = ['tests/e2e/m5-trace.mjs', 'tests/e2e/m5-outfit.mjs', 'tests/e2e/lib/m5-greeting.mjs'];

describe('M5 trace evidence paths', () => {
  it.each(SCRIPTS)('%s joins no path above evidenceRoot', script => {
    expect(readFileSync(script, 'utf8')).not.toMatch(/join\(\s*evidenceRoot\s*,\s*'\.\.'/);
  });
});
