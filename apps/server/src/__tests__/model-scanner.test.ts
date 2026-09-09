import { describe, it, expect } from 'vitest';
import { scanLive2DModels } from '../services/model-scanner.js';

describe('scanLive2DModels', () => {
  it('returns default personas when directory does not exist', () => {
    const result = scanLive2DModels('/nonexistent/path');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('path');
    expect(result[0]).toHaveProperty('name');
  });

  it('each default persona has required fields', () => {
    const result = scanLive2DModels('/nonexistent/path');
    for (const model of result) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.name).toBe('string');
      expect(typeof model.path).toBe('string');
      expect(model.path).toContain('/live2d/');
    }
  });
});