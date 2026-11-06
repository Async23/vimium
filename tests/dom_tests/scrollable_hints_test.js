context("Scrollable area hints", () => {
  let fixture;

  const createScroller = (tag = "div", parent = fixture) => {
    const element = document.createElement(tag);
    Object.assign(element.style, {
      display: "block",
      width: "220px",
      height: "80px",
      overflow: "auto",
      margin: "0",
    });
    element.innerHTML = '<div style="height:300px">Scrollable content</div>';
    parent.appendChild(element);
    return element;
  };

  const fixtureHints = () =>
    LocalHints.getLocalHints(false, true)
      .filter((hint) => fixture.contains(hint.element));

  const activateScrollableHints = () => {
    let request;
    stub(chrome.runtime, "sendMessage", (message) => request = message);
    LinkHints.activateModeToFocusScrollable();
    assert.equal("prepareToActivateLinkHintsMode", request.handler);
    HintCoordinator.getHintDescriptors(request);
    HintCoordinator.activateMode({
      frameIdToHintDescriptors: {},
      modeIndex: request.modeIndex,
      originatingFrameId: frameId,
    });
    return HintCoordinator.linkHintsMode;
  };

  const selectScroller = (element) => {
    const mode = activateScrollableHints();
    const marker = mode.hintMarkers.find((m) => m.localHint?.element === element);
    assert.isTrue(marker != null);
    mode.activateLink(marker);
  };

  setup(() => {
    Mode.reset();
    handlerStack.reset();
    installModes();
    stub(Settings._settings, "filterLinkHints", false);
    stub(Settings._settings, "smoothScroll", false);
    stub(globalThis, "windowIsFocused", () => true);
    fixture = document.getElementById("test-div");
    fixture.innerHTML = "";
    document.scrollingElement.scrollTop = 0;
  });

  teardown(() => {
    HintCoordinator.exit({ isSuccess: false });
    fixture.innerHTML = "";
    fixture.removeAttribute("style");
    Mode.reset();
    handlerStack.reset();
    document.scrollingElement.scrollTop = 0;
  });

  should("offer scrollable elements of any tag, without ordinary links and buttons", () => {
    fixture.innerHTML = '<a href="#">Link</a><button>Button</button>';
    const elements = ["div", "section", "main", "pre"].map((tag) => createScroller(tag));
    assert.equal(elements, fixtureHints().map((hint) => hint.element));
  });

  should(
    "find vertical and horizontal targets at their end without changing their positions",
    () => {
      const vertical = createScroller();
      vertical.scrollTop = vertical.scrollHeight;
      const horizontal = createScroller();
      horizontal.style.overflowY = "hidden";
      horizontal.firstElementChild.style.height = "40px";
      horizontal.firstElementChild.style.width = "600px";
      horizontal.scrollLeft = horizontal.scrollWidth;
      const positions = [vertical.scrollTop, horizontal.scrollLeft];
      assert.isTrue(positions.every((position) => position > 0));
      assert.equal([vertical, horizontal], fixtureHints().map((hint) => hint.element));
      assert.equal(positions, [vertical.scrollTop, horizontal.scrollLeft]);
    },
  );

  should("switch the scroll target without clicking it, and allow selecting it again", () => {
    const left = createScroller();
    const right = createScroller();
    let clickCount = 0;
    right.addEventListener("click", () => clickCount++);
    selectScroller(right);
    Scroller.scrollBy("y", 40, 1, false);
    assert.equal(40, right.scrollTop);
    assert.equal(0, left.scrollTop);
    assert.equal(0, clickCount);
    assert.isTrue(fixtureHints().some((hint) => hint.element === right));
    selectScroller(left);
    Scroller.scrollBy("y", 30, 1, false);
    assert.equal(30, left.scrollTop);
    assert.equal(40, right.scrollTop);
  });

  should("offer the main page and switch back to it from an inner scroller", () => {
    const inner = createScroller();
    fixture.style.height = "1600px";
    const root = document.scrollingElement;
    const hint = LocalHints.getLocalHints(false, true).find((hint) => hint.element === root);
    assert.isTrue(hint != null);
    assert.equal(innerWidth, hint.rect.width);
    assert.equal(innerHeight, hint.rect.height);
    selectScroller(inner);
    Scroller.scrollBy("y", 20, 1, false);
    selectScroller(root);
    Scroller.scrollBy("y", 40, 1, false);
    assert.equal(40, root.scrollTop);
    assert.equal(20, inner.scrollTop);
  });

  should("offer both nested scroll containers", () => {
    const outer = createScroller();
    const inner = createScroller("section", outer.firstElementChild);
    inner.style.height = "40px";
    assert.equal([outer, inner], fixtureHints().map((hint) => hint.element));
  });

  should("find scroll targets in an open shadow root", () => {
    const host = document.createElement("div");
    fixture.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const scroller = createScroller("section", root);
    assert.isTrue(LocalHints.getLocalHints(false, true).some((hint) => hint.element === scroller));
  });

  should("exclude hidden, clipped, and fully covered scroll containers", () => {
    const hidden = createScroller();
    hidden.style.visibility = "hidden";
    const clipped = createScroller();
    clipped.style.overflow = "hidden";
    const covered = createScroller();
    const cover = document.createElement("div");
    const rect = covered.getBoundingClientRect();
    Object.assign(cover.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      background: "white",
      zIndex: "1000",
    });
    fixture.appendChild(cover);
    assert.equal([], fixtureHints());
  });

  should("focus the owning frame when selecting a target in an unfocused frame", () => {
    const scroller = createScroller();
    stub(globalThis, "windowIsFocused", () => false);
    stub(globalThis, "focusThisFrame", ensureCalled(() => {}));
    selectScroller(scroller);
    Scroller.scrollBy("y", 40, 1, false);
    assert.equal(40, scroller.scrollTop);
  });

  should("support filtered hints and cancel without changing the scroll target", () => {
    const left = createScroller();
    const right = createScroller();
    selectScroller(left);
    stub(Settings._settings, "filterLinkHints", true);
    const mode = activateScrollableHints();
    assert.equal("focus-scrollable", mode.mode.name);
    assert.isTrue(mode.markerMatcher instanceof FilterHints);
    mode.hintMode.exit({ key: "Escape" });
    Scroller.scrollBy("y", 40, 1, false);
    assert.equal(40, left.scrollTop);
    assert.equal(0, right.scrollTop);
  });

  should("explain when no scrollable targets are available", () => {
    const messages = [];
    stub(HUD, "show", (message) => messages.push(message));
    const mode = activateScrollableHints();
    assert.equal("No scrollable areas to select.", messages[messages.length - 1]);
    assert.equal(null, mode.hintMode);
  });
});
