import { useState, useRef, useCallback, useEffect } from 'react';
import { Bot, Send, Phone, Mail, Globe, Loader2, AlertCircle, X, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';

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
    thinking: 'Thinking…', error: 'Something went wrong. Please try again.',
    retry: 'Try again', relatedHelp: 'Related help',
    call: 'Call', email: 'Email', website: 'Website', moreInfo: 'More info',
    openChat: 'Open chat', closeChat: 'Close chat', clearChat: 'Clear chat',
    you: 'You', assistant: 'Assistant',
    disclaimer: 'This is an AI assistant. Always double-check important details with the organisation itself.',
};

// ── Minimal markdown renderer ────────────────────────────────────────────
// Two independent safety layers before this ever reaches dangerouslySetInnerHTML:
// (1) all HTML entities in the raw model output are escaped FIRST, so the model's text
//     can never introduce tag/attribute syntax — only a fixed, hardcoded set of tags is
//     reintroduced afterward via regex substitution, and only around text the model
//     supplied, never around markup it supplied; and
// (2) the final HTML is run through DOMPurify as a second, independent safety net.
const SAFE_ABSOLUTE = /^(https?:|mailto:|tel:)/i;
function sanitizeUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return SAFE_ABSOLUTE.test(u) ? u : '';
    return u; // relative URL — safe, resolves against this origin
}
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

function SourceCard({ meta, strings, moreInfoHref }) {
    let ctx = {};
    try { ctx = JSON.parse(meta.context || '{}'); } catch { /* ignore */ }
    const safeUrl = sanitizeUrl(ctx.url);
    const infoHref = moreInfoHref ? moreInfoHref(meta.entity_id) : null;
    return (
        <div className="sui-chat-source-card">
            <div className="sui-chat-source-title">{meta.name || ctx.naam || ''}</div>
            {ctx.adres && <div className="sui-chat-source-address">{ctx.adres}</div>}
            <div className="sui-chat-source-actions">
                {ctx.tel && (
                    <a className="sui-chat-action-btn" href={`tel:${ctx.tel.replace(/\s+/g, '')}`}>
                        <Phone className="sui-chat-icon" /> {strings.call}
                    </a>
                )}
                {ctx.email && (
                    <a className="sui-chat-action-btn" href={`mailto:${ctx.email}`}>
                        <Mail className="sui-chat-icon" /> {strings.email}
                    </a>
                )}
                {safeUrl && (
                    <a className="sui-chat-action-btn" href={safeUrl} target="_blank" rel="noopener noreferrer">
                        <Globe className="sui-chat-icon" /> {strings.website}
                    </a>
                )}
                {infoHref && (
                    <a className="sui-chat-action-btn sui-chat-action-btn--info" href={infoHref}>
                        {strings.moreInfo}
                    </a>
                )}
            </div>
        </div>
    );
}

function Message({ role, content, chunks, streaming, strings, moreInfoHref }) {
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
                                <SourceCard key={s.meta.entity_id} meta={s.meta} strings={strings} moreInfoHref={moreInfoHref} />
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
    moreInfoHref = null,
    persistKey = null,
}) {
    const strings = { ...DEFAULT_STRINGS, ...stringsProp };
    const isBubble = variant === 'chat-bubble';

    const [open,      setOpen]      = useState(!isBubble);
    const [messages,  setMessages]  = useState(() => loadMessages(persistKey));
    const [input,     setInput]     = useState('');
    const [streaming, setStreaming] = useState('');
    const [pending,   setPending]   = useState(false);
    const [error,     setError]     = useState('');
    const logRef   = useRef(null);
    const inputRef = useRef(null);
    const toggleRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        });
    }, []);

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError('');
        saveMessages(persistKey, []);
        if (persistKey) { try { sessionStorage.removeItem(persistKey); } catch { /* ignore */ } }
        inputRef.current?.focus();
    }, [persistKey]);

    const send = useCallback(async (e) => {
        e.preventDefault();
        const query = input.trim();
        if (!query || pending) return;

        setError('');
        const nextMessages = [...messages, { role: 'user', content: query }];
        setMessages(nextMessages);
        saveMessages(persistKey, nextMessages);
        setInput('');
        setPending(true);
        setStreaming(' ');
        scrollToBottom();

        const apiUrl = `https://${aiSearchId}.search.ai.cloudflare.com/chat/completions`;
        const body = {
            messages: [
                { role: 'system', content: `Respond in ${languageName}. Keep answers concise and easy to read for someone who may be in a stressful situation.` },
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
    }, [input, pending, messages, aiSearchId, languageName, persistKey, strings.error, scrollToBottom]);

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

            <div className="sui-chat-log" role="log" aria-relevant="additions" ref={logRef}>
                {messages.length === 0 && !streaming && (
                    <p className="sui-chat-log-hint">{strings.inputLabel}…</p>
                )}
                {messages.map((m, i) => (
                    <Message key={i} {...m} strings={strings} moreInfoHref={moreInfoHref} />
                ))}
                {streaming && <Message role="assistant" content={streaming} streaming strings={strings} moreInfoHref={moreInfoHref} />}
            </div>

            <div className="sui-chat-status" role="status" aria-live="polite">
                {pending && !error ? strings.thinking : ''}
            </div>

            {error && (
                <p className="sui-chat-error"><AlertCircle className="sui-chat-icon-sm" /> {error}</p>
            )}

            <form className="sui-chat-form" onSubmit={send}>
                <label className="sui-chat-sr-only">{strings.inputLabel}
                    <input
                        ref={inputRef}
                        type="text"
                        className="sui-chat-input"
                        placeholder={placeholder || strings.inputLabel}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={pending}
                        autoComplete="off"
                    />
                </label>
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
