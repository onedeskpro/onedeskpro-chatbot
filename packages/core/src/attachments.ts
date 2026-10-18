import type { ChatAttachment } from '@onedeskpro/chatbot-types';
import { SDK_CHAT_MAX_ATTACHMENTS, SDK_UPLOAD_MAX_BYTES } from './constants';

/**
 * Why `files` cannot be sent as one message, or `null` when they can. Shared by the
 * widget (instant feedback while picking) and the core (the last word before upload).
 */
export function attachmentProblem(files: readonly File[]): string | null {
  if (files.length > SDK_CHAT_MAX_ATTACHMENTS) {
    return `You can send up to ${SDK_CHAT_MAX_ATTACHMENTS} files at a time.`;
  }
  const tooBig = files.find((file) => file.size > SDK_UPLOAD_MAX_BYTES);
  if (tooBig) {
    const limitMb = Math.round(SDK_UPLOAD_MAX_BYTES / (1024 * 1024));
    return `"${tooBig.name || 'This file'}" is larger than ${limitMb} MB.`;
  }
  return null;
}

/** Only these schemes may become an `href` or `src` inside the widget. */
export function isSafeAttachmentUrl(url: string): boolean {
  return /^(https?:\/\/|blob:)/i.test(url);
}

/** A local `blob:` URL for previewing `file`, or `''` where object URLs are unavailable. */
export function createPreviewUrl(file: File): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url: string): void {
  if (!url.startsWith('blob:')) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  URL.revokeObjectURL(url);
}

/** The attachment shown in the visitor's bubble while `file` is still uploading. */
export function toPreviewAttachment(file: File): ChatAttachment {
  return {
    type: file.type || 'application/octet-stream',
    url: createPreviewUrl(file),
    fileName: file.name || 'attachment',
    size: file.size,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attachments from an inbox-shaped `message:receive` payload, keeping only entries with
 * an `http(s)` URL. Anything else (missing, malformed, other schemes) is dropped.
 */
export function extractAttachments(payload: unknown): ChatAttachment[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  let raw: unknown = record.attachments;
  if (!Array.isArray(raw) && record.message && typeof record.message === 'object') {
    raw = (record.message as Record<string, unknown>).attachments;
  }
  if (!Array.isArray(raw)) return [];

  const attachments: ChatAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
    attachments.push({
      type: typeof entry.type === 'string' && entry.type ? entry.type : 'application/octet-stream',
      url: entry.url,
      fileName: typeof entry.fileName === 'string' && entry.fileName ? entry.fileName : 'attachment',
      size: typeof entry.size === 'number' && entry.size >= 0 ? entry.size : 0,
      ...(typeof entry.durationSeconds === 'number' ? { durationSeconds: entry.durationSeconds } : {}),
    });
  }
  return attachments;
}

/**
 * True when `content` is only the label the sender's client put on a media message
 * (a file name, "3 files", or the inbox's "Image"/"Video" preview), so the bubble
 * shows the attachment alone instead of repeating it as text.
 */
export function isAutoCaption(content: string, attachments: readonly ChatAttachment[]): boolean {
  const text = content.trim();
  if (!text) return true;
  if (attachments.length === 0) return false;
  if (attachments.some((attachment) => attachment.fileName === text)) return true;
  if (/^\d+ files?$/.test(text)) return true;
  return ['Image', 'Video', 'Audio', 'Attachment'].includes(text);
}
