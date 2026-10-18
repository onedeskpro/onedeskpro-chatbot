/** Default OneDesk Pro API origin when `apiBaseUrl` is omitted from init options. */
export const DEFAULT_API_BASE_URL = 'https://api.onedeskpro.com' as const;
/** Largest file `POST /sdk/upload` accepts, in bytes (10 MB). */
export const SDK_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Most attachments one chat message may carry. */
export const SDK_CHAT_MAX_ATTACHMENTS = 10;
