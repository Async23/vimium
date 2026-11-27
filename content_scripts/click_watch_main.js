// This script runs in the page's world. Only the presence of listeners crosses into Vimium's
// isolated world, via DOM attributes. Page callbacks are always registered with their original
// identity so native dispatch and removal also work with listeners installed before this script.
(() => {
  const installed = Symbol.for("vimium.clickWatch");
  const propSyncInstalled = Symbol.for("vimium.clickPropSync");
  const syncEvent = "vimium:sync-click-props";
  const clearEvent = "vimium:clear-click-props";
  const propAttr = "data-vimium-prop-click";
  const propDisabledAttr = "data-vimium-prop-disabled";
  const propRootAttr = "data-vimium-prop-click-root";

  const prototype = EventTarget.prototype;
  const add = prototype.addEventListener;
  const remove = prototype.removeEventListener;
  const stopImmediate = Event.prototype.stopImmediatePropagation;
  const hasAttr = Element.prototype.hasAttribute;
  const toggleAttr = Element.prototype.toggleAttribute;
  const docQueryAll = Document.prototype.querySelectorAll;
  const shadowQueryAll = ShadowRoot.prototype.querySelectorAll;
  const getShadowRoot = Object.getOwnPropertyDescriptor(Element.prototype, "shadowRoot")?.get;
  const hasOwn = Object.prototype.hasOwnProperty;
  const ownKeys = Object.keys;

  function isPageTarget(target) {
    return target === globalThis || target === document || target === document.documentElement ||
      target === document.body;
  }

  globalThis[propSyncInstalled]?.teardown?.();
  {
    const knownReactKeys = [];
    let markedElements = [];

    const isReactKey = (key) =>
      key.startsWith("__reactProps$") || key.startsWith("__reactEventHandlers$");

    const classifyReactProps = (props) => {
      if (!props || typeof props !== "object") return null;
      if (props.disabled === true) return "disabled";
      if (typeof props.onClick === "function") return "click";
      return null;
    };

    const inspectReactProps = (element) => {
      let sawReactProps = false;
      let state = null;
      for (let i = 0; i < knownReactKeys.length; i++) {
        const key = knownReactKeys[i];
        if (hasOwn.call(element, key)) {
          sawReactProps = true;
          const res = classifyReactProps(element[key]);
          if (res === "click") return "click";
          if (res === "disabled") state = "disabled";
        }
      }
      if (sawReactProps) return state;

      for (const key of ownKeys(element)) {
        if (isReactKey(key)) {
          if (!knownReactKeys.includes(key)) knownReactKeys.push(key);
          const res = classifyReactProps(element[key]);
          if (res === "click") return "click";
          if (res === "disabled") state = "disabled";
        }
      }
      return state;
    };

    const inspectElementProps = (element) => {
      try {
        const reactState = inspectReactProps(element);
        if (reactState != null) return reactState;
        if (!hasAttr.call(element, "onclick") && typeof element.onclick === "function") {
          return "click";
        }
        return null;
      } catch {
        return null;
      }
    };

    const hasPageRootClickProp = (root) => {
      try {
        return root != null &&
          (!(root instanceof Element) || !hasAttr.call(root, "onclick")) &&
          typeof root.onclick === "function";
      } catch {
        return false;
      }
    };

    const clearPropClicks = (event) => {
      if (event) stopImmediate.call(event);
      const docEl = document.documentElement;
      if (docEl instanceof Element && hasAttr.call(docEl, propRootAttr)) {
        toggleAttr.call(docEl, propRootAttr, false);
      }
      for (const element of markedElements) {
        if (hasAttr.call(element, propAttr)) toggleAttr.call(element, propAttr, false);
        if (hasAttr.call(element, propDisabledAttr)) {
          toggleAttr.call(element, propDisabledAttr, false);
        }
      }
      markedElements = [];
    };

    const syncPropClicks = (event) => {
      stopImmediate.call(event);
      clearPropClicks(null);

      const docEl = document.documentElement;
      if (!(docEl instanceof Element)) return;

      const roots = [globalThis, document, docEl, document.body];
      if (roots.some(hasPageRootClickProp)) {
        toggleAttr.call(docEl, propRootAttr, true);
      }

      const visitRoot = (root, queryAll) => {
        for (const element of queryAll.call(root, "*")) {
          if (!isPageTarget(element)) {
            const state = inspectElementProps(element);
            if (state === "click") {
              toggleAttr.call(element, propAttr, true);
              markedElements.push(element);
            } else if (state === "disabled") {
              toggleAttr.call(element, propDisabledAttr, true);
              markedElements.push(element);
            } else {
              if (hasAttr.call(element, propAttr)) toggleAttr.call(element, propAttr, false);
              if (hasAttr.call(element, propDisabledAttr)) {
                toggleAttr.call(element, propDisabledAttr, false);
              }
            }
          }
          const shadow = getShadowRoot?.call(element);
          if (shadow) {
            visitRoot(shadow, shadowQueryAll);
          }
        }
      };

      visitRoot(document, docQueryAll);
    };

    add.call(document, syncEvent, syncPropClicks, true);
    add.call(document, clearEvent, clearPropClicks, true);
    globalThis[propSyncInstalled] = {
      teardown() {
        clearPropClicks(null);
        remove.call(document, syncEvent, syncPropClicks, true);
        remove.call(document, clearEvent, clearPropClicks, true);
      },
    };
  }

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
  const listeners = new WeakMap();
  const dirty = new Set();

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
