'use strict';

const { URL } = require('url');
const {
  hattipRequest,
  HattipResponse,
  HattipResponseError,
} = require('./hattip-request');
const {
  hattipTimeKeeper,
  HattipTimeoutError,
} = require('./hattip-time-keeper');
const { hattipBackoff } = require('./hattip-backoff');

function normalizeInput(...input) {
  if (typeof input[0] === 'string' || input[0] instanceof URL) {
    return { url: input[0], ...input[1] };
  }
  if (typeof input[0] === 'function') {
    return { createClientRequest: input[0], ...input[1] };
  }
  return { ...input[0] };
}

function wrap(fn) {
  return (...input) => {
    return fn(normalizeInput(...input));
  };
}

const hattip = wrap(hattipRequest);
hattip.request = hattip;
hattip.get = wrap((o) => hattipRequest({ ...o, method: 'GET' }));
hattip.post = wrap((o) => hattipRequest({ ...o, method: 'POST' }));
hattip.put = wrap((o) => hattipRequest({ ...o, method: 'PUT' }));
hattip.patch = wrap((o) => hattipRequest({ ...o, method: 'PATCH' }));
hattip.delete = wrap((o) => hattipRequest({ ...o, method: 'DELETE' }));

exports.hattip = hattip;
exports.hattipBackoff = hattipBackoff;
exports.hattipTimeKeeper = hattipTimeKeeper;
exports.HattipResponse = HattipResponse;
exports.HattipResponseError = HattipResponseError;
exports.HattipTimeoutError = HattipTimeoutError;
