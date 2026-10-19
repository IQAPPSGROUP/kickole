import { describe, expect, it } from 'vitest';
import { DRACO_DECODER_PATH, KTX2_TRANSCODER_PATH } from './decoders';

describe('local mesh decoders', () => {
  it('points Draco and KTX2 at bundled files', () => {
    expect(DRACO_DECODER_PATH).toContain('decoders/draco/');
    expect(KTX2_TRANSCODER_PATH).toContain('decoders/basis/');
    expect(DRACO_DECODER_PATH).not.toMatch(/gstatic|jsdelivr|unpkg|cdnjs|googleapis/i);
    expect(KTX2_TRANSCODER_PATH).not.toMatch(/gstatic|jsdelivr|unpkg|cdnjs|googleapis/i);
  });
});
