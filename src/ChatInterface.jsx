import { useState, useRef, useCallback, useEffect, useId, forwardRef, useImperativeHandle } from 'react';
import { Bot, Send, Loader2, AlertCircle, X, Trash2, MessageCircle } from 'lucide-react';
import DOMPurify from 'dompurify';
import ActionButtons, { sanitizeUrl } from './ActionButtons.jsx';
import { STARTER_ICONS } from './starterIcons.js';

// ChatInterface — shared, presentational chat UI talking directly to a Cloudflare AI
// Search instance's public endpoint. Used by both:
//   - admin_client's block-editor live preview (thin wrapper supplies aiSearchId via
//     the region embedded in the logged-in session, no persistence, no moreInfoHref)
//   - mini_site's published AI Chatbot block (thin Astro wrapper mounts this as a
//     client:load island, supplies aiSearchId from build-time region data, a
//     sessionStorage persistKey, and a moreInfoHref pointing at the site's own
//     service detail pages)
//
// Optional pilot chat logging (chatLoggingEnabled + chatLogEndpoint props): when both
// are set, each completed exchange is POSTed to chatLogEndpoint (api_server's /log/v1,
// see that repo's chatlog_router.js) fire-and-forget — never awaited, never touched by
// component state, `keepalive: true` so it survives a tab close right after sending.
// A failure there is invisible to the person chatting, by design (see logChatTurn).
// chatLoggingEnabled is resolved by the consuming app from its own CMS config — see
// mini_site's AiChatBlock.astro, which reads it per ai-chat block/widget instance.
//
// Whenever chatLoggingEnabled is on, the disclaimer also grows a notice + an opt-out
// link/modal (LoggingOptOutModal below). Confirming it sets a sessionStorage flag
// (see persistLoggingOptOut/isLoggingOptedOut) that silences logChatTurn for the rest
// of the browser tab — across every logging-enabled widget on the page, not just this
// one instance, since that's what the opt-out copy tells the person.
//
// systemPrompt (optional): extra CMS-configurable instruction appended to the system
// message (see buildSystemMessage) — the consuming app resolves this from its own
// config (e.g. a region-wide default overridable per block) before passing it in;
// this component just appends whatever string it's given.
//
// botName (optional): overrides strings.assistant (the speaker label shown next to
// the bot's messages, "Stappie" by default) with a CMS-configurable name — same
// region-default-overridable-per-block resolution pattern as systemPrompt, resolved
// by the consuming app before passing it in.
//
// Retrieval tuning/diagnostics escape hatch (retrievalOverrides, onSearchChunks, and
// the resendLastQuery() ref method) exists for admin_client's AiChatPreview.jsx
// tuning panel — mirrors Cloudflare's own AI Search playground (adjust max_num_results/
// match_threshold on an existing conversation, inspect retrieved chunks + raw scores).
// All three are no-ops when unused, so mini_site's public widget is unaffected:
//   - retrievalOverrides: merged into ai_search_options.retrieval on every request
//     (see Cloudflare's per-request retrieval schema: max_num_results, match_threshold,
//     retrieval_type, keyword_match_mode, fusion_method, context_expansion, boost_by).
//     `filters` is never overridable this way — see SECURITY note below.
//   - onSearchChunks(chunks): called with the raw retrieved chunks (score + metadata)
//     after each turn, for a caller that wants to render them (not just the curated
//     source cards this component itself shows).
//   - ref.resendLastQuery(): re-sends the last user message as a new turn — lets a
//     tuning panel change retrievalOverrides then replay without retyping, with both
//     attempts left visible in the transcript for comparison.
//
// chatProxyEndpoint/chatProxySettings (optional): routes sendQuery through a
// server-side proxy (see admin_client's src/app/api/chat/route.js) instead of
// calling Cloudflare's public /chat/completions endpoint directly — used for
// adaptive, retrieval-confidence-based model selection, which needs a secret
// (AI Gateway token) that can't live in the browser. When set, the proxy also emits
// `status` SSE events ("searching"/"found:N"/"generating") shown via formatStatus()
// in place of strings.thinking, and its own `chunks` event in the same shape the
// direct path emits, so citations work unchanged either way. Both null (the
// default) is the unmodified direct-to-Cloudflare path.
//
// SECURITY: the `folder: public/` retrieval filter below is NOT a prop and must never
// become one. It's the only thing standing between this being a safe public/preview
// chatbot and a leak of internal case notes indexed alongside it (see the sync module,
// api_server/cf_aisearch_sync.js, and its aiSearchInternalName split). Every caller of
// this component always gets the same filter, unconditionally.
const PUBLIC_FILTER = { folder: { $gte: 'public/', $lt: 'public0' } };

