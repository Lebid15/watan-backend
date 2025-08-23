#!/usr/bin/env node
/**
 * Generates .env.build with GIT_SHA, BUILD_TIME, VERSION (package.json version)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function safe(cmd) {
  try { return execSync(cmd, { stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch { return ''; }
}

const gitSha = process.env.GIT_SHA || safe('git rev-parse --short HEAD') || 'unknown';
const buildTime = new Date().toISOString();
let version = '0.0.0';
try {
  version = require(path.join(process.cwd(), 'package.json')).version || version;
} catch {}

const content = `GIT_SHA=${gitSha}\nBUILD_TIME=${buildTime}\nVERSION=${version}\n`;
fs.writeFileSync(path.join(process.cwd(), '.env.build'), content, 'utf8');
console.log('[build-meta] wrote .env.build:', content.replace(/\n/g,' '));
