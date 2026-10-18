import type { ChatAttachment } from '@onedeskpro/chatbot-types';
import { formatFileSize, isAutoCaption, isSafeAttachmentUrl } from '../attachments';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMarkdown(raw: string): string {
  const stash: string[] = [];

  // Stash fenced code blocks before escaping HTML. Block-level and inline code
  // get different sentinels so the paragraph pass below can tell them apart —
  // a <pre> wrapped in a <p> gets auto-closed by the parser and wrecks the layout.
  let text = raw.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const i = stash.length;
    stash.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\x04${i}\x05`;
  });

  // Stash inline code
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const i = stash.length;
    stash.push(`<code>${escapeHtml(code)}</code>`);
    return `\x02${i}\x03`;
  });

  // Escape remaining HTML
  text = escapeHtml(text);

  // Process line by line for block-level elements
  const lines = text.split('\n');
  const out: string[] = [];
  let listOpen = '';

  const closeList = () => {
    if (listOpen) { out.push(`</${listOpen}>`); listOpen = ''; }
  };

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^### (.+)/))) {
      closeList(); out.push(`<h3>${m[1]}</h3>`);
    } else if ((m = line.match(/^## (.+)/))) {
      closeList(); out.push(`<h2>${m[1]}</h2>`);
    } else if ((m = line.match(/^# (.+)/))) {
      closeList(); out.push(`<h1>${m[1]}</h1>`);
    } else if ((m = line.match(/^[*-] (.+)/))) {
      if (listOpen !== 'ul') { closeList(); out.push('<ul>'); listOpen = 'ul'; }
      out.push(`<li>${m[1]}</li>`);
    } else if ((m = line.match(/^\d+\. (.+)/))) {
      if (listOpen !== 'ol') { closeList(); out.push('<ol>'); listOpen = 'ol'; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      closeList();
      out.push(line);
    }
  }
  closeList();

  text = out.join('\n');

  // Inline: bold → italic → links (order matters)
  text = text
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/_(.+?)_/gs, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Wrap non-block segments in <p> and convert single \n to <br>
  text = text
    .split(/\n{2,}/)
    .map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-3]|ul|ol|pre|li)/.test(t)) return t;
      // Split around fenced-code sentinels so each one sits beside the paragraph
      // rather than inside it; inline-code sentinels stay in the flow.
      return t
        .split(/(\x04\d+\x05)/g)
        .map(part => {
          if (/^\x04\d+\x05$/.test(part)) return part;
          const inner = part.trim();
          return inner ? `<p>${inner.replace(/\n/g, '<br>')}</p>` : '';
        })
        .join('');
    })
    .filter(Boolean)
    .join('');

  // Restore stashed code elements (both sentinel flavours)
  text = text
    .replace(/\x04(\d+)\x05/g, (_, i) => stash[+i] ?? '')
    .replace(/\x02(\d+)\x03/g, (_, i) => stash[+i] ?? '');

  return text;
}

export function newSessionIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="8" x2="12" y2="14"/>
    <line x1="9" y1="11" x2="15" y2="11"/>
  </svg>`;
}

export function chatIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
  </svg>`;
}

export function closeIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>`;
}

export function sendIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>`;
}

export function botIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zm-2 10H6V7h12v12zm-9-6c-.83 0-1.5-.67-1.5-1.5S8.17 10 9 10s1.5.67 1.5 1.5S9.83 13 9 13zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/>
  </svg>`;
}

export function userIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>`;
}

export function personIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

export function envelopeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>`;
}

export function chevronDownIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;
}

export function arrowRightIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>`;
}

export function shieldCheckIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>`;
}

export function verifiedCheckIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="currentColor"/>
    <path d="M9 12l2 2 4-4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function starsIcon(): string {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#F59E0B" d="M8 2.5l1.1 2.2 2.4.3-1.7 1.7.4 2.4L8 8l-2.2 1.1.4-2.4L4.5 5l2.4-.3L8 2.5z"/>
    <path fill="#F59E0B" d="M16 3.5l.8 1.6 1.8.2-1.3 1.3.3 1.8L16 7.5l-1.6.9.3-1.8-1.3-1.3 1.8-.2L16 3.5z"/>
    <path fill="#FBBF24" d="M12 11.5l1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3 1-2z"/>
  </svg>`;
}

export function requestHumanIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`;
}

export function plusIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;
}

export function paperclipIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>`;
}

export function imageIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>`;
}

