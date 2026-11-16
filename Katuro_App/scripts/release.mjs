#!/usr/bin/env node
/**
 * release.mjs — builds a signed KaTuro App release and its update file.
 *
 *   cd Katuro_App
 *   node scripts/release.mjs             build only (USB install): KaTuro-App-<version>.apk + katuro-app-latest.json
 *   node scripts/release.mjs --publish   also upload both to GitHub, so installed apps update themselves
 *
 * Before a new release: raise "version" in Katuro_App/package.json (1.0.0 → 1.0.1 for fixes,
 * 1.1.0 for new features, 2.0.0 for big changes) and add its notes on top of CHANGELOG.md.
 *
 * The update lives on the GitHub release "katuro-app" of Ben010618/Katuro.ai, marked as a
 * pre-release and never "latest", so KaTuroDesk's own updater (which reads the latest
 * release) is not confused by it. Publishing needs the GitHub CLI (`gh auth login`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '..');
const REPO = 'Ben010618/Katuro.ai';
const TAG = 'katuro-app';
const publish = process.argv.includes('--publish');

const version = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!m || Number(m[2]) > 99 || Number(m[3]) > 99) throw new Error(`Katuro_App/package.json version "${version}" must look like 1.2.3 (each part up to 99).`);
const versionCode = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);

const signing = path.join(os.homedir(), '.katuro-signing', 'keystore.properties');
if (!fs.existsSync(signing)) throw new Error(`The release key is missing (${signing}). Without the same key, installed apps cannot update.`);

const outDir = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build?.directories?.output || path.join(ROOT, 'release');
fs.mkdirSync(outDir, { recursive: true });

const run = (cmd, args, cwd, env = {}) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });

console.log(`KaTuro App v${version} (${versionCode})`);
run('npm', ['run', 'build:web'], APP);
run('npx', ['cap', 'sync', 'android'], APP);
const javaHome = process.env.KATURO_JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const androidHome = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleRelease', '-q'], path.join(APP, 'android'), { JAVA_HOME: javaHome, ANDROID_HOME: androidHome });

const built = path.join(APP, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(built)) throw new Error('The signed APK was not made (app-release.apk is missing).');
const apkName = `KaTuro-App-${version}.apk`;
const apk = path.join(outDir, apkName);
fs.copyFileSync(built, apk);
const bytes = fs.readFileSync(apk);

// The notes of this version: its section of CHANGELOG.md (## v1.2.3 …).
const changelog = fs.existsSync(path.join(APP, 'CHANGELOG.md')) ? fs.readFileSync(path.join(APP, 'CHANGELOG.md'), 'utf8') : '';
const section = changelog.split(/^## /m).find((s) => s.startsWith(`v${version}`)) || '';
const notes = section.split('\n').slice(1).join('\n').trim();

const update = {
  version,
  versionCode,
  url: `https://github.com/${REPO}/releases/download/${TAG}/${apkName}`,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  notes,
};
const feed = path.join(outDir, 'katuro-app-latest.json');
fs.writeFileSync(feed, `${JSON.stringify(update, null, 2)}\n`);
console.log(`\nMade:\n  ${apk}\n  ${feed}\n  SHA-256 ${update.sha256}`);

if (!publish) {
  console.log('\nFor USB: copy the APK to the phone or tablet and open it.\nTo send this update to installed apps: node scripts/release.mjs --publish');
} else {
  try {
    execFileSync('gh', ['release', 'view', TAG, '--repo', REPO], { stdio: 'ignore', shell: process.platform === 'win32' });
  } catch {
    run('gh', ['release', 'create', TAG, '--repo', REPO, '--title', 'KaTuro App', '--notes', 'Updates of the KaTuro App (phones and tablets). Installed apps read katuro-app-latest.json from here.', '--prerelease', '--latest=false'], APP);
  }
  // The APK first, the update file last: an app never sees an update whose APK is not there yet.
  run('gh', ['release', 'upload', TAG, apk, '--repo', REPO, '--clobber'], APP);
  run('gh', ['release', 'upload', TAG, feed, '--repo', REPO, '--clobber'], APP);
  console.log(`\nPublished v${version}. Installed KaTuro Apps will offer the update.`);
}