const DEFAULT_STRINGS = {
    title: 'Ask your question', inputLabel: 'Type your question', send: 'Send',
    startHint: 'Choose a topic or ask a question below',
    thinking: 'Thinking…', error: 'Something went wrong. Please try again.',
    retry: 'Try again', relatedHelp: 'Related help',
    call: 'Call', email: 'Email', website: 'Website', route: 'Directions', moreInfo: 'More info',
    openChat: 'Open chat', closeChat: 'Close chat', clearChat: 'Clear chat', clearInput: 'Clear',
    you: 'You', assistant: 'Assistant',
    disclaimer: 'This is an AI assistant. Always double-check important details with the organisation itself.',
    aboutYouTitle: 'About you (optional)',
    nameLabel: 'What should we call you?',
    ageLabel: 'Your age',
    genderLabel: 'Your gender',
    intakeNotStored: 'Optional. Never stored.',
    loggingNotice: 'We may use this conversation to help improve our services.',
    loggingOptOutLink: 'Opt out for this session',
    loggingOptOutModalTitle: 'Turn off conversation logging?',
    loggingOptOutModalBody: 'This stops us from saving this conversation for review, for the rest of this browser session. You can keep chatting as normal.',
    loggingOptOutConfirm: 'Turn off for this session',
    loggingOptOutCancel: 'Cancel',
    loggingOptedOutNotice: 'Logging is turned off for this session.',
    statusSearching: 'Searching…',
    statusFound: '{n} results found…',
    statusGenerating: 'Preparing an answer…',
};

// ── Minimal markdown renderer ────────────────────────────────────────────
// Two independent safety layers before this ever reaches dangerouslySetInnerHTML:
// (1) all HTML entities in the raw model output are escaped FIRST, so the model's text
//     can never introduce tag/attribute syntax — only a fixed, hardcoded set of tags is
//     reintroduced afterward via regex substitution, and only around text the model
//     supplied, never around markup it supplied; and
// (2) the final HTML is run through DOMPurify as a second, independent safety net.
// (sanitizeUrl is imported from ActionButtons.jsx — same function, shared.)
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Safe by construction — see module comment above. The output only ever passes through
// DOMPurify.sanitize() before it's used, providing a second independent safety layer.
function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const safe = sanitizeUrl(url);
        return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    html = html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return DOMPurify.sanitize(html);
}

function parseSSEBlock(block) {
    let eventName = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    return dataLines.length ? { eventName, data: dataLines.join('\n') } : null;
}

// Translates a proxy `status` SSE event (see admin_client's src/app/api/chat/route.js
// — raw values like "searching"/"found:3"/"generating"/"error:400") into the current
// language's UI copy. Only ever populated when chatProxyEndpoint is in play; falls
// back to strings.thinking for anything unrecognized (including the direct-to-
// Cloudflare path, where statusText is always '').
function formatStatus(status, strings) {
    if (!status) return '';
    if (status === 'searching') return strings.statusSearching ?? strings.thinking;
    if (status === 'generating') return strings.statusGenerating ?? strings.thinking;
    const found = status.match(/^found:(\d+)$/);
    if (found) return (strings.statusFound ?? strings.thinking).replace('{n}', found[1]);
    return strings.thinking;
}

function dedupeSources(chunks) {
    const byId = new Map();
    for (const c of chunks ?? []) {
        const meta = c.item?.metadata;
        if (!meta?.entity_id) continue;
        const existing = byId.get(meta.entity_id);
        if (!existing || (c.score ?? 0) > existing.score) {
            byId.set(meta.entity_id, { meta, score: c.score ?? 0 });
        }
    }
    return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}

