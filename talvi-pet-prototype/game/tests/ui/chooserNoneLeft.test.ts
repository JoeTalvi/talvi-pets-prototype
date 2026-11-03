// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { charmCard } from '../../src/ui/panels/templates/chooser';

const css = readFileSync('src/ui/styles/panels.css', 'utf8');
const tokens = readFileSync('src/ui/styles/tokens.css', 'utf8');
const token = (name: string) => tokens.match(new RegExp(`--${name}:(#[0-9a-f]{6})`))![1];
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';

describe('VERIFY-WORK-038-3-09 B8: the "none left" label reads clearly and sits below the sprite', () => {
  it('VERIFY-WORK-038-3-09: the zero-count label flows below the sprite, name and tags (static, last in the card column), not over the image', () => {
    const host = document.createElement('div');
    host.innerHTML = charmCard({ text: key => (key === 'tpp.chooser.noneLeft' ? 'none left' : key) },
      { typeId: 'lamp', sprite: 'charms/lamp', name: 'Lamp', tagsHtml: '', copies: 0 });
    const card = host.firstElementChild as HTMLElement;
    const children = [...card.children].map(c => c.className || c.tagName);
    expect(children.at(-1)).toBe('tpp-charm-copies');
    expect(card.querySelector('.tpp-charm-copies')!.textContent).toBe('none left');
    const label = rule('.tpp-charm-card.none-left .tpp-charm-copies');
    expect(label).toContain('position:static');
    expect(label).toContain('order:9');
  });

  it('VERIFY-WORK-038-3-09: ink on paper2 is ≥ 4.5:1 and the card dim no longer applies to the label', () => {
    const label = rule('.tpp-charm-card.none-left .tpp-charm-copies');
    expect(label).toContain('color:var(--ink)');
    expect(label).toContain('background:var(--paper2)');
    expect(contrast(token('ink'), token('paper2'))).toBeGreaterThanOrEqual(4.5);
    expect(rule('.tpp-charm-card.none-left')).not.toContain('opacity');
    expect(rule('.tpp-charm-card.none-left>:not(.tpp-charm-copies)')).toContain('opacity:.5');
  });
});
