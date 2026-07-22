import test from 'node:test';
import assert from 'node:assert/strict';
import { CDNS, DEFAULT_CDN_ID, getCdn, parseTestOptions, validateCdnId } from './cdn-config.mjs';

test('nPerf is the public default route', () => {
  assert.equal(DEFAULT_CDN_ID, 'nperf');
  assert.equal(getCdn().host, 'localhost');
});

test('only advertised CDN ids can be selected', () => {
  assert.equal(validateCdnId('nperf'), 'nperf');
  assert.equal(validateCdnId('unknown'), DEFAULT_CDN_ID);
  assert.equal(validateCdnId(undefined), DEFAULT_CDN_ID);
});

test('CDN configuration exposes valid test endpoints', () => {
  for (const cdn of Object.values(CDNS)) {
    assert.match(cdn.pingUrl, /^\//);
    assert.match(cdn.downloadUrl(), /^\//);
    assert.match(cdn.host, /localhost/i);
  }
  assert.match(CDNS.nperf.downloadUrl(), /bytes=/);
});

test('test options are bounded and include a validated CDN', () => {
  assert.deepEqual(parseTestOptions({ cdn: 'nperf', duration: '40000', streams: '0' }), {
    cdnId: 'nperf', duration: 30000, streams: 1,
  });
  assert.deepEqual(parseTestOptions({ cdn: 'bad', duration: 'nope', streams: '100' }), {
    cdnId: 'nperf', duration: 8000, streams: 64,
  });
});
