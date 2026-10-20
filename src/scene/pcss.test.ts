import { describe, expect, it } from 'vitest';
import { ShaderChunk } from 'three';
import { installPcss, pcssInstalled, restorePcss, withPcss } from './pcss';

describe('PCSS shadow chunk', () => {
  it('replaces the basic shadow function and leaves cascaded sun sampling in place', () => {
    const rewritten = withPcss(ShaderChunk.shadowmap_pars_fragment);
    expect(rewritten).toContain('pcssVogel');
    expect(rewritten).toContain('blockerSum');
    expect(rewritten).toContain('getSunShadow');
    expect(rewritten.match(/float getShadow\( sampler2D shadowMap/g)?.length).toBe(2);
  });

  it('installs and restores the live chunk', () => {
    const before = ShaderChunk.shadowmap_pars_fragment;
    installPcss();
    expect(pcssInstalled()).toBe(true);
    expect(ShaderChunk.shadowmap_pars_fragment).toContain('pcssVogel');
    installPcss();
    restorePcss();
    expect(pcssInstalled()).toBe(false);
    expect(ShaderChunk.shadowmap_pars_fragment).toBe(before);
  });
});