// ── sessionStorage persistence (optional — only active when persistKey is set) ──
const MAX_STORED_MESSAGES = 40;
function loadMessages(key) {
    if (!key) return [];
    try {
        const raw = sessionStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}
function saveMessages(key, messages) {
    if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))); }
    catch { /* private browsing / quota exceeded — degrade to in-memory only */ }
}

// ── Optional pilot chat logging (see module comment) ──────────────────────
function randomId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A stable id correlating every turn of one conversation into a single logged
// entry (chatlog_router.js upserts by it). NOT the same as persistKey: persistKey
// is one constant string shared by every visitor of a given widget instance, so
// reusing it here would merge unrelated visitors' conversations into one log.
// Reuses the same sessionStorage entry across a reload (like persisted messages)
// when persistKey is set; otherwise lives only for this component instance.
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
        return randomId(); // private browsing / quota exceeded — degrade to in-memory only
    }
}

// Fire-and-forget: never awaited by the caller, never feeds into component state
// (setError/setPending/etc). A logging failure must stay completely invisible to
// the person using the chat widget.
function logChatTurn(endpoint, sessionId, language, messages) {
    if (!endpoint) return;
    try {
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                language,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
            }),
            keepalive: true,
        }).catch(() => {});
    } catch { /* ignore — see comment above */ }
}

// Session-wide opt-out: one flag for the whole browser tab, not scoped per widget —
// so opting out in one chat widget also silences any other logging-enabled widget
// on the same page for the rest of this browser session, matching what the opt-out
// modal actually tells the person. Deliberately NOT keyed by persistKey/aiSearchId.
const LOGGING_OPT_OUT_KEY = 'sui-chat-logging-opted-out';
function isLoggingOptedOut() {
    try { return sessionStorage.getItem(LOGGING_OPT_OUT_KEY) === '1'; }
    catch { return false; } // private browsing / quota exceeded — treat as not opted out
}
function persistLoggingOptOut() {
    try { sessionStorage.setItem(LOGGING_OPT_OUT_KEY, '1'); } catch { /* ignore */ }
}

// moreInfoHrefPattern is a plain string like "/service/{id}/", not a function — props
// passed into an Astro client:load island are serialized to JSON, which can't carry
// functions across the server→client boundary, so this has to stay data, not code.
function buildMoreInfoHref(pattern, entityId) {
    if (!pattern) return null;
    return pattern.replace('{id}', encodeURIComponent(entityId));
}

function SourceCard({ meta, strings, moreInfoHrefPattern }) {
    let ctx = {};
    try { ctx = JSON.parse(meta.context || '{}'); } catch { /* ignore */ }
    const infoHref = buildMoreInfoHref(moreInfoHrefPattern, meta.entity_id);
    return (
        <div className="sui-chat-source-card">
            <div className="sui-chat-source-title">{meta.name || ctx.naam || ''}</div>
            {ctx.adres && <div className="sui-chat-source-address">{ctx.adres}</div>}
            <ActionButtons tel={ctx.tel} email={ctx.email} url={ctx.url} address={ctx.adres} moreInfoHref={infoHref} strings={strings} />
        </div>
    );
}

// Builds the extra line appended to the client-sent system message (see `send` below) —
// only mentions fields the person actually filled in; an empty/untouched field is never
// mentioned at all, since these questions are genuinely optional.
function buildIntakeContext(intake) {
    const parts = [];
    if (intake.name?.trim())   parts.push(`Their name is ${intake.name.trim()} — you may use it to sound warm and personal.`);
    if (intake.age?.trim())    parts.push(`Their age is ${intake.age.trim()}.`);
    if (intake.gender?.trim()) parts.push(`Their gender: ${intake.gender.trim()}.`);
    if (!parts.length) return '';
    return ` ${parts.join(' ')} Never ask them to confirm or repeat this information back.`;
}

