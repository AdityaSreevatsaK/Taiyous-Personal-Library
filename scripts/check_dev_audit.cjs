#!/usr/bin/env node
'use strict';

/**
 * Assess npm's complete development-dependency audit. The one narrowly
 * accepted unpatched advisory is picomatch ReDoS, which propagates through
 * the *development-only* Vite/Vitest dependency graph. Production dependencies
 * are audited separately with a strict failing gate in verify.yml.
 *
 * Do not add an advisory here without a reviewed security decision. Any other
 * HIGH/CRITICAL finding must fail CI, including a second advisory against one
 * of these same five packages. Remove this exception once upstream patches.
 */
const fs = require('node:fs');

const BASELINE_GHSA = 'GHSA-fc5q-39xc-vjpf';
const AFFECTED_DEV_PACKAGES = new Set([
  'picomatch', 'fdir', 'tinyglobby', 'vite', 'vitest',
]);
const PRIORITY = new Set(['high', 'critical']);

function advisoryId(url) {
  if (typeof url !== 'string') return '';
  const match = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)\/?$/i.exec(url);
  return match ? match[1].toLowerCase() : '';
}

function assessDevAudit(report) {
  const failures = [];
  const known = [];
  if (!report || typeof report !== 'object' || !report.vulnerabilities ||
      typeof report.vulnerabilities !== 'object' || !report.metadata?.vulnerabilities) {
    return { failures: ['npm audit returned malformed or incomplete JSON'], known };
  }

  let countedHigh = 0;
  let countedCritical = 0;
  let foundBaseline = false;
  for (const [name, value] of Object.entries(report.vulnerabilities)) {
    if (!value || typeof value !== 'object') {
      failures.push('Malformed vulnerability entry: ' + name);
      continue;
    }
    if (!PRIORITY.has(value.severity)) continue;
    if (value.severity === 'high') countedHigh++;
    if (value.severity === 'critical') countedCritical++;
    if (value.severity === 'critical') {
      failures.push('CRITICAL severity: ' + name);
      continue;
    }
    if (!AFFECTED_DEV_PACKAGES.has(name) || !Array.isArray(value.via) || !value.via.length) {
      failures.push('Unexpected HIGH advisory package: ' + name);
      continue;
    }

    let permitted = true;
    for (const route of value.via) {
      if (typeof route === 'string') {
        // A meta-vulnerability must come solely from this known dependency chain.
        if (!AFFECTED_DEV_PACKAGES.has(route)) permitted = false;
      } else if (route && typeof route === 'object') {
        if (PRIORITY.has(route.severity)) {
          if (name !== 'picomatch' ||
              advisoryId(route.url) !== BASELINE_GHSA.toLowerCase()) {
            permitted = false;
          } else {
            foundBaseline = true;
          }
        }
      } else {
        permitted = false;
      }
    }

    // The direct advisory must not be hidden as an unsupported transitive chain.
    if (name === 'picomatch' && !value.via.some(route =>
      route && typeof route === 'object' &&
      route.severity === 'high' &&
      advisoryId(route.url) === BASELINE_GHSA.toLowerCase())) permitted = false;

    if (!permitted) failures.push('New or changed HIGH advisory: ' + name);
    else known.push(name);
  }

  const totals = report.metadata.vulnerabilities;
  if (Number(totals.high || 0) !== countedHigh ||
      Number(totals.critical || 0) !== countedCritical) {
    failures.push('Audit metadata and vulnerability entries disagree');
  }
  if (known.length && !foundBaseline) {
    failures.push('Known dependency chain has no exact picomatch advisory root');
  }

  return { failures, known };
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Audit JSON filepath is required');
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = assessDevAudit(report);
    const totals = report.metadata?.vulnerabilities || {};
    console.log('Development dependency advisory counts: ' + JSON.stringify(totals));
    if (result.known.length) {
      console.log('::warning title=Tracked dev-only advisory ' + BASELINE_GHSA +
        '::Unpatched picomatch advisory affects ' + result.known.join(', ') +
        '. Production dependencies are separately audited and must remain clean. See issue #71.');
    }
    if (result.failures.length) {
      for (const failure of result.failures) console.error('::error::' + failure);
      process.exitCode = 1;
    } else {
      console.log('Development audit baseline verified; no NEW high/critical advisories.');
    }
  } catch (error) {
    console.error('::error::Development dependency audit could not be verified: ' + String(error));
    process.exitCode = 1;
  }
}

module.exports = { assessDevAudit };
