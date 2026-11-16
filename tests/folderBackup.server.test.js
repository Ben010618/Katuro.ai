/**
 * electron/folderBackup.cjs — a copy of the KaTuro folder on a USB drive or another folder.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { backupFolder, backupName } = require('../electron/folderBackup.cjs');

let tmp;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-backup-'));
  const home = path.join(tmp, 'KaTuro');
  fs.mkdirSync(path.join(home, 'Records', 'Attendance'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Lessons', 'Week 1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Records', 'Grade 7 - Rizal - Science.xlsx'), 'record');
  fs.writeFileSync(path.join(home, 'Records', '~$Grade 7 - Rizal - Science.xlsx'), 'excel lock');
  fs.writeFileSync(path.join(home, 'Records', 'Attendance', 'Grade 7 - Rizal - Science.xlsx'), 'att');
  fs.writeFileSync(path.join(home, 'Lessons', 'Week 1', 'Cells.pdf'), 'pdf');
  fs.writeFileSync(path.join(home, 'Lessons', 'Thumbs.db'), 'x');
  const usb = path.join(tmp, 'USB');
  fs.mkdirSync(usb);
  return { home, usb };
}

describe('backup of the KaTuro folder', () => {
  it('copies every folder into a dated folder, without lock files, and never over an earlier backup', async () => {
    const { home, usb } = setup();
    const now = new Date(2026, 10, 16, 14, 32);
    const first = await backupFolder({ home, dest: usb, now });
    expect(first.path).toBe(path.join(usb, 'KaTuro Backup 2026-11-16 1432'));
    expect(first.files).toBe(3);
    expect(first.bytes).toBe('record'.length + 'att'.length + 'pdf'.length);
    expect(fs.readFileSync(path.join(first.path, 'Records', 'Grade 7 - Rizal - Science.xlsx'), 'utf8')).toBe('record');
    expect(fs.existsSync(path.join(first.path, 'Lessons', 'Week 1', 'Cells.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(first.path, 'Records', '~$Grade 7 - Rizal - Science.xlsx'))).toBe(false);
    expect(fs.existsSync(path.join(first.path, 'Lessons', 'Thumbs.db'))).toBe(false);

    const second = await backupFolder({ home, dest: usb, now });
    expect(second.path).toBe(path.join(usb, 'KaTuro Backup 2026-11-16 1432 (2)'));
  });

  it('refuses a destination inside the KaTuro folder, or one that is gone', async () => {
    const { home } = setup();
    await expect(backupFolder({ home, dest: home })).rejects.toMatchObject({ code: 'INSIDE_HOME' });
    await expect(backupFolder({ home, dest: path.join(home, 'Lessons') })).rejects.toMatchObject({ code: 'INSIDE_HOME' });
    await expect(backupFolder({ home, dest: path.join(tmp, 'unplugged') })).rejects.toMatchObject({ code: 'NO_DESTINATION' });
  });

  it('names the backup by date and time', () => {
    expect(backupName(new Date(2026, 0, 5, 7, 3))).toBe('KaTuro Backup 2026-01-05 0703');
  });

  it('a backup that fails midway leaves nothing half-done on the drive, and says why plainly', async () => {
    const { home, usb } = setup();
    const failing = async (from, to, opts) => {
      await fs.promises.cp(path.join(from, 'Lessons'), path.join(to, 'Lessons'), { ...opts, recursive: true });
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    };
    await expect(backupFolder({ home, dest: usb, copy: failing })).rejects.toMatchObject({ code: 'COPY_FAILED', message: expect.stringMatching(/drive is full.*Nothing half-done/) });
    expect(fs.readdirSync(usb)).toEqual([]);
  });

  it('a half-done copy left by a KaTuroDesk closed mid-backup is cleared by the next backup', async () => {
    const { home, usb } = setup();
    const now = new Date(2026, 10, 16, 14, 32);
    const left = path.join(usb, 'KaTuro Backup 2026-11-16 1432 (incomplete)');
    fs.mkdirSync(path.join(left, 'Records'), { recursive: true });
    fs.writeFileSync(path.join(left, 'Records', 'half.xlsx'), 'x');
    fs.mkdirSync(path.join(usb, 'My (incomplete) notes'));
    const res = await backupFolder({ home, dest: usb, now });
    expect(res.path).toBe(path.join(usb, 'KaTuro Backup 2026-11-16 1432'));
    expect(fs.readdirSync(usb).sort()).toEqual(['KaTuro Backup 2026-11-16 1432', 'My (incomplete) notes']);
  });

  it('a folder inside KaTuro whose name starts with ".." is still inside', async () => {
    const { home } = setup();
    fs.mkdirSync(path.join(home, '..cache'));
    await expect(backupFolder({ home, dest: path.join(home, '..cache') })).rejects.toMatchObject({ code: 'INSIDE_HOME' });
  });
});
