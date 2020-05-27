# hattip

[![Build Status](https://travis-ci.com/davidtheclark/hattip.svg?branch=master)](https://travis-ci.com/davidtheclark/hattip)

Hattip is a promise-based HTTP client for Node.js that makes it easy to follow the most important rules of interservice network etiquette while remaining simple and direct.

What are the most important rules of interservice network etiquette? Use retries and timeouts.

## Table of contents

- [Design](#design)
- [API](#api)
  - [Parameters](#parameters)
  - [Returns](#returns)
- [Retries](#retries)
  - [hattipBackoff](#hattipbackoff)
  - [Examples](#examples)
- [Timings and timeouts](#timings-and-timeouts)

## Design

Hattip has the following goals:

- A simple API that makes (and keeps) Promises.
- All the options available to `http.request`, including the meta-option to use `http.request` yourself, directly, and give Hattip the `ClientRequest`.
- Flexible retry support.
- Flexible timeout support.
- Timing measurements, to help you understand your request lifecycle and decide what timeouts to use.
- Auto-parsed JSON request and response bodies (a trivial perk).

Hattip will not try to support other fancy HTTP client features unless they're shown to be critically entangled with those above. If you want more complex features, you can use a more complex client library. Hattip bundles together the features above because: (1) Promises and retries are natural partners. (2) Timeouts and timing measurements are natural partners. (3) Promises, retries, and timeouts seem to be the most important generic features for interservice clients.

(Hattip will not try to support streams, because generically supporting both Promises-with-retries and streams requires more complexity than Hattip wants.)

## API

```js
const { hattip } = require('hattip');

hattip(...parameters);
hattip.request(...parameters);
hattip.get(...parameters);
hattip.post(...parameters);
hattip.put(...parameters);
hattip.patch(...parameters);
hattip.delete(...parameters);
```

`hattip` and `hattip.request` are equivalent. Then there are shortcut functions for calling `hattip` with a specific HTTP method. All of these have the same signature.

### Parameters

```
hattip(options)
hattip(url[, options])
hattip(createClientRequest[, options])
```

If the first argument is a string or `URL`, it is the `url` parameter, as in the native `http.request(url[, options])`.

If the first argument is a function (`createClientRequest`), it must be a synchronous function that returns a native `ClientRequest`, such as the one you get from `http.request`.

`options` extend the options of the native `http.request`. All of the native options are available, as well as the following Hattip options:

- **`retry`** `{Function}`: A function that defines retry behavior. If this is not provided, no retries are attempted. See ["Retries"].
- **`timeoutRequest`** `{number}`: See ["Timings and timeouts"].
- **`timeoutResponse`** `{number}`: See ["Timings and timeouts"].
- **`timeoutEnd`** `{number}`: See ["Timings and timeouts"].
- **`timeoutIdleSocket`** `{number}`: See ["Timings and timeouts"].
- **`measureTimings`** `{boolean}`: If `true`, the [`HattipResponse`] will have a `timings` property that tells you how long the communication's phases took. `timings` are also provided if any `timeout*` options are set, so this option is only necessary if you don't use any `timeout*` options. See ["Timings and timeouts"].

### Returns

A Promise that settles in one of the following ways:

- Resolves with a [`HattipResponse`], if a response was received with a `2xx` status code.
- Rejects with a [`HattipResponseError`], if a response was received with a non-`2xx` status code.
- Rejects with an `Error`.

If retries are enabled (see ["Retries"]), the settled value will have two additional properties that are useful for troubleshooting:

- `attemptCount {number}`: The total number of attempts made. This number includes the first request (which wasn't a retry, just a try).
- `failedAttempts {Array<HattipResponseError | Error>}`: The results from every prior failed attempt.

For example, if the request received a `503` response once, then retried and got a `503` again, then retried and succeeded with a `200`, the Promise would resolve with a `HattipResponse`, and `response.attemptCount` would be `3` and `response.failedAttempts` would include two `HattipResponseErrors` to look at. If the request tried three times and each time received a `503`, the Promise would reject with a `HattipResponseError` with equivalent properties.

#### `HattipResponse`

Instances have the following properties:

- `statusCode {number}`: From `incomingMessage.statusCode`.
- `ok {boolean}`: `true` if `statusCode` is a `2xx`, as with [the Fetch API's `ok`](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok).
- `headers {Object}`: From `incomingMessage.headers`.
- `body {*}`: The aggregated response body. If the response's `Content-Type` header includes `application/json`, the body is parsed with `JSON.parse()`.
- `timings {Timings}`: If the option `measureTimings` is `true`, this property exposes those timings. See ["Timings and timeouts"].
- `incomingMessage {IncomingMessage}` : The `incomingMessage`. This property is not enumerable.
- `clientRequest {ClientRequest}`: The `clientRequest`. This property is not enumerable.

#### `HattipResponseError`

`HattipResponseError`s represent responses that are not `ok`: they have a non-`2xx` status code.

Instances have the following properties:

- `statusCode {number}`: See `HattipResponse.statusCode`.
- `body {*}`: See `HattipResponse.body`.
- `response {HattipResponse}`: The `HattipResponse`.

## Retries

Here are some edifying articles on retries, from your favorite cloud providers:

- ["Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- ["Implementing exponential backoff"](https://cloud.google.com/iot/docs/how-tos/exponential-backoff)
- ["Retry pattern"](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)

With Hattip, retries are attempted if a `retry` function is provided *and* one of the following is true:

- The `error` has a `code` property indicating a network failure: `ETIMEDOUT`, `ECONNRESET`, `EADDRINUSE`, `ECONNREFUSED`, `EPIPE`, `ENOTFOUND`, `ENETUNREACH`, `EAI_AGAIN`.
- The `error` is a `HattipResponseError` with a `statusCode` that is `>= 500`, `408`, or `429`.
- `retry` does not return `false`.

Hattip does not try to block you from using retries on non-idempotent requests (like many `POST`s): when you make requests that are not idempotent, do not provide `retryBackoff`.

`retry` must be a synchronous function that returns the number of milliseconds to wait before retrying, or `false` if no more retries should be attempted. The `retry` function receives a single object argument with the following properties:

- `retryIndex {number}`: Starts at `0`, since this function is first called on the first retry.
- `error {Error | HattipResponseError}`: The error that triggered the retry. If it's an `Error` object, it's probably from the `ClientRequest` (e.g. a TCP connection failure); and if it's a [`HattipResponseError`], the response was received but indicated a retriable failure (e.g. a `503` status code).

### hattipBackoff

You might want a truncated exponential backoff following this general pattern (see the articles linked above): `Math.min(maxTimeout, Math.pow(2, retryIndex) * minTimeout * jitter)`. Also, on the first retry you may might to return a very low number, like `1`, since TCP connection blips can often be overcome with an immediate retry. Or maybe you don't.

Hattip exports the `hattipBackoff` shortcut, which you can use to create your own backoff functions with features like these. **It does provide defaults, but you should think hard about setting your own situation-specific values.** It accepts a single object argument, with the following properties, and returns a backoff function you can pass to `retry`:

- **`limit`** `{number}`: Maximum number of retries to attempt. Default: `3`.
- **`minDelay`** `{number}`: Minimum number of milliseconds to wait before retrying. Default: `100`.
- **`maxDelay`** `{number}`: Maximum number of milliseconds to wait before retrying. Default: `1000`.
- **`jitter`** `{boolean}`: If `true`, the delay will be multipled by a random number between 1 and 2. Default: `true`.
- **`fastFirst`** `{boolean}`: If `true`, the delay of the first retry will be `1` millisecond. Default: `false`.

### Examples

Each example shows the same backoff accomplished manually or with `hattipBackoff`.

```js
const { hattipBackoff } = require('hattip');

// Retry once right away, then up to 5 more times (a total of 6) with a
// maximum delay of 2s and some jitter.
hattip.get(url, {
  retry({ retryIndex }) {
    if (retryIndex === 0) return 1;
    if (retryIndex > 5) return false;
    return Math.min(2000, Math.pow(2, retryIndex) * 50 * (Math.random() + 1));
  }
});
hattip.get(url, {
  retry: hattipBackoff({
    limit: 6,
    minDelay: 50,
    maxDelay: 2000,
    fastFirst: true,
  })
});

// Retry like the AWS SDK.
hattip.get(url, {
  retryBackoff({ retryIndex }) {
    if (retryIndex > 3) return false;
    return Math.random() * Math.pow(2, retryIndex) * 100
  }
});
// Not quite the same jitter
hattip.get(url, {
  retry: hattipBackoff({
    maxDelay: Infinity,
    jitter: false,
  })
});
// 188.4235818647642, 355.48425553603977, 732.9242677035347
// 63.28274629759672, 205.58176727597007, 295.59627027146985


// Retry at a leisurely pace, up to 5 times, with no jitter.
hattip.get(url, {
  retryBackoff({ retryIndex }) {
    if (retryIndex === 6) return false;
    return Math.min(10000, Math.pow(2, retryIndex) * 1000);
  }
});
hattip.get(url, {
  retry: hattipBackoff({
    limit: 5,
    minDelay: 1000,
    maxDelay: 10000,
    jitter: false,
  })
});
// 2000, 4000, 8000, 10000, 10000
```

## Timings and timeouts

If you set `measureTimings` to `true` or use any of the timeout options, the [`HattipResponse`] will have a `timings` property showing the duration of the following successive communication phases:

- `socket`: Ends with the assignment of a socket (the `socket` event of `ClientRequest`).
- `dns`: Ends with the DNS resolution of the request's host (the `lookup` event of `Socket`).
- `tcpConnect`: Ends with the successful establishment of a TCP connection (the `connect` event of `Socket`).
- `tls`: Ends with a successful TLS handshake (the `secureConnect` event of `Socket`). Will be `0` if the request does not involve TLS.
- `upload`: Ends when the request has finished sending its data (the `finish` event of `ClientRequest`).
- `response`: Ends when the client has received the first bytes of the response (the `response` event of `ClientRequest`).
- `download`: Ends when the client has consumed all the response's data (the `end` event of `IncomingMessage`).
- `total`: The total duration of all the above phases.

Phases will be `0` if they are skipped (e.g. an error occurred so we didn't make it to the end, or no TCP connection needs to be made because the request is using an existing persistent connection).

With this information in hand, you can determine reasonable timeout values. You can set one, none, or all of Hattip's timeout options. In every case, if the timeout is reached, Hattip will abort the request and reject with a `HattipTimeoutError`.

**`timeoutIdleSocket`**: The native `http.request` offers a single `timeout` option (the equivalent of `Socket#setTimeout`). If you use it, a `timeout` event will be emitted from the `ClientRequest` if the socket stays idle for your timeout period, at an point during communication. Hattip's `timeoutIdleSocket` option augments this feature by automatically aborting the timed-out request, not just emitting the event.

**`timeoutRequest`**: This timeout regulates the period between creating the request and sending it all to the server. Relevant timings: `socket + dns + tcpConnect + tls + upload`.

**`timeoutResponse`**: This timeout regulates the period between sending the request and receiving the first bytes of the response. Relevant timings: `response`.

**`timeoutTotal`**: This timeout regulates the total period between creating the request and consuming all the data from the response. Relevant timings: `total`.

Further reading:

- [http-timer](https://github.com/szmarczak/http-timer)
- [Got's timeouts](https://github.com/sindresorhus/got)
- [Needle's timeouts](https://github.com/tomas/needle)
- ["Understanding & Measuring HTTP Timings with Node.js"](https://blog.risingstack.com/measuring-http-timings-node-js/)

[`hattipresponse`]: #hattipresponse

[`hattipresponseerror`]: #hattipresponseerror

["retries"]: #retries

["Timings and timeouts"]: #timings-and-timeouts
