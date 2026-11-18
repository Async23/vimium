// This script runs in the page's world. Only the presence of listeners crosses into Vimium's
// isolated world, via DOM attributes. Page callbacks are always registered with their original
// identity so native dispatch and removal also work with listeners installed before this script.
(() => {
  const installed = Symbol.for("vimium.clickWatch");
  if (globalThis[installed]) return;

  const types = new Set([
    "click",
    "dblclick",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
  ]);
  const prototype = EventTarget.prototype;
  const add = prototype.addEventListener;
  const remove = prototype.removeEventListener;
  const listeners = new WeakMap();
  const dirty = new Set();

  function isPageTarget(target) {
    return target === globalThis || target === document || target === document.documentElement ||
      target === document.body;
  }

  function canObserve(target, type, listener) {
    return types.has(type) && listener != null &&
      (typeof listener === "function" || typeof listener === "object") &&
      (target instanceof Element || target instanceof ShadowRoot || isPageTarget(target));
  }

  function flush() {
    const batch = Array.from(dirty);
    dirty.clear();
    for (const target of batch) {
      if (isPageTarget(target)) {
        const roots = [globalThis, document, document.documentElement, document.body];
        document.documentElement?.toggleAttribute(
          "data-vimium-click-root",
          roots.some((root) => listeners.has(root)),
        );
      } else if (target instanceof ShadowRoot) {
        target.host.toggleAttribute("data-vimium-click-root", listeners.has(target));
      } else {
        // Frameworks often attach listeners before inserting an element into the document.
        target.toggleAttribute("data-vimium-click", listeners.has(target));
      }
    }
  }

  function changed(target) {
    if (dirty.size === 0) queueMicrotask(flush);
    dirty.add(isPageTarget(target) ? document : target);
  }

  function find(target, type, listener, capture) {
    return listeners.get(target)?.find((entry) =>
      entry.type === type && entry.listener === listener && entry.capture === capture
    );
  }

  function isDictionary(options) {
    return options != null && (typeof options === "object" || typeof options === "function");
  }

  // A long-lived AbortSignal should not retain detached elements through our bookkeeping.
  function weakCallback(callback) {
    const ref = new WeakRef(callback);
    return () => ref.deref()?.();
  }

  prototype.addEventListener = function addEventListener(type, listener, options = undefined) {
    if (!canObserve(this, type, listener)) return add.apply(this, arguments);

    // Read each option once, including getters used by sites to feature-detect passive listeners.
    if (isDictionary(options)) {
      const { capture, once, passive, signal } = options;
      options = { capture, once, passive, signal };
    }
    const capture = !!(isDictionary(options) ? options.capture : options);
    const { once, signal } = options ?? {};
    if (find(this, type, listener, capture) || signal?.aborted) {
      return add.call(this, type, listener, options);
    }

    let abortSignal, onAbort;
    const forget = () => {
      const entries = listeners.get(this);
      entries.splice(entries.indexOf(entry), 1);
      if (!entries.length) listeners.delete(this);
      if (once) remove.call(this, type, forget, capture);
      if (abortSignal) remove.call(abortSignal, "abort", onAbort);
      changed(this);
    };
    const entry = { type, listener, capture, forget };

    // A companion just before a once-listener retires its hint even when the page callback stops
    // propagation or registers itself again. The browser still invokes the original callback.
    if (once) add.call(this, type, forget, { capture, once: true, passive: true, signal });
    add.call(this, type, listener, options);
    if (!listeners.has(this)) listeners.set(this, []);
    listeners.get(this).push(entry);
    if (signal) {
      // A page can stop propagation on its own signal. Its dependent signal still aborts.
      abortSignal = AbortSignal.any([signal]);
      onAbort = weakCallback(forget);
      add.call(abortSignal, "abort", onAbort, { once: true });
    }
    changed(this);
  };

  prototype.removeEventListener = function removeEventListener(
    type,
    listener,
    options = undefined,
  ) {
    if (!canObserve(this, type, listener)) return remove.apply(this, arguments);
    const capture = !!(isDictionary(options) ? options.capture : options);
    remove.call(this, type, listener, capture);
    find(this, type, listener, capture)?.forget();
  };

  globalThis[installed] = true;
  if (!document.documentElement) {
    add.call(document, "DOMContentLoaded", () => changed(document), { once: true });
  }
})();
