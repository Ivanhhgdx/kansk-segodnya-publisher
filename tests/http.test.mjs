import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, API_HEADERS, options } from '../lib/http.ts';
test('public JSON clients receive CORS without credentials or login', () => {
  assert.equal(API_HEADERS['Access-Control-Allow-Origin'], '*');
  assert.equal(API_HEADERS['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal(options().status, 204);
  assert.equal(API_HEADERS['Cache-Control'], 'no-store');
});
test('valid JSON is accepted; malformed input and large streaming bodies are rejected', async () => {
  const request = body => new Request('https://example.invalid/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.deepEqual(await readJson(request('{"action":"telegram_check_connection","arguments":{}}')), { action: 'telegram_check_connection', arguments: {} });
  await assert.rejects(readJson(request('{broken')));
  await assert.rejects(readJson(request('x'.repeat(100001))));
  await assert.rejects(readJson(new Request('https://example.invalid', { method: 'POST', body: '{}' })));
});
