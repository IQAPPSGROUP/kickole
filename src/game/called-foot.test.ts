import { describe, expect, it } from 'vitest';
import { CALLED_FOOT_BONUS, calledFootBonus, calledFootForKick } from './called-foot';

describe('called foot', () => {
  it('starts at kick 3 and then every 4th kick, alternating sides', () => {
    expect(calledFootForKick(1)).toBeNull();
    expect(calledFootForKick(2)).toBeNull();
    expect(calledFootForKick(3)).toBe('left');
    expect(calledFootForKick(4)).toBeNull();
    expect(calledFootForKick(6)).toBeNull();
    expect(calledFootForKick(7)).toBe('right');
    expect(calledFootForKick(11)).toBe('left');
    expect(calledFootForKick(15)).toBe('right');
    expect(calledFootForKick(3.5)).toBeNull();
  });

  it('adds +2 only when the successful kick matches, and nothing for the other foot', () => {
    expect(calledFootBonus(3, 'left')).toBe(CALLED_FOOT_BONUS);
    expect(calledFootBonus(3, 'right')).toBe(0);
    expect(calledFootBonus(7, 'right')).toBe(2);
    expect(calledFootBonus(7, 'left')).toBe(0);
    expect(calledFootBonus(4, 'left')).toBe(0);
  });
});
