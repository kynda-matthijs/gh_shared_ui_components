import { useState, useRef, useCallback, useEffect, useId } from 'react';
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

export default function ChatInterface({
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
}) {
    const strings = { ...DEFAULT_STRINGS, ...stringsProp };
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
    const [error,     setError]     = useState('');
    const logRef   = useRef(null);
    const inputRef = useRef(null);
    const toggleRef = useRef(null);
    const inputId  = useId();

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

        const apiUrl = `https://${aiSearchId}.search.ai.cloudflare.com/chat/completions`;
        const body = {
            messages: [
                { role: 'system', content: `Respond in ${languageName}. Keep answers concise and easy to read for someone who may be in a stressful situation.${buildIntakeContext(intake)}${extraPrompt ? ` ${extraPrompt}` : ''}` },
                ...nextMessages.map(m => ({ role: m.role, content: m.content })),
            ],
            stream: true,
            ai_search_options: { retrieval: { filters: PUBLIC_FILTER } },
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
        } catch (err) {
            setError(strings.error);
        } finally {
            setStreaming('');
            setPending(false);
            scrollToBottom();
        }
    }, [pending, messages, aiSearchId, languageName, persistKey, strings.error, scrollToBottom, intake]);

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
                {pending && !error ? strings.thinking : ''}
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

            <p className="sui-chat-disclaimer">{strings.disclaimer}</p>
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
}
