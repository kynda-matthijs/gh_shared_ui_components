// src/ChatInterface.jsx
import { useState, useRef, useCallback, useEffect, useId } from "react";
import { Bot, Send, Loader2, AlertCircle, X, Trash2, MessageCircle as MessageCircle2 } from "lucide-react";
import DOMPurify from "dompurify";

// src/ActionButtons.jsx
import { Phone, Mail, Globe, MapPin } from "lucide-react";
import { jsx, jsxs } from "react/jsx-runtime";
var SAFE_ABSOLUTE = /^(https?:|mailto:|tel:)/i;
function sanitizeUrl(url) {
  if (!url) return "";
  const u = String(url).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return SAFE_ABSOLUTE.test(u) ? u : "";
  return u;
}
function ActionButtons({ tel, email, url, address, moreInfoHref, strings }) {
  const safeUrl = sanitizeUrl(url);
  return /* @__PURE__ */ jsxs("div", { className: "sui-action-btns", children: [
    tel && /* @__PURE__ */ jsxs("a", { className: "sui-action-btn", href: `tel:${String(tel).replace(/\s+/g, "")}`, children: [
      /* @__PURE__ */ jsx(Phone, { className: "sui-chat-icon" }),
      " ",
      strings.call
    ] }),
    email && /* @__PURE__ */ jsxs("a", { className: "sui-action-btn", href: `mailto:${email}`, children: [
      /* @__PURE__ */ jsx(Mail, { className: "sui-chat-icon" }),
      " ",
      strings.email
    ] }),
    safeUrl && /* @__PURE__ */ jsxs("a", { className: "sui-action-btn", href: safeUrl, target: "_blank", rel: "noopener noreferrer", children: [
      /* @__PURE__ */ jsx(Globe, { className: "sui-chat-icon" }),
      " ",
      strings.website
    ] }),
    address && /* @__PURE__ */ jsxs(
      "a",
      {
        className: "sui-action-btn",
        href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
        target: "_blank",
        rel: "noopener noreferrer",
        children: [
          /* @__PURE__ */ jsx(MapPin, { className: "sui-chat-icon" }),
          " ",
          strings.route
        ]
      }
    ),
    moreInfoHref && /* @__PURE__ */ jsx("a", { className: "sui-action-btn sui-action-btn--info", href: moreInfoHref, children: strings.moreInfo })
  ] });
}

// src/starterIcons.js
import {
  Home,
  Utensils,
  Wallet,
  Users,
  HeartPulse,
  FileText,
  ShieldAlert,
  Briefcase,
  HelpCircle,
  Phone as Phone2,
  MapPin as MapPin2,
  Clock,
  MessageCircle,
  Heart
} from "lucide-react";
var STARTER_ICONS = {
  Home,
  Utensils,
  Wallet,
  Users,
  HeartPulse,
  FileText,
  ShieldAlert,
  Briefcase,
  HelpCircle,
  Phone: Phone2,
  MapPin: MapPin2,
  Clock,
  MessageCircle,
  Heart
};

