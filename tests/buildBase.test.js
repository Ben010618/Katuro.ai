import { describe, it, expect } from 'vitest';
import { baseFor, outDirFor } from '../vite.config.js';
import appPkg from '../Katuro_App/package.json';
import capConfig from '../Katuro_App/capacitor.config.json';
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
  it('website and KaTuroDesk build into dist/', () => {
    expect(outDirFor('production')).toBe('dist');
    expect(outDirFor('desk')).toBe('dist');
  });
  it('phone app (Capacitor) uses relative paths and its own dist-mobile/ folder', () => {
    expect(baseFor('mobile')).toBe('./');
    expect(outDirFor('mobile')).toBe('dist-mobile');
    expect(appPkg.scripts['build:web']).toMatch(/vite build --mode mobile/);
    expect(capConfig.webDir).toBe('../dist-mobile');
    expect(capConfig.appId).toBe('ai.katuro.app');
  });
});
