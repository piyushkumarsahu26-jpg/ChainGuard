// Tests for aiClient.service.js's HTTP mechanics — retry, timeout, error
// handling. Uses a real local HTTP server (Node's http module) rather than
// mocking global.fetch, exercising the actual request/response path the
// same way this sprint's manual verification did (real Node code against
// a real, if minimal, server) — see
// docs/chainguard-sprint-ai4b-completion-report.md §5.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;
let baseUrl;
let requestCount = 0;
let failNextNRequests = 0;
let forceErrorStatus = null;

before(async () => {
  server = http.createServer((req, res) => {
    requestCount += 1;

    if (failNextNRequests > 0) {
      failNextNRequests -= 1;
      req.destroy(); // simulate a connection-level failure, not a clean HTTP error
      return;
    }

    if (forceErrorStatus) {
      const status = forceErrorStatus;
      forceErrorStatus = null;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Forced error for testing' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { status: 'ok' } }));
      } else if (req.url === '/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: [] }));
      } else if (req.url.startsWith('/predict/image')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { detections: [], processingTimeMs: 1.0 } }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
  process.env.AI_SERVICE_URL = baseUrl;
  process.env.AI_SERVICE_API_KEY = 'test-key';
  process.env.AI_SERVICE_MAX_RETRIES = '2';
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('checkHealth() makes a real request and parses the response', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  const result = await aiClientService.checkHealth();
  assert.equal(result.data.status, 'ok');
});

test('listModels() makes a real request', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  const result = await aiClientService.listModels();
  assert.deepEqual(result.data, []);
});

test('predictImage() sends a real multipart request and parses the result', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  const result = await aiClientService.predictImage(Buffer.from('fake-image-bytes'), 'test.jpg', 'image/jpeg');
  assert.deepEqual(result.detections, []);
});

test('retries on connection failure and succeeds once the server responds', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  failNextNRequests = 1; // first attempt fails, retry should succeed
  const result = await aiClientService.checkHealth();
  assert.equal(result.data.status, 'ok');
});

test('gives up after exhausting retries and throws a clear error', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  failNextNRequests = 10; // more than AI_SERVICE_MAX_RETRIES=2 can absorb
  await assert.rejects(() => aiClientService.checkHealth());
});

test('non-2xx responses are translated into a clear ApiError, not a raw fetch error', async () => {
  const { aiClientService } = await import('../src/services/aiClient.service.js');
  forceErrorStatus = 500;
  await assert.rejects(
    () => aiClientService.checkHealth(),
    (err) => {
      assert.equal(err.statusCode, 503); // translated to 503 (upstream unavailable), not passed through as 500
      return true;
    }
  );
});
