/* eslint-disable */
'use strict';

// Mocked unit tests for the ExpertModelsEdenAi node (sync + async paths).
// No test framework: plain Node + assert. Run with `npm test` (builds first)
// or `node test/test-nodes.cjs` against an existing dist build.
//
// These tests stub IExecuteFunctions + the n8n HTTP/binary helpers so the
// request-building and async launch/poll logic can be exercised deterministically
// without hitting the API.

const assert = require('node:assert');
const path = require('node:path');

const { ExpertModelsEdenAi } = require(
	path.join(__dirname, '..', 'dist', 'nodes', 'ExpertModelsEdenAi', 'ExpertModelsEdenAi.node.js'),
);

const GLOBAL_BASE = 'https://api.edenai.run/v3';
const EU_BASE = 'https://api.eu.edenai.run/v3';

// Build a fake IExecuteFunctions context.
//   params  : map read by getNodeParameter(name, i, default)
//   httpMock: (opts, calls) => response, for every helpers.httpRequestWithAuthentication
//   opts    : { continueOnFail, inputBinary, helpers } overrides
function makeCtx(params, httpMock, opts = {}) {
	const calls = [];
	const node = { id: '1', name: 'Test', type: 'expertModelsEdenAi', typeVersion: 1, position: [0, 0], parameters: {} };
	const loud = (n) => () => { throw new Error(`${n} should not be called`); };
	const helpers = {
		httpRequestWithAuthentication: function (_cred, o) {
			calls.push({ method: o.method, url: o.url, body: o.body });
			return Promise.resolve(httpMock(o, calls));
		},
		assertBinaryData: loud('assertBinaryData'),
		getBinaryDataBuffer: loud('getBinaryDataBuffer'),
		requestWithAuthentication: loud('requestWithAuthentication'),
		httpRequest: loud('httpRequest'),
		prepareBinaryData: loud('prepareBinaryData'),
		...(opts.helpers || {}),
	};
	return {
		calls,
		ctx: {
			getInputData: () => [{ json: {}, ...(opts.inputBinary ? { binary: opts.inputBinary } : {}) }],
			getCredentials: async () => ({ url: GLOBAL_BASE, apiKey: 'test-key' }),
			getNode: () => node,
			continueOnFail: () => opts.continueOnFail === true,
			getNodeParameter: (name, _i, dflt) => (name in params ? params[name] : dflt),
			helpers,
		},
	};
}

const fileParams = { euOnly: false, inputType: 'file', fileSource: 'fileId', fileId: 'file-uuid', 'additionalInput.field': [] };

const node = new ExpertModelsEdenAi();
const run = (ctx) => node.execute.call(ctx);

let passed = 0;
const failures = [];
async function test(name, fn) {
	try {
		await fn();
		passed++;
		console.log(`  ✓ ${name}`);
	} catch (err) {
		failures.push({ name, err });
		console.log(`  ✗ ${name}\n      ${err && err.message}`);
	}
}