// Builds the system message sent with every request. Language: prefer whatever
// language the person is actually typing in (so a Dutch-language site can still help
// someone writing in Arabic or Turkish); languageName (the site's configured/UI
// language) is only the fallback for when that can't be confidently determined —
// not the default. systemPrompt is the CMS-configurable extra instruction (region
// default, optionally overridden per ai-chat block — see the consuming apps'
// wrapper components); extraPrompt is a conversation-starter's own hidden context
// for this one turn only (see StarterButtons/sendQuery below).
function buildSystemMessage(languageName, intake, systemPrompt, extraPrompt) {
    return `Respond in the same language the person is writing in. If you can't confidently `
        + `tell what language that is, respond in ${languageName} instead. Keep answers concise `
        + `and easy to read for someone who may be in a stressful situation.`
        + `${buildIntakeContext(intake)}`
        + `${systemPrompt?.trim() ? ` ${systemPrompt.trim()}` : ''}`
        + `${extraPrompt ? ` ${extraPrompt}` : ''}`;
}

// Optional pre-chat context (name/age/gender) — every field independently opt-in via
// props, local component state only (never sessionStorage/persisted, unlike chat
// history), never blocks sending a message. See buildIntakeContext for how it's used.
function IntakeForm({ intake, onChange, askName, askAge, askGender, strings, open, onToggle }) {
    if (!askName && !askAge && !askGender) return null;
    return (
        <div className="sui-chat-intake">
            <button type="button" className="sui-chat-intake-toggle" onClick={onToggle} aria-expanded={open}>
                {strings.aboutYouTitle}
            </button>
            {open && (
                <div className="sui-chat-intake-fields">
                    {askName && (
                        <label className="sui-chat-intake-field">
                            <span>{strings.nameLabel}</span>
                            <input type="text" value={intake.name} autoComplete="off"
                                onChange={e => onChange({ ...intake, name: e.target.value })} />
                        </label>
                    )}
                    {askAge && (
                        <label className="sui-chat-intake-field">
                            <span>{strings.ageLabel}</span>
                            <input type="number" inputMode="numeric" min="0" max="120" value={intake.age} autoComplete="off"
                                onChange={e => onChange({ ...intake, age: e.target.value })} />
                        </label>
                    )}
                    {askGender && (
                        <label className="sui-chat-intake-field">
                            <span>{strings.genderLabel}</span>
                            <input type="text" value={intake.gender} autoComplete="off"
                                onChange={e => onChange({ ...intake, gender: e.target.value })} />
                        </label>
                    )}
                    <p className="sui-chat-intake-note">{strings.intakeNotStored}</p>
                </div>
            )}
        </div>
    );
}

