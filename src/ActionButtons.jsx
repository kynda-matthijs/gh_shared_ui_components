import { Phone, Mail, Globe, MapPin } from 'lucide-react';

// Shared "contact this organisation" button row — call/email/website/route/more-info.
// Used by both ChatInterface's chat-answer source cards and DynamicContentGrid's
// 'contact-card' design, so the two stay visually and behaviorally identical rather
// than drifting as two hand-maintained copies. Rendered via the `.sui-action-btn*`
// classes — see the module comment in each consuming app's global stylesheet for why
// those live in an always-loaded stylesheet rather than a per-block one.
const SAFE_ABSOLUTE = /^(https?:|mailto:|tel:)/i;
export function sanitizeUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return SAFE_ABSOLUTE.test(u) ? u : '';
    return u; // relative URL — safe, resolves against this origin
}

export default function ActionButtons({ tel, email, url, address, moreInfoHref, strings }) {
    const safeUrl = sanitizeUrl(url);
    return (
        <div className="sui-action-btns">
            {tel && (
                <a className="sui-action-btn" href={`tel:${String(tel).replace(/\s+/g, '')}`}>
                    <Phone className="sui-chat-icon" /> {strings.call}
                </a>
            )}
            {email && (
                <a className="sui-action-btn" href={`mailto:${email}`}>
                    <Mail className="sui-chat-icon" /> {strings.email}
                </a>
            )}
            {safeUrl && (
                <a className="sui-action-btn" href={safeUrl} target="_blank" rel="noopener noreferrer">
                    <Globe className="sui-chat-icon" /> {strings.website}
                </a>
            )}
            {address && (
                <a className="sui-action-btn"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank" rel="noopener noreferrer">
                    <MapPin className="sui-chat-icon" /> {strings.route}
                </a>
            )}
            {moreInfoHref && (
                <a className="sui-action-btn sui-action-btn--info" href={moreInfoHref}>
                    {strings.moreInfo}
                </a>
            )}
        </div>
    );
}
