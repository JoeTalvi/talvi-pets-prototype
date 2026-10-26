// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRotateCurtain, curtainShown } from '../../src/ui/panels/rotateCurtain';
import { errorExportFilename, showContentError } from '../../src/ui/panels/errorScreen';
import { mountOverlay } from '../../src/ui/overlay';
import { ContentError, loadContent } from '../../src/content/load';
import { manifest } from '../content/helpers';
import { createMemoryStorage } from '../app/memoryStorage';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('VERIFY-PRES-012 rotate curtain', () => {
  it('VERIFY-PRES-012 partial: rule half — curtainShown only for touch + portrait (device half not-run (user, play session))', () => {
    expect(curtainShown('portrait-primary', true)).toBe(true);
    expect(curtainShown('landscape-primary', true)).toBe(false);
    expect(curtainShown('portrait-primary', false)).toBe(false);
  });

  it('VERIFY-PRES-012 partial: rule half — createRotateCurtain toggles .tpp-rotateCurtain and records ui.rotateCurtain only on change', () => {
    const root = document.createElement('div'); document.body.append(root);
    const record = vi.fn();
    const curtain = createRotateCurtain(root, record);
    const element = root.querySelector<HTMLElement>('.tpp-rotateCurtain')!;
    expect(element.hidden).toBe(true);
    curtain.update('landscape-primary', true); expect(record).not.toHaveBeenCalled();
    curtain.update('portrait-primary', true); expect(element.hidden).toBe(false);
    curtain.update('portrait-secondary', true);
    curtain.update('landscape-primary', true); expect(element.hidden).toBe(true);
    expect(record.mock.calls).toEqual([['ui.rotateCurtain', { shown: true }], ['ui.rotateCurtain', { shown: false }]]);
  });
});

describe('VERIFY-PRES-013 error screen export', () => {
  it('VERIFY-PRES-013 partial: Export half (jsdom) — FX-BAD charms-bad-size-class lists the loader line; Export downloads tpp-error-<date>.txt with the issues and the log mirror (device half not-run)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: unknown;
    try { loadContent(manifest, JSON.parse(readFileSync('tests/fixtures/bad/charms-bad-size-class.json', 'utf8'))); } catch (thrown) { error = thrown; }
    expect(error).toBeInstanceOf(ContentError);
    const storage = createMemoryStorage(); storage.setItem('tpp.log', '{"type":"session.started"}');
    const reload = vi.fn();
    const screen = showContentError((error as ContentError).issues, { storage, wall: () => '2026-10-23T17:42:09.000Z', reload });
    const pre = screen.querySelector('pre[data-diagnostic="issues"]')!.textContent!;
    expect(pre.split('\n')).toHaveLength((error as ContentError).issues.length);
    expect(pre).toMatch(/^charms\.json:\/types\/3\/sizeClass /m);
    screen.querySelector<HTMLButtonElement>('[data-action="reload"]')!.click();
    expect(reload).toHaveBeenCalledTimes(1);
    const blobs: Blob[] = [];
    Object.assign(URL, { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:x'; }, revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('tpp-error-2026-10-23T1742.txt'); });
    screen.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();
    expect(click).toHaveBeenCalledTimes(1);
    const text = await blobs[0].text();
    expect(text).toContain(pre);
    expect(text).toContain('{"type":"session.started"}');
    expect(errorExportFilename('2026-01-02T03:04:05.000Z')).toBe('tpp-error-2026-01-02T0304.txt');
  });
});

describe('overlay', () => {
  it('QT-1(a) findings banner shows only under lenient with findings, and dismisses', () => {
    const root = document.createElement('div'); document.body.append(root);
    const finding = { ids: ['CHK-CORE-03'], level: 'error' as const, file: 'charms.json', path: '/types/2/sprite', message: 'Asset "charms/fern" must resolve as image' };
    mountOverlay(root, { findings: [finding], lenient: false });
    expect(root.querySelector('#findings-banner')).toBeNull();
    expect(root.querySelector('#panels')).not.toBeNull();
    mountOverlay(root, { findings: [finding], lenient: true });
    expect(root.querySelector('#findings-banner li')!.textContent).toBe('CHK-CORE-03 · charms.json:/types/2/sprite · Asset "charms/fern" must resolve as image');
    root.querySelector<HTMLButtonElement>('#findings-banner [data-action="dismiss"]')!.click();
    expect(root.querySelector('#findings-banner')).toBeNull();
  });
});
