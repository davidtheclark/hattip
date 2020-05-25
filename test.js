/* eslint-env jest */
'use strict';

const http = require('http');
const https = require('https');
const getPort = require('get-port');
const {
  hattip,
  hattipBackoff,
  hattipTimeKeeper,
  HattipResponse,
  HattipResponseError,
  HattipTimeoutError,
} = require('.');

let requestListener;
let server;
let port;
let baseOptions;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    requestListener(req, res);
  });
  port = await getPort();
  baseOptions = {
    protocol: 'http:',
    host: 'localhost',
    port,
  };
  return new Promise((resolve) => {
    server.listen(port, resolve);
  });
});

afterAll((done) => {
  server.close(done);
});

let responseStatusCode;
let responseBody;
function setResponse(statusCode, body) {
  responseStatusCode = statusCode;
  responseBody = body;
}

beforeEach(() => {
  responseStatusCode = 200;
  responseBody = { ok: true };
  requestListener = (req, res) => {
    if (typeof responseBody === 'string') {
      res.writeHead(responseStatusCode);
      res.end(responseBody);
    } else {
      res.writeHead(responseStatusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    }
  };
});

test('works with simple GET', async () => {
  const response = await hattip.request({ ...baseOptions });

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(200);
  expect(response.ok).toBe(true);
  expect(response.headers).toHaveProperty('content-type', 'application/json');
  expect(response.body).toEqual({ ok: true });
  expect(response.timings).toBeUndefined();
});

test('https protocol works with URL argument', async () => {
  const response = await hattip.get('https://postman-echo.com/get?foo=bar');

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.body.args).toEqual({ foo: 'bar' });
});

test('https protocol works with URL argument', async () => {
  const response = await hattip.get({
    protocol: 'https:',
    host: 'postman-echo.com',
    path: '/get?baz=yes',
  });

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.body.args).toEqual({ baz: 'yes' });
});

test('measureTimings adds timings to response', async () => {
  const response = await hattip.request({
    ...baseOptions,
    measureTimings: true,
  });

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.timings).toEqual({
    dns: expect.any(Number),
    download: expect.any(Number),
    response: expect.any(Number),
    socket: expect.any(Number),
    tcpConnect: expect.any(Number),
    tls: 0,
    total: expect.any(Number),
    upload: expect.any(Number),
  });
});

test('measureTimings with https', async () => {
  const response = await hattip.get('https://postman-echo.com/get?foo=bar', {
    measureTimings: true,
  });

  expect(response.timings).toEqual({
    dns: expect.any(Number),
    download: expect.any(Number),
    response: expect.any(Number),
    socket: expect.any(Number),
    tcpConnect: expect.any(Number),
    tls: expect.any(Number),
    total: expect.any(Number),
    upload: expect.any(Number),
  });
  expect(response.timings.tls).toBeGreaterThan(0);
});

test('measureTimings with https and keep-alive agent', async () => {
  const agent = new https.Agent({ keepAlive: true });
  await hattip.get('https://postman-echo.com/get?foo=bar', {
    agent,
    measureTimings: true,
  });
  const response = await hattip.get('https://postman-echo.com/get?foo=bar', {
    agent,
    measureTimings: true,
  });

  // 0s are steps that should be skipped when a persistent connection is re-used.
  expect(response.timings).toEqual({
    dns: 0,
    download: expect.any(Number),
    response: expect.any(Number),
    socket: expect.any(Number),
    tcpConnect: 0,
    tls: 0,
    total: expect.any(Number),
    upload: expect.any(Number),
  });
});

test('works with a URL argument', async () => {
  const response = await hattip.get('http://localhost/blah', { port });

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(200);
  expect(response.ok).toBe(true);
  expect(response.headers).toHaveProperty('content-type', 'application/json');
  expect(response.body).toEqual({ ok: true });
});

test('works with createClientRequest', async () => {
  const response = await hattip.get({
    createClientRequest: () => http.request({ port }),
  });

  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(200);
  expect(response.ok).toBe(true);
  expect(response.headers).toHaveProperty('content-type', 'application/json');
  expect(response.body).toEqual({ ok: true });
});

test('works with simple POST', async () => {
  let receivedMethod;
  let receivedBody = '';
  requestListener = (req, res) => {
    receivedMethod = req.method;
    req.on('data', (chunk) => (receivedBody += chunk));
    req.on('end', () => {
      res.writeHead(204);
      res.end();
    });
  };

  const response = await hattip
    .post({ ...baseOptions, body: { hello: 1 } })
    .catch((error) => console.log(error.response));

  expect(receivedMethod).toBe('POST');
  expect(receivedBody).toBe('{"hello":1}');
  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(204);
  expect(response.ok).toBe(true);
});

