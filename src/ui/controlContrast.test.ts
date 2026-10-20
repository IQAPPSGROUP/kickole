import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FOOT_BORDER,
  FOOT_FILL,
  FOOT_LABEL,
  FOOT_MARK,
  CUE_FILL,
  CUE_TEXT,
  MENU_BUTTON_BORDER,
  MENU_BUTTON_FILL,
  MENU_BUTTON_TEXT,
  TRICK_BORDER,
  TRICK_BUTTONS,
  controlContrast,
} from './controlContrast';

describe('control contrast', () => {
  it('keeps menu, foot, and trick labels at least 4.5:1 on their fills', () => {
    expect(controlContrast(MENU_BUTTON_TEXT, MENU_BUTTON_FILL)).toBeGreaterThanOrEqual(4.5);
    expect(controlContrast(FOOT_MARK, FOOT_FILL)).toBeGreaterThanOrEqual(4.5);
    expect(controlContrast(FOOT_LABEL, FOOT_FILL)).toBeGreaterThanOrEqual(4.5);
    expect(controlContrast(CUE_TEXT, CUE_FILL)).toBeGreaterThanOrEqual(4.5);
    for (const button of TRICK_BUTTONS) {
      expect(controlContrast(button.text, button.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('paints those fills, light borders, and larger labels in the stylesheet', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toContain(`background: ${MENU_BUTTON_FILL}`);
    expect(css).toContain(`color: ${MENU_BUTTON_TEXT}`);
    expect(css).toContain(`border: 2px solid ${MENU_BUTTON_BORDER}`);
    expect(css).toContain(`background: ${FOOT_FILL}`);
    expect(css).toContain(`color: ${FOOT_MARK}`);
    expect(css).toContain(`color: ${FOOT_LABEL}`);
    expect(css).toContain(`border: 3px solid ${FOOT_BORDER}`);
    expect(css).toContain(`border: 3px solid ${TRICK_BORDER}`);
    expect(css).toContain(`color: ${CUE_TEXT}`);
    expect(css).toContain(`background: ${CUE_FILL}`);
    expect(css).toContain('font-size: 15px');
    expect(css).toContain('font-size: 13px');
    for (const button of TRICK_BUTTONS) {
      expect(css).toContain(button.fill);
      expect(css).toContain(button.text);
    }
  });
});
