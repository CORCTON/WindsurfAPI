import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const dashboard = readFileSync(new URL('../src/dashboard/index.html', import.meta.url), 'utf8');
const checkUpdate = dashboard.match(/async checkUpdate\(\) \{[\s\S]*?\n  \},\n\n  async applyUpdate\(\)/)?.[0] || '';
const applyUpdate = dashboard.match(/async applyUpdate\(\) \{[\s\S]*?\n  \},\n\n  _pollHealthAfterUpdate\(/)?.[0] || '';
const rollbackUpdate = dashboard.match(/async rollbackUpdate\(\) \{[\s\S]*?\n  \},\n\n  \/\/ Restart the whole gateway/)?.[0] || '';

describe('dashboard self-update button state', () => {
  it('disables apply while checking or after failure, then re-enables every actionable success path', () => {
    assert.ok(checkUpdate, 'checkUpdate() source block must be discoverable');
    assert.match(checkUpdate, /btn\.disabled = true;\s*apply\.disabled = true;/,
      'a new check must close the stale-click window');
    assert.match(checkUpdate,
      /if \(r\.mode === 'docker'\)[\s\S]*?apply\.classList\.remove\('hidden'\);\s*apply\.disabled = false;/,
      'docker-ready must recover from a prior failed check');
    assert.match(checkUpdate,
      /else if \(r\.behind\)[\s\S]*?apply\.classList\.remove\('hidden'\);\s*apply\.disabled = false;/,
      'git update-available must recover from a prior failed check');
    assert.match(checkUpdate,
      /if \(!r\.ok\)[\s\S]*?apply\.classList\.add\('hidden'\);\s*apply\.disabled = true;/,
      'a failed tag/fetch check must not leave an old apply action enabled');
  });

  it('asks twice before a dirty rollback and force-retries only that actionable error', () => {
    assert.ok(rollbackUpdate, 'rollbackUpdate() source block must be discoverable');
    assert.match(rollbackUpdate, /let r = await this\.api\('POST', '\/self-update\/rollback'\);/,
      'rollback must begin with a non-destructive probe request');
    assert.match(rollbackUpdate,
      /!r\.ok && r\.error === 'ERR_UNCOMMITTED_CHANGES' && r\.dirty[\s\S]*?confirm\.rollbackDirtyTitle[\s\S]*?\{ forceReset: true \}/,
      'only the explicit dirty-tree response may trigger a second danger confirmation and force retry');
    assert.doesNotMatch(rollbackUpdate, /if \(r\.dirty\)/,
      'a generic dirty flag must not force-retry ignored conflicts or unknown terminal states');
    assert.match(rollbackUpdate, /r\.error === 'ERR_IGNORED_PATH_CONFLICT'[\s\S]*?r\.conflictPaths/,
      'ignored collisions must surface their manual backup paths instead of auto-forcing');
  });

  it('shows ignored owner-data paths when applying an update is refused', () => {
    assert.ok(applyUpdate, 'applyUpdate() source block must be discoverable');
    assert.match(applyUpdate,
      /r\.error === 'ERR_IGNORED_PATH_CONFLICT'[\s\S]*?Array\.isArray\(r\.conflictPaths\)[\s\S]*?r\.conflictPaths\.slice\(0, 10\)\.join\(', '\)/,
      'update ignored collisions must surface the same bounded manual backup paths as rollback');
    assert.match(applyUpdate, /throw new Error\(conflicts \? `\$\{message\}: \$\{conflicts\}` : message\);/,
      'the translated update error must include the conflicting paths');
  });

  it('polls the expected release commit and requires a new process identity', () => {
    assert.match(applyUpdate,
      /this\._pollHealthAfterUpdate\(status, apply, \{[\s\S]*?expectedCommit: r\.after,[\s\S]*?previousPid: previousHealth\?\.pid/,
      'changed updates must pass the expected commit and pre-update PID into health polling');
    assert.match(dashboard,
      /const healthMatchesUpdate = \(h\) => \{[\s\S]*?h\.status !== 'ok'[\s\S]*?h\.commit[\s\S]*?h\.pid[\s\S]*?pid !== oldPid/,
      'health polling must reject stale listeners, wrong commits, and same-PID responses');
    assert.match(dashboard, /const isCommitId = value => \/\^\[0-9a-f\]\{7,64\}\$\/\.test\(value\);[\s\S]*?actual\.startsWith\(expected\)[\s\S]*?expected\.startsWith\(actual\)/,
      'health polling must compare abbreviated and full commit IDs by correspondence, not equality alone');
    assert.match(dashboard, /if \(!isCommitId\(expected\) \|\| !isCommitId\(actual\) \|\| !commitsCorrespond\) return false;/,
      'health polling must enforce the computed commit correspondence guard');
    assert.match(dashboard, /Number\.isSafeInteger\(previousPid\)[\s\S]*?Number\.isSafeInteger\(pid\)/,
      'health polling must require numeric process identities before comparing them');
    assert.doesNotMatch(dashboard, /const pid = Number\(h\.pid\);/,
      'health polling must not coerce a forged string PID into a trusted process identity');
    assert.match(rollbackUpdate,
      /this\._pollHealthAfterUpdate\(status, apply, \{[\s\S]*?expectedCommit: r\.rolledBackTo,[\s\S]*?previousPid: previousHealth\?\.pid/,
      'rollback must use the same commit/PID correspondence check before reloading');
  });
});
