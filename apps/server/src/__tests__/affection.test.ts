import { describe, it, expect } from 'vitest';
import {
  affectionLevelFromScore,
  determineAIEmotion,
  getTimeMode,
  AFFECTION_LEVEL_NAMES,
} from '../services/affection.js';

describe('affectionLevelFromScore', () => {
  it('returns level 0 for score 0', () => {
    expect(affectionLevelFromScore(0)).toBe(0);
  });

  it('returns level 1 for score 50', () => {
    expect(affectionLevelFromScore(50)).toBe(1);
  });

  it('returns level 2 for score 150', () => {
    expect(affectionLevelFromScore(150)).toBe(2);
  });

  it('returns level 3 for score 320', () => {
    expect(affectionLevelFromScore(320)).toBe(3);
  });

  it('returns level 4 for score 600', () => {
    expect(affectionLevelFromScore(600)).toBe(4);
  });

  it('returns level 5 for score 1000', () => {
    expect(affectionLevelFromScore(1000)).toBe(5);
  });

  it('returns level 0 for negative scores', () => {
    expect(affectionLevelFromScore(-10)).toBe(0);
  });

  it('returns level 5 for very high scores', () => {
    expect(affectionLevelFromScore(9999)).toBe(5);
  });

  it('returns correct intermediate levels', () => {
    expect(affectionLevelFromScore(49)).toBe(0);
    expect(affectionLevelFromScore(51)).toBe(1);
    expect(affectionLevelFromScore(149)).toBe(1);
    expect(affectionLevelFromScore(151)).toBe(2);
  });

  it('AFFECTION_LEVEL_NAMES has 6 entries', () => {
    expect(AFFECTION_LEVEL_NAMES).toHaveLength(6);
    expect(AFFECTION_LEVEL_NAMES[0]).toBe('陌生');
    expect(AFFECTION_LEVEL_NAMES[5]).toBe('专属');
  });
});

describe('getTimeMode', () => {
  it('returns morning for 8am', () => {
    const date = new Date(2025, 0, 1, 8, 0, 0);
    expect(getTimeMode(date)).toBe('morning');
  });

  it('returns afternoon for 14pm', () => {
    const date = new Date(2025, 0, 1, 14, 0, 0);
    expect(getTimeMode(date)).toBe('afternoon');
  });

  it('returns evening for 20pm', () => {
    const date = new Date(2025, 0, 1, 20, 0, 0);
    expect(getTimeMode(date)).toBe('evening');
  });

  it('returns night for 23pm', () => {
    const date = new Date(2025, 0, 1, 23, 0, 0);
    expect(getTimeMode(date)).toBe('night');
  });

  it('returns morning for 0am', () => {
    const date = new Date(2025, 0, 1, 0, 0, 0);
    expect(getTimeMode(date)).toBe('morning');
  });
});

describe('determineAIEmotion', () => {
  it('returns sleepy when night and sad', () => {
    expect(determineAIEmotion('sad', 3, 'night')).toBe('sleepy');
  });

  it('returns sleepy when night and neutral', () => {
    expect(determineAIEmotion('neutral', 3, 'night')).toBe('sleepy');
  });

  it('returns concerned when sad and affection >= 2', () => {
    expect(determineAIEmotion('sad', 2, 'afternoon')).toBe('concerned');
  });

  it('returns warm when sad and affection < 2', () => {
    expect(determineAIEmotion('sad', 1, 'afternoon')).toBe('warm');
  });

  it('returns happy when user is happy', () => {
    expect(determineAIEmotion('happy', 0, 'morning')).toBe('happy');
  });

  it('returns angry when user is angry and affection < 3', () => {
    expect(determineAIEmotion('angry', 2, 'morning')).toBe('warm');
  });

  it('returns shy when affection >= 4 and neutral user', () => {
    expect(determineAIEmotion('neutral', 4, 'morning')).toBe('shy');
  });

  it('returns warm when affection >= 2 and neutral user', () => {
    expect(determineAIEmotion('neutral', 2, 'morning')).toBe('warm');
  });

  it('returns neutral when affection < 2 and neutral user', () => {
    expect(determineAIEmotion('neutral', 1, 'morning')).toBe('neutral');
  });
});