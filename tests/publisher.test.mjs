import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Publisher, Telegram, buildOperation, PUBLIC_CALLER, CHAT_ID, BOT_ID, BOT_USERNAME } from '../lib/telegram.ts';
const owner = { id: 'owner', email: 'owner@example.invalid' };
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_remarkable_firedrake.sql', import.meta.url), 'utf8'));
  return { prepare(query) {
    const statement = sql.prepare(query);
    let values = [];
    return { bind(...args) { values = args; return this; }, async first() { return statement.get(...values) || null; }, async all() { return { results: statement.all(...values) }; }, async run() { return { meta: { changes: statement.run(...values).changes } }; } };
  } };
}
function fixture({ mutation = 'ok', chatId = CHAT_ID } = {}) {
  const calls = [];
  const env = { DB: database(), TELEGRAM_BOT_TOKEN: '123456:' + 'x'.repeat(35), OWNER_EMAIL: owner.email };
  const transport = async (url, init) => {
    const method = url.split('/').at(-1), params = JSON.parse(init.body); calls.push({ method, params });
    let result;
    if (method === 'getMe') result = { id: BOT_ID, username: BOT_USERNAME, is_bot: true };
    else if (method === 'getChat') result = { id: chatId, username: 'kansk_segodnya', type: 'channel', title: 'Канск Сегодня' };
    else if (method === 'getChatMember') result = { status: 'administrator', can_post_messages: true, can_edit_messages: true };
    else {
      assert.equal(params.chat_id, CHAT_ID);
      if (mutation === 'timeout') throw new Error('network');
      if (mutation === 'rejected') return Response.json({ ok: false, description: 'Bad Request' }, { status: 400 });
      result = { message_id: 42, chat: { id: CHAT_ID } };
    }
    return Response.json({ ok: true, result });
  };
  return { env, calls, transport, publisher: new Publisher(env, transport) };
}
const args = { operation_key: 'news-1', text: 'Разрешённый пост' };
test('channel journal scope is stable', () => {
  assert.equal(PUBLIC_CALLER.id, 'public-channel');
  assert.equal(PUBLIC_CALLER.email, '');
});
test('channel cannot be replaced; invalid edits fail before network', () => {
  assert.throws(() => buildOperation('telegram_publish_text', { ...args, chat_id: '@other' }));
  assert.throws(() => buildOperation('telegram_edit_text', { ...args, message_id: 0 }));
  assert.throws(() => buildOperation('telegram_edit_media', { operation_key: 'm', message_id: 1, kind: 'photo', media_ref: 'https://example.invalid/a.jpg' }));
});
test('check pins channel and never mutates Telegram', async () => {
  const f = fixture(); const r = await f.publisher.check();
  assert.equal(r.connected, true); assert.equal(r.can_edit_messages, true);
  assert.deepEqual(f.calls.map(c => c.method), ['getMe','getChat','getChatMember']);
  const g = fixture({ chatId: 123 }); await assert.rejects(g.publisher.execute(owner, 'telegram_publish_text', args));
  assert.equal(g.calls.filter(c => c.method === 'sendMessage').length, 0);
});
test('completed operation survives a new Publisher and blocks changed contents', async () => {
  const f = fixture(); await f.publisher.execute(owner, 'telegram_publish_text', args);
  const restarted = new Publisher(f.env, f.transport);
  const repeat = await restarted.execute(owner, 'telegram_publish_text', args);
  assert.equal(repeat.repeated, true); assert.equal(repeat.message_id, 42);
  await assert.rejects(restarted.execute(owner, 'telegram_publish_text', { ...args, text: 'Другое' }));
  assert.equal(f.calls.filter(c => c.method === 'sendMessage').length, 1);
});
test('simultaneous requests reserve one durable operation', async () => {
  const f = fixture(); await Promise.allSettled([f.publisher.execute(owner,'telegram_publish_text',args), f.publisher.execute(owner,'telegram_publish_text',args)]);
  assert.equal(f.calls.filter(c => c.method === 'sendMessage').length, 1);
});
test('uncertain operation blocks automatic retries after a new process', async () => {
  const f = fixture({ mutation: 'timeout' });
  await assert.rejects(f.publisher.execute(owner,'telegram_publish_text',args));
  assert.equal((await f.publisher.operation(owner,'news-1')).status, 'uncertain');
  await assert.rejects(new Publisher(f.env,f.transport).execute(owner,'telegram_publish_text',args));
  assert.equal(f.calls.filter(c => c.method === 'sendMessage').length, 1);
});
test('definite rejection stored separately and not automatically repeated', async () => {
  const f = fixture({ mutation: 'rejected' }); await assert.rejects(f.publisher.execute(owner,'telegram_publish_text',args));
  assert.equal((await f.publisher.operation(owner,'news-1')).status, 'rejected');
  await assert.rejects(f.publisher.execute(owner,'telegram_publish_text',args));
  assert.equal(f.calls.filter(c => c.method === 'sendMessage').length, 1);
});
test('pending operations block mutation; history is owner-scoped', async () => {
  const f = fixture(); await f.publisher.execute(owner,'telegram_publish_text',args);
  await f.env.DB.prepare("UPDATE operations SET status = 'pending' WHERE id = ?").bind('owner:news-1').run();
  await assert.rejects(f.publisher.execute(owner,'telegram_publish_text',args));
  assert.equal((await f.publisher.recent({ id: 'other' })).length, 0);
  assert.equal(f.calls.filter(c => c.method === 'sendMessage').length, 1);
});
test('read requests retry, write requests do not, errors hide credentials', async () => {
  let calls = 0; const env = { TELEGRAM_BOT_TOKEN: '123456:' + 'x'.repeat(35) };
  const api = new Telegram(env, async () => { calls++; throw new Error(env.TELEGRAM_BOT_TOKEN); });
  await assert.rejects(api.call('getMe'), e => !e.message.includes(env.TELEGRAM_BOT_TOKEN)); assert.equal(calls, 2);
  await assert.rejects(api.call('sendMessage'), e => !e.message.includes(env.TELEGRAM_BOT_TOKEN)); assert.equal(calls, 3);
});
test('Worker-compatible redirect mode never forwards credentials to another origin', async () => {
  const env = { TELEGRAM_BOT_TOKEN: '123456:' + 'x'.repeat(35) }; let calls = 0;
  const api = new Telegram(env, async (url, init) => {
    calls++; assert.equal(init.redirect, 'manual');
    assert.equal(new URL(url).hostname, 'api.telegram.org');
    return new Response(null, { status: 302, headers: { Location: 'https://other.invalid/' } });
  });
  await assert.rejects(api.call('getMe'), e => !e.message.includes(env.TELEGRAM_BOT_TOKEN));
  assert.equal(calls, 1);
});