test('works with simple PATCH', async () => {
  let receivedMethod;
  let receivedBody = '';
  requestListener = (req, res) => {
    receivedMethod = req.method;
    req.on('data', (chunk) => (receivedBody += chunk));
    req.on('end', () => {
      res.writeHead(204);
      res.end();
    });
  };

  const response = await hattip
    .patch({ ...baseOptions, body: { hello: 1 } })
    .catch((error) => console.log(error.response));

  expect(receivedMethod).toBe('PATCH');
  expect(receivedBody).toBe('{"hello":1}');
  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(204);
  expect(response.ok).toBe(true);
});

test('works with simple PUT', async () => {
  let receivedMethod;
  let receivedBody = '';
  requestListener = (req, res) => {
    receivedMethod = req.method;
    req.on('data', (chunk) => (receivedBody += chunk));
    req.on('end', () => {
      res.writeHead(204);
      res.end();
    });
  };

  const response = await hattip
    .put({ ...baseOptions, body: { hello: 1 } })
    .catch((error) => console.log(error.response));

  expect(receivedMethod).toBe('PUT');
  expect(receivedBody).toBe('{"hello":1}');
  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(204);
  expect(response.ok).toBe(true);
});

test('works with simple DELETE', async () => {
  let receivedMethod;
  requestListener = (req, res) => {
    receivedMethod = req.method;
    res.writeHead(204);
    res.end();
  };

  const response = await hattip
    .delete({ ...baseOptions })
    .catch((error) => console.log(error.response));

  expect(receivedMethod).toBe('DELETE');
  expect(response).toBeInstanceOf(HattipResponse);
  expect(response.statusCode).toBe(204);
  expect(response.ok).toBe(true);
});

test('rejects non-2xx HTTP status code', async () => {
  setResponse(404, { message: 'Not found' });

  expect.hasAssertions();
  try {
    await hattip.request({ ...baseOptions });
  } catch (error) {
    expect(error).toBeInstanceOf(HattipResponseError);
    expect(error.statusCode).toBe(404);
    expect(error.body).toEqual({ message: 'Not found' });

    const response = error.response;
    expect(response).toBeInstanceOf(HattipResponse);
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ message: 'Not found' });
    expect(response.ok).toBe(false);
    expect(response.headers).toHaveProperty('content-type', 'application/json');
  }
});

test('rejects unparseable JSON response body', async () => {
  requestListener = (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{what');
  };

  expect.hasAssertions();
  try {
    await hattip.request({ ...baseOptions });
  } catch (error) {
    expect(error).toBeInstanceOf(HattipResponseError);
    expect(error.message).toBe('Failed to parse response body');
    expect(error.statusCode).toBe(200);
    expect(error.body).toBe('{what');
  }
});

test('accepts non-JSON response body', async () => {
  requestListener = (req, res) => {
    res.writeHead(200);
    res.end('{what');
  };

  const response = await hattip.request({ ...baseOptions });

  expect(response.statusCode).toBe(200);
  expect(response.body).toBe('{what');
});

describe('retries', () => {
  test('succeeds on third, no limit', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      if (times === 1) {
        req.destroy(new Error('Yikes'));
        return;
      }
      if (times === 2) {
        res.writeHead(500);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ patience: 'virtue' }));
    };

    const response = await hattip.get({
      ...baseOptions,
      retryBackoff: () => 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ patience: 'virtue' });
    expect(response.failedAttempts).toHaveLength(2);
    expect(response.failedAttempts[0].message).toBe('socket hang up');
    expect(response.failedAttempts[0].code).toBe('ECONNRESET');
    expect(response.failedAttempts[1]).toBeInstanceOf(HattipResponseError);
    expect(response.failedAttempts[1].statusCode).toBe(500);
  });

  test('succeeds on fourth with createClientRequest', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      if (times === 1) {
        req.destroy(new Error('Yikes'));
        return;
      }
      if (times < 4) {
        res.writeHead(500);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ patience: 'virtue' }));
    };

    const response = await hattip.request(
      () => http.request({ host: 'localhost', port }),
      { retryBackoff: ({ retryIndex }) => (retryIndex > 5 ? false : 1) },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ patience: 'virtue' });
    expect(response.failedAttempts).toHaveLength(3);
    expect(response.failedAttempts[0].message).toBe('socket hang up');
    expect(response.failedAttempts[0].code).toBe('ECONNRESET');
    expect(response.failedAttempts[1]).toBeInstanceOf(HattipResponseError);
    expect(response.failedAttempts[1].statusCode).toBe(500);
    expect(response.failedAttempts[2]).toBeInstanceOf(HattipResponseError);
    expect(response.failedAttempts[2].statusCode).toBe(500);
  });

  test('fails on all attempts, with limit imposed by backoff function', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      if (times === 1) {
        req.destroy(new Error('Yikes'));
        return;
      }
      if (times === 2) {
        res.writeHead(429);
        res.end();
        return;
      }
      res.writeHead(408);
      res.end();
    };

    expect.hasAssertions();
    try {
      await hattip.get({
        ...baseOptions,
        retryBackoff: ({ retryIndex }) => {
          if (retryIndex === 1) return false;
          return 1;
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipResponseError);
      expect(error.statusCode).toBe(408);
      expect(error.failedAttempts).toHaveLength(2);
      expect(error.failedAttempts[0].message).toBe('socket hang up');
      expect(error.failedAttempts[0].code).toBe('ECONNRESET');
      expect(error.failedAttempts[1]).toBeInstanceOf(HattipResponseError);
      expect(error.failedAttempts[1].statusCode).toBe(429);
    }
  });

  test('does not retry 404', async () => {
    setResponse(404, 'Not Found');

    expect.hasAssertions();
    try {
      await hattip.get({
        ...baseOptions,
        retryBackoff: ({ retryIndex }) => (retryIndex > 3 ? false : 1),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipResponseError);
      expect(error.statusCode).toBe(404);
      expect(error.failedAttempts).toHaveLength(0);
    }
  });
});