// src/ChatInterface.jsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PUBLIC_FILTER = { folder: { $gte: "public/", $lt: "public0" } };
var DEFAULT_STRINGS = {
  title: "Ask your question",
  inputLabel: "Type your question",
  send: "Send",
  startHint: "Choose a topic or ask a question below",
  thinking: "Thinking\u2026",
  error: "Something went wrong. Please try again.",
  retry: "Try again",
  relatedHelp: "Related help",
  call: "Call",
  email: "Email",
  website: "Website",
  route: "Directions",
  moreInfo: "More info",
  openChat: "Open chat",
  closeChat: "Close chat",
  clearChat: "Clear chat",
  clearInput: "Clear",
  you: "You",
  assistant: "Assistant",
  disclaimer: "This is an AI assistant. Always double-check important details with the organisation itself.",
  aboutYouTitle: "About you (optional)",
  nameLabel: "What should we call you?",
  ageLabel: "Your age",
  genderLabel: "Your gender",
  intakeNotStored: "Optional. Never stored.",
  loggingNotice: "We may use this conversation to help improve our services.",
  loggingOptOutLink: "Opt out for this session",
  loggingOptOutModalTitle: "Turn off conversation logging?",
  loggingOptOutModalBody: "This stops us from saving this conversation for review, for the rest of this browser session. You can keep chatting as normal.",
  loggingOptOutConfirm: "Turn off for this session",
  loggingOptOutCancel: "Cancel",
  loggingOptedOutNotice: "Logging is turned off for this session."
};
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safe = sanitizeUrl(url);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  html = html.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  return DOMPurify.sanitize(html);
}
function parseSSEBlock(block) {
  let eventName = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return dataLines.length ? { eventName, data: dataLines.join("\n") } : null;
}
function dedupeSources(chunks) {
  var _a;
  const byId = /* @__PURE__ */ new Map();
  for (const c of chunks ?? []) {
    const meta = (_a = c.item) == null ? void 0 : _a.metadata;
    if (!(meta == null ? void 0 : meta.entity_id)) continue;
    const existing = byId.get(meta.entity_id);
    if (!existing || (c.score ?? 0) > existing.score) {
      byId.set(meta.entity_id, { meta, score: c.score ?? 0 });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}
var MAX_STORED_MESSAGES = 40;
function loadMessages(key) {
  if (!key) return [];
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveMessages(key, messages) {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {
  }
}
function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function getOrCreateLogSessionId(key) {
  if (!key) return randomId();
  const storageKey = `${key}:logId`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = randomId();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return randomId();
  }
}
function logChatTurn(endpoint, sessionId, language, messages) {
  if (!endpoint) return;
  try {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        language,
        messages: messages.map((m) => ({ role: m.role, content: m.content }))
      }),
      keepalive: true
    }).catch(() => {
    });
  } catch {
  }
}
var LOGGING_OPT_OUT_KEY = "sui-chat-logging-opted-out";
function isLoggingOptedOut() {
  try {
    return sessionStorage.getItem(LOGGING_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}
function persistLoggingOptOut() {
  try {
    sessionStorage.setItem(LOGGING_OPT_OUT_KEY, "1");
  } catch {
  }
}
function buildMoreInfoHref(pattern, entityId) {
  if (!pattern) return null;
  return pattern.replace("{id}", encodeURIComponent(entityId));
}
function SourceCard({ meta, strings, moreInfoHrefPattern }) {
  let ctx = {};
  try {
    ctx = JSON.parse(meta.context || "{}");
  } catch {
  }
  const infoHref = buildMoreInfoHref(moreInfoHrefPattern, meta.entity_id);
  return /* @__PURE__ */ jsxs2("div", { className: "sui-chat-source-card", children: [
    /* @__PURE__ */ jsx2("div", { className: "sui-chat-source-title", children: meta.name || ctx.naam || "" }),
    ctx.adres && /* @__PURE__ */ jsx2("div", { className: "sui-chat-source-address", children: ctx.adres }),
    /* @__PURE__ */ jsx2(ActionButtons, { tel: ctx.tel, email: ctx.email, url: ctx.url, address: ctx.adres, moreInfoHref: infoHref, strings })
  ] });
}
function buildIntakeContext(intake) {
  var _a, _b, _c;
  const parts = [];
  if ((_a = intake.name) == null ? void 0 : _a.trim()) parts.push(`Their name is ${intake.name.trim()} \u2014 you may use it to sound warm and personal.`);
  if ((_b = intake.age) == null ? void 0 : _b.trim()) parts.push(`Their age is ${intake.age.trim()}.`);
  if ((_c = intake.gender) == null ? void 0 : _c.trim()) parts.push(`Their gender: ${intake.gender.trim()}.`);
  if (!parts.length) return "";
  return ` ${parts.join(" ")} Never ask them to confirm or repeat this information back.`;
}
function buildSystemMessage(languageName, intake, systemPrompt, extraPrompt) {
  return `Respond in the same language the person is writing in. If you can't confidently tell what language that is, respond in ${languageName} instead. Keep answers concise and easy to read for someone who may be in a stressful situation.${buildIntakeContext(intake)}${(systemPrompt == null ? void 0 : systemPrompt.trim()) ? ` ${systemPrompt.trim()}` : ""}${extraPrompt ? ` ${extraPrompt}` : ""}`;
}
function IntakeForm({ intake, onChange, askName, askAge, askGender, strings, open, onToggle }) {
  if (!askName && !askAge && !askGender) return null;
  return /* @__PURE__ */ jsxs2("div", { className: "sui-chat-intake", children: [
    /* @__PURE__ */ jsx2("button", { type: "button", className: "sui-chat-intake-toggle", onClick: onToggle, "aria-expanded": open, children: strings.aboutYouTitle }),
    open && /* @__PURE__ */ jsxs2("div", { className: "sui-chat-intake-fields", children: [
      askName && /* @__PURE__ */ jsxs2("label", { className: "sui-chat-intake-field", children: [
        /* @__PURE__ */ jsx2("span", { children: strings.nameLabel }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "text",
            value: intake.name,
            autoComplete: "off",
            onChange: (e) => onChange({ ...intake, name: e.target.value })
          }
        )
      ] }),
      askAge && /* @__PURE__ */ jsxs2("label", { className: "sui-chat-intake-field", children: [
        /* @__PURE__ */ jsx2("span", { children: strings.ageLabel }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "number",
            inputMode: "numeric",
            min: "0",
            max: "120",
            value: intake.age,
            autoComplete: "off",
            onChange: (e) => onChange({ ...intake, age: e.target.value })
          }
        )
      ] }),
      askGender && /* @__PURE__ */ jsxs2("label", { className: "sui-chat-intake-field", children: [
        /* @__PURE__ */ jsx2("span", { children: strings.genderLabel }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "text",
            value: intake.gender,
            autoComplete: "off",
            onChange: (e) => onChange({ ...intake, gender: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsx2("p", { className: "sui-chat-intake-note", children: strings.intakeNotStored })
    ] })
  ] });
}
function StarterButtons({ starters, onPick, onPreview }) {
  if (!starters.length) return null;
  return /* @__PURE__ */ jsx2("div", { className: "sui-chat-starters", children: starters.map((s) => {
    const Icon = STARTER_ICONS[s.icon] ?? MessageCircle2;
    return /* @__PURE__ */ jsxs2(
      "button",
      {
        type: "button",
        className: "sui-chat-starter-btn",
        onClick: () => onPick(s),
        onMouseEnter: () => onPreview(s.question),
        onMouseLeave: () => onPreview(""),
        onFocus: () => onPreview(s.question),
        onBlur: () => onPreview(""),
        children: [
          /* @__PURE__ */ jsx2(Icon, { className: "sui-chat-icon" }),
          /* @__PURE__ */ jsx2("span", { children: s.label })
        ]
      },
      s.id
    );
  }) });
}
function Message({ role, content, chunks, streaming, strings, moreInfoHrefPattern }) {
  const sources = role === "assistant" ? dedupeSources(chunks) : [];
  return /* @__PURE__ */ jsxs2("div", { className: `sui-chat-msg sui-chat-msg--${role}`, children: [
    /* @__PURE__ */ jsx2("span", { className: "sui-chat-msg-label", children: role === "user" ? strings.you : strings.assistant }),
    /* @__PURE__ */ jsxs2("div", { className: "sui-chat-msg-bubble", "aria-live": role === "assistant" ? "polite" : void 0, children: [
      role === "user" ? /* @__PURE__ */ jsx2("div", { className: "sui-chat-msg-text", children: content }) : /* @__PURE__ */ jsx2("div", { className: "sui-chat-msg-text", dangerouslySetInnerHTML: { __html: renderMarkdown(content) } }),
      streaming && /* @__PURE__ */ jsx2("span", { className: "sui-chat-cursor", "aria-hidden": "true" }),
      sources.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "sui-chat-sources", children: [
        /* @__PURE__ */ jsx2("h4", { className: "sui-chat-sources-heading", children: strings.relatedHelp }),
        /* @__PURE__ */ jsx2("div", { className: "sui-chat-sources-grid", children: sources.map((s) => /* @__PURE__ */ jsx2(SourceCard, { meta: s.meta, strings, moreInfoHrefPattern }, s.meta.entity_id)) })
      ] })
    ] })
  ] });
}
function LoggingOptOutModal({ strings, titleId, onConfirm, onCancel }) {
  return /* @__PURE__ */ jsx2("div", { className: "sui-chat-optout-overlay", onClick: (e) => {
    if (e.target === e.currentTarget) onCancel();
  }, children: /* @__PURE__ */ jsxs2("div", { className: "sui-chat-optout-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, children: [
    /* @__PURE__ */ jsx2("h3", { id: titleId, className: "sui-chat-optout-title", children: strings.loggingOptOutModalTitle }),
    /* @__PURE__ */ jsx2("p", { className: "sui-chat-optout-body", children: strings.loggingOptOutModalBody }),
    /* @__PURE__ */ jsxs2("div", { className: "sui-chat-optout-actions", children: [
      /* @__PURE__ */ jsx2("button", { type: "button", className: "sui-chat-optout-cancel", onClick: onCancel, children: strings.loggingOptOutCancel }),
      /* @__PURE__ */ jsx2("button", { type: "button", className: "sui-chat-optout-confirm", onClick: onConfirm, children: strings.loggingOptOutConfirm })
    ] })
  ] }) });
}
function ChatInterface({
  aiSearchId,
  languageName = "English",
  strings: stringsProp,
  variant = "chat-page",
  dir = "ltr",
  placeholder,
  moreInfoHrefPattern = null,
  persistKey = null,
  askName = false,
  askAge = false,
  askGender = false,
  starters = [],
  autoSendStarters = false,
  chatLoggingEnabled = false,
  chatLogEndpoint = null,
  systemPrompt = ""
}) {
  const strings = { ...DEFAULT_STRINGS, ...stringsProp };
  const isBubble = variant === "chat-bubble";
  const visibleStarters = (starters ?? []).filter((s) => s.active !== false);
  const [open, setOpen] = useState(!isBubble);
  const [intake, setIntake] = useState({ name: "", age: "", gender: "" });
  const [intakeOpen, setIntakeOpen] = useState(true);
  const pendingExtraPromptRef = useRef("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [previewQuestion, setPreviewQuestion] = useState("");
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const inputId = useId();
  const sessionIdRef = useRef(null);
  if (sessionIdRef.current == null) sessionIdRef.current = getOrCreateLogSessionId(persistKey);
  const [loggingOptedOut, setLoggingOptedOutState] = useState(false);
  const [optOutModalOpen, setOptOutModalOpen] = useState(false);
  const optOutTitleId = useId();
  useEffect(() => {
    if (chatLoggingEnabled) setLoggingOptedOutState(isLoggingOptedOut());
  }, [chatLoggingEnabled]);
  const confirmLoggingOptOut = useCallback(() => {
    persistLoggingOptOut();
    setLoggingOptedOutState(true);
    setOptOutModalOpen(false);
  }, []);
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);
  useEffect(() => {
    const stored = loadMessages(persistKey);
    if (stored.length) setMessages(stored);
  }, []);
  const clearChat = useCallback(() => {
    var _a;
    setMessages([]);
    setError("");
    saveMessages(persistKey, []);
    if (persistKey) {
      try {
        sessionStorage.removeItem(persistKey);
      } catch {
      }
    }
    (_a = inputRef.current) == null ? void 0 : _a.focus();
  }, [persistKey]);
  const sendQuery = useCallback(async (query, extraPrompt = "") => {
    var _a, _b, _c;
    query = query.trim();
    if (!query || pending) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content: query }];
    setMessages(nextMessages);
    saveMessages(persistKey, nextMessages);
    setInput("");
    setIntakeOpen(false);
    setPending(true);
    setStreaming(" ");
    scrollToBottom();
    const apiUrl = `https://${aiSearchId}.search.ai.cloudflare.com/chat/completions`;
    const body = {
      messages: [
        { role: "system", content: buildSystemMessage(languageName, intake, systemPrompt, extraPrompt) },
        ...nextMessages.map((m) => ({ role: m.role, content: m.content }))
      ],
      stream: true,
      ai_search_options: { retrieval: { filters: PUBLIC_FILTER } }
    };
    let assistantText = "";
    let chunks = [];
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body)
      });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const parsed = parseSSEBlock(part);
          if (!parsed || parsed.data === "[DONE]") continue;
          if (parsed.eventName === "chunks") {
            try {
              chunks = JSON.parse(parsed.data);
            } catch {
            }
            continue;
          }
          try {
            const frame = JSON.parse(parsed.data);
            const delta = (_c = (_b = (_a = frame.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.delta) == null ? void 0 : _c.content;
            if (delta) {
              assistantText += delta;
              setStreaming(assistantText);
              scrollToBottom();
            }
          } catch {
          }
        }
      }
      if (!assistantText) throw new Error("empty response");
      const withAssistant = [...nextMessages, { role: "assistant", content: assistantText, chunks }];
      setMessages(withAssistant);
      saveMessages(persistKey, withAssistant);
      if (chatLoggingEnabled && !loggingOptedOut) {
        logChatTurn(chatLogEndpoint, sessionIdRef.current, languageName, withAssistant);
      }
    } catch (err) {
      setError(strings.error);
    } finally {
      setStreaming("");
      setPending(false);
      scrollToBottom();
    }
  }, [pending, messages, aiSearchId, languageName, persistKey, strings.error, scrollToBottom, intake, chatLoggingEnabled, chatLogEndpoint, systemPrompt, loggingOptedOut]);
  const handleFormSubmit = useCallback((e) => {
    e.preventDefault();
    const extra = pendingExtraPromptRef.current;
    pendingExtraPromptRef.current = "";
    sendQuery(input, extra);
  }, [input, sendQuery]);
  const handleStarterPick = useCallback((starter) => {
    var _a;
    setPreviewQuestion("");
    if (autoSendStarters) {
      sendQuery(starter.question, starter.extraPrompt);
    } else {
      setInput(starter.question);
      pendingExtraPromptRef.current = starter.extraPrompt || "";
      (_a = inputRef.current) == null ? void 0 : _a.focus();
    }
  }, [autoSendStarters, sendQuery]);
  if (!aiSearchId) return null;
  const panel = /* @__PURE__ */ jsxs2("div", { className: "sui-chat-panel", children: [
    /* @__PURE__ */ jsxs2("div", { className: "sui-chat-header", children: [
      /* @__PURE__ */ jsx2(Bot, { className: "sui-chat-icon" }),
      /* @__PURE__ */ jsx2("span", { className: "sui-chat-header-title", children: strings.title }),
      /* @__PURE__ */ jsxs2("div", { className: "sui-chat-header-actions", children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            className: "sui-chat-clear-btn",
            onClick: clearChat,
            "aria-label": strings.clearChat,
            title: strings.clearChat,
            children: /* @__PURE__ */ jsx2(Trash2, { className: "sui-chat-icon-sm" })
          }
        ),
        isBubble && /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            className: "sui-chat-close-btn",
            onClick: () => setOpen(false),
            "aria-label": strings.closeChat,
            children: /* @__PURE__ */ jsx2(X, { className: "sui-chat-icon-sm" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx2(
      IntakeForm,
      {
        intake,
        onChange: setIntake,
        askName,
        askAge,
        askGender,
        strings,
        open: intakeOpen,
        onToggle: () => setIntakeOpen((v) => !v)
      }
    ),
    /* @__PURE__ */ jsxs2("div", { className: "sui-chat-log", role: "log", "aria-relevant": "additions", ref: logRef, children: [
      messages.length === 0 && !streaming && /* @__PURE__ */ jsxs2(Fragment, { children: [
        visibleStarters.length > 0 && /* @__PURE__ */ jsx2("p", { className: "sui-chat-log-hint", children: strings.startHint }),
        /* @__PURE__ */ jsx2(StarterButtons, { starters: visibleStarters, onPick: handleStarterPick, onPreview: setPreviewQuestion })
      ] }),
      messages.map((m, i) => /* @__PURE__ */ jsx2(Message, { ...m, strings, moreInfoHrefPattern }, i)),
      streaming && /* @__PURE__ */ jsx2(Message, { role: "assistant", content: streaming, streaming: true, strings, moreInfoHrefPattern })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "sui-chat-status", role: "status", "aria-live": "polite", children: pending && !error ? strings.thinking : "" }),
    error && /* @__PURE__ */ jsxs2("p", { className: "sui-chat-error", children: [
      /* @__PURE__ */ jsx2(AlertCircle, { className: "sui-chat-icon-sm" }),
      " ",
      error
    ] }),
    /* @__PURE__ */ jsxs2("form", { className: "sui-chat-form", onSubmit: handleFormSubmit, children: [
      /* @__PURE__ */ jsx2("label", { className: "sui-chat-sr-only", htmlFor: inputId, children: strings.inputLabel }),
      /* @__PURE__ */ jsxs2("div", { className: "sui-chat-input-wrap", children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            ref: inputRef,
            id: inputId,
            type: "text",
            className: "sui-chat-input",
            placeholder: previewQuestion || placeholder || strings.inputLabel,
            value: input,
            onChange: (e) => {
              setInput(e.target.value);
              pendingExtraPromptRef.current = "";
            },
            disabled: pending,
            autoComplete: "off"
          }
        ),
        input && /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            className: "sui-chat-clear-input-btn",
            onClick: () => {
              var _a;
              setInput("");
              pendingExtraPromptRef.current = "";
              (_a = inputRef.current) == null ? void 0 : _a.focus();
            },
            "aria-label": strings.clearInput,
            title: strings.clearInput,
            children: /* @__PURE__ */ jsx2(X, { className: "sui-chat-icon-sm" })
          }
        )
      ] }),
      /* @__PURE__ */ jsx2("button", { type: "submit", className: "sui-chat-send-btn", disabled: pending || !input.trim(), "aria-label": strings.send, children: pending ? /* @__PURE__ */ jsx2(Loader2, { className: "sui-chat-icon sui-chat-spin" }) : /* @__PURE__ */ jsx2(Send, { className: "sui-chat-icon" }) })
    ] }),
    /* @__PURE__ */ jsxs2("p", { className: "sui-chat-disclaimer", children: [
      strings.disclaimer,
      chatLoggingEnabled && (loggingOptedOut ? /* @__PURE__ */ jsxs2("span", { className: "sui-chat-logging-note", children: [
        " ",
        strings.loggingOptedOutNotice
      ] }) : /* @__PURE__ */ jsxs2("span", { className: "sui-chat-logging-note", children: [
        " ",
        strings.loggingNotice,
        " ",
        /* @__PURE__ */ jsx2("button", { type: "button", className: "sui-chat-logging-optout-link", onClick: () => setOptOutModalOpen(true), children: strings.loggingOptOutLink })
      ] }))
    ] }),
    optOutModalOpen && /* @__PURE__ */ jsx2(
      LoggingOptOutModal,
      {
        strings,
        titleId: optOutTitleId,
        onConfirm: confirmLoggingOptOut,
        onCancel: () => setOptOutModalOpen(false)
      }
    )
  ] });
  if (!isBubble) {
    return /* @__PURE__ */ jsx2("section", { className: "sui-chat-widget sui-chat-widget--chat-page", dir, children: panel });
  }
  return /* @__PURE__ */ jsx2("section", { className: "sui-chat-widget sui-chat-widget--chat-bubble", dir, children: open ? panel : /* @__PURE__ */ jsx2(
    "button",
    {
      ref: toggleRef,
      type: "button",
      className: "sui-chat-bubble-toggle",
      "aria-expanded": open,
      "aria-label": strings.openChat,
      onClick: () => setOpen(true),
      children: /* @__PURE__ */ jsx2(Bot, { className: "sui-chat-icon-lg" })
    }
  ) });
}

