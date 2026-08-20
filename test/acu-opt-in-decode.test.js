import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFrame, __testing } from '../src/devin-connect.js';
import { writeStringField, writeFixed64Field } from '../src/proto.js';

describe('ACU decode is opt-in', () => {
  it('default billing map does not include committed_acu_cost', () => {
    const { parseBillingTagMap } = __testing;
    assert.deepEqual(parseBillingTagMap({}), {
      cache_read_tokens: 5,
      cache_write_tokens: 4,
    });
  });

  it('reads top-level #22 as fixed64/double when opted in', () => {
    const acu = 0.0006735000060871243;
    const raw = Buffer.alloc(8);
    raw.writeDoubleLE(acu, 0);
    const payload = Buffer.concat([
      writeStringField(1, 'bot-enterprise'),
      writeFixed64Field(22, raw),
    ]);
    const d = decodeFrame(payload, {
      billingTags: { committed_acu_cost: -22 },
      dumpMeta: true,
    });
    assert.equal(d.billing.committed_acu_cost, acu);
    assert.deepEqual(d.frameDump[22], {
      kind: 'fixed64',
      preview: acu,
      raw: raw.toString('hex'),
    });
  });

  it('does not invent ACU when the default map is used', () => {
    const acu = 0.0006735000060871243;
    const raw = Buffer.alloc(8);
    raw.writeDoubleLE(acu, 0);
    const payload = Buffer.concat([
      writeStringField(1, 'bot-enterprise'),
      writeFixed64Field(22, raw),
    ]);
    const d = decodeFrame(payload, {
      billingTags: __testing.parseBillingTagMap({}),
      dumpMeta: true,
    });
    assert.equal(d.billing, null);
    assert.equal(d.frameDump[22].kind, 'fixed64');
  });
});
