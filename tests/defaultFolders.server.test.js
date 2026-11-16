/**
 * electron/defaultFolders.cjs — the KaTuro home folder (Documents\KaTuro\Records + Lessons).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const folders = require('../electron/defaultFolders.cjs');

describe('KaTuro home folder', () => {
  let docs;
  afterEach(() => {
    if (docs) fs.rmSync(docs, { recursive: true, force: true });
  });
  const freshDocuments = () => (docs = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-docs-')));

  it('first run makes Documents\\KaTuro with Records and Lessons', () => {
    const home = folders.ensureHomeFolder(freshDocuments());
    expect(home).toBe(path.join(docs, 'KaTuro'));
    expect(fs.readdirSync(home).sort()).toEqual(['Lessons', 'Records']);
    for (const name of folders.MAIN_FOLDERS) expect(fs.statSync(path.join(home, name)).isDirectory()).toBe(true);
  });

  it('later runs keep the teacher\'s files and folders, and bring back a deleted main folder', () => {
    const home = folders.ensureHomeFolder(freshDocuments());
    fs.writeFileSync(path.join(home, 'Records', 'Grade 7 - Rizal.xlsx'), 'class record');
    fs.mkdirSync(path.join(home, 'Seminars'));
    fs.rmSync(path.join(home, 'Lessons'), { recursive: true });

    folders.ensureHomeFolder(docs);

    expect(fs.readdirSync(home).sort()).toEqual(['Lessons', 'Records', 'Seminars']);
    expect(fs.readFileSync(path.join(home, 'Records', 'Grade 7 - Rizal.xlsx'), 'utf-8')).toBe('class record');
  });

  it('knows the home folder from any other folder', () => {
    freshDocuments();
    expect(folders.isHomeFolder(path.join(docs, 'KaTuro'), docs)).toBe(true);
    expect(folders.isHomeFolder(path.join(docs, 'KaTuro', 'Records'), docs)).toBe(false);
    expect(folders.isHomeFolder(path.join(docs, 'Other'), docs)).toBe(false);
  });
});