export function fileIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>`;
}

/** What a bubble needs from a `ChatMessage`: its `message` plus the upload flag. */
export interface RenderableMessage {
  type: 'human' | 'ai' | 'agent';
  content: string;
  attachments?: ChatAttachment[];
  pending?: boolean;
}

/**
 * One attachment inside a bubble. URLs come from the API (or a local `blob:` preview)
 * and are only ever assigned through DOM properties after a scheme check — never
 * interpolated into markup.
 */
function buildAttachmentEl(attachment: ChatAttachment): HTMLElement {
  const url = isSafeAttachmentUrl(attachment.url) ? attachment.url : '';
  const type = attachment.type.toLowerCase();

  if (url && type.startsWith('image/')) {
    const link = document.createElement('a');
    link.className = 'ttcb-attachment ttcb-attachment-image';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Open ${attachment.fileName}`);
    const img = document.createElement('img');
    img.src = url;
    img.alt = attachment.fileName;
    img.loading = 'lazy';
    link.appendChild(img);
    return link;
  }

  if (url && type.startsWith('video/')) {
    const video = document.createElement('video');
    video.className = 'ttcb-attachment ttcb-attachment-video';
    video.controls = true;
    video.preload = 'metadata';
    video.src = url;
    video.setAttribute('aria-label', attachment.fileName);
    return video;
  }

  if (url && type.startsWith('audio/')) {
    const audio = document.createElement('audio');
    audio.className = 'ttcb-attachment ttcb-attachment-audio';
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = url;
    audio.setAttribute('aria-label', attachment.fileName);
    return audio;
  }

  const chip = document.createElement(url ? 'a' : 'div');
  chip.className = 'ttcb-attachment ttcb-attachment-file';
  if (chip instanceof HTMLAnchorElement) {
    chip.href = url;
    chip.target = '_blank';
    chip.rel = 'noopener noreferrer';
  }
  const icon = document.createElement('span');
  icon.className = 'ttcb-attachment-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = fileIcon();
  const meta = document.createElement('span');
  meta.className = 'ttcb-attachment-meta';
  const name = document.createElement('span');
  name.className = 'ttcb-attachment-name';
  name.textContent = attachment.fileName;
  meta.appendChild(name);
  const size = formatFileSize(attachment.size);
  if (size) {
    const sizeEl = document.createElement('span');
    sizeEl.className = 'ttcb-attachment-size';
    sizeEl.textContent = size;
    meta.appendChild(sizeEl);
  }
  chip.appendChild(icon);
  chip.appendChild(meta);
  return chip;
}

export function buildMessageEl(message: RenderableMessage): HTMLElement {
  const { type, content } = message;
  const attachments = message.attachments ?? [];
  const wrapper = document.createElement('div');
  wrapper.className = `ttcb-msg ${type}`;
  if (message.pending) wrapper.classList.add('ttcb-pending');

  const avatar = document.createElement('div');
  avatar.className = 'ttcb-msg-avatar';
  if (type === 'human') {
    avatar.innerHTML = userIcon();
  } else if (type === 'agent') {
    avatar.innerHTML = personIcon();
  } else {
    avatar.innerHTML = botIcon();
  }

  const column = document.createElement('div');
  column.className = 'ttcb-msg-body';

  if (type === 'agent') {
    const label = document.createElement('span');
    label.className = 'ttcb-msg-label';
    label.textContent = 'Agent';
    column.appendChild(label);
  }

  if (attachments.length > 0) {
    const list = document.createElement('div');
    list.className = 'ttcb-attachments';
    for (const attachment of attachments) {
      list.appendChild(buildAttachmentEl(attachment));
    }
    column.appendChild(list);
  }

  if (attachments.length === 0 || !isAutoCaption(content, attachments)) {
    const bubble = document.createElement('div');
    bubble.className = 'ttcb-bubble';
    if (type === 'human') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = parseMarkdown(content);
    }
    column.appendChild(bubble);
  }

  if (message.pending) {
    const status = document.createElement('span');
    status.className = 'ttcb-msg-status';
    status.textContent = 'Uploading…';
    column.appendChild(status);
  }

  wrapper.appendChild(avatar);
  wrapper.appendChild(column);
  return wrapper;
}

export function buildTypingIndicator(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ttcb-msg ai';
  wrapper.id = 'ttcb-typing';

  const avatar = document.createElement('div');
  avatar.className = 'ttcb-msg-avatar';
  avatar.innerHTML = botIcon();

  const typing = document.createElement('div');
  typing.className = 'ttcb-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';

  wrapper.appendChild(avatar);
  wrapper.appendChild(typing);
  return wrapper;
}
