'use strict';

const http = require('http');
const https = require('https');
const { hattipTimeKeeper } = require('./hattip-time-keeper');

class HattipResponse {
  constructor(clientRequest, incomingMessage) {
    Object.defineProperties(this, {
      incomingMessage: { value: incomingMessage },
      clientRequest: { value: clientRequest },
    });
    const ok =
      incomingMessage.statusCode >= 200 && incomingMessage.statusCode <= 299;
    setEnumerable(this, 'ok', ok);
    setEnumerable(this, 'statusCode', incomingMessage.statusCode);
    setEnumerable(this, 'headers', incomingMessage.headers);
  }
}

class HattipResponseError extends Error {
  constructor(message, response) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    setEnumerable(this, 'name', this.constructor.name);
    setEnumerable(this, 'statusCode', response.statusCode);
    setEnumerable(this, 'body', response.body);
    setEnumerable(this, 'response', response);
  }
}

function setEnumerable(thing, name, value) {
  Object.defineProperty(thing, name, { value, enumerable: true });
}

function protocolModule(options) {
  if (options.protocol === 'https:') return https;
  if (options.url && options.url.startsWith('https:')) return https;
  return http;
}

function isIncomingMessageJson(incomingMessage) {
  return (
    incomingMessage.headers['content-type'] &&
    incomingMessage.headers['content-type'].includes('application/json')
  );
}

const retriableErrorCodes = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'EADDRINUSE',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
]);

function isStatusCodeRetriable(statusCode) {
  if (statusCode >= 500) return true;
  if (statusCode === 408) return true; // Request timeout
  if (statusCode === 429) return true; // Too many requests
  return false;
}

function isRetriable(error) {
  if (error.statusCode) {
    return isStatusCodeRetriable(error.statusCode);
  }
  return retriableErrorCodes.has(error.code);
}

async function hattipRequestWithRetries(options) {
  const { retryBackoff } = options;

  const failedAttempts = [];
  const withFailedAttempts = (thing) => {
    Object.freeze(failedAttempts);
    setEnumerable(thing, 'failedAttempts', failedAttempts);
    setEnumerable(thing, 'attemptCount', failedAttempts.length + 1);
    return thing;
  };

  const attemptRequest = async () => {
    try {
      const response = await hattipRequest({ ...options, retryBackoff: null });
      return withFailedAttempts(response);
    } catch (error) {
      if (!isRetriable(error)) {
        throw withFailedAttempts(error);
      }

      const delay = retryBackoff({
        retryIndex: failedAttempts.length - 1,
        error,
      });
      if (delay === false) {
        throw withFailedAttempts(error);
      }

      failedAttempts.push(error);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return attemptRequest();
    }
  };
  return attemptRequest();
}

function createClientRequest(options) {
  if (options.createClientRequest) {
    return options.createClientRequest(options);
  }
  const requestArgs = options.url ? [options.url, options] : [options];
  return protocolModule(options).request(...requestArgs);
}

function hattipRequest(options) {
  const {
    measureTimings = false,
    body,
    retryBackoff,
    timeoutRequest,
    timeoutResponse,
    timeoutIdleSocket,
    timeoutTotal,
  } = options;
  const optionsIncludeTimeout =
    timeoutRequest ||
    timeoutResponse ||
    timeoutIdleSocket ||
    timeoutTotal ||
    options.timeout;

  if (retryBackoff) {
    return hattipRequestWithRetries(options);
  }

  const clientRequest = createClientRequest(options);
  const timings =
    measureTimings || optionsIncludeTimeout
      ? hattipTimeKeeper(clientRequest, {
          timeoutRequest,
          timeoutResponse,
          timeoutIdleSocket,
          timeoutTotal,
        })
      : null;

  const result = new Promise((resolve, reject) => {
    clientRequest.on('error', (error) => {
      if (!clientRequest.aborted) reject(error);
    });

    clientRequest.once('response', (incomingMessage) => {
      incomingMessage.once('error', reject);

      let rawResponseBody = '';
      incomingMessage.on('data', (chunk) => (rawResponseBody += chunk));

      incomingMessage.once('end', () => {
        const response = new HattipResponse(clientRequest, incomingMessage);
        if (timings) {
          setEnumerable(response, 'timings', timings);
        }

        let responseBody = rawResponseBody || null;
        if (rawResponseBody && isIncomingMessageJson(incomingMessage)) {
          try {
            responseBody = JSON.parse(rawResponseBody);
          } catch (parseError) {
            setEnumerable(response, 'body', responseBody);
            const hattipError = new HattipResponseError(
              'Failed to parse response body',
              response,
            );
            reject(hattipError);
            return;
          }
        }

        setEnumerable(response, 'body', responseBody);

        if (response.ok) {
          resolve(response);
        } else {
          reject(new HattipResponseError('Non-2xx status code', response));
        }
      });
    });

    if (body) {
      clientRequest.setHeader('content-type', 'application/json');
      clientRequest.write(JSON.stringify(body));
    }

    clientRequest.end();
  });

  result.clientRequest = clientRequest;
  return result;
}

exports.hattipRequest = hattipRequest;
exports.HattipResponse = HattipResponse;
exports.HattipResponseError = HattipResponseError;
