window.__ModuleLoader__.load({
  id: "dsh-plugin-gmt",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    let react = require("react");
    let react_dom = require("react-dom");

    /** 客户端所需服务：槽位、工作区、会话及对话输入机。 */
    const inject = [
      "slots",
      "sessions",
      "workspaces",
      "conversation",
    ];
    const PROMPT_REQUEST_TYPE = "gmt-erp:start-session";
    const PROMPT_RESULT_TYPE = "gmt-erp:start-session-result";
    const SIDEBAR_STYLE_ID = "dsh-plugin-gmt-sidebar";
    const OVERLAY_STYLE_ID = "dsh-plugin-gmt-overlay";
    const SIDEBAR_WORKSPACES_SELECTOR = '[data-slot="sidebar.workspaces"]';

    const sidebarCss = `
[data-slot="sidebar.footer.action"] {
  display: flex !important;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}
.gmtErpLauncher {
  flex: none;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  margin: 4px 0;
  padding: 0 var(--dsh-sidebar-inline-padding, 12px);
  gap: 8px;
  justify-content: flex-start;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.gmtErpLauncher:hover { background: rgba(127, 127, 127, 0.12); }
.gmtErpLauncher:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.gmtErpLauncherIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  font-weight: 800;
  font-size: 13px;
}
.gmtErpLauncherLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.gmtErpLauncher[data-wide="false"] {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
}
.gmtErpTopMount { flex: none; min-width: 0; width: 100%; }
.gmtErpTopEntry {
  box-sizing: border-box;
  width: 100%;
  padding-right: var(--dsh-sidebar-inline-padding, 12px);
}
.gmtErpTopEntry .gmtErpLauncher { width: 100%; margin: 0 0 8px; }
.gmtErpTopEntry[data-wide="false"] { width: 36px; padding-right: 0; }
`;

    const overlayCss = `
.gmtErpOverlayBackdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 24px;
  box-sizing: border-box;
}
.gmtErpOverlayPanel {
  width: min(1120px, 96vw);
  height: min(820px, 92vh);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  color: #111827;
  box-shadow: 0 24px 80px rgba(0,0,0,0.28);
}
.gmtErpOverlayHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.gmtErpOverlayTitle { font-size: 16px; font-weight: 700; }
.gmtErpOverlayClose {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
}
.gmtErpOverlayClose:hover { background: #f3f4f6; }
.gmtErpOverlayFrame {
  flex: 1;
  width: 100%;
  border: 0;
  background: transparent;
}
`;

    function installStyles(id, css) {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        el.textContent = css;
        document.head.appendChild(el);
      }
      return () => { el?.remove(); };
    }

    function ensureTopLauncherMount() {
      const workspaces = document.querySelector(SIDEBAR_WORKSPACES_SELECTOR);
      if (!workspaces || !workspaces.parentElement) return null;
      const parent = workspaces.parentElement;
      let mount = parent.querySelector(":scope > .gmtErpTopMount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "gmtErpTopMount";
        parent.insertBefore(mount, workspaces);
      }
      return mount;
    }

    /**
     * 符合 DSH Slot Store contract：返回 { spec, create() }，
     * Host 会调用 create() 得到 getSnapshot/subscribe/actions。
     * （不可直接传 useStore，否则 Desktop 侧栏 slot 渲染失败、入口消失）
     */
    function createPanelViewStore() {
      const spec = {
        init: () => ({ open: false }),
        actions: {
          open: (draft) => { draft.open = true; },
          close: (draft) => { draft.open = false; },
        },
      };
      return {
        spec,
        create() {
          let state = spec.init();
          const listeners = new Set();
          const actions = {};
          for (const [name, mutate] of Object.entries(spec.actions)) {
            actions[name] = (...params) => {
              const draft = { ...state };
              mutate(draft, ...params);
              state = draft;
              for (const listener of listeners) listener();
            };
          }
          return {
            actions,
            getSnapshot: () => state,
            subscribe(listener) {
              listeners.add(listener);
              return () => { listeners.delete(listener); };
            },
            clearPersisted() {
              listeners.clear();
            },
          };
        },
      };
    }

    function safeSnapshot(listLike) {
      try {
        return typeof listLike?.getSnapshot === "function" ? listLike.getSnapshot() : null;
      } catch {
        return null;
      }
    }

    function listWorkspaceItems(ctx) {
      const snap = safeSnapshot(ctx.workspaces?.list);
      const items = Array.isArray(snap?.items) ? snap.items : [];
      return { snap, items };
    }

    /** 解析可用工作区：当前会话所属 → 最近 → 列表第一项 */
    function resolveWorkspaceId(ctx) {
      const { snap, items } = listWorkspaceItems(ctx);
      const sessionsSnap = safeSnapshot(ctx.sessions?.list);
      const current = sessionsSnap?.current;

      if (typeof current === "string" && current) {
        const owned = items.find((item) =>
          Array.isArray(item?.sessionIds) && item.sessionIds.includes(current));
        if (typeof owned?.workspaceId === "string" && owned.workspaceId) {
          return owned.workspaceId;
        }
      }

      if (typeof snap?.recentWorkspaceId === "string" && snap.recentWorkspaceId) {
        return snap.recentWorkspaceId;
      }

      for (const item of items) {
        if (typeof item?.workspaceId === "string" && item.workspaceId) {
          return item.workspaceId;
        }
      }
      return null;
    }

    const PENDING_DRAFT_KEY = "gmt-erp:pending-draft";

    function isNoBindingError(error) {
      const msg = error instanceof Error ? error.message : String(error || "");
      return /no binding|resolved no binding|binding/i.test(msg);
    }

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function stashPendingDraft(sessionId, promptText) {
      try {
        sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({
          sessionId,
          prompt: promptText,
          t: Date.now(),
        }));
      } catch { /* ignore */ }
    }

    function readPendingDraft() {
      try {
        const raw = sessionStorage.getItem(PENDING_DRAFT_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.sessionId || typeof data.prompt !== "string") return null;
        if (Date.now() - (data.t || 0) > 60_000) {
          sessionStorage.removeItem(PENDING_DRAFT_KEY);
          return null;
        }
        return data;
      } catch {
        return null;
      }
    }

    function clearPendingDraft() {
      try { sessionStorage.removeItem(PENDING_DRAFT_KEY); } catch { /* ignore */ }
    }

    function tryApplyDraft(ctx, sessionId, promptText) {
      const conversation = typeof ctx.get === "function" ? ctx.get("conversation") : ctx.conversation;
      if (conversation === void 0) return false;
      try {
        const shell = conversation.input.shell(sessionId);
        if (!shell || typeof shell.setDraft !== "function") return false;
        shell.setDraft(promptText);
        return true;
      } catch (error) {
        if (isNoBindingError(error)) return false;
        throw error;
      }
    }

    /** 弹窗关闭后主界面才会挂上 conversation binding，这里轮询冲刷挂起草稿 */
    function flushPendingDraft(ctx) {
      const pending = readPendingDraft();
      if (!pending) return false;
      try {
        if (tryApplyDraft(ctx, pending.sessionId, pending.prompt)) {
          clearPendingDraft();
          console.log("[gmt-erp] pending draft applied:", pending.sessionId);
          return true;
        }
      } catch (error) {
        console.warn("[gmt-erp] flush pending draft failed:", error);
      }
      return false;
    }

    /**
     * 与 MCP连接器、DSH「新会话」同源：connectWorkspace
     * 会复用当前工作区空白会话，没有空白时再新建，返回时 composer binding 已就绪。
     * 不要用 sessions.create：会建出没有输入框绑定的会话，必须人工再点「新会话」。
     */
    async function openBoundSession(ctx, workspaceId) {
      const uiWorkspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
      if (workspaceId && typeof uiWorkspace?.connectWorkspace === "function") {
        return await uiWorkspace.connectWorkspace(workspaceId);
      }
      if (workspaceId && typeof ctx.workspaces?.connectWorkspace === "function") {
        return await ctx.workspaces.connectWorkspace(workspaceId);
      }
      throw new Error("当前 DSH 没有可用的「新会话」能力（connectWorkspace），请升级 DSH 后重试");
    }

    async function waitAndApplyDraft(ctx, sessionId, promptText, tries = 40) {
      for (let i = 0; i < tries; i++) {
        try {
          if (tryApplyDraft(ctx, sessionId, promptText)) {
            clearPendingDraft();
            return sessionId;
          }
        } catch { /* 等 binding */ }
        await sleep(80);
      }
      return null;
    }

    async function startPromptSession(ctx, promptText, options = {}) {
      if (typeof promptText !== "string" || promptText.trim() === "") {
        throw new Error("Prompt 不能为空");
      }
      const targetWorkspaceId = resolveWorkspaceId(ctx);
      if (!targetWorkspaceId) {
        throw new Error("未能定位工作区。请先在左侧点一下任意工作区，再回来发起。");
      }

      // 先关弹窗，让对话页挂上，再走官方新会话（与 MCP连接器相同）
      if (typeof options?.afterPrepare === "function") {
        try { await options.afterPrepare(); } catch { /* ignore */ }
      }
      await sleep(220);

      const sessionId = await openBoundSession(ctx, targetWorkspaceId);
      if (!sessionId || typeof sessionId !== "string") {
        throw new Error("未能打开可用会话。请先确认左侧工作区可选，再试一次。");
      }
      stashPendingDraft(sessionId, promptText);

      try { tryApplyDraft(ctx, sessionId, promptText); } catch { /* 再轮询 */ }
      if (typeof ctx.sessions?.open === "function") ctx.sessions.open(sessionId);

      const applied = await waitAndApplyDraft(ctx, sessionId, promptText);
      if (!applied) {
        console.warn("[gmt-erp] draft still pending, background flusher will retry:", sessionId);
      }
      return sessionId;
    }

    function GmtOverlay(props) {
      const { useStore, actions, startPromptSession: launch } = props;
      const open = useStore((s) => s.open);
      const frameRef = react.useRef(null);

      react.useEffect(() => {
        if (!open) return void 0;
        const onMessage = (event) => {
          if (event.origin !== window.location.origin) return;
          if (event.source !== frameRef.current?.contentWindow) return;
          if (event.data?.type !== PROMPT_REQUEST_TYPE) return;
          const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
          const prompt = event.data.prompt;
          const forceNew = event.data.forceNew === true;
          const reply = (ok, message) => {
            frameRef.current?.contentWindow?.postMessage({
              type: PROMPT_RESULT_TYPE,
              requestId,
              ok,
              message,
            }, window.location.origin);
          };
          if (!requestId || typeof prompt !== "string") {
            reply(false, "无效请求");
            return;
          }
          Promise.resolve(launch(prompt, {
            forceNew,
            afterPrepare: async () => {
              reply(true, forceNew ? "已在新对话中打开，请确认后发送" : "已打开对话，请确认后发送");
              actions.close();
              await sleep(220);
            },
          })).then(() => {
            console.log("[gmt-erp] prompt session ready");
          }, (error) => {
            reply(false, error instanceof Error ? error.message : String(error));
          });
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
      }, [open, actions, launch]);

      react.useEffect(() => {
        if (!open) return void 0;
        const onKey = (e) => { if (e.key === "Escape") actions.close(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [open, actions]);

      if (!open) return null;

      const modal = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: "gmtErpOverlayBackdrop",
        onMouseDown: (e) => { if (e.target === e.currentTarget) actions.close(); },
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: "gmtErpOverlayPanel",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "固美特ERP",
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
              className: "gmtErpOverlayHeader",
              children: [
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                  className: "gmtErpOverlayTitle",
                  children: "固美特 ERP",
                }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
                  type: "button",
                  className: "gmtErpOverlayClose",
                  onClick: () => actions.close(),
                  children: "关闭",
                }),
              ],
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
              ref: frameRef,
              className: "gmtErpOverlayFrame",
              src: "/gmt-erp/ui/?v=0.1.10",
              title: "固美特ERP",
            }),
          ],
        }),
      });

      if (document.body && typeof react_dom.createPortal === "function") {
        return react_dom.createPortal(modal, document.body);
      }
      return modal;
    }

    function SidebarEntry(props) {
      const { wide, useStore, actions } = props;
      const open = useStore((s) => s.open);
      const [topMount, setTopMount] = (0, react.useState)(null);

      (0, react.useEffect)(() => {
        const removeStyles = installStyles(SIDEBAR_STYLE_ID, sidebarCss);
        let disposed = false;
        const owned = new Set();
        const sync = () => {
          if (disposed) return;
          const mount = ensureTopLauncherMount();
          if (mount) owned.add(mount);
          setTopMount((cur) => (cur === mount ? cur : mount));
        };
        sync();
        let observer = null;
        if (typeof window.MutationObserver === "function" && document.body) {
          observer = new window.MutationObserver(sync);
          observer.observe(document.body, { childList: true, subtree: true });
        }
        return () => {
          disposed = true;
          observer?.disconnect();
          for (const m of owned) m.remove();
          removeStyles();
        };
      }, []);

      const launcher = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
        type: "button",
        className: "gmtErpLauncher",
        "data-wide": wide,
        "aria-label": "固美特ERP",
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        onClick: () => {
          try { actions.open(); }
          catch (error) { console.error("[gmt-erp] open failed:", error); }
        },
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: "gmtErpLauncherIcon",
            "aria-hidden": true,
            children: "固",
          }),
          wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: "gmtErpLauncherLabel",
            children: "固美特ERP",
          }) : null,
        ],
      });

      // 优先 Portal 到工作区列表上方；失败时仍渲染在 footer.action，保证可见
      if (topMount && typeof react_dom.createPortal === "function") {
        return react_dom.createPortal(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          className: "gmtErpTopEntry",
          "data-wide": wide,
          children: launcher,
        }), topMount);
      }
      return launcher;
    }

    function apply(ctx) {
      console.log("[gmt-erp] client apply() called");
      try {
        const view = createPanelViewStore();
        ctx.effect(() => installStyles(OVERLAY_STYLE_ID, overlayCss), "gmt-erp: overlay styles");

        // 后台冲刷：弹层关闭后 conversation binding 才就绪
        ctx.effect(() => {
          const timer = window.setInterval(() => {
            try { flushPendingDraft(ctx); } catch { /* ignore */ }
          }, 250);
          // 启动时也冲一次（防上次残留）
          try { flushPendingDraft(ctx); } catch { /* ignore */ }
          return () => window.clearInterval(timer);
        }, "gmt-erp: pending draft flusher");

        ctx.slots.inject("shell.overlay", () => {
          console.log("[gmt-erp] registering shell.overlay");
          return ctx.slots.register({
            name: "shell.overlay",
            id: "gmt-erp",
            order: 90,
            store: view,
            inject: () => ({
              startPromptSession: (promptText, options) => startPromptSession(ctx, promptText, options),
            }),
          }, GmtOverlay);
        });

        ctx.slots.inject("sidebar.footer.action", () => {
          console.log("[gmt-erp] registering sidebar.footer.action");
          return ctx.slots.register({
            name: "sidebar.footer.action",
            id: "gmt-erp",
            order: 1,
            store: view,
          }, SidebarEntry);
        });

        // 设置 → 插件项：即使侧栏被挤掉，也能从设置打开
        if (typeof ctx.inject === "function") {
          ctx.inject(["settingsScope"], (settingsCtx) => {
            settingsCtx.slots.inject("settings.plugin.item", () => settingsCtx.slots.register({
              name: "settings.plugin.item",
              id: "gmt-erp-open",
              order: 40,
              store: view,
              inject: () => ({ settingsScope: settingsCtx.settingsScope }),
            }, function GmtSettingsCard(props) {
              const { actions } = props;
              return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
                style: {
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                },
                children: [
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                    style: { fontWeight: 700 },
                    children: "固美特 ERP",
                  }),
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                    style: { fontSize: 13, color: "#6b7280" },
                    children: "打开固美特 ERP 功能目录、工具表单与 MCP 设置。",
                  }),
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
                    type: "button",
                    onClick: () => actions.open(),
                    style: {
                      justifySelf: "start",
                      border: "1px solid #0f766e",
                      background: "#0f766e",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      font: "inherit",
                    },
                    children: "打开固美特ERP",
                  }),
                ],
              });
            }));
          });
        }

        console.log("[gmt-erp] client apply() completed");
      } catch (error) {
        console.error("[gmt-erp] client apply() failed:", error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
