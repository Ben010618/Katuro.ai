import { describe, it, expect } from 'vitest';
import { baseFor } from '../vite.config.js';
import pkg from '../package.json';

describe('asset paths', () => {
  it('website uses absolute paths so nested pages (/lesson-gen/step-3) load after a reload', () => {
    expect(baseFor('production')).toBe('/');
  });
  it('KaTuroDesk (file://) uses relative paths, and both desktop build scripts select that mode', () => {
    expect(baseFor('desk')).toBe('./');
    expect(pkg.scripts['desk:dist']).toMatch(/vite build --mode desk/);
    expect(pkg.scripts['electron:build']).toMatch(/vite build --mode desk/);
    expect(pkg.scripts.build).toBe('vite build');
  });
});
