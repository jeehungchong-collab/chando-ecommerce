// PDF.js creates one DOMMatrix while its module is evaluated. Cloudflare's
// server renderer does not provide that browser API, so provide the smallest
// server-only stand-in. Browsers keep their native DOMMatrix implementation.
if (typeof globalThis.DOMMatrix === "undefined") {
  class ServerDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  }

  Object.defineProperty(globalThis, "DOMMatrix", {
    configurable: true,
    value: ServerDOMMatrix,
  });
}

