// A deleted account's models stayed advertised forever.
//
// applyCloudModels injects keys into the module-level MODELS table for UIDs the static
// table doesn't know, and nothing ever removed them. Measured before this fix: inject
// one account-only UID, removeAccount, and the pool total is 0 while the key is still in
// MODELS and still returned by listModels.
//
// The load-bearing subtlety, and the reason the first version of this fix was wrong:
// applyCloudModels SKIPS a UID that already exists, so only the first account to report
// it gets an injection record. An injector-keyed eviction rule therefore keeps the key
// when the first account leaves (correct — the second still reaches it) but then
// withdraws NOTHING when the second leaves, leaking it anyway. Eviction has to ask
// whether any surviving account's catalog still contains the UID.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal, getAccountCount,
} from '../src/auth.js';
import {
  MODELS, listModels, mergeCloudModels, setActiveCloudCatalogAccounts,
  clearCloudModelCatalogs,
} from '../src/models.js';

const PHANTOM_UID = 'PHANTOM_EVICTION_TEST_MODEL';
const PHANTOM_KEY = 'phantom-eviction-test-model';
const SECOND_UID = 'PHANTOM_EVICTION_TEST_SECOND';

const created = [];
const staticKeys = new Set(Object.keys(MODELS));
const staticUids = Object.values(MODELS).map((m) => m.modelUid).filter(Boolean);

/**
 * A snapshot that GROWS the catalog: every UID the static table already has, plus the
 * phantoms. Required — a one-entry snapshot trips the shrink-confirmation guard and is
 * quarantined, so applyCloudModels never runs and the test would prove nothing. (That
 * is exactly how the first attempt at reproducing this defect produced a false "no leak".)
 */
function fullSnapshotPlus(...extraUids) {
  return [
    // STATIC uids captured at module load — deliberately not re-read from MODELS here.
    // Reading live would include phantoms another account already injected, silently
    // making this account a legitimate holder of them and inverting the eviction
    // expectations. (That mistake made the two-phantom test below fail on a correct
    // implementation.)
    ...staticUids.map((uid) => ({ modelUid: uid, provider: 'MODEL_PROVIDER_ANTHROPIC' })),
    ...extraUids.map((uid) => ({ modelUid: uid, provider: 'MODEL_PROVIDER_ANTHROPIC' })),
  ];
}

function mkActive(label) {
  const a = addAccountByKey('sk-evict-' + Math.random().toString(36).slice(2, 12), label);
  getAccountInternal(a.id).status = 'active';
  created.push(a.id);
  return a;
}

function injectedKeys() {
  return Object.keys(MODELS).filter((k) => !staticKeys.has(k));
}

afterEach(() => {
  while (created.length) removeAccount(created.pop());
  clearCloudModelCatalogs();
  // Remove any key this file introduced, so a failure cannot leak into later files.
  for (const k of injectedKeys()) delete MODELS[k];
});