describe('timeouts', () => {
  test('timeoutRequest', async () => {
    expect.hasAssertions();
    try {
      // To prevent the connection from being established use a non-routable IP
      // address. See https://tools.ietf.org/html/rfc5737#section-3
      await hattip.get({
        url: 'http://192.0.2.1',
        timeoutRequest: 50,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipTimeoutError);
      expect(error.code).toBe('ETIMEDOUT');
      expect(error.message).toBe(
        'Timeout "timeoutRequest" triggered after 50ms',
      );
    }
  });

  test('timeoutResponse', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      const delay = times === 1 ? 1 : 10;
      setTimeout(() => {
        res.writeHead(200);
        res.end();
      }, delay);
    };

    await hattip.get({
      ...baseOptions,
      timeoutResponse: 5,
    });

    expect.hasAssertions();
    try {
      await hattip.get({
        ...baseOptions,
        timeoutResponse: 5,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipTimeoutError);
      expect(error.code).toBe('ETIMEDOUT');
      expect(error.message).toBe(
        'Timeout "timeoutResponse" triggered after 5ms',
      );
    }
  });

  test('timeoutIdleSocket', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      const delay = times === 1 ? 1 : 10;
      setTimeout(() => {
        res.writeHead(200);
        res.end();
      }, delay);
    };

    await hattip.get({
      ...baseOptions,
      timeoutIdleSocket: 5,
    });

    expect.hasAssertions();
    try {
      await hattip.get({
        ...baseOptions,
        timeoutIdleSocket: 5,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipTimeoutError);
      expect(error.code).toBe('ETIMEDOUT');
      expect(error.message).toBe(
        'Timeout "timeoutIdleSocket" triggered after 5ms',
      );
    }
  });

  test('timeoutTotal timeout', async () => {
    let times = 0;
    requestListener = (req, res) => {
      times += 1;
      const delay = times === 1 ? 10 : 20;
      res.writeHead(200);
      setTimeout(() => {
        res.write;
      }, delay / 2);
      setTimeout(() => {
        res.end();
      }, delay);
    };

    await hattip.get({
      ...baseOptions,
      timeoutTotal: 15,
    });

    expect.hasAssertions();
    try {
      await hattip.get({
        ...baseOptions,
        timeoutTotal: 5,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HattipTimeoutError);
      expect(error.code).toBe('ETIMEDOUT');
      expect(error.message).toBe('Timeout "timeoutTotal" triggered after 5ms');
    }
  });
});

test('hattipTimeKeeper outside of hattip.request', (done) => {
  const req = http.request({ ...baseOptions });
  req.on('error', done);
  const timings = hattipTimeKeeper(req);
  req.on('response', (res) => {
    res.on('data', () => {});
    res.on('error', done);
    res.on('end', () => {
      expect(timings).toEqual({
        dns: expect.any(Number),
        download: expect.any(Number),
        response: expect.any(Number),
        socket: expect.any(Number),
        tcpConnect: expect.any(Number),
        tls: expect.any(Number),
        total: expect.any(Number),
        upload: expect.any(Number),
      });
      done();
    });
  });
  req.end();
});

function runBackoff(fn) {
  const result = [];
  for (let i = 0; i < 100; i++) {
    const delay = fn({ retryIndex: i });
    if (delay === false) break;
    result.push(delay);
  }
  return result;
}

describe('hattipBackoff', () => {
  test('defaults', () => {
    const result = runBackoff(hattipBackoff());
    expect(result).toHaveLength(4);
    expect(result[0]).toBeGreaterThan(100);
    expect(result[0]).toBeLessThan(200);
    expect(result[1]).toBeGreaterThan(200);
    expect(result[1]).toBeLessThan(400);
    expect(result[2]).toBeGreaterThan(400);
    expect(result[2]).toBeLessThan(800);
    expect(result[3]).toBeGreaterThan(800);
    expect(result[3]).toBeLessThanOrEqual(1000);
  });

  test('options', () => {
    const result = runBackoff(
      hattipBackoff({
        limit: 6,
        minDelay: 50,
        maxDelay: 3000,
        jitter: false,
        fastFirst: true,
      }),
    );
    expect(result).toEqual([1, 100, 200, 400, 800, 1600, 3000]);
  });
});
