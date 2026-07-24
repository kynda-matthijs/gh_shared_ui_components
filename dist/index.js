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
  intakeNotStored: "Optional. Never stored."
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
  const visible = (starters ?? []).filter((s) => s.active !== false);
  if (!visible.length) return null;
  return /* @__PURE__ */ jsx2("div", { className: "sui-chat-starters", children: visible.map((s) => {
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
  autoSendStarters = false
}) {
  const strings = { ...DEFAULT_STRINGS, ...stringsProp };
  const isBubble = variant === "chat-bubble";
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
        { role: "system", content: `Respond in ${languageName}. Keep answers concise and easy to read for someone who may be in a stressful situation.${buildIntakeContext(intake)}${extraPrompt ? ` ${extraPrompt}` : ""}` },
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
    } catch (err) {
      setError(strings.error);
    } finally {
      setStreaming("");
      setPending(false);
      scrollToBottom();
    }
  }, [pending, messages, aiSearchId, languageName, persistKey, strings.error, scrollToBottom, intake]);
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
        /* @__PURE__ */ jsxs2("p", { className: "sui-chat-log-hint", children: [
          strings.inputLabel,
          "\u2026"
        ] }),
        /* @__PURE__ */ jsx2(StarterButtons, { starters, onPick: handleStarterPick, onPreview: setPreviewQuestion })
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
    /* @__PURE__ */ jsx2("p", { className: "sui-chat-disclaimer", children: strings.disclaimer })
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
    intakeNotStored: "Optioneel. Wordt niet opgeslagen."
  },
  en: {
    title: "Ask your question",
    inputLabel: "Type your question",
    send: "Send",
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
    intakeNotStored: "Optional. Never stored."
  },
  ar: {
    title: "\u0627\u0637\u0631\u062D \u0633\u0624\u0627\u0644\u0643",
    inputLabel: "\u0627\u0643\u062A\u0628 \u0633\u0624\u0627\u0644\u0643",
    send: "\u0625\u0631\u0633\u0627\u0644",
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
    intakeNotStored: "\u0627\u062E\u062A\u064A\u0627\u0631\u064A. \u0644\u0627 \u064A\u062A\u0645 \u062D\u0641\u0638\u0647 \u0623\u0628\u062F\u064B\u0627."
  },
  tr: {
    title: "Sorunuzu sorun",
    inputLabel: "Sorunuzu yaz\u0131n",
    send: "G\xF6nder",
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
    intakeNotStored: "\u0130ste\u011Fe ba\u011Fl\u0131. Asla saklanmaz."
  },
  fr: {
    title: "Posez votre question",
    inputLabel: "\xC9crivez votre question",
    send: "Envoyer",
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
    intakeNotStored: "Facultatif. Jamais enregistr\xE9."
  },
  de: {
    title: "Stell deine Frage",
    inputLabel: "Frage eingeben",
    send: "Senden",
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
    intakeNotStored: "Optional. Wird nie gespeichert."
  },
  es: {
    title: "Haz tu pregunta",
    inputLabel: "Escribe tu pregunta",
    send: "Enviar",
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
    intakeNotStored: "Opcional. Nunca se guarda."
  },
  pt: {
    title: "Fa\xE7a a sua pergunta",
    inputLabel: "Escreva a sua pergunta",
    send: "Enviar",
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
    intakeNotStored: "Opcional. Nunca \xE9 guardado."
  },
  pl: {
    title: "Zadaj pytanie",
    inputLabel: "Wpisz swoje pytanie",
    send: "Wy\u015Blij",
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
    intakeNotStored: "Opcjonalne. Nigdy nie zapisywane."
  },
  ru: {
    title: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u0441\u0432\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441",
    inputLabel: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u0432\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441",
    send: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C",
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
    intakeNotStored: "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E. \u041D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F."
  },
  zh: {
    title: "\u63D0\u51FA\u60A8\u7684\u95EE\u9898",
    inputLabel: "\u8F93\u5165\u60A8\u7684\u95EE\u9898",
    send: "\u53D1\u9001",
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
    intakeNotStored: "\u53EF\u9009\u3002\u7EDD\u4E0D\u4F1A\u88AB\u4FDD\u5B58\u3002"
  }
};
export {
  CHAT_STRINGS,
  ChatInterface,
  DynamicContentGrid,
  STARTER_ICONS
};
//# sourceMappingURL=index.js.map