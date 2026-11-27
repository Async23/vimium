import "./test_helper.js";
import { JSDOM } from "jsdom";
import "../../lib/keyboard_utils.js";
import "../../lib/settings.js";
import "../../content_scripts/mode.js";
import "../../content_scripts/link_hints.js";

context("Script-bound link hints", () => {
  let page, doc;
  const watcher = new URL("../../content_scripts/click_watch_main.js", import.meta.url);
  const hasHint = (element) => LocalHints.getLocalHintsForElement(element).length === 1;
  const noop = () => {};

  setup(async () => {
    page = new JSDOM("<body></body>", { runScripts: "outside-only" }).window;
    doc = page.document;
    page.eval(await Deno.readTextFile(watcher));
    stub(LocalHints, "checkForAngularJs", () => false);
    stub(globalThis, "DomUtils", { getVisibleClientRect: () => ({}) });
  });
  teardown(() => page.close());

  should(
    "track distinct listeners by type, identity and capture, including detached nodes",
    async () => {
      const el = doc.createElement("div");
      el.addEventListener("click", noop);
      el.addEventListener("click", noop);
      el.addEventListener("pointerup", noop, true);
      el.addEventListener("keydown", noop);
      el.removeEventListener("click", () => {});
      await Promise.resolve();
      doc.body.append(el);
      assert.isTrue(hasHint(el));
      el.removeEventListener("click", noop);
      el.removeEventListener("pointerup", noop, false);
      await Promise.resolve();
      assert.isTrue(hasHint(el));
      el.removeEventListener("pointerup", noop, { capture: true });
      await Promise.resolve();
      assert.isFalse(hasHint(el));
    },
  );

  should(
    "offer pointer blocks under a delegate and leave inherited cursors and plain text alone",
    async () => {
      doc.body.innerHTML = '<section><div style="cursor:pointer"><span style="cursor:pointer">tab' +
        '</span></div><p>text</p></section><aside style="cursor:pointer">outside</aside>';
      doc.querySelector("section").addEventListener("mousedown", noop);
      await Promise.resolve();
      assert.isTrue(hasHint(doc.querySelector("div")));
      assert.isFalse(hasHint(doc.querySelector("span")));
      assert.isFalse(hasHint(doc.querySelector("p")));
      assert.isFalse(hasHint(doc.querySelector("aside")));
    },
  );

  should("combine page-level delegates and clear them when the last one is removed", async () => {
    doc.body.innerHTML = '<div style="cursor:pointer">tab</div><p>text</p>';
    const roots = [page, doc, doc.documentElement, doc.body];
    for (const root of roots) root.addEventListener("click", noop);
    await Promise.resolve();
    for (const root of roots) {
      assert.isTrue(hasHint(doc.querySelector("div")));
      assert.isFalse(hasHint(doc.querySelector("p")));
      root.removeEventListener("click", noop);
      await Promise.resolve();
    }
    assert.isFalse(hasHint(doc.querySelector("div")));
  });

  should("respect once, re-registration inside a callback and abort signals", async () => {
    const el = doc.createElement("div");
    const controller = new page.AbortController();
    controller.signal.addEventListener("abort", (event) => event.stopImmediatePropagation());
    let calls = 0;
    const listener = {
      handleEvent(event) {
        calls++;
        event.stopImmediatePropagation();
        if (calls === 1) {
          el.addEventListener("click", this, { signal: controller.signal });
        }
      },
    };
    el.addEventListener("click", listener, { once: true });
    await Promise.resolve();
    assert.isTrue(hasHint(el));
    el.click();
    await Promise.resolve();
    assert.isTrue(hasHint(el));
    el.click();
    controller.abort();
    el.addEventListener("click", noop, { signal: controller.signal });
    await Promise.resolve();
    el.click();
    assert.equal(2, calls);
    assert.isFalse(hasHint(el));
  });

  should("remove a one-shot hint even if its callback stops propagation", async () => {
    const el = doc.createElement("div");
    el.addEventListener("click", (event) => event.stopImmediatePropagation(), { once: true });
    await Promise.resolve();
    assert.isTrue(hasHint(el));
    el.click();
    await Promise.resolve();
    assert.isFalse(hasHint(el));
  });

  should("retain native hints and respect disabled controls", async () => {
    const button = doc.createElement("button");
    button.addEventListener("pointerdown", noop);
    await Promise.resolve();
    const [hint] = LocalHints.getLocalHintsForElement(button);
    assert.isFalse(hint.possibleFalsePositive);
    button.disabled = true;
    assert.isFalse(hasHint(button));
  });

  should("recognize delegated controls inside shadow roots", async () => {
    const host = doc.body.appendChild(doc.createElement("section"));
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<div style="cursor:pointer">tab</div>';
    shadow.addEventListener("touchstart", noop);
    await Promise.resolve();
    assert.isTrue(hasHint(shadow.firstElementChild));
    assert.isFalse(hasHint(host));
    shadow.removeEventListener("touchstart", noop);
    await Promise.resolve();
    assert.isFalse(hasHint(shadow.firstElementChild));
  });

  should("install once and read page-provided option getters once", async () => {
    const el = doc.createElement("div");
    const add = page.EventTarget.prototype.addEventListener;
    page.eval(await Deno.readTextFile(watcher));
    assert.isTrue(add === page.EventTarget.prototype.addEventListener);
    let reads = 0;
    el.addEventListener("click", noop, {
      get capture() {
        reads++;
        return true;
      },
    });
    el.removeEventListener("click", noop, true);
    await Promise.resolve();
    assert.equal(1, reads);
    assert.isFalse(hasHint(el));
  });

  should(
    "recognize React and IDL click props while blocking disabled/inert leaks and cleaning up DOM attributes",
    async () => {
      doc.body.innerHTML = [
        '<div id="root" style="cursor:auto">',
        '  <form id="clobber"><input name="shadowRoot"></form>',
        '  <div id="inline-host" onclick=""><span id="inline-child" style="cursor:pointer">inline</span></div>',
        '  <div id="disabled-btn" class="btn" style="cursor:pointer">disabled under auto root</div>',
        '  <div id="not-allowed-btn" class="btn" style="cursor:not-allowed">blocked btn</div>',
        '  <div id="not-allowed-role" role="button" style="cursor:not-allowed">blocked role</div>',
        '  <div id="player" style="cursor:pointer">',
        '    <div id="like">5286</div>',
        '    <div id="author" style="cursor:auto">@author</div>',
        '    <div id="disabled-cursor" style="cursor:not-allowed">next</div>',
        '    <div id="inert-overlay" style="pointer-events:none">overlay</div>',
        '    <div id="capture-only">panel</div>',
        '    <div id="idl-btn">idl</div>',
        "  </div>",
        "</div>",
      ].join("");
      doc.getElementById("root").addEventListener("click", noop);
      doc.getElementById("player").addEventListener("click", noop);
      await Promise.resolve();

      let inlineOnclickReads = 0;
      Object.defineProperty(doc.getElementById("inline-host"), "onclick", {
        configurable: true,
        get() {
          inlineOnclickReads++;
          return noop;
        },
      });

      const disabledBtn = doc.getElementById("disabled-btn");
      const notAllowedBtn = doc.getElementById("not-allowed-btn");
      const notAllowedRole = doc.getElementById("not-allowed-role");
      const inlineChild = doc.getElementById("inline-child");
      const like = doc.getElementById("like");
      const author = doc.getElementById("author");
      const disabledCursor = doc.getElementById("disabled-cursor");
      const inertOverlay = doc.getElementById("inert-overlay");
      const captureOnly = doc.getElementById("capture-only");
      const idlBtn = doc.getElementById("idl-btn");

      disabledBtn.__reactProps$abc = { onClick: noop, disabled: true };
      like.__reactProps$abc = { onClick: noop };
      author.__reactEventHandlers$xyz = { onClick: noop };
      disabledCursor.__reactProps$abc = { onClick: noop };
      inertOverlay.__reactProps$abc = { onClick: noop };
      captureOnly.__reactProps$abc = { onClickCapture: noop, onPointerDown: noop };
      idlBtn.onclick = noop;

      assert.isFalse(hasHint(disabledBtn));
      assert.isFalse(hasHint(notAllowedBtn));
      assert.isFalse(hasHint(notAllowedRole));
      assert.isTrue(hasHint(inlineChild));
      assert.equal(0, inlineOnclickReads);
      assert.isTrue(hasHint(like));
      assert.isTrue(hasHint(author));
      assert.isFalse(hasHint(disabledCursor));
      assert.isFalse(hasHint(inertOverlay));
      assert.isFalse(hasHint(captureOnly));
      assert.isTrue(hasHint(idlBtn));

      // Transient markers must be cleaned up immediately after each scan.
      assert.isFalse(like.hasAttribute("data-vimium-prop-click"));
      assert.isFalse(disabledBtn.hasAttribute("data-vimium-prop-disabled"));
      assert.isFalse(doc.documentElement.hasAttribute("data-vimium-prop-click-root"));

      // Re-renders that drop onClick or clear onclick must retire markers on the next scan.
      like.__reactProps$abc = { onMouseEnter: noop };
      idlBtn.onclick = null;
      assert.isFalse(hasHint(like));
      assert.isFalse(hasHint(idlBtn));
    },
  );

  should(
    "support page-level onclick delegates and replace prop sync on repeated reloads",
    () => {
      const freshPage = new JSDOM(
        '<body><div id="item" style="cursor:pointer">item</div><p id="plain">plain</p></body>',
        { runScripts: "outside-only" },
      ).window;
      try {
        let oldTeardownRuns = 0;
        freshPage[Symbol.for("vimium.clickWatch")] = true;
        freshPage[Symbol.for("vimium.clickPropSync")] = {
          teardown() {
            oldTeardownRuns++;
          },
        };
        freshPage.eval(Deno.readTextFileSync(watcher));
        assert.equal(1, oldTeardownRuns);

        freshPage.document.onclick = noop;
        assert.isTrue(hasHint(freshPage.document.getElementById("item")));
        assert.isFalse(
          freshPage.document.documentElement.hasAttribute("data-vimium-prop-click-root"),
        );
        assert.isFalse(hasHint(freshPage.document.getElementById("plain")));
        freshPage.document.onclick = null;
        assert.isFalse(hasHint(freshPage.document.getElementById("item")));
      } finally {
        freshPage.close();
      }
    },
  );
});

context("With insufficient link characters", () => {
  setup(async () => {
    await Settings.onLoaded();
  });

  teardown(async () => {
    await Settings.clear();
  });

  should("throw error in AlphabetHints", async () => {
    await Settings.set("linkHintCharacters", "ab");
    new AlphabetHints();
    await Settings.set("linkHintCharacters", "a");
    assert.throwsError(() => new AlphabetHints(), "Error");
  });

  should("throw error in FilterHints", async () => {
    await Settings.set("linkHintNumbers", "12");
    new FilterHints();
    await Settings.set("linkHintNumbers", "1");
    assert.throwsError(() => new FilterHints(), "Error");
  });
});
