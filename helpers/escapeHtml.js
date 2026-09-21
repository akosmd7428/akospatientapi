'use strict';

/**
 * SEC-015 / SEC-034: user-supplied values were interpolated unescaped into the
 * prescription PDF template and into outbound HTML emails.
 *
 * escapeHtml covers text content and quoted attribute values. It does NOT make a
 * URL safe - `javascript:` and `data:` survive HTML escaping - so anything
 * landing in href/src must go through safeUrl instead.
 */

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
};

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ENTITIES[ch]);
}

/**
 * Accept only an inline image data URI, or a path within our own asset store.
 * Everything else - including http(s) URLs to hosts we do not control, file://
 * and javascript: - returns '' so the element renders nothing.
 *
 * SEC-015: this is what stops `<img src="${signature}">` becoming SSRF against
 * cloud instance metadata.
 */
function safeImageSrc(value) {
    const src = String(value || '').trim();
    if (src === '') return '';

    if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src)) {
        return src;
    }
    // A stored asset path, e.g. /assets/signature/2026/<hex>.png
    if (/^\/assets\/[A-Za-z0-9_\-/.]+\.(png|jpe?g|gif|webp)$/i.test(src)) {
        return src;
    }
    return '';
}

/** Allow only http(s) links in generated markup. */
function safeUrl(value) {
    const url = String(value || '').trim();
    if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
    return '';
}

module.exports = { escapeHtml, safeImageSrc, safeUrl };
