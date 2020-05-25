'use strict';

const { performance } = require('perf_hooks');
const { TLSSocket } = require('tls');

class HattipTimeoutError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    Object.defineProperty(this, 'code', {
      value: 'ETIMEDOUT',
      enumerable: true,
    });
  }
}

class SubEmitter {
  constructor(emitter) {
    this._emitter = emitter;
    this._listeners = [];
  }

  prependOnceListener(event, listener) {
    this._emitter.prependOnceListener(event, listener);
    this._listeners.push({ event, listener });
  }

  removeAllListeners() {
    for (const { event, listener } of this._listeners) {
      this._emitter.removeListener(event, listener);
    }
  }
}

class PhaseTimer {
  constructor(phases) {
    this._offset = performance.now();
    this.timings = phases.reduce((result, phase) => {
      result[phase] = 0;
      return result;
    }, {});
  }

  endPhase(name) {
    // istanbul ignore if
    if (this.timings[name] === undefined)
      throw new Error(`Unknown phase "${name}"`);
    const time = performance.now() - this._offset;
    this.timings[name] = time - this.timings.total;
    this.timings.total = time;
  }
}

function hattipTimeKeeper(req, options = {}) {
  const {
    timeoutRequest,
    timeoutResponse,
    timeoutIdleSocket,
    timeoutTotal,
  } = options;

  const timer = new PhaseTimer([
    'socket',
    'dns',
    'tcpConnect',
    'tls',
    'upload',
    'response',
    'download',
    'total',
  ]);
  const reqSubEmitter = new SubEmitter(req);
  let socketSubEmitter;
  let resSubEmitter;

  const timeoutAbort = (timeoutName) => {
    const message = `Timeout "${timeoutName}" triggered after ${options[timeoutName]}ms`;
    req.emit('error', new HattipTimeoutError(message));
    req.abort();
  };

  const timeouts = {};
  const clearTimeouts = () => {
    for (const timeout of Object.values(timeouts)) {
      clearTimeout(timeout);
    }
  };
  if (timeoutRequest) {
    timeouts.timeoutRequest = setTimeout(
      () => timeoutAbort('timeoutRequest'),
      timeoutRequest,
    ).unref();
  }
  if (timeoutTotal) {
    timeouts.timeoutTotal = setTimeout(
      () => timeoutAbort('timeoutTotal'),
      timeoutTotal,
    ).unref();
  }

  const onEnd = () => {
    clearTimeouts();
    timer.endPhase('download');
    reqSubEmitter.removeAllListeners();
    // istanbul ignore else
    if (socketSubEmitter) socketSubEmitter.removeAllListeners();
    if (resSubEmitter) resSubEmitter.removeAllListeners();
  };

  const onSocket = (socket) => {
    timer.endPhase('socket');

    socketSubEmitter = new SubEmitter(socket);

    if (timeoutIdleSocket) {
      socket.setTimeout(timeoutIdleSocket, () =>
        timeoutAbort('timeoutIdleSocket'),
      );
    }

    const checkTls = () => {
      if (
        socket instanceof TLSSocket === true &&
        !socket.authorized &&
        !socket.authorizationError
      ) {
        socketSubEmitter.prependOnceListener('secureConnect', () => {
          timer.endPhase('tls');
        });
      }
    };

    if (socket.connecting) {
      socketSubEmitter.prependOnceListener('lookup', () => {
        timer.endPhase('dns');
      });
      socketSubEmitter.prependOnceListener('connect', () => {
        timer.endPhase('tcpConnect');
        checkTls();
      });
    } else {
      checkTls();
    }
  };

  const onResponse = (res) => {
    clearTimeout(timeouts.timeoutResponse);
    timer.endPhase('response');

    resSubEmitter = new SubEmitter(res);
    resSubEmitter.prependOnceListener('error', onEnd);
    resSubEmitter.prependOnceListener('end', onEnd);
  };

  const onFinish = () => {
    clearTimeout(timeouts.timeoutRequest);
    timer.endPhase('upload');
    if (timeoutResponse) {
      timeouts.timeoutResponse = setTimeout(
        () => timeoutAbort('timeoutResponse'),
        timeoutResponse,
      ).unref();
    }
  };

  reqSubEmitter.prependOnceListener('error', onEnd);
  reqSubEmitter.prependOnceListener('socket', onSocket);
  reqSubEmitter.prependOnceListener('finish', onFinish);
  reqSubEmitter.prependOnceListener('response', onResponse);

  return timer.timings;
}

exports.hattipTimeKeeper = hattipTimeKeeper;
exports.HattipTimeoutError = HattipTimeoutError;
