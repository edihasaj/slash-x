import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TwitterClientBase } from '../dist/twitter/base.js';
import { withPosting } from '../dist/twitter/posting.js';

function clientWith(responses) {
    const calls = [];
    class Stub extends TwitterClientBase {
        async ensureClientUserId() {}
        async getQueryId() { return 'test-query'; }
        async refreshQueryIds() {}
        async withTransactionId(headers) { return headers; }
        async fetchWithTimeout(url, init) {
            calls.push({ url, ...init });
            assert.ok(responses.length, 'Unexpected extra request');
            return responses.shift();
        }
    }
    const Posting = withPosting(Stub);
    return { client: new Posting({ cookies: { authToken: 'test', ct0: 'test' } }), calls };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

for (const method of ['tweet', 'reply', 'noteTweet']) {
    for (const fallback of [false, true]) {
        test(`${method}: missing receipt never claims creation${fallback ? ' after 404 fallback' : ''}`, async () => {
            const responses = fallback ? [json({}, 404), json({}, 404), json({ data: {} })] : [json({ data: {} })];
            const { client, calls } = clientWith(responses);
            const result = method === 'reply' ? await client.reply('Test body', '123') : await client[method]('Test body');
            assert.equal(result.success, false);
            assert.match(result.error, /not confirmed/i);
            assert.match(result.error, /no ID returned/i);
            assert.doesNotMatch(result.error, /Tweet created/i);
            assert.equal(calls.length, fallback ? 3 : 1);
        });
    }
}

for (const [method, field] of [['tweet', 'create_tweet'], ['noteTweet', 'notetweet_create']]) {
    test(`${method}: a returned ID confirms success`, async () => {
        const { client } = clientWith([json({ data: { [field]: { tweet_results: { result: { rest_id: '123' } } } } })]);
        assert.deepEqual(await client[method]('Test body'), { success: true, tweetId: '123' });
    });
}

test('provider refusals keep their reason and are not retried', async () => {
    const { client, calls } = clientWith([json({ errors: [{ message: 'Not permitted', code: 385 }] })]);
    assert.deepEqual(await client.reply('Test body', '123'), { success: false, error: 'Not permitted (385)' });
    assert.equal(calls.length, 1);
});
