/* ==========================================================================
   SafaCycle Waste Expert — chatbot front end for the rule-based expert system
   --------------------------------------------------------------------------
   Self-contained: it builds its own floating button and panel, talks to the
   Python backend with fetch(), and never inserts server text as HTML.

   Backend location: set in js/ai-config.js (loaded before this file). Empty
   means the local Flask server at http://127.0.0.1:5000.
   ========================================================================== */
(function () {
  "use strict";

  const CHATBOT_VERSION = "2026.10.01";
  const SAFACYCLE_AI_API_BASE_URL = (window.SAFACYCLE_AI_API_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
  console.info("SafaCycle Waste Expert chatbot " + CHATBOT_VERSION + " - backend: " + SAFACYCLE_AI_API_BASE_URL);
  const REQUEST_TIMEOUT_MS = 12000;
  const MAX_MESSAGE_LENGTH = 500;
  const MAX_COMMENT_LENGTH = 300;
  const FEEDBACK_DELAY_MS = 10000;   // after each answer, ask "rate this chat?" once the user has been quiet for 10 s

  const EXAMPLES = [
    "I have an old phone with a swollen battery. What should I do?",
    "Can I sell cardboard that has some cooking oil on it?",
    "How should I dispose of a broken glass bottle?",
    "I have vegetable peels and leftover rice.",
    "This plastic container still has chemicals in it."
  ];
  const FALLBACK_WELCOME = "Namaste! I'm the SafaCycle Waste Expert, a rule-based expert system (not a human and not a generative AI). Describe any item you want to recycle, sell, or throw away, in your own words.";

  const state = {
    sessionId: null,
    online: null,
    welcomed: false,
    busy: false,
    feedbackTimer: null,
    built: false
  };
  const ui = {};

  /* ---------------------------------------------------------------- helpers */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    (children || []).forEach((child) => {
      if (child == null || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function svg(pathD, viewBox) {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", viewBox || "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "scx-icon");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", pathD);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.append(p);
    return s;
  }
  const ICONS = {
    expert: "M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6zM9 11.5l2 2 4-4",
    send: "M4 12l16-8-6 16-2.5-6.5z",
    restart: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
    minimize: "M6 12h12",
    expand: "M6 15l6-6 6 6",
    close: "M6 6l12 12M18 6L6 18",
    warn: "M12 4L2.8 20h18.4zM12 10v4M12 17h.01"
  };

  async function api(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(SAFACYCLE_AI_API_BASE_URL + path, {
        method: (options && options.method) || "GET",
        headers: Object.assign(
          // Lets requests through the warning page of ngrok's free plan (harmless elsewhere).
          { "ngrok-skip-browser-warning": "true" },
          options && options.body ? { "Content-Type": "application/json" } : {}
        ),
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok) {
        const message = (data && data.error && data.error.message) || "The expert system returned an error (" + response.status + ").";
        const err = new Error(message);
        err.status = response.status;
        err.code = data && data.error && data.error.code;
        throw err;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        const err = new Error("The expert system took too long to respond. Please try again.");
        err.code = "timeout";
        throw err;
      }
      if (error instanceof TypeError) {
        const err = new Error("The expert system backend is not reachable.");
        err.code = "offline";
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /* -------------------------------------------------------------------- UI */
  function build() {
    if (state.built) return;
    state.built = true;

    ui.fab = el("button", { class: "scx-fab", type: "button", "aria-controls": "scxPanel", "aria-expanded": "false", "aria-label": "Open the Waste Expert chat" },
      [svg(ICONS.expert), el("span", { class: "scx-fab__label", text: "Waste Expert" })]);

    ui.title = el("h2", { class: "scx-title", id: "scxTitle", text: "SafaCycle Waste Expert" });
    ui.minimizeBtn = el("button", { class: "scx-iconbtn", type: "button", "aria-label": "Minimize chat", "aria-expanded": "true", "aria-controls": "scxBody" }, [svg(ICONS.minimize)]);
    const head = el("header", { class: "scx-head" }, [
      el("div", { class: "scx-head__text" }, [
        ui.title,
        el("p", { class: "scx-badge", text: "Rule-Based Waste Expert", title: "Chatbot version " + CHATBOT_VERSION }),
        (ui.conn = el("span", { class: "scx-conn scx-conn--checking", role: "status", "aria-live": "polite", text: "Checking…" }))
      ]),
      el("div", { class: "scx-head__actions" }, [
        el("button", { class: "scx-iconbtn", type: "button", "aria-label": "Restart consultation", title: "Restart", onclick: restart }, [svg(ICONS.restart)]),
        ui.minimizeBtn,
        el("button", { class: "scx-iconbtn", type: "button", "aria-label": "Close chat", onclick: () => close(true) }, [svg(ICONS.close)])
      ])
    ]);
    ui.minimizeBtn.addEventListener("click", toggleMinimize);

    ui.status = el("div", { class: "scx-status", role: "status", hidden: true });
    ui.log = el("div", { class: "scx-log", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": "Conversation" });
    ui.examples = el("div", { class: "scx-examples" }, [
      el("p", { class: "scx-examples__label", text: "Optional examples (click to edit and send):" }),
      el("div", { class: "scx-examples__list" }, EXAMPLES.map((text) => el("button", {
        class: "scx-example", type: "button", text,
        onclick: () => { ui.input.value = text; updateCounter(); ui.input.focus(); }
      })))
    ]);

    ui.input = el("textarea", { class: "scx-input", id: "scxInput", rows: "1", maxlength: String(MAX_MESSAGE_LENGTH), placeholder: "Describe your item, e.g. \"an oily pizza box\"", autocomplete: "off" });
    ui.send = el("button", { class: "scx-send", type: "submit", "aria-label": "Send message" }, [svg(ICONS.send)]);
    ui.counter = el("span", { text: "0/" + MAX_MESSAGE_LENGTH });
    ui.form = el("form", { class: "scx-form", novalidate: true }, [
      el("label", { class: "scx-sr", for: "scxInput", text: "Describe the waste item" }),
      ui.input,
      ui.send
    ]);
    ui.form.addEventListener("submit", onSubmit);
    ui.input.addEventListener("input", () => { updateCounter(); autoGrow(); if (state.feedbackTimer) scheduleFeedback(); });
    ui.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ui.form.requestSubmit(); }
    });

    ui.body = el("div", { class: "scx-body", id: "scxBody" }, [
      ui.status, ui.log, ui.examples, ui.form,
      el("p", { class: "scx-foot" }, [ui.counter, " · Please don't share names, phone numbers, or addresses."])
    ]);
    ui.panel = el("section", { class: "scx-panel", id: "scxPanel", role: "dialog", "aria-modal": "false", "aria-labelledby": "scxTitle", hidden: true }, [head, ui.body]);
    ui.panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(true); });

    ui.fab.addEventListener("click", open);
    document.body.append(ui.fab, ui.panel);
  }

  function updateCounter() {
    ui.counter.textContent = ui.input.value.length + "/" + MAX_MESSAGE_LENGTH;
  }
  function autoGrow() {
    ui.input.style.height = "auto";
    ui.input.style.height = Math.min(ui.input.scrollHeight, 120) + "px";
    ui.input.style.overflowY = ui.input.scrollHeight > 120 ? "auto" : "hidden";
  }
  function scrollLog() {
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function setStatus(message, kind, withRetry) {
    ui.status.replaceChildren();
    if (!message) { ui.status.hidden = true; return; }
    ui.status.hidden = false;
    ui.status.className = "scx-status scx-status--" + (kind || "info");
    ui.status.append(el("span", { text: message }));
    if (withRetry) ui.status.append(el("button", { class: "scx-link", type: "button", text: "Retry", onclick: checkHealth }));
  }

  function addUserMessage(text) {
    ui.log.append(el("div", { class: "scx-msg scx-msg--user" }, [el("p", { text })]));
    scrollLog();
  }

  function addBotMessage(text, data) {
    const bubble = el("div", { class: "scx-msg scx-msg--bot" }, [el("p", { text })]);
    if (data && data.category && data.fired_rules && data.fired_rules.length) bubble.append(resultCard(data));
    ui.log.append(bubble);
    scrollLog();
    return bubble;
  }

  // Short summary under a recommendation. The full reasoning is not shown here;
  // the user can ask "why?" and the expert system explains it in the chat.
  function resultCard(data) {
    const card = el("div", { class: "scx-card" });
    card.append(el("div", { class: "scx-chips" }, [
      el("span", { class: "scx-chip scx-chip--cat", text: data.category }),
      data.classification && data.classification !== data.category ? el("span", { class: "scx-chip", text: data.classification }) : null
    ]));
    if (data.attributes && Object.keys(data.attributes).length) {
      const labels = { recyclable: "Recyclable", reusable: "Reusable", compostable: "Compostable", hazard_level: "Hazard" };
      card.append(el("dl", { class: "scx-attrs" }, Object.keys(labels).map((key) =>
        el("div", {}, [el("dt", { text: labels[key] }), el("dd", { text: String(data.attributes[key] || "—") })]))));
    }
    if (data.safety_warnings && data.safety_warnings.length) {
      card.append(el("div", { class: "scx-warning", role: "note" }, [svg(ICONS.warn), el("p", { text: data.safety_warnings.join(" ") })]));
    }
    return card;
  }

  function showTyping() {
    const typing = el("div", { class: "scx-msg scx-msg--bot scx-typing", "aria-label": "The expert system is thinking" }, [el("span"), el("span"), el("span")]);
    ui.log.append(typing);
    scrollLog();
    return typing;
  }

  /* -------------------------------------------------------------- feedback */
  // Flow for EVERY answer: the user reads it -> after FEEDBACK_DELAY_MS with no
  // typing or sending, a small "Would you like to rate this chat?" prompt appears
  // -> the rating form opens only if they click "Rate this chat". Each rating is
  // saved by the backend (ai_backend/data/feedback.json) and copied to Firebase.
  let formCounter = 0;

  function feedbackCard() {
    const id = "scxFb" + (++formCounter);          // unique ids: several forms can exist in one chat
    const stars = el("div", { class: "scx-stars" }, [5, 4, 3, 2, 1].map((n) => [
      el("input", { type: "radio", name: id + "Rating", id: id + "Star" + n, value: String(n) }),
      el("label", { for: id + "Star" + n, title: n + " star" + (n > 1 ? "s" : "") }, [el("span", { "aria-hidden": "true", text: "★" }), el("span", { class: "scx-sr", text: n + " star" + (n > 1 ? "s" : "") })])
    ]).flat());
    const helpful = el("div", { class: "scx-helpful" }, [
      el("label", {}, [el("input", { type: "radio", name: id + "Helpful", value: "true" }), " Helpful"]),
      el("label", {}, [el("input", { type: "radio", name: id + "Helpful", value: "false" }), " Not helpful"])
    ]);
    const comment = el("textarea", { class: "scx-comment", id: id + "Comment", rows: "2", maxlength: String(MAX_COMMENT_LENGTH), placeholder: "Optional: what could be better? (no personal details)" });
    const message = el("p", { class: "scx-fb-msg", role: "status" });
    const submit = el("button", { class: "scx-fb-submit", type: "submit", text: "Submit rating" });
    const form = el("form", { class: "scx-feedback", novalidate: true, "aria-labelledby": id + "Title" }, [
      el("h3", { id: id + "Title", text: "Rate this chat" }),
      el("fieldset", {}, [el("legend", { text: "Rating (1 to 5 stars)" }), stars]),
      el("fieldset", {}, [el("legend", { text: "Did it help?" }), helpful]),
      el("label", { class: "scx-sr", for: id + "Comment", text: "Optional comment" }),
      comment,
      submit,
      message
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const rating = form.querySelector("input[name=" + id + "Rating]:checked");
      const help = form.querySelector("input[name=" + id + "Helpful]:checked");
      if (!rating || !help) {
        message.className = "scx-fb-msg scx-fb-msg--error";
        message.textContent = !rating ? "Please choose a star rating." : "Please say whether it helped.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Saving…";
      message.textContent = "";
      const record = { rating: Number(rating.value), helpful: help.value === "true", comment: comment.value.trim() };
      let savedInBackend = false;
      try {
        // 1) Backend file ai_backend/data/feedback.json (validation + duplicate protection).
        await api("/api/feedback", { method: "POST", body: { session_id: state.sessionId, ...record } });
        savedInBackend = true;
      } catch (err) {
        if (err.code === "duplicate_feedback") {
          form.replaceChildren(el("p", { class: "scx-fb-thanks", text: err.message }));
          return;
        }
      }
      // 2) Firebase Firestore "expertFeedback": collects every visitor's rating in one place.
      const savedInFirebase = await saveRatingToFirebase(record);
      if (savedInFirebase) {
        form.replaceChildren(el("p", { class: "scx-fb-thanks", text: "Thank you! Your rating was saved." }));
      } else if (savedInBackend) {
        form.replaceChildren(el("p", { class: "scx-fb-thanks scx-fb-thanks--partial",
          text: "Thank you! Your rating was saved on this computer, but it could not be sent to Firebase." }));
      } else {
        message.className = "scx-fb-msg scx-fb-msg--error";
        message.textContent = "Your rating could not be saved. Please try again.";
        submit.disabled = false;
        submit.textContent = "Submit rating";
      }
    });
    return form;
  }

  // Firebase copy of each rating. Only rating, helpful, and the optional comment are sent.
  const FIREBASE_VERSION = "12.19.0";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDHtlnEl98UpddI0HVOM74HZ29F35qZ3HY",
    authDomain: "kabadi-chitwan.firebaseapp.com",
    projectId: "kabadi-chitwan",
    storageBucket: "kabadi-chitwan.firebasestorage.app",
    messagingSenderId: "173243868190",
    appId: "1:173243868190:web:9b5218e6290d26663d3a0f"
  };
  let firebase = null;

  async function saveRatingToFirebase(record) {
    try {
      if (!firebase) {
        const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-";
        const [appMod, fs] = await Promise.all([import(base + "app.js"), import(base + "firestore.js")]);
        const app = appMod.getApps().find((a) => a.name === "waste-expert") || appMod.initializeApp(FIREBASE_CONFIG, "waste-expert");
        firebase = { fs, db: fs.getFirestore(app) };
      }
      const { fs, db } = firebase;
      const write = fs.addDoc(fs.collection(db, "expertFeedback"), {
        rating: record.rating, helpful: record.helpful, comment: record.comment.slice(0, MAX_COMMENT_LENGTH),
        source: "waste-expert", createdAt: fs.serverTimestamp()
      });
      await Promise.race([write, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000))]);
      return true;
    } catch (err) {
      console.warn("Firebase rating not saved:", (err && (err.code || err.message)) || err,
        "- publish the expertFeedback rule in Firestore (see ai_backend/README.md).");
      return false;
    }
  }

  function ratePrompt() {
    const prompt = el("div", { class: "scx-rate-prompt", role: "group", "aria-label": "Rate this chat" }, [
      el("p", { text: "Would you like to rate this chat?" }),
      el("div", { class: "scx-rate-prompt__actions" }, [
        el("button", { class: "scx-rate-yes", type: "button", text: "Rate this chat", onclick: () => {
          const form = feedbackCard();
          prompt.replaceWith(form);
          if (ui.prompt === prompt) ui.prompt = null;
          form.querySelector("input[type=radio]").focus({ preventScroll: true });
          form.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } }),
        el("button", { class: "scx-rate-no", type: "button", text: "Not now", onclick: () => {
          prompt.remove();
          if (ui.prompt === prompt) ui.prompt = null;
          ui.input.focus();
        } })
      ])
    ]);
    return prompt;
  }

  function showRatePrompt() {
    if (!state.sessionId || ui.prompt) return;
    const nearBottom = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 80;
    ui.prompt = ratePrompt();
    ui.log.append(ui.prompt);
    if (nearBottom) scrollLog();  // don't pull the view away if the user scrolled up to read
  }

  // Called after every answer. Typing or sending restarts the wait.
  function scheduleFeedback() {
    clearTimeout(state.feedbackTimer);
    state.feedbackTimer = setTimeout(() => { state.feedbackTimer = null; showRatePrompt(); }, FEEDBACK_DELAY_MS);
  }
  function cancelFeedbackTimer() {
    clearTimeout(state.feedbackTimer);
    state.feedbackTimer = null;
  }
  // A new question makes an unanswered prompt for the previous answer irrelevant.
  function removePendingPrompt() {
    if (ui.prompt) { ui.prompt.remove(); ui.prompt = null; }
  }

  /* ------------------------------------------------------ connection state */
  // The Waste Expert has no offline mode: every answer comes from the Python
  // backend. While it is unreachable the chat is locked and says so clearly.
  let reconnectTimer = null;
  let healthInFlight = null;

  function offlineCard() {
    return el("div", { class: "scx-offline", role: "alert" }, [
      svg(ICONS.warn),
      el("strong", { text: "Backend isn't connected." }),
      el("button", { class: "scx-retry", type: "button", text: "Retry", onclick: () => checkHealth(true) })
    ]);
  }

  function setConnectionBadge(mode) {
    const labels = { checking: "Checking…", online: "Connected", offline: "Not connected" };
    ui.conn.className = "scx-conn scx-conn--" + mode;
    ui.conn.textContent = labels[mode];
  }

  function setConnected(connected, detail) {
    state.online = connected;
    setConnectionBadge(connected ? "online" : "offline");
    ui.panel.classList.toggle("scx-panel--offline", !connected);
    ui.fab.classList.toggle("scx-fab--offline", !connected);
    ui.input.disabled = !connected;
    ui.send.disabled = !connected || state.busy;
    ui.input.placeholder = connected ? "Describe your item, e.g. \"an oily pizza box\"" : "Backend isn't connected";
    ui.examples.querySelectorAll("button").forEach((b) => { b.disabled = !connected; });
    if (connected) {
      if (ui.offline) { ui.offline.remove(); ui.offline = null; }
      setStatus("");
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }
    if (!ui.offline) ui.offline = offlineCard();
    ui.log.append(ui.offline);
    scrollLog();
    setStatus(detail || "", "error");   // only used for the rare "running but knowledge failed" case
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => { if (!ui.panel.hidden) checkHealth(false); }, 8000);
    }
  }

  function checkHealth(showChecking) {
    if (healthInFlight) return healthInFlight;
    if (showChecking) setConnectionBadge("checking");
    healthInFlight = (async () => {
      try {
        const data = await api("/api/health");
        setConnected(true);
        if (!state.welcomed) {
          addBotMessage(data.welcome || FALLBACK_WELCOME);
          state.welcomed = true;
        }
        return data;
      } catch (err) {
        // 503 means the backend is running but its knowledge base failed to load.
        setConnected(false, err.status === 503 ? "The backend is running, but its knowledge base could not be loaded." : "");
        return null;
      } finally {
        healthInFlight = null;
      }
    })();
    return healthInFlight;
  }

  /* ---------------------------------------------------------------- actions */
  async function onSubmit(e) {
    e.preventDefault();
    if (state.online !== true) { checkHealth(true); return; }
    const text = ui.input.value.trim();
    if (!text) { setStatus("Please type a message first.", "error"); ui.input.focus(); return; }
    if (text.length > MAX_MESSAGE_LENGTH) { setStatus("Please keep your message under " + MAX_MESSAGE_LENGTH + " characters.", "error"); return; }
    if (state.busy) return;
    cancelFeedbackTimer();
    removePendingPrompt();
    state.busy = true;
    ui.send.disabled = true;
    ui.examples.hidden = true;
    setStatus("");
    addUserMessage(text);
    ui.input.value = "";
    updateCounter();
    autoGrow();
    const typing = showTyping();
    try {
      const body = { message: text };
      if (state.sessionId) body.session_id = state.sessionId;
      const data = await api("/api/chat", { method: "POST", body });
      typing.remove();
      state.online = true;
      if (data.session_id !== state.sessionId) {
        state.sessionId = data.session_id;
      }
      addBotMessage(data.reply, data);
      if (data.type === "reset") resetFeedback();
      else if (!["greeting", "closing"].includes(data.type)) scheduleFeedback();   // every real answer
    } catch (err) {
      typing.remove();
      if (err.code === "offline") {
        addBotMessage("Your message wasn't sent because the backend isn't connected.");
        setConnected(false);
      } else {
        addBotMessage("Sorry, I couldn't process that: " + err.message);
        if (err.code === "timeout") setStatus(err.message, "error", true);
      }
    } finally {
      state.busy = false;
      ui.send.disabled = state.online !== true;
      if (state.online === true) ui.input.focus();
    }
  }

  function resetFeedback() {
    cancelFeedbackTimer();
    removePendingPrompt();
  }

  async function restart() {
    if (state.sessionId) {
      try { await api("/api/reset", { method: "POST", body: { session_id: state.sessionId } }); } catch (_) { /* a new session is started below anyway */ }
    }
    state.sessionId = null;
    resetFeedback();
    ui.log.replaceChildren();
    ui.offline = null;
    ui.examples.hidden = false;
    if (state.online === true) {
      addBotMessage("New consultation started. Describe the item you want help with.");
      ui.input.focus();
    } else {
      setConnected(false);
      checkHealth(false);
    }
  }

  function toggleMinimize() {
    const minimized = ui.panel.classList.toggle("scx-panel--min");
    ui.body.hidden = minimized;
    ui.minimizeBtn.setAttribute("aria-expanded", String(!minimized));
    ui.minimizeBtn.setAttribute("aria-label", minimized ? "Expand chat" : "Minimize chat");
    ui.minimizeBtn.replaceChildren(svg(minimized ? ICONS.expand : ICONS.minimize));
    if (!minimized) ui.input.focus();
  }

  async function open() {
    build();
    ui.panel.hidden = false;
    ui.fab.hidden = true;
    ui.fab.setAttribute("aria-expanded", "true");
    if (ui.panel.classList.contains("scx-panel--min")) toggleMinimize();
    if (state.online === true) ui.input.focus();
    else await checkHealth(true);
  }

  function close(restoreFocus) {
    ui.panel.hidden = true;
    ui.fab.hidden = false;
    ui.fab.setAttribute("aria-expanded", "false");
    if (restoreFocus) ui.fab.focus();
  }

  function init() {
    build();
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-open-waste-expert]");
      if (trigger) { e.preventDefault(); open(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