describe('snapshot-injected models are withdrawn when unreachable', () => {
  it('advertises a model only one account reports', () => {
    // Precondition for every other test here: injection actually happens.
    const a = mkActive('solo');
    setActiveCloudCatalogAccounts([a.id]);
    const added = mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: a.id });

    assert.equal(added, 1, 'the phantom UID must be injected');
    assert.ok(PHANTOM_KEY in MODELS);
    assert.ok(listModels().some((m) => m._windsurf_id === PHANTOM_KEY));
  });

  it('withdraws it once that account is removed', () => {
    const a = mkActive('solo');
    setActiveCloudCatalogAccounts([a.id]);
    mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: a.id });
    assert.ok(PHANTOM_KEY in MODELS, 'precondition: injected');

    const idx = created.indexOf(a.id);
    if (idx >= 0) created.splice(idx, 1);
    removeAccount(a.id);

    assert.equal(getAccountCount().total, 0);
    assert.ok(!(PHANTOM_KEY in MODELS),
      'a removed account must not leave its models in the catalog');
    assert.ok(!listModels().some((m) => m._windsurf_id === PHANTOM_KEY),
      'and /v1/models must stop advertising it');
  });

  it('keeps a model a SURVIVING account still reports', () => {
    const a = mkActive('first');
    const b = mkActive('second');
    setActiveCloudCatalogAccounts([a.id, b.id]);

    const snap = fullSnapshotPlus(PHANTOM_UID);
    assert.equal(mergeCloudModels(snap, { accountId: a.id }), 1, 'A injects it');
    assert.equal(mergeCloudModels(snap, { accountId: b.id }), 0,
      'B reports the same UID but applyCloudModels skips an existing key — this is why '
      + 'an injector-keyed eviction rule is wrong');

    const idx = created.indexOf(a.id);
    if (idx >= 0) created.splice(idx, 1);
    removeAccount(a.id);

    assert.ok(PHANTOM_KEY in MODELS,
      'B still reaches this model, so removing A must not withdraw it');
    assert.ok(listModels().some((m) => m._windsurf_id === PHANTOM_KEY));
  });

  it('withdraws it when the LAST holder leaves, even though it never injected it', () => {
    // The case the first version of this fix got wrong: B has no injection record, so an
    // injector-keyed rule withdraws nothing here and the key leaks.
    const a = mkActive('first');
    const b = mkActive('second');
    setActiveCloudCatalogAccounts([a.id, b.id]);
    const snap = fullSnapshotPlus(PHANTOM_UID);
    mergeCloudModels(snap, { accountId: a.id });
    mergeCloudModels(snap, { accountId: b.id });

    for (const id of [a.id, b.id]) {
      const idx = created.indexOf(id);
      if (idx >= 0) created.splice(idx, 1);
      removeAccount(id);
    }

    assert.equal(getAccountCount().total, 0);
    assert.ok(!(PHANTOM_KEY in MODELS),
      'with no account left, the model must be withdrawn regardless of who injected it');
    assert.ok(!listModels().some((m) => m._windsurf_id === PHANTOM_KEY));
  });

  it('never withdraws a static-table model', () => {
    // Only snapshot-derived keys are eviction candidates. If this ever fails the proxy
    // has started deleting its own built-in catalog.
    const a = mkActive('solo');
    setActiveCloudCatalogAccounts([a.id]);
    mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: a.id });

    const idx = created.indexOf(a.id);
    if (idx >= 0) created.splice(idx, 1);
    removeAccount(a.id);

    for (const key of staticKeys) {
      assert.ok(key in MODELS, `static model ${key} must survive account removal`);
    }
  });

  it('withdraws only the unreachable one when two phantoms have different holders', () => {
    const a = mkActive('holds-first');
    const b = mkActive('holds-second');
    setActiveCloudCatalogAccounts([a.id, b.id]);
    mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: a.id });
    mergeCloudModels(fullSnapshotPlus(SECOND_UID), { accountId: b.id });

    const secondKey = SECOND_UID.toLowerCase().replace(/_/g, '-');
    assert.ok(PHANTOM_KEY in MODELS && secondKey in MODELS, 'precondition: both injected');

    const idx = created.indexOf(a.id);
    if (idx >= 0) created.splice(idx, 1);
    removeAccount(a.id);

    assert.ok(!(PHANTOM_KEY in MODELS), "A's exclusive model goes");
    assert.ok(secondKey in MODELS, "B's model stays");
  });

  it('leaves the lookup table consistent after eviction', () => {
    // The UID aliases are registered alongside the key; a partial delete would leave
    // resolveModelKey pointing at a model that no longer exists.
    const a = mkActive('solo');
    setActiveCloudCatalogAccounts([a.id]);
    mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: a.id });

    const idx = created.indexOf(a.id);
    if (idx >= 0) created.splice(idx, 1);
    removeAccount(a.id);

    // Re-injecting must work cleanly — a stale _lookup entry would make applyCloudModels
    // skip it (`_lookup.has(uid)` short-circuits) and silently advertise nothing.
    const c = mkActive('re-add');
    setActiveCloudCatalogAccounts([c.id]);
    const added = mergeCloudModels(fullSnapshotPlus(PHANTOM_UID), { accountId: c.id });

    assert.equal(added, 1,
      'after eviction the UID must be injectable again; a leftover _lookup alias would '
      + 'make this 0 and the model would never come back');
    assert.ok(PHANTOM_KEY in MODELS);
  });
});
