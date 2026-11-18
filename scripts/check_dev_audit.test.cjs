'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessDevAudit } = require('./check_dev_audit.cjs');

const known = () => ({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } },
  vulnerabilities: {
    picomatch: {
      severity: 'high',
      via: [{
        name: 'picomatch', severity: 'high',
        url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
      }],
    },
    fdir: { severity: 'high', via: ['picomatch'] },
    tinyglobby: { severity: 'high', via: ['fdir', 'picomatch'] },
    vite: { severity: 'high', via: ['fdir', 'picomatch', 'tinyglobby'] },
    vitest: { severity: 'high', via: ['picomatch', 'tinyglobby', 'vite'] },
  },
});

test('allows only the documented picomatch development-tool advisory', () => {
  const result = assessDevAudit(known());
  assert.deepEqual(result.failures, []);
  assert.equal(result.known.length, 5);
});

test('fails on a newly introduced high dependency', () => {
  const report = known();
  report.vulnerabilities.foo = { severity: 'high', via: ['picomatch'] };
  report.metadata.vulnerabilities.high++;
  assert.ok(assessDevAudit(report).failures.length);
});

test('fails on a new HIGH advisory in an already tracked package', () => {
  const report = known();
  report.vulnerabilities.picomatch.via.push({
    severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  });
  assert.ok(assessDevAudit(report).failures.some(x => x.includes('picomatch')));
});

test('fails on any critical advisory, including picomatch', () => {
  const report = known();
  report.vulnerabilities.vite.severity = 'critical';
  report.metadata.vulnerabilities.high--;
  report.metadata.vulnerabilities.critical++;
  assert.ok(assessDevAudit(report).failures.some(x => x.includes('CRITICAL')));
});

test('fails closed on mismatched counts, missing data or changed advisory root', () => {
  assert.ok(assessDevAudit({}).failures.length);
  const count = known(); count.metadata.vulnerabilities.high = 0;
  assert.ok(assessDevAudit(count).failures.length);
  const root = known(); root.vulnerabilities.picomatch.via[0].url = 'https://example.invalid/unknown';
  assert.ok(assessDevAudit(root).failures.length);
});

test('passes on an entirely clean npm development audit', () => {
  assert.deepEqual(assessDevAudit({
    metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } },
    vulnerabilities: {},
  }), { failures: [], known: [] });
});
