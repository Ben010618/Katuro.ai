#!/usr/bin/env node
/**
 * installers.mjs: the clean folder of installers to hand out (USB), apart from the build files.
 *
 *   C:\Users\<you>\KaTuro Installers\
 *     KaTuro App - Android & iOS\   KaTuro-App-<version>.apk   (the iPhone/iPad one later)
 *     KaTuroDesk - Windows\         KaTuroDesk-Setup-<version>.exe
 *
 * Each folder holds only the newest installer; older copies there are replaced. The build
 * folder (package.json build.directories.output, KaTuroDesk-Dist) still keeps every version and
 * the online-update files.
 *
 *   node scripts/installers.mjs desk    after `npm run desk:dist` (runs by itself there)
 *   node scripts/installers.mjs phone   the KaTuro App APK (Katuro_App/scripts/release.mjs does this)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INSTALLERS = process.env.KATURO_INSTALLERS || path.join(os.homedir(), 'KaTuro Installers');
const FOLDERS = {
  phone: { name: 'KaTuro App - Android & iOS', older: /^KaTuro-App-.*\.(apk|ipa)$/i },
  desk: { name: 'KaTuroDesk - Windows', older: /^KaTuroDesk-Setup-.*\.exe$/i },
};

/** Copies `file` into its clean folder ('phone' | 'desk'), replacing older installers there. → the copy's path */
export function placeInstaller(file, kind) {
  const { name, older } = FOLDERS[kind];
  const dir = path.join(INSTALLERS, name);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file);
  for (const f of fs.readdirSync(dir)) if (older.test(f) && f !== base) fs.rmSync(path.join(dir, f));
  const dest = path.join(dir, base);
  fs.copyFileSync(file, dest);
  return dest;
}

const versionOf = (pkg) => JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
const buildDir = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build?.directories?.output || path.join(ROOT, 'release');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kind = process.argv[2];
  if (!FOLDERS[kind]) throw new Error('Use: node scripts/installers.mjs desk | phone');
  const file = kind === 'desk'
    ? path.join(buildDir(), `KaTuroDesk-Setup-${versionOf(path.join(ROOT, 'package.json'))}.exe`)
    : path.join(buildDir(), `KaTuro-App-${versionOf(path.join(ROOT, 'Katuro_App', 'package.json'))}.apk`);
  if (!fs.existsSync(file)) throw new Error(`${file} is not built yet.`);
  console.log(`Installer ready for USB: ${placeInstaller(file, kind)}`);
}
