/**
 * electron/defaultFolders.cjs — the KaTuro home folder (Desktop\Katuro Teaching Assistant\Records + Lessons),
 * where it is chosen, moved, and what the Explorer may never rename or delete.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const folders = require('../electron/defaultFolders.cjs');

describe('KaTuro home folder', () => {
  let tmp;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });
  const fresh = () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-home-'));
    const desktopDir = path.join(tmp, 'Desktop');
    const documentsDir = path.join(tmp, 'Documents');
    fs.mkdirSync(desktopDir);
    fs.mkdirSync(documentsDir);
    return { desktopDir, documentsDir, settingsFile: path.join(tmp, 'userData', 'katuro-home.json') };
  };

  it('a new install puts Records, Lessons and Templates on the Desktop, in Katuro Teaching Assistant', () => {
    const env = fresh();
    const home = folders.ensureHomeFolder(folders.chooseHome(env));
    expect(home).toBe(path.join(env.desktopDir, 'Katuro Teaching Assistant'));
    expect(fs.readdirSync(home).sort()).toEqual(['Lessons', 'Records', 'Templates']);
    // The choice is saved: the next start uses the same place.
    expect(JSON.parse(fs.readFileSync(env.settingsFile, 'utf-8')).path).toBe(home);
    expect(folders.chooseHome({ ...env, desktopDir: path.join(tmp, 'Elsewhere') })).toBe(home);
  });

  it('an older install with files in Documents\\KaTuro keeps using it', () => {
    const env = fresh();
    const legacy = path.join(env.documentsDir, 'KaTuro');
    fs.mkdirSync(path.join(legacy, 'Records'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'Records', 'Grade 7 - Rizal.xlsx'), 'class record');
    expect(folders.chooseHome(env)).toBe(legacy);
    expect(fs.existsSync(path.join(env.desktopDir, 'Katuro Teaching Assistant'))).toBe(false);
  });

  it('an empty old Documents\\KaTuro is tidied away and the Desktop folder is used', () => {
    const env = fresh();
    const legacy = path.join(env.documentsDir, 'KaTuro');
    for (const n of ['Records', 'Lessons']) fs.mkdirSync(path.join(legacy, n), { recursive: true });
    expect(folders.chooseHome(env)).toBe(path.join(env.desktopDir, 'Katuro Teaching Assistant'));
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it('later runs keep the teacher\'s files and folders, and bring back a deleted main folder', () => {
    const env = fresh();
    const home = folders.ensureHomeFolder(folders.chooseHome(env));
    fs.writeFileSync(path.join(home, 'Records', 'Grade 7 - Rizal.xlsx'), 'class record');
    fs.mkdirSync(path.join(home, 'Seminars'));
    fs.rmSync(path.join(home, 'Lessons'), { recursive: true });

    folders.ensureHomeFolder(folders.chooseHome(env));

    expect(fs.readdirSync(home).sort()).toEqual(['Lessons', 'Records', 'Seminars', 'Templates']);
    expect(fs.readFileSync(path.join(home, 'Records', 'Grade 7 - Rizal.xlsx'), 'utf-8')).toBe('class record');
  });

  it('knows the home folder from any other folder', () => {
    const env = fresh();
    const home = folders.chooseHome(env);
    expect(folders.isHomeFolder(home, home)).toBe(true);
    expect(folders.isHomeFolder(path.join(home, 'Records'), home)).toBe(false);
    expect(folders.isHomeFolder(path.join(env.desktopDir, 'Other'), home)).toBe(false);
  });

  it('moves the whole folder to a new place, with everything in it', async () => {
    const env = fresh();
    const home = folders.ensureHomeFolder(folders.chooseHome(env));
    fs.writeFileSync(path.join(home, 'Lessons', 'Week 1.pptx'), 'slides');
    const target = path.join(tmp, 'D-drive');
    fs.mkdirSync(target);
    const moved = await folders.moveHome(home, target);
    expect(moved).toBe(path.join(target, 'Katuro Teaching Assistant'));
    expect(fs.readFileSync(path.join(moved, 'Lessons', 'Week 1.pptx'), 'utf-8')).toBe('slides');
    expect(fs.existsSync(home)).toBe(false);
  });

  it('will not move into itself, onto the same place, or over another folder', async () => {
    const env = fresh();
    const home = folders.ensureHomeFolder(folders.chooseHome(env));
    await expect(folders.moveHome(home, path.join(home, 'Records'))).rejects.toMatchObject({ code: 'INSIDE' });
    await expect(folders.moveHome(home, env.desktopDir)).rejects.toMatchObject({ code: 'SAME' });
    const other = path.join(tmp, 'Other');
    fs.mkdirSync(path.join(other, 'Katuro Teaching Assistant'), { recursive: true });
    await expect(folders.moveHome(home, other)).rejects.toMatchObject({ code: 'EXISTS' });
    expect(fs.existsSync(path.join(home, 'Records'))).toBe(true);
  });
});

describe('Explorer rename and delete guard', () => {
  const home = path.resolve('/kt/Desktop/Katuro Teaching Assistant');
  const opts = { home, roots: [home] };

  it('never renames or deletes the home folder, Records, Lessons, the open folder, or a folder holding them', () => {
    expect(folders.isProtectedPath(home, opts)).toBe(true);
    expect(folders.isProtectedPath(path.join(home, 'Records'), opts)).toBe(true);
    expect(folders.isProtectedPath(path.join(home, 'Templates'), opts)).toBe(true);
    expect(folders.isProtectedPath(path.join(home, 'lessons'), opts)).toBe(process.platform === 'win32');
    expect(folders.isProtectedPath(path.resolve('/kt/Desktop'), opts)).toBe(true);
    expect(folders.isProtectedPath(path.resolve('/kt/USB'), { home, roots: [path.resolve('/kt/USB')] })).toBe(true);
  });

  it('allows the teacher\'s own folders and files', () => {
    expect(folders.isProtectedPath(path.join(home, 'Seminars'), opts)).toBe(false);
    expect(folders.isProtectedPath(path.join(home, 'Records', 'Grade 7.xlsx'), opts)).toBe(false);
    expect(folders.isProtectedPath(path.join(home, 'Lessons', 'Week 1'), opts)).toBe(false);
  });

  it('accepts only names Windows allows', () => {
    expect(folders.cleanName('  Week 2  ')).toBe('Week 2');
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'what?', 'x:y', 'name.', 'CON', 'nul.txt', 'a'.repeat(201)]) {
      expect(() => folders.cleanName(bad)).toThrow();
    }
  });
});

describe('Where the KaTuro folder may move', () => {
  const access = require('../electron/phoneAccess.cjs');
  const shared = [{ name: 'School', path: path.resolve('/kt/D/School') }];
  const guard = { shared, protectedPaths: [path.resolve('/kt/AppData/KaTuroDesk')], systemPaths: [path.resolve('/kt/Windows')] };

  it('not inside or around a folder phones already see, KaTuroDesk\'s own files, or Windows', () => {
    expect(access.homePlaceProblem(path.resolve('/kt/D/School/Katuro Teaching Assistant'), guard)).toMatch(/School/);
    expect(access.homePlaceProblem(path.resolve('/kt/AppData/KaTuroDesk/Katuro Teaching Assistant'), guard)).toMatch(/own files/);
    expect(access.homePlaceProblem(path.resolve('/kt/Windows/Katuro Teaching Assistant'), guard)).toMatch(/Windows/);
  });

  it('anywhere else is fine', () => {
    expect(access.homePlaceProblem(path.resolve('/kt/D/Teaching/Katuro Teaching Assistant'), guard)).toBeNull();
  });
});