(async () => {
	console.log('ExpertModelsEdenAi');

	// --- async happy path + body assertion -------------------------------------
	await test('async: polls processing->success, posts correct body', async () => {
		let getCount = 0;
		const { ctx, calls } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async',
				options: { simplifyResponse: true, waitForCompletion: true, pollInterval: 5, maxWaitTime: 2000 } },
			(o) => {
				if (o.method === 'POST' && o.url.endsWith('/universal-ai/async')) return { status: 'processing', public_id: 'job-a', output: null, error: null };
				if (o.method === 'GET' && o.url.includes('/universal-ai/async/job-a')) { getCount++; return getCount < 2 ? { status: 'processing', output: null } : { status: 'success', output: { number_of_pages: 3 }, error: null }; }
				throw new Error(`unexpected ${o.method} ${o.url}`);
			},
		);
		const out = await run(ctx);
		assert.deepStrictEqual(out[0][0].json, { number_of_pages: 3 });
		assert.ok(getCount >= 2, 'should poll at least twice');
		const launch = calls.find((c) => c.url.endsWith('/universal-ai/async'));
		assert.strictEqual(launch.body.model, 'ocr/ocr_async/amazon', 'posts full model path');
		assert.deepStrictEqual(launch.body.input, { file: 'file-uuid' }, 'posts the file input');
		assert.strictEqual(launch.body.webhook_receiver, undefined, 'no webhook when none set');
	});

	// --- waitForCompletion=false returns handle (and preserves public_id even with simplify) ---
	await test('async: waitForCompletion=false returns job handle, no polling', async () => {
		const { ctx, calls } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: false } },
			(o) => { if (o.method === 'POST') return { status: 'processing', public_id: 'job-b', output: null, error: null }; throw new Error(`unexpected ${o.method}`); },
		);
		const out = await run(ctx);
		assert.strictEqual(out[0][0].json.public_id, 'job-b');
		assert.ok(!calls.some((c) => c.method === 'GET'), 'must not poll');
	});

	await test('async: simplify + waitForCompletion=false still returns public_id (regression)', async () => {
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { simplifyResponse: true, waitForCompletion: false } },
			(o) => { if (o.method === 'POST') return { status: 'processing', public_id: 'job-b2', output: null, error: null }; throw new Error('unexpected'); },
		);
		const out = await run(ctx);
		assert.strictEqual(out[0][0].json.public_id, 'job-b2', 'simplify must not discard the job handle');
	});

	// --- timeout with bounded poll count ---------------------------------------
	await test('async: times out and respects pollInterval (bounded polls)', async () => {
		let getCount = 0;
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: true, pollInterval: 5, maxWaitTime: 18 } },
			(o) => { if (o.method === 'POST') return { status: 'processing', public_id: 'job-c', error: null }; getCount++; return { status: 'processing', output: null }; },
		);
		await assert.rejects(run(ctx), /did not finish within 18 ms/);
		assert.ok(getCount >= 1 && getCount <= 6, `polled a bounded number of times (got ${getCount})`);
	});

	// --- sync routing + body + no webhook on sync ------------------------------
	await test('sync: uses /universal-ai, never async, no webhook even if set', async () => {
		const { ctx, calls } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr/google', subfeature: 'ocr', options: { simplifyResponse: true, webhookUrl: 'https://hook.example/cb' } },
			(o) => { if (o.method === 'POST' && o.url.endsWith('/universal-ai')) return { status: 'success', output: { text: 'hello' }, provider: 'google' }; throw new Error(`unexpected ${o.method} ${o.url}`); },
		);
		const out = await run(ctx);
		assert.deepStrictEqual(out[0][0].json, { text: 'hello' });
		assert.ok(!calls.some((c) => c.url.includes('/async')), 'sync must not hit async endpoint');
		const post = calls.find((c) => c.method === 'POST');
		assert.strictEqual(post.body.webhook_receiver, undefined, 'webhook must NOT be sent on sync requests');
		assert.deepStrictEqual(post.body.input, { file: 'file-uuid' });
	});

	// --- terminal async failure surfaces error ---------------------------------
	await test('async: terminal fail surfaces the error', async () => {
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: true, pollInterval: 5, maxWaitTime: 2000 } },
			(o) => { if (o.method === 'POST') return { status: 'processing', public_id: 'job-e', error: null }; return { status: 'fail', output: null, error: { message: 'provider exploded' } }; },
		);
		await assert.rejects(run(ctx), /provider exploded/);
	});

	// --- webhook on async launch ------------------------------------------------
	await test('async: webhook URL sent as webhook_receiver', async () => {
		let body = null;
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: false, webhookUrl: 'https://hook.example/cb' } },
			(o) => { if (o.method === 'POST') { body = o.body; return { status: 'processing', public_id: 'job-f', error: null }; } throw new Error('unexpected'); },
		);
		await run(ctx);
		assert.strictEqual(body.webhook_receiver, 'https://hook.example/cb');
	});

	// --- request-body construction: fallbacks / provider_params / show_original --
	await test('body: fallbacks trimmed+sliced, provider_params, show_original_response', async () => {
		let body = null;
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr/google', subfeature: 'ocr',
				options: { fallbacks: 'google, microsoft ,a,b', providerParams: '{"steps":20}', showOriginalResponse: true } },
			(o) => { body = o.body; return { status: 'success', output: {} }; },
		);
		await run(ctx);
		assert.deepStrictEqual(body.fallbacks, ['google', 'microsoft', 'a'], 'trimmed + capped at 3');
		assert.deepStrictEqual(body.provider_params, { steps: 20 });
		assert.strictEqual(body.show_original_response, true);
	});

	// --- additionalInput JSON-vs-string coercion -------------------------------
	await test('body: additionalInput coerces JSON values, keeps strings', async () => {
		let body = null;
		const { ctx } = makeCtx(
			{ euOnly: false, inputType: 'text', text: 'hi', providerModel: 'text/moderation/openai', subfeature: 'moderation',
				'additionalInput.field': [
					{ key: 'num', value: '42' }, { key: 'flag', value: 'true' }, { key: 'name', value: 'bob' }, { key: 'arr', value: '[1,2]' },
				], options: {} },
			(o) => { body = o.body; return { status: 'success', output: {} }; },
		);
		await run(ctx);
		assert.strictEqual(body.input.text, 'hi');
		assert.strictEqual(body.input.num, 42);
		assert.strictEqual(body.input.flag, true);
		assert.strictEqual(body.input.name, 'bob');
		assert.deepStrictEqual(body.input.arr, [1, 2]);
	});

	// --- EU routing -------------------------------------------------------------
	await test('eu: euOnly routes to the EU base URL', async () => {
		const { ctx, calls } = makeCtx(
			{ ...fileParams, euOnly: true, providerModel: 'ocr/ocr/google', subfeature: 'ocr', options: {} },
			(o) => { assert.ok(o.url.startsWith(EU_BASE), `expected EU host, got ${o.url}`); return { status: 'success', output: {} }; },
		);
		await run(ctx);
		assert.ok(calls[0].url.startsWith(EU_BASE));
	});

	// --- error branches ---------------------------------------------------------
	await test('error: no provider selected throws', async () => {
		const { ctx } = makeCtx({ ...fileParams, providerModel: '', subfeature: 'ocr', options: {} }, () => ({ status: 'success' }));
		await assert.rejects(run(ctx), /No model selected/);
	});

	await test('error: invalid Provider Params JSON throws', async () => {
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr/google', subfeature: 'ocr', options: { providerParams: '{bad' } },
			() => ({ status: 'success', output: {} }),
		);
		await assert.rejects(run(ctx), /Invalid Provider Params JSON/);
	});

	await test('error: async launch without public_id throws', async () => {
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: true } },
			(o) => { if (o.method === 'POST') return { status: 'processing', error: null }; throw new Error('should not poll'); },
		);
		await assert.rejects(run(ctx), /did not return a public_id/);
	});

	// --- continueOnFail collects the error instead of throwing -----------------
	await test('continueOnFail: collects error, does not throw', async () => {
		const { ctx } = makeCtx(
			{ ...fileParams, providerModel: 'ocr/ocr_async/amazon', subfeature: 'ocr_async', options: { waitForCompletion: true, pollInterval: 5, maxWaitTime: 2000 } },
			(o) => { if (o.method === 'POST') return { status: 'processing', public_id: 'job-cf', error: null }; return { status: 'fail', error: { message: 'kaboom' } }; },
			{ continueOnFail: true },
		);
		const out = await run(ctx);
		assert.match(out[0][0].json.error, /kaboom/);
	});

	// --- binary upload -> file_id -> input.file --------------------------------
	await test('binary: uploads file and uses returned file_id as input.file', async () => {
		let body = null;
		let uploaded = false;
		const { ctx } = makeCtx(
			{ euOnly: false, inputType: 'file', fileSource: 'binary', binaryProperty: 'data', providerModel: 'ocr/ocr/google', subfeature: 'ocr', 'additionalInput.field': [], options: {} },
			(o) => { body = o.body; return { status: 'success', output: { text: 'ok' } }; },
			{ helpers: {
				assertBinaryData: () => ({ fileName: 'doc.png', mimeType: 'image/png' }),
				getBinaryDataBuffer: async () => Buffer.from('imgbytes'),
				requestWithAuthentication: async () => { uploaded = true; return { file_id: 'uploaded-id' }; },
			} },
		);
		await run(ctx);
		assert.ok(uploaded, 'should upload the binary');
		assert.strictEqual(body.input.file, 'uploaded-id', 'uses returned file_id');
	});

	await test('binary: upload without file_id throws', async () => {
		const { ctx } = makeCtx(
			{ euOnly: false, inputType: 'file', fileSource: 'binary', binaryProperty: 'data', providerModel: 'ocr/ocr/google', subfeature: 'ocr', 'additionalInput.field': [], options: {} },
			() => ({ status: 'success' }),
			{ helpers: {
				assertBinaryData: () => ({ fileName: 'doc.png', mimeType: 'image/png' }),
				getBinaryDataBuffer: async () => Buffer.from('x'),
				requestWithAuthentication: async () => ({}),
			} },
		);
		await assert.rejects(run(ctx), /did not return a file_id/);
	});

	// --- downloadFileOutput attaches + merges binary ---------------------------
	await test('downloadFileOutput: fetches resource URL and merges binary', async () => {
		const prepared = { data: 'base64', mimeType: 'image/png', fileName: 'out.png' };
		const { ctx } = makeCtx(
			{ euOnly: false, inputType: 'text', text: 'a cat', providerModel: 'image/generation/replicate', subfeature: 'generation', 'additionalInput.field': [],
				options: { downloadFileOutput: true, outputBinaryProperty: 'image' } },
			(o) => ({ status: 'success', output: { image_resource_url: 'https://cdn.example/img.png' } }),
			{ inputBinary: { existing: { data: 'keep', mimeType: 'text/plain' } },
				helpers: {
					httpRequest: async () => Buffer.from('PNGDATA'),
					prepareBinaryData: async () => prepared,
				} },
		);
		const out = await run(ctx);
		assert.deepStrictEqual(out[0][0].binary.image, prepared, 'downloaded file attached under outputBinaryProperty');
		assert.ok(out[0][0].binary.existing, 'pre-existing binary is preserved');
	});

	console.log(`\n${passed} passed, ${failures.length} failed`);
	if (failures.length > 0) process.exit(1);
})();