// src/DynamicContentGrid.jsx
import { useState as useState2 } from "react";
import { Image as ImageIcon, User as UserIcon, Folder as FolderIcon } from "lucide-react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function trunc(s, n = 120) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "\u2026" : str;
}
function fmtDate(v, locale = "nl-NL") {
  try {
    return new Date(v).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return String(v);
  }
}
function getByPath(item, path) {
  if (!item || !path) return "";
  let cur = item;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object") return "";
    cur = cur[p];
  }
  return cur ?? "";
}
function getUniqueValues(items, field) {
  const counts = {};
  for (const item of items) {
    const val = String(getByPath(item, field) ?? "").trim();
    if (val) counts[val] = (counts[val] ?? 0) + 1;
  }
  return Object.keys(counts).sort().map((v) => ({ value: v, count: counts[v] }));
}
function applyUserFilters(baseItems, activeFilters, searchTerm, filterBar) {
  var _a;
  let result = baseItems;
  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const searchFields = ((_a = filterBar == null ? void 0 : filterBar.searchFields) == null ? void 0 : _a.length) ? filterBar.searchFields : ["name", "title", "description"];
    result = result.filter((item) => searchFields.some((f) => String(getByPath(item, f) ?? "").toLowerCase().includes(term)));
  }
  for (const [field, values] of Object.entries(activeFilters)) {
    if (!(values == null ? void 0 : values.length)) continue;
    const valSet = new Set(values.map((v) => String(v).toLowerCase()));
    result = result.filter((item) => valSet.has(String(getByPath(item, field) ?? "").toLowerCase()));
  }
  return result;
}
function Badge({ value }) {
  return value ? /* @__PURE__ */ jsx3("span", { className: "sui-dyn-badge", children: value }) : null;
}
function CardImage({ src }) {
  if (src) return /* @__PURE__ */ jsx3("img", { src, alt: "", loading: "lazy" });
  return /* @__PURE__ */ jsx3("div", { className: "sui-dyn-img-placeholder", children: /* @__PURE__ */ jsx3(ImageIcon, { className: "sui-dyn-icon" }) });
}
function defaultDetailUrl(item, fieldMap, collection) {
  const pattern = (fieldMap == null ? void 0 : fieldMap.detailUrl) ?? "";
  if (pattern) {
    return pattern.replace(/\{\{id\}\}/g, String(item.id ?? "")).replace(/\{\{slug\}\}/g, String(item.slug ?? item.id ?? ""));
  }
  const idOrSlug = item.slug ?? item.id;
  return collection && idOrSlug ? `/${collection}/${idOrSlug}` : "";
}
function buildMoreInfoUrl(item, fieldMap) {
  const pattern = (fieldMap == null ? void 0 : fieldMap.moreInfoUrl) ?? "";
  if (!pattern) return "";
  return pattern.replace(/\{\{id\}\}/g, String(item.id ?? "")).replace(/\{\{slug\}\}/g, String(item.slug ?? item.id ?? ""));
}
function PreviewCard({ item, design, fieldMap, collection, detailUrlBuilder, dateLocale, strings }) {
  const g = (slot) => {
    const field = fieldMap[slot];
    return field ? getByPath(item, field) : "";
  };
  switch (design) {
    case "image-card":
      return /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3("div", { className: "sui-dyn-img", children: /* @__PURE__ */ jsx3(CardImage, { src: g("image") }) }),
        /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body", children: [
          /* @__PURE__ */ jsx3(Badge, { value: g("badge") }),
          /* @__PURE__ */ jsx3("h3", { children: g("heading") || item.name || item.title || "\u2014" }),
          g("subheading") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-sub", children: String(g("subheading")) }),
          g("body") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-desc", children: trunc(g("body")) })
        ] })
      ] });
    case "compact-card":
      return /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body sui-dyn-body-full", children: [
        /* @__PURE__ */ jsx3("h3", { children: g("heading") || item.name || item.title || "\u2014" }),
        g("subheading") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-sub", children: String(g("subheading")) }),
        g("body") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-desc", children: trunc(g("body"), 100) }),
        g("date") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-date", children: fmtDate(g("date"), dateLocale) })
      ] });
    case "stat-card":
      return /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body sui-dyn-stat-body", children: [
        /* @__PURE__ */ jsx3("p", { className: "sui-dyn-stat-label", children: g("heading") || item.name || "\u2014" }),
        /* @__PURE__ */ jsx3("p", { className: "sui-dyn-stat-value", children: String(g("number") || "\u2014") }),
        g("subheading") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-sub", children: String(g("subheading")) }),
        /* @__PURE__ */ jsx3(Badge, { value: g("badge") })
      ] });
    case "person-card":
      return /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3("div", { className: "sui-dyn-avatar-wrap", children: g("image") ? /* @__PURE__ */ jsx3("img", { src: String(g("image")), className: "sui-dyn-avatar", alt: "" }) : /* @__PURE__ */ jsx3("div", { className: "sui-dyn-avatar-placeholder", children: /* @__PURE__ */ jsx3(UserIcon, { className: "sui-dyn-icon" }) }) }),
        /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body sui-dyn-person-body", children: [
          /* @__PURE__ */ jsx3("h3", { children: g("heading") || item.name || "\u2014" }),
          g("subheading") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-sub", children: String(g("subheading")) }),
          g("body") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-desc", children: trunc(g("body"), 100) })
        ] })
      ] });
    case "contact-card":
      return /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body sui-dyn-body-full", children: [
        /* @__PURE__ */ jsx3("h3", { children: g("heading") || item.name || item.title || "\u2014" }),
        /* @__PURE__ */ jsx3(
          ActionButtons,
          {
            tel: g("tel"),
            email: g("email"),
            url: g("website"),
            address: g("address"),
            moreInfoHref: buildMoreInfoUrl(item, fieldMap),
            strings
          }
        )
      ] });
    case "document-card":
      return /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3("div", { className: "sui-dyn-doc-icon", children: /* @__PURE__ */ jsx3(FolderIcon, { className: "sui-dyn-icon" }) }),
        /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-body sui-dyn-body-full", children: [
          /* @__PURE__ */ jsx3("h3", { children: g("heading") || item.name || item.title || "\u2014" }),
          /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-doc-meta", children: [
            /* @__PURE__ */ jsx3(Badge, { value: g("badge") }),
            g("date") && /* @__PURE__ */ jsx3("span", { className: "sui-dyn-date", children: fmtDate(g("date"), dateLocale) })
          ] }),
          g("body") && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-desc", children: trunc(g("body"), 100) })
        ] })
      ] });
    default:
      return /* @__PURE__ */ jsx3("div", { className: "sui-dyn-body sui-dyn-body-full", children: /* @__PURE__ */ jsx3("h3", { children: item.name ?? item.title ?? String(item.id ?? "\u2014") }) });
  }
}
function FilterBar({ allItems, filterBar, activeFilters, searchTerm, setActiveFilters, setSearchTerm, strings }) {
  const fb = filterBar ?? {};
  const hasSearch = fb.searchEnabled;
  const sortedFilters = (fb.filters ?? []).filter((f) => f.field).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!hasSearch && sortedFilters.length === 0) return null;
  return /* @__PURE__ */ jsxs3("div", { className: `sui-dyn-filterbar sui-dyn-filterbar--${fb.layout ?? "horizontal"}`, children: [
    hasSearch && /* @__PURE__ */ jsx3("div", { className: "sui-dyn-filter-group", children: /* @__PURE__ */ jsx3(
      "input",
      {
        type: "search",
        className: "sui-dyn-search-input",
        value: searchTerm,
        placeholder: (fb.searchLabel || strings.search) + "\u2026",
        onChange: (e) => setSearchTerm(e.target.value)
      }
    ) }),
    sortedFilters.map((filterDef) => {
      const options = getUniqueValues(allItems, filterDef.field);
      if (options.length <= 1) return null;
      const selected = activeFilters[filterDef.field] ?? [];
      const label = filterDef.label || filterDef.field;
      return /* @__PURE__ */ jsxs3("div", { className: "sui-dyn-filter-group", children: [
        /* @__PURE__ */ jsx3("span", { className: "sui-dyn-filter-label", children: label }),
        filterDef.type === "select" ? /* @__PURE__ */ jsxs3(
          "select",
          {
            className: "sui-dyn-filter-select",
            value: selected[0] ?? "",
            onChange: (e) => setActiveFilters((prev) => ({ ...prev, [filterDef.field]: e.target.value ? [e.target.value] : [] })),
            children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: strings.all }),
              options.map((o) => /* @__PURE__ */ jsxs3("option", { value: o.value, children: [
                o.value,
                filterDef.showCount ? ` (${o.count})` : ""
              ] }, o.value))
            ]
          }
        ) : /* @__PURE__ */ jsx3("div", { className: `sui-dyn-filter-options sui-dyn-filter-options--${filterDef.type ?? "checkbox"}`, children: options.map((o) => /* @__PURE__ */ jsxs3("label", { className: "sui-dyn-filter-option", children: [
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: filterDef.type === "radio" ? "radio" : "checkbox",
              name: `sui-dyn-filter-${filterDef.id}`,
              value: o.value,
              checked: filterDef.type === "radio" ? selected[0] === o.value : selected.includes(o.value),
              onChange: (e) => {
                if (filterDef.type === "radio") {
                  setActiveFilters((prev) => ({ ...prev, [filterDef.field]: e.target.checked ? [o.value] : [] }));
                } else {
                  setActiveFilters((prev) => {
                    const cur = prev[filterDef.field] ?? [];
                    return { ...prev, [filterDef.field]: e.target.checked ? [...cur, o.value] : cur.filter((v) => v !== o.value) };
                  });
                }
              }
            }
          ),
          " ",
          o.value,
          filterDef.showCount ? ` (${o.count})` : ""
        ] }, o.value)) })
      ] }, filterDef.id);
    })
  ] });
}
var DEFAULT_STRINGS2 = {
  noResults: "No results found.",
  all: "All",
  clearFilters: "\xD7 Clear filters",
  search: "Search",
  call: "Call",
  email: "Email",
  website: "Website",
  route: "Directions",
  moreInfo: "More info"
};
function DynamicContentGrid({
  items = [],
  loading = false,
  error = null,
  cardDesign = "image-card",
  fieldMap = {},
  cols = 3,
  filterBar: filterBarConfig = {},
  title,
  collection,
  detailUrlBuilder,
  strings: stringsProp,
  dateLocale = "nl-NL"
}) {
  const strings = { ...DEFAULT_STRINGS2, ...stringsProp };
  const [activeFilters, setActiveFilters] = useState2({});
  const [searchTerm, setSearchTerm] = useState2("");
  const displayItems = applyUserFilters(items, activeFilters, searchTerm, filterBarConfig);
  const hasFilterBar = filterBarConfig.enabled && (filterBarConfig.searchEnabled || (filterBarConfig.filters ?? []).some((f) => f.field));
  const pos = filterBarConfig.position ?? "top";
  const hasActive = searchTerm.length > 0 || Object.values(activeFilters).some((v) => v.length > 0);
  const buildHref = (item) => detailUrlBuilder ? detailUrlBuilder(item) : defaultDetailUrl(item, fieldMap, collection);
  const gridContent = /* @__PURE__ */ jsxs3(Fragment2, { children: [
    loading && /* @__PURE__ */ jsx3("div", { className: "sui-dyn-grid", style: { "--sui-dyn-cols": Math.min(cols, 4) }, children: Array.from({ length: Math.min(cols * 2, 6) }).map((_, i) => /* @__PURE__ */ jsx3("div", { className: "sui-dyn-skeleton" }, i)) }),
    !loading && error && /* @__PURE__ */ jsxs3("p", { className: "sui-dyn-error", children: [
      "\u26A0 ",
      error
    ] }),
    !loading && !error && displayItems.length === 0 && /* @__PURE__ */ jsx3("p", { className: "sui-dyn-no-items", children: strings.noResults }),
    !loading && !error && displayItems.length > 0 && /* @__PURE__ */ jsx3("div", { className: "sui-dyn-grid", style: { "--sui-dyn-cols": Math.min(cols, 4) }, children: displayItems.map((item) => {
      const href = cardDesign === "contact-card" ? "" : buildHref(item);
      const Wrap = href ? "a" : "article";
      return /* @__PURE__ */ jsx3(Wrap, { className: `sui-dyn-card sui-dyn-card-${cardDesign}`, ...href ? { href } : {}, children: /* @__PURE__ */ jsx3(PreviewCard, { item, design: cardDesign, fieldMap, collection, detailUrlBuilder, dateLocale, strings }) }, item.id ?? item.name);
    }) })
  ] });
  return /* @__PURE__ */ jsxs3("section", { className: "sui-dyn-wrap", children: [
    title && /* @__PURE__ */ jsx3("h2", { className: "sui-dyn-title", children: title }),
    hasFilterBar ? /* @__PURE__ */ jsxs3("div", { className: `sui-dyn-layout sui-dyn-layout--${pos}`, children: [
      pos === "right" || pos === "bottom" ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3("div", { className: "sui-dyn-grid-wrap", children: gridContent }),
        /* @__PURE__ */ jsx3(
          FilterBar,
          {
            allItems: items,
            filterBar: filterBarConfig,
            activeFilters,
            searchTerm,
            setActiveFilters,
            setSearchTerm,
            strings
          }
        )
      ] }) : /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3(
          FilterBar,
          {
            allItems: items,
            filterBar: filterBarConfig,
            activeFilters,
            searchTerm,
            setActiveFilters,
            setSearchTerm,
            strings
          }
        ),
        /* @__PURE__ */ jsx3("div", { className: "sui-dyn-grid-wrap", children: gridContent })
      ] }),
      hasActive && /* @__PURE__ */ jsx3("button", { type: "button", className: "sui-dyn-reset-btn", onClick: () => {
        setActiveFilters({});
        setSearchTerm("");
      }, children: strings.clearFilters })
    ] }) : gridContent
  ] });
}