// Conversation-starter shortcut buttons — CMS-configured (label, icon, the actual
// question, and an optional extraPrompt hidden from the visible transcript, see
// module comment on buildIntakeContext's sibling handling in `sendQuery` below).
// Only shown before the first message, same "welcome screen" as the sui-chat-log-hint
// text above it. `starters` here is expected already-filtered to active-only (the
// caller also needs that same filtered list to decide whether to show the hint/arrow
// at all, so the filtering happens once, in the parent).
// `onPreview` is called with a starter's question on hover/focus (shown as the chat
// input's placeholder, a ghost preview — never the actual input value) and with ''
// on hover-out/blur. `onPick` is the real, "finalizing" action on click — unchanged
// from before, it either sends immediately or fills the input for review, depending
// on autoSendStarters.
function StarterButtons({ starters, onPick, onPreview }) {
    if (!starters.length) return null;
    return (
        <div className="sui-chat-starters">
            {starters.map(s => {
                const Icon = STARTER_ICONS[s.icon] ?? MessageCircle;
                return (
                    <button key={s.id} type="button" className="sui-chat-starter-btn"
                        onClick={() => onPick(s)}
                        onMouseEnter={() => onPreview(s.question)}
                        onMouseLeave={() => onPreview('')}
                        onFocus={() => onPreview(s.question)}
                        onBlur={() => onPreview('')}>
                        <Icon className="sui-chat-icon" />
                        <span>{s.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// Small hand-drawn-style arrow pointing down into the input box, shown alongside the
// welcome-screen hint/starters (see the "welcome screen" empty-state condition around
// `sui-chat-log`) so first-time visitors can find where to actually type. Purely
// decorative (aria-hidden) — the input already has its own accessible label.
function ArrowToInput() {
    return (
        <svg className="sui-chat-arrow-hint" viewBox="0 0 64 56" fill="none" aria-hidden="true">
            <path
                d="M56 6 C 44 3, 30 5, 25 16 C 21 24, 28 27, 22 35 C 17 42, 10 40, 8 48"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
                d="M8 48 L 3 38 M8 48 L 18 43"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            />
        </svg>
    );
}

function Message({ role, content, chunks, streaming, strings, moreInfoHrefPattern }) {
    const sources = role === 'assistant' ? dedupeSources(chunks) : [];
    return (
        <div className={`sui-chat-msg sui-chat-msg--${role}`}>
            <span className="sui-chat-msg-label">{role === 'user' ? strings.you : strings.assistant}</span>
            <div className="sui-chat-msg-bubble" aria-live={role === 'assistant' ? 'polite' : undefined}>
                {role === 'user' ? (
                    <div className="sui-chat-msg-text">{content}</div>
                ) : (
                    <div className="sui-chat-msg-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
                )}
                {streaming && <span className="sui-chat-cursor" aria-hidden="true" />}
                {sources.length > 0 && (
                    <div className="sui-chat-sources">
                        <h4 className="sui-chat-sources-heading">{strings.relatedHelp}</h4>
                        <div className="sui-chat-sources-grid">
                            {sources.map(s => (
                                <SourceCard key={s.meta.entity_id} meta={s.meta} strings={strings} moreInfoHrefPattern={moreInfoHrefPattern} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Confirmation modal for the disclaimer's opt-out link (see the disclaimer block in
// ChatInterface's render). Small and centered — this floats over a chat widget that
// may itself be a small floating bubble, so a full-page side drawer (the pattern
// admin_client uses elsewhere) would look broken here; deliberately its own minimal
// dialog instead. titleId ties the heading to aria-labelledby for screen readers.
function LoggingOptOutModal({ strings, titleId, onConfirm, onCancel }) {
    return (
        <div className="sui-chat-optout-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="sui-chat-optout-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <h3 id={titleId} className="sui-chat-optout-title">{strings.loggingOptOutModalTitle}</h3>
                <p className="sui-chat-optout-body">{strings.loggingOptOutModalBody}</p>
                <div className="sui-chat-optout-actions">
                    <button type="button" className="sui-chat-optout-cancel" onClick={onCancel}>
                        {strings.loggingOptOutCancel}
                    </button>
                    <button type="button" className="sui-chat-optout-confirm" onClick={onConfirm}>
                        {strings.loggingOptOutConfirm}
                    </button>
                </div>
            </div>
        </div>
    );
}

const ChatInterface = forwardRef(function ChatInterface({
    aiSearchId,
    languageName = 'English',
    strings: stringsProp,
    variant = 'chat-page',
    dir = 'ltr',
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
    systemPrompt = '',
    retrievalOverrides = null,
    onSearchChunks = null,
    botName = '',
    chatProxyEndpoint = null,
    chatProxySettings = null,
}, ref) {
    // botName overrides just the one strings.assistant key (the speaker label shown
    // next to each of the bot's messages) rather than requiring the consuming app to
    // clone/override the whole per-language strings table for one field — see
    // buildSystemMessage's sibling pattern (systemPrompt) for the same reasoning.
    const strings = { ...DEFAULT_STRINGS, ...stringsProp, ...(botName?.trim() ? { assistant: botName.trim() } : {}) };
    const isBubble = variant === 'chat-bubble';
    // `active` defaults to on for any starter saved before this field existed. Computed
    // once here since both the hint text above the starters and the starters themselves
    // need to agree on whether there's anything to show.
    const visibleStarters = (starters ?? []).filter(s => s.active !== false);

    const [open,      setOpen]      = useState(!isBubble);
    const [intake,      setIntake]      = useState({ name: '', age: '', gender: '' });
    const [intakeOpen,  setIntakeOpen]  = useState(true);
    // Set when a starter is picked in "review" mode (autoSendStarters=false) — the
    // question fills the input for the person to read/edit, but the starter's hidden
    // extraPrompt still needs to travel with it whenever they do hit send. Cleared on
    // send, and on any manual edit to the input (see the input's onChange below) so an
    // unrelated typed message never picks up a stale extra prompt.
    const pendingExtraPromptRef = useRef('');
    // Starts empty (not from sessionStorage) so server-rendered HTML matches the
    // client's first render — restoring persisted history happens in the effect below,
    // which only runs after hydration, avoiding a hydration mismatch (sessionStorage
    // doesn't exist during Astro's SSR pass, but this component still gets SSR'd even
    // though it's mounted via client:load).
    const [messages,  setMessages]  = useState([]);
    const [input,     setInput]     = useState('');
    // Hover/focus-only ghost preview of a starter's question, shown as the input's
    // placeholder — never written into `input` itself. Only "finalized" into a real
    // value (or sent) by actually clicking the starter, see handleStarterPick.
    const [previewQuestion, setPreviewQuestion] = useState('');
    const [streaming, setStreaming] = useState('');
    const [pending,   setPending]   = useState(false);
    // Only ever populated when chatProxyEndpoint is in play (see sendQuery) — the
    // proxy's `status` SSE events ("searching"/"found:N"/"generating"), shown in
    // place of strings.thinking so the extra retrieval round-trip reads as visible
    // progress rather than a stall. Stays '' for the direct-to-Cloudflare path.
    const [statusText, setStatusText] = useState('');
    const [error,     setError]     = useState('');
    const logRef   = useRef(null);
    const inputRef = useRef(null);
    const toggleRef = useRef(null);
    const inputId  = useId();
    // Lazily computed on first render (not a useState initializer) so it never runs
    // during SSR module evaluation, only once this component actually mounts.
    const sessionIdRef = useRef(null);
    if (sessionIdRef.current == null) sessionIdRef.current = getOrCreateLogSessionId(persistKey);
    // Read after mount, not in a useState initializer — sessionStorage doesn't exist
    // during Astro's SSR pass (same reasoning as the persisted-messages effect below).
    // Only bothers checking when logging is actually on for this widget.
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

    // Client-only: restore any persisted conversation after hydration (see the
    // messages useState above for why this can't happen in the initializer).
    useEffect(() => {
        const stored = loadMessages(persistKey);
        if (stored.length) setMessages(stored);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError('');
        saveMessages(persistKey, []);
        if (persistKey) { try { sessionStorage.removeItem(persistKey); } catch { /* ignore */ } }
        inputRef.current?.focus();
    }, [persistKey]);

    // extraPrompt is a conversation-starter's hidden context (see StarterButtons) —
    // it's appended to the system message for this one turn only, never shown in the
    // visible transcript (nextMessages/Message rendering only ever sees `query`).
    // See buildSystemMessage for how it combines with systemPrompt/languageName/intake.
    const sendQuery = useCallback(async (query, extraPrompt = '') => {
        query = query.trim();
        if (!query || pending) return;

        setError('');
        const nextMessages = [...messages, { role: 'user', content: query }];
        setMessages(nextMessages);
        saveMessages(persistKey, nextMessages);
        setInput('');
        setIntakeOpen(false);
        setPending(true);
        setStreaming(' ');
        scrollToBottom();

        const fullSystemPrompt = buildSystemMessage(languageName, intake, systemPrompt, extraPrompt);

        // chatProxyEndpoint (optional): routes through a server-side proxy instead of
        // Cloudflare's public endpoint directly — see admin_client's
        // src/app/api/chat/route.js. It does its own retrieval + adaptive model
        // selection and builds the final messages array itself, so it only needs the
        // conversation + the fully-resolved system prompt, not ai_search_options.
        // chatProxySettings is opaque here — whatever shape the proxy expects (see
        // registry.js's block.adaptive), this component just forwards it as-is.
        const usingProxy = !!chatProxyEndpoint;
        const apiUrl = usingProxy
            ? chatProxyEndpoint
            : `https://${aiSearchId}.search.ai.cloudflare.com/chat/completions`;
        const body = usingProxy
            ? {
                aiSearchId,
                messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
                systemPrompt: fullSystemPrompt,
                settings: chatProxySettings,
            }
            : {
                messages: [
                    { role: 'system', content: fullSystemPrompt },
                    ...nextMessages.map(m => ({ role: m.role, content: m.content })),
                ],
                stream: true,
                // retrievalOverrides (max_num_results/match_threshold/etc, per Cloudflare's
                // ai_search_options.retrieval schema) is a per-request debugging/tuning
                // escape hatch. `filters` is always present regardless, since the
                // public/-only retrieval scope (see module SECURITY note) must never be
                // overridable by whatever the caller passes in.
                ai_search_options: { retrieval: { ...retrievalOverrides, filters: PUBLIC_FILTER } },
            };

        let assistantText = '';
        let chunks = [];
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                body: JSON.stringify(body),
            });
            if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    const parsed = parseSSEBlock(part);
                    if (!parsed || parsed.data === '[DONE]') continue;
                    if (parsed.eventName === 'chunks') {
                        try { chunks = JSON.parse(parsed.data); } catch { /* ignore */ }
                        continue;
                    }
                    // status/meta: only ever sent by chatProxyEndpoint (see route.js) — a
                    // human-readable progress label ("searching"/"found:3"/"generating")
                    // shown instead of strings.thinking. meta carries structured diagnostics
                    // (bucket/model/scores) that this component doesn't otherwise use, so
                    // it's parsed but intentionally discarded here.
                    if (parsed.eventName === 'status') {
                        setStatusText(parsed.data);
                        continue;
                    }
                    if (parsed.eventName === 'meta') continue;
                    try {
                        const frame = JSON.parse(parsed.data);
                        const delta = frame.choices?.[0]?.delta?.content;
                        if (delta) {
                            assistantText += delta;
                            setStreaming(assistantText);
                            scrollToBottom();
                        }
                    } catch { /* non-JSON / keep-alive line */ }
                }
            }
            if (!assistantText) throw new Error('empty response');
            const withAssistant = [...nextMessages, { role: 'assistant', content: assistantText, chunks }];
            setMessages(withAssistant);
            saveMessages(persistKey, withAssistant);
            if (chatLoggingEnabled && !loggingOptedOut) {
                logChatTurn(chatLogEndpoint, sessionIdRef.current, languageName, withAssistant);
            }
            onSearchChunks?.(chunks);
        } catch (err) {
            setError(strings.error);
        } finally {
            setStreaming('');
            setStatusText('');
            setPending(false);
            scrollToBottom();
        }
    }, [pending, messages, aiSearchId, languageName, persistKey, strings.error, scrollToBottom, intake, chatLoggingEnabled, chatLogEndpoint, systemPrompt, loggingOptedOut, retrievalOverrides, onSearchChunks, chatProxyEndpoint, chatProxySettings]);

    const handleFormSubmit = useCallback((e) => {
        e.preventDefault();
        const extra = pendingExtraPromptRef.current;
        pendingExtraPromptRef.current = '';
        sendQuery(input, extra);
    }, [input, sendQuery]);

    const handleStarterPick = useCallback((starter) => {
        setPreviewQuestion('');
        if (autoSendStarters) {
            sendQuery(starter.question, starter.extraPrompt);
        } else {
            setInput(starter.question);
            pendingExtraPromptRef.current = starter.extraPrompt || '';
            inputRef.current?.focus();
        }
    }, [autoSendStarters, sendQuery]);

    // Imperative escape hatch for a tuning/debugging tool (see admin_client's
    // AiChatPreview.jsx) that wants to re-ask the last question after adjusting
    // retrievalOverrides, without the person retyping it — resendLastQuery() sends it
    // as a genuinely new turn (not a replace-in-place), so both attempts stay visible
    // in the transcript for side-by-side comparison. Unused by mini_site — a ref this
    // component doesn't receive is simply never populated, no behavior change.
    useImperativeHandle(ref, () => ({
        resendLastQuery: () => {
            const lastUser = [...messages].reverse().find(m => m.role === 'user');
            if (lastUser) sendQuery(lastUser.content);
        },
    }), [messages, sendQuery]);

    if (!aiSearchId) return null;

    const panel = (
        <div className="sui-chat-panel">
            <div className="sui-chat-header">
                <Bot className="sui-chat-icon" />
                <span className="sui-chat-header-title">{strings.title}</span>
                <div className="sui-chat-header-actions">
                    <button type="button" className="sui-chat-clear-btn" onClick={clearChat}
                        aria-label={strings.clearChat} title={strings.clearChat}>
                        <Trash2 className="sui-chat-icon-sm" />
                    </button>
                    {isBubble && (
                        <button type="button" className="sui-chat-close-btn" onClick={() => setOpen(false)}
                            aria-label={strings.closeChat}>
                            <X className="sui-chat-icon-sm" />
                        </button>
                    )}
                </div>
            </div>

            <IntakeForm
                intake={intake} onChange={setIntake}
                askName={askName} askAge={askAge} askGender={askGender}
                strings={strings} open={intakeOpen} onToggle={() => setIntakeOpen(v => !v)}
            />

            <div className="sui-chat-log" role="log" aria-relevant="additions" ref={logRef}>
                {messages.length === 0 && !streaming && (
                    <>
                        {visibleStarters.length > 0 && <p className="sui-chat-log-hint">{strings.startHint}</p>}
                        <StarterButtons starters={visibleStarters} onPick={handleStarterPick} onPreview={setPreviewQuestion} />
                    </>
                )}
                {messages.map((m, i) => (
                    <Message key={i} {...m} strings={strings} moreInfoHrefPattern={moreInfoHrefPattern} />
                ))}
                {streaming && <Message role="assistant" content={streaming} streaming strings={strings} moreInfoHrefPattern={moreInfoHrefPattern} />}
            </div>

            <div className="sui-chat-status" role="status" aria-live="polite">
                {pending && !error ? (formatStatus(statusText, strings) || strings.thinking) : ''}
            </div>

            {error && (
                <p className="sui-chat-error"><AlertCircle className="sui-chat-icon-sm" /> {error}</p>
            )}

            <form className="sui-chat-form" onSubmit={handleFormSubmit}>
                <label className="sui-chat-sr-only" htmlFor={inputId}>{strings.inputLabel}</label>
                <div className="sui-chat-input-wrap">
                    {/* {messages.length === 0 && !streaming && <ArrowToInput />} */}
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        className="sui-chat-input"
                        placeholder={previewQuestion || placeholder || strings.inputLabel}
                        value={input}
                        onChange={e => { setInput(e.target.value); pendingExtraPromptRef.current = ''; }}
                        disabled={pending}
                        autoComplete="off"
                    />
                    {input && (
                        <button type="button" className="sui-chat-clear-input-btn"
                            onClick={() => { setInput(''); pendingExtraPromptRef.current = ''; inputRef.current?.focus(); }}
                            aria-label={strings.clearInput} title={strings.clearInput}>
                            <X className="sui-chat-icon-sm" />
                        </button>
                    )}
                </div>
                <button type="submit" className="sui-chat-send-btn" disabled={pending || !input.trim()} aria-label={strings.send}>
                    {pending ? <Loader2 className="sui-chat-icon sui-chat-spin" /> : <Send className="sui-chat-icon" />}
                </button>
            </form>

            <p className="sui-chat-disclaimer">
                {strings.disclaimer}
                {chatLoggingEnabled && (loggingOptedOut ? (
                    <span className="sui-chat-logging-note"> {strings.loggingOptedOutNotice}</span>
                ) : (
                    <span className="sui-chat-logging-note">
                        {' '}{strings.loggingNotice}{' '}
                        <button type="button" className="sui-chat-logging-optout-link" onClick={() => setOptOutModalOpen(true)}>
                            {strings.loggingOptOutLink}
                        </button>
                    </span>
                ))}
            </p>

            {optOutModalOpen && (
                <LoggingOptOutModal
                    strings={strings}
                    titleId={optOutTitleId}
                    onConfirm={confirmLoggingOptOut}
                    onCancel={() => setOptOutModalOpen(false)}
                />
            )}
        </div>
    );

    if (!isBubble) {
        return (
            <section className="sui-chat-widget sui-chat-widget--chat-page" dir={dir}>
                {panel}
            </section>
        );
    }

    return (
        <section className="sui-chat-widget sui-chat-widget--chat-bubble" dir={dir}>
            {open ? panel : (
                <button
                    ref={toggleRef}
                    type="button"
                    className="sui-chat-bubble-toggle"
                    aria-expanded={open}
                    aria-label={strings.openChat}
                    onClick={() => setOpen(true)}
                >
                    <Bot className="sui-chat-icon-lg" />
                </button>
            )}
        </section>
    );
});

export default ChatInterface;