// src/chatStrings.js
var CHAT_STRINGS = {
  nl: {
    title: "Stel je vraag",
    inputLabel: "Typ je vraag",
    send: "Verstuur",
    startHint: "Kies een onderwerp of stel een vraag hieronder",
    thinking: "Aan het antwoorden\u2026",
    error: "Er ging iets mis. Probeer het opnieuw.",
    retry: "Opnieuw proberen",
    relatedHelp: "Gerelateerde hulp",
    call: "Bellen",
    email: "E-mailen",
    website: "Website",
    route: "Route",
    moreInfo: "Meer info",
    openChat: "Open chat",
    closeChat: "Sluit chat",
    clearChat: "Wis chat",
    clearInput: "Wissen",
    you: "Jij",
    assistant: "Stappie",
    disclaimer: "Dit is een AI-assistent. Controleer belangrijke informatie altijd bij de organisatie zelf.",
    languageName: "Dutch",
    aboutYouTitle: "Over jou (optioneel)",
    nameLabel: "Hoe mogen we je noemen?",
    ageLabel: "Wat is je leeftijd?",
    genderLabel: "Wat is je geslacht?",
    intakeNotStored: "Optioneel. Wordt niet opgeslagen.",
    loggingNotice: "We kunnen dit gesprek gebruiken om onze dienstverlening te verbeteren.",
    loggingOptOutLink: "Afmelden voor deze sessie",
    loggingOptOutModalTitle: "Gesprek niet opslaan?",
    loggingOptOutModalBody: "Hiermee stoppen we het opslaan van dit gesprek voor beoordeling, voor de rest van deze browsersessie. Je kunt de chat gewoon blijven gebruiken.",
    loggingOptOutConfirm: "Uitschakelen voor deze sessie",
    loggingOptOutCancel: "Annuleren",
    loggingOptedOutNotice: "Opslaan is uitgeschakeld voor deze sessie."
  },
  en: {
    title: "Ask your question",
    inputLabel: "Type your question",
    send: "Send",
    startHint: "Choose a topic or ask a question below",
    thinking: "Thinking\u2026",
    error: "Something went wrong. Please try again.",
    retry: "Try again",
    relatedHelp: "Related help",
    call: "Call",
    email: "Email",
    website: "Website",
    route: "Directions",
    moreInfo: "More info",
    openChat: "Open chat",
    closeChat: "Close chat",
    clearChat: "Clear chat",
    clearInput: "Clear",
    you: "You",
    assistant: "Stappie",
    disclaimer: "This is an AI assistant. Always double-check important details with the organisation itself.",
    languageName: "English",
    aboutYouTitle: "About you (optional)",
    nameLabel: "What should we call you?",
    ageLabel: "Your age",
    genderLabel: "Your gender",
    intakeNotStored: "Optional. Never stored.",
    loggingNotice: "We may use this conversation to help improve our services.",
    loggingOptOutLink: "Opt out for this session",
    loggingOptOutModalTitle: "Turn off conversation logging?",
    loggingOptOutModalBody: "This stops us from saving this conversation for review, for the rest of this browser session. You can keep chatting as normal.",
    loggingOptOutConfirm: "Turn off for this session",
    loggingOptOutCancel: "Cancel",
    loggingOptedOutNotice: "Logging is turned off for this session."
  },
  ar: {
    title: "\u0627\u0637\u0631\u062D \u0633\u0624\u0627\u0644\u0643",
    inputLabel: "\u0627\u0643\u062A\u0628 \u0633\u0624\u0627\u0644\u0643",
    send: "\u0625\u0631\u0633\u0627\u0644",
    startHint: "\u0627\u062E\u062A\u0631 \u0645\u0648\u0636\u0648\u0639\u064B\u0627 \u0623\u0648 \u0627\u0637\u0631\u062D \u0633\u0624\u0627\u0644\u0627\u064B \u0623\u062F\u0646\u0627\u0647",
    thinking: "\u062C\u0627\u0631\u064D \u0627\u0644\u0643\u062A\u0627\u0628\u0629\u2026",
    error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0645\u0627. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",
    retry: "\u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649",
    relatedHelp: "\u0645\u0633\u0627\u0639\u062F\u0629 \u0630\u0627\u062A \u0635\u0644\u0629",
    call: "\u0627\u062A\u0635\u0627\u0644",
    email: "\u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A",
    website: "\u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A",
    route: "\u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",
    moreInfo: "\u0645\u0632\u064A\u062F \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A",
    openChat: "\u0627\u0641\u062A\u062D \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",
    closeChat: "\u0623\u063A\u0644\u0642 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",
    clearChat: "\u0645\u0633\u062D \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",
    clearInput: "\u0645\u0633\u062D",
    you: "\u0623\u0646\u062A",
    assistant: "\u0633\u062A\u0627\u0628\u064A",
    disclaimer: "\u0647\u0630\u0627 \u0645\u0633\u0627\u0639\u062F \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A. \u062A\u062D\u0642\u0642 \u062F\u0627\u0626\u0645\u064B\u0627 \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 \u0645\u0639 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.",
    languageName: "Arabic",
    aboutYouTitle: "\u0639\u0646\u0643 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)",
    nameLabel: "\u0643\u064A\u0641 \u0646\u0646\u0627\u062F\u064A\u0643\u061F",
    ageLabel: "\u0639\u0645\u0631\u0643",
    genderLabel: "\u062C\u0646\u0633\u0643",
    intakeNotStored: "\u0627\u062E\u062A\u064A\u0627\u0631\u064A. \u0644\u0627 \u064A\u062A\u0645 \u062D\u0641\u0638\u0647 \u0623\u0628\u062F\u064B\u0627.",
    loggingNotice: "\u0642\u062F \u0646\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0644\u062A\u062D\u0633\u064A\u0646 \u062E\u062F\u0645\u0627\u062A\u0646\u0627.",
    loggingOptOutLink: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0644\u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629",
    loggingOptOutModalTitle: "\u0625\u064A\u0642\u0627\u0641 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629\u061F",
    loggingOptOutModalBody: "\u0633\u064A\u0624\u062F\u064A \u0647\u0630\u0627 \u0625\u0644\u0649 \u0625\u064A\u0642\u0627\u0641 \u062D\u0641\u0638 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629\u060C \u0644\u0628\u0642\u064A\u0629 \u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0647\u0630\u0647. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0627\u0633\u062A\u0645\u0631\u0627\u0631 \u0641\u064A \u0627\u0644\u062F\u0631\u062F\u0634\u0629 \u0643\u0627\u0644\u0645\u0639\u062A\u0627\u062F.",
    loggingOptOutConfirm: "\u0625\u064A\u0642\u0627\u0641 \u0644\u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629",
    loggingOptOutCancel: "\u0625\u0644\u063A\u0627\u0621",
    loggingOptedOutNotice: "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0644\u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629."
  },
  tr: {
    title: "Sorunuzu sorun",
    inputLabel: "Sorunuzu yaz\u0131n",
    send: "G\xF6nder",
    startHint: "Bir konu se\xE7in veya a\u015Fa\u011F\u0131ya bir soru yaz\u0131n",
    thinking: "Yan\u0131tlan\u0131yor\u2026",
    error: "Bir \u015Feyler ters gitti. L\xFCtfen tekrar deneyin.",
    retry: "Tekrar dene",
    relatedHelp: "\u0130lgili yard\u0131m",
    call: "Ara",
    email: "E-posta g\xF6nder",
    website: "Web sitesi",
    route: "Yol tarifi",
    moreInfo: "Daha fazla bilgi",
    openChat: "Sohbeti a\xE7",
    closeChat: "Sohbeti kapat",
    clearChat: "Sohbeti temizle",
    clearInput: "Temizle",
    you: "Sen",
    assistant: "Stappie",
    disclaimer: "Bu bir yapay zeka asistan\u0131d\u0131r. \xD6nemli bilgileri her zaman kurulu\u015Fla do\u011Frulay\u0131n.",
    languageName: "Turkish",
    aboutYouTitle: "Hakk\u0131nda (iste\u011Fe ba\u011Fl\u0131)",
    nameLabel: "Sana nas\u0131l hitap edelim?",
    ageLabel: "Ya\u015F\u0131n",
    genderLabel: "Cinsiyetin",
    intakeNotStored: "\u0130ste\u011Fe ba\u011Fl\u0131. Asla saklanmaz.",
    loggingNotice: "Bu g\xF6r\xFC\u015Fmeyi hizmetlerimizi geli\u015Ftirmek i\xE7in kullanabiliriz.",
    loggingOptOutLink: "Bu oturum i\xE7in devre d\u0131\u015F\u0131 b\u0131rak",
    loggingOptOutModalTitle: "G\xF6r\xFC\u015Fme kayd\u0131 kapat\u0131ls\u0131n m\u0131?",
    loggingOptOutModalBody: "Bu, bu taray\u0131c\u0131 oturumunun geri kalan\u0131nda g\xF6r\xFC\u015Fmenin incelenmek \xFCzere kaydedilmesini durdurur. Sohbete normal \u015Fekilde devam edebilirsin.",
    loggingOptOutConfirm: "Bu oturum i\xE7in kapat",
    loggingOptOutCancel: "\u0130ptal",
    loggingOptedOutNotice: "Bu oturum i\xE7in kay\u0131t kapat\u0131ld\u0131."
  },
  fr: {
    title: "Posez votre question",
    inputLabel: "\xC9crivez votre question",
    send: "Envoyer",
    startHint: "Choisissez un sujet ou posez une question ci-dessous",
    thinking: "R\xE9ponse en cours\u2026",
    error: "Une erreur s'est produite. Veuillez r\xE9essayer.",
    retry: "R\xE9essayer",
    relatedHelp: "Aide associ\xE9e",
    call: "Appeler",
    email: "Envoyer un e-mail",
    website: "Site web",
    route: "Itin\xE9raire",
    moreInfo: "Plus d'infos",
    openChat: "Ouvrir le chat",
    closeChat: "Fermer le chat",
    clearChat: "Effacer la conversation",
    clearInput: "Effacer",
    you: "Vous",
    assistant: "Stappie",
    disclaimer: "Ceci est un assistant IA. V\xE9rifiez toujours les informations importantes aupr\xE8s de l'organisation elle-m\xEAme.",
    languageName: "French",
    aboutYouTitle: "\xC0 propos de vous (facultatif)",
    nameLabel: "Comment devons-nous vous appeler ?",
    ageLabel: "Votre \xE2ge",
    genderLabel: "Votre genre",
    intakeNotStored: "Facultatif. Jamais enregistr\xE9.",
    loggingNotice: "Nous pouvons utiliser cette conversation pour am\xE9liorer nos services.",
    loggingOptOutLink: "Se d\xE9sinscrire pour cette session",
    loggingOptOutModalTitle: "D\xE9sactiver l'enregistrement de la conversation ?",
    loggingOptOutModalBody: "Cela emp\xEAchera l'enregistrement de cette conversation \xE0 des fins d'examen, pour le reste de cette session de navigateur. Vous pouvez continuer \xE0 discuter normalement.",
    loggingOptOutConfirm: "D\xE9sactiver pour cette session",
    loggingOptOutCancel: "Annuler",
    loggingOptedOutNotice: "L'enregistrement est d\xE9sactiv\xE9 pour cette session."
  },
  de: {
    title: "Stell deine Frage",
    inputLabel: "Frage eingeben",
    send: "Senden",
    startHint: "W\xE4hle ein Thema oder stelle unten eine Frage",
    thinking: "Antwortet\u2026",
    error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    retry: "Erneut versuchen",
    relatedHelp: "Verwandte Hilfe",
    call: "Anrufen",
    email: "E-Mail senden",
    website: "Webseite",
    route: "Route",
    moreInfo: "Mehr Infos",
    openChat: "Chat \xF6ffnen",
    closeChat: "Chat schlie\xDFen",
    clearChat: "Chat l\xF6schen",
    clearInput: "L\xF6schen",
    you: "Du",
    assistant: "Stappie",
    disclaimer: "Dies ist ein KI-Assistent. \xDCberpr\xFCfe wichtige Informationen immer bei der Organisation selbst.",
    languageName: "German",
    aboutYouTitle: "\xDCber dich (optional)",
    nameLabel: "Wie d\xFCrfen wir dich nennen?",
    ageLabel: "Dein Alter",
    genderLabel: "Dein Geschlecht",
    intakeNotStored: "Optional. Wird nie gespeichert.",
    loggingNotice: "Wir k\xF6nnen dieses Gespr\xE4ch nutzen, um unsere Dienste zu verbessern.",
    loggingOptOutLink: "F\xFCr diese Sitzung abmelden",
    loggingOptOutModalTitle: "Gespr\xE4chsprotokollierung deaktivieren?",
    loggingOptOutModalBody: "Dadurch wird dieses Gespr\xE4ch f\xFCr den Rest dieser Browsersitzung nicht mehr zur \xDCberpr\xFCfung gespeichert. Du kannst den Chat ganz normal weiter nutzen.",
    loggingOptOutConfirm: "F\xFCr diese Sitzung deaktivieren",
    loggingOptOutCancel: "Abbrechen",
    loggingOptedOutNotice: "Die Protokollierung ist f\xFCr diese Sitzung deaktiviert."
  },
  es: {
    title: "Haz tu pregunta",
    inputLabel: "Escribe tu pregunta",
    send: "Enviar",
    startHint: "Elige un tema o haz una pregunta abajo",
    thinking: "Pensando\u2026",
    error: "Algo sali\xF3 mal. Int\xE9ntalo de nuevo.",
    retry: "Intentar de nuevo",
    relatedHelp: "Ayuda relacionada",
    call: "Llamar",
    email: "Enviar correo",
    website: "Sitio web",
    route: "C\xF3mo llegar",
    moreInfo: "M\xE1s informaci\xF3n",
    openChat: "Abrir chat",
    closeChat: "Cerrar chat",
    clearChat: "Borrar chat",
    clearInput: "Borrar",
    you: "T\xFA",
    assistant: "Stappie",
    disclaimer: "Esto es un asistente de IA. Verifica siempre la informaci\xF3n importante con la organizaci\xF3n misma.",
    languageName: "Spanish",
    aboutYouTitle: "Sobre ti (opcional)",
    nameLabel: "\xBFC\xF3mo quieres que te llamemos?",
    ageLabel: "Tu edad",
    genderLabel: "Tu g\xE9nero",
    intakeNotStored: "Opcional. Nunca se guarda.",
    loggingNotice: "Podemos usar esta conversaci\xF3n para mejorar nuestros servicios.",
    loggingOptOutLink: "Darse de baja para esta sesi\xF3n",
    loggingOptOutModalTitle: "\xBFDesactivar el registro de la conversaci\xF3n?",
    loggingOptOutModalBody: "Esto evitar\xE1 que guardemos esta conversaci\xF3n para revisi\xF3n durante el resto de esta sesi\xF3n del navegador. Puedes seguir chateando con normalidad.",
    loggingOptOutConfirm: "Desactivar para esta sesi\xF3n",
    loggingOptOutCancel: "Cancelar",
    loggingOptedOutNotice: "El registro est\xE1 desactivado para esta sesi\xF3n."
  },
  pt: {
    title: "Fa\xE7a a sua pergunta",
    inputLabel: "Escreva a sua pergunta",
    send: "Enviar",
    startHint: "Escolha um t\xF3pico ou fa\xE7a uma pergunta abaixo",
    thinking: "A responder\u2026",
    error: "Algo correu mal. Tente novamente.",
    retry: "Tentar novamente",
    relatedHelp: "Ajuda relacionada",
    call: "Ligar",
    email: "Enviar e-mail",
    website: "S\xEDtio web",
    route: "Dire\xE7\xF5es",
    moreInfo: "Mais informa\xE7\xE3o",
    openChat: "Abrir chat",
    closeChat: "Fechar chat",
    clearChat: "Limpar chat",
    clearInput: "Limpar",
    you: "Voc\xEA",
    assistant: "Stappie",
    disclaimer: "Isto \xE9 um assistente de IA. Verifique sempre as informa\xE7\xF5es importantes diretamente com a organiza\xE7\xE3o.",
    languageName: "Portuguese",
    aboutYouTitle: "Sobre voc\xEA (opcional)",
    nameLabel: "Como podemos cham\xE1-lo(a)?",
    ageLabel: "A sua idade",
    genderLabel: "O seu g\xE9nero",
    intakeNotStored: "Opcional. Nunca \xE9 guardado.",
    loggingNotice: "Podemos utilizar esta conversa para melhorar os nossos servi\xE7os.",
    loggingOptOutLink: "Cancelar para esta sess\xE3o",
    loggingOptOutModalTitle: "Desativar o registo da conversa?",
    loggingOptOutModalBody: "Isto impede que guardemos esta conversa para revis\xE3o, durante o resto desta sess\xE3o do navegador. Pode continuar a conversar normalmente.",
    loggingOptOutConfirm: "Desativar para esta sess\xE3o",
    loggingOptOutCancel: "Cancelar",
    loggingOptedOutNotice: "O registo est\xE1 desativado para esta sess\xE3o."
  },
  pl: {
    title: "Zadaj pytanie",
    inputLabel: "Wpisz swoje pytanie",
    send: "Wy\u015Blij",
    startHint: "Wybierz temat lub zadaj pytanie poni\u017Cej",
    thinking: "Odpowiadam\u2026",
    error: "Co\u015B posz\u0142o nie tak. Spr\xF3buj ponownie.",
    retry: "Spr\xF3buj ponownie",
    relatedHelp: "Powi\u0105zana pomoc",
    call: "Zadzwo\u0144",
    email: "Wy\u015Blij e-mail",
    website: "Strona internetowa",
    route: "Wskaz\xF3wki dojazdu",
    moreInfo: "Wi\u0119cej informacji",
    openChat: "Otw\xF3rz czat",
    closeChat: "Zamknij czat",
    clearChat: "Wyczy\u015B\u0107 czat",
    clearInput: "Wyczy\u015B\u0107",
    you: "Ty",
    assistant: "Stappie",
    disclaimer: "To jest asystent AI. Zawsze sprawdzaj wa\u017Cne informacje bezpo\u015Brednio w organizacji.",
    languageName: "Polish",
    aboutYouTitle: "O tobie (opcjonalnie)",
    nameLabel: "Jak mamy si\u0119 do ciebie zwraca\u0107?",
    ageLabel: "Tw\xF3j wiek",
    genderLabel: "Twoja p\u0142e\u0107",
    intakeNotStored: "Opcjonalne. Nigdy nie zapisywane.",
    loggingNotice: "Mo\u017Cemy wykorzysta\u0107 t\u0119 rozmow\u0119 do ulepszenia naszych us\u0142ug.",
    loggingOptOutLink: "Zrezygnuj na t\u0119 sesj\u0119",
    loggingOptOutModalTitle: "Wy\u0142\u0105czy\u0107 zapisywanie rozmowy?",
    loggingOptOutModalBody: "Spowoduje to zaprzestanie zapisywania tej rozmowy do przegl\u0105du przez reszt\u0119 tej sesji przegl\u0105darki. Mo\u017Cesz normalnie kontynuowa\u0107 czat.",
    loggingOptOutConfirm: "Wy\u0142\u0105cz na t\u0119 sesj\u0119",
    loggingOptOutCancel: "Anuluj",
    loggingOptedOutNotice: "Zapisywanie jest wy\u0142\u0105czone na t\u0119 sesj\u0119."
  },
  ru: {
    title: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u0441\u0432\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441",
    inputLabel: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u0432\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441",
    send: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C",
    startHint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043C\u0443 \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u043D\u0438\u0436\u0435",
    thinking: "\u041F\u0435\u0447\u0430\u0442\u0430\u0435\u0442\u2026",
    error: "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.",
    retry: "\u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430",
    relatedHelp: "\u041F\u043E\u0445\u043E\u0436\u0430\u044F \u043F\u043E\u043C\u043E\u0449\u044C",
    call: "\u041F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C",
    email: "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C",
    website: "\u0412\u0435\u0431-\u0441\u0430\u0439\u0442",
    route: "\u041C\u0430\u0440\u0448\u0440\u0443\u0442",
    moreInfo: "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435",
    openChat: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442",
    closeChat: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442",
    clearChat: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0447\u0430\u0442",
    clearInput: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    you: "\u0412\u044B",
    assistant: "Stappie",
    disclaimer: "\u042D\u0442\u043E \u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442. \u0412\u0441\u0435\u0433\u0434\u0430 \u0443\u0442\u043E\u0447\u043D\u044F\u0439\u0442\u0435 \u0432\u0430\u0436\u043D\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E \u043D\u0435\u043F\u043E\u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0435\u043D\u043D\u043E \u0432 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438.",
    languageName: "Russian",
    aboutYouTitle: "\u041E \u0432\u0430\u0441 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    nameLabel: "\u041A\u0430\u043A \u043A \u0432\u0430\u043C \u043E\u0431\u0440\u0430\u0449\u0430\u0442\u044C\u0441\u044F?",
    ageLabel: "\u0412\u0430\u0448 \u0432\u043E\u0437\u0440\u0430\u0441\u0442",
    genderLabel: "\u0412\u0430\u0448 \u043F\u043E\u043B",
    intakeNotStored: "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E. \u041D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F.",
    loggingNotice: "\u041C\u044B \u043C\u043E\u0436\u0435\u043C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0434\u043B\u044F \u0443\u043B\u0443\u0447\u0448\u0435\u043D\u0438\u044F \u043D\u0430\u0448\u0438\u0445 \u0443\u0441\u043B\u0443\u0433.",
    loggingOptOutLink: "\u041E\u0442\u043A\u0430\u0437\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u044D\u0442\u0443 \u0441\u0435\u0441\u0441\u0438\u044E",
    loggingOptOutModalTitle: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430?",
    loggingOptOutModalBody: "\u042D\u0442\u043E \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0433\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043D\u0430 \u043E\u0441\u0442\u0430\u0432\u0448\u0443\u044E\u0441\u044F \u0447\u0430\u0441\u0442\u044C \u044D\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430. \u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C \u043E\u0431\u0449\u0430\u0442\u044C\u0441\u044F \u0432 \u043E\u0431\u044B\u0447\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435.",
    loggingOptOutConfirm: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438",
    loggingOptOutCancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    loggingOptedOutNotice: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438."
  },
  zh: {
    title: "\u63D0\u51FA\u60A8\u7684\u95EE\u9898",
    inputLabel: "\u8F93\u5165\u60A8\u7684\u95EE\u9898",
    send: "\u53D1\u9001",
    startHint: "\u9009\u62E9\u4E00\u4E2A\u4E3B\u9898\uFF0C\u6216\u5728\u4E0B\u65B9\u63D0\u95EE",
    thinking: "\u6B63\u5728\u56DE\u7B54\u2026",
    error: "\u51FA\u4E86\u70B9\u95EE\u9898\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    retry: "\u91CD\u8BD5",
    relatedHelp: "\u76F8\u5173\u5E2E\u52A9",
    call: "\u81F4\u7535",
    email: "\u53D1\u9001\u90AE\u4EF6",
    website: "\u7F51\u7AD9",
    route: "\u8DEF\u7EBF",
    moreInfo: "\u66F4\u591A\u4FE1\u606F",
    openChat: "\u6253\u5F00\u804A\u5929",
    closeChat: "\u5173\u95ED\u804A\u5929",
    clearChat: "\u6E05\u9664\u804A\u5929",
    clearInput: "\u6E05\u9664",
    you: "\u4F60",
    assistant: "Stappie",
    disclaimer: "\u8FD9\u662F\u4E00\u4E2A\u4EBA\u5DE5\u667A\u80FD\u52A9\u624B\u3002\u8BF7\u52A1\u5FC5\u76F4\u63A5\u5411\u8BE5\u673A\u6784\u6838\u5B9E\u91CD\u8981\u4FE1\u606F\u3002",
    languageName: "Chinese",
    aboutYouTitle: "\u5173\u4E8E\u4F60\uFF08\u53EF\u9009\uFF09",
    nameLabel: "\u6211\u4EEC\u8BE5\u600E\u4E48\u79F0\u547C\u4F60\uFF1F",
    ageLabel: "\u4F60\u7684\u5E74\u9F84",
    genderLabel: "\u4F60\u7684\u6027\u522B",
    intakeNotStored: "\u53EF\u9009\u3002\u7EDD\u4E0D\u4F1A\u88AB\u4FDD\u5B58\u3002",
    loggingNotice: "\u6211\u4EEC\u53EF\u80FD\u4F1A\u4F7F\u7528\u6B64\u5BF9\u8BDD\u6765\u6539\u8FDB\u6211\u4EEC\u7684\u670D\u52A1\u3002",
    loggingOptOutLink: "\u672C\u6B21\u4F1A\u8BDD\u9000\u51FA",
    loggingOptOutModalTitle: "\u5173\u95ED\u5BF9\u8BDD\u8BB0\u5F55\uFF1F",
    loggingOptOutModalBody: "\u8FD9\u5C06\u5728\u672C\u6B21\u6D4F\u89C8\u5668\u4F1A\u8BDD\u7684\u5269\u4F59\u65F6\u95F4\u5185\u505C\u6B62\u4FDD\u5B58\u6B64\u5BF9\u8BDD\u4EE5\u4F9B\u5BA1\u6838\u3002\u60A8\u4ECD\u7136\u53EF\u4EE5\u6B63\u5E38\u804A\u5929\u3002",
    loggingOptOutConfirm: "\u672C\u6B21\u4F1A\u8BDD\u5173\u95ED",
    loggingOptOutCancel: "\u53D6\u6D88",
    loggingOptedOutNotice: "\u672C\u6B21\u4F1A\u8BDD\u8BB0\u5F55\u5DF2\u5173\u95ED\u3002"
  }
};
export {
  CHAT_STRINGS,
  ChatInterface,
  DynamicContentGrid,
  STARTER_ICONS
};
//# sourceMappingURL=index.js.map