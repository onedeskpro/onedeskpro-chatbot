import type {
  ApiError,
  ApiResponse,
  ChatRequest,
  ChatResponseData,
  IdentifyRequest,
  IdentifyResponseData,
  SdkConfigResponse,
  TicketStatusData,
  UploadAttachmentResponseData,
  VisitorVerifyResponse,
} from '@onedeskpro/chatbot-types';

interface ApiClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Abort a request that has not responded within this many milliseconds. */
  timeoutMs?: number;
  /** Abort a file upload that has not completed within this many milliseconds. */
  uploadTimeoutMs?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** Uploads carry whole files, so they get longer than a JSON round-trip before aborting. */
const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000;

/** An Error carrying the API's structured error body and the HTTP status. */
export interface ChatbotRequestError extends Error {
  apiError: ApiError;
  status: number;
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).message === 'string'
  );
}

function isUploadedAttachment(value: unknown): value is UploadAttachmentResponseData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.type === 'string' &&
    typeof record.url === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.size === 'number'
  );
}

export function isChatbotRequestError(error: unknown): error is ChatbotRequestError {
  return (
    error instanceof Error &&
    'apiError' in error &&
    'status' in error &&
    typeof (error as ChatbotRequestError).status === 'number' &&
    isApiError((error as ChatbotRequestError).apiError)
  );
}

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private uploadTimeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.uploadTimeoutMs = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  }

  private fail(message: string, status: number, code: string, path: string): never {
    const apiError: ApiError = {
      statusCode: status,
      message,
      code,
      timestamp: new Date().toISOString(),
      path,
    };
    throw Object.assign(new Error(message), { apiError, status }) as ChatbotRequestError;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    params?: Record<string, string>,
    extraHeaders?: Record<string, string>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    // A FormData body goes out as multipart; the browser sets that Content-Type
    // itself because it has to generate the boundary.
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      'X-API-Key': this.apiKey,
      ...extraHeaders,
    };

    // Without this, a request that never resolves leaves the widget stuck in its
    // loading state with the input disabled and no way back short of a reload.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body: isMultipart ? body : JSON.stringify(body) } : {}),
      });
    } catch (err) {
      if (controller.signal.aborted) {
        this.fail(
          `Request timed out after ${timeoutMs}ms.`,
          0,
          'TIMEOUT',
          path,
        );
      }
      this.fail(
        err instanceof Error ? err.message : 'Network request failed.',
        0,
        'NETWORK_ERROR',
        path,
      );
    } finally {
      clearTimeout(timer);
    }

    // Read as text first: proxies and gateways answer with HTML, and 204s answer
    // with nothing at all. Calling res.json() straight away would replace the real
    // status with a JSON SyntaxError.
    const raw = await res.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      if (isApiError(payload)) {
        throw Object.assign(new Error(payload.message), {
          apiError: payload,
          status: res.status,
        }) as ChatbotRequestError;
      }
      this.fail(
        `Request failed with status ${res.status} ${res.statusText}`.trim(),
        res.status,
        'HTTP_ERROR',
        path,
      );
    }

    if (payload === null) {
      this.fail('The server returned an empty or malformed response.', res.status, 'BAD_RESPONSE', path);
    }

    return (payload as ApiResponse<T>).data;
  }

  async identify(payload: IdentifyRequest): Promise<IdentifyResponseData> {
    return this.request<IdentifyResponseData>('POST', '/sdk/identify', payload);
  }

  async verifyVisitor(visitorToken: string): Promise<VisitorVerifyResponse> {
    return this.request<VisitorVerifyResponse>('GET', '/sdk/visitor', undefined, undefined, {
      'X-Visitor-Token': visitorToken,
    });
  }

  async sendMessage(payload: ChatRequest): Promise<ChatResponseData> {
    return this.request<ChatResponseData>('POST', '/sdk/chat', payload);
  }

  /** Uploads one file for a media message; the result goes into `ChatRequest.attachments`. */
  async uploadAttachment(file: File, visitorToken: string): Promise<UploadAttachmentResponseData> {
    const body = new FormData();
    body.append('file', file, file.name);
    const data = await this.request<unknown>(
      'POST',
      '/sdk/upload',
      body,
      undefined,
      { 'X-Visitor-Token': visitorToken },
      this.uploadTimeoutMs,
    );
    if (!isUploadedAttachment(data)) {
      this.fail('The server returned an unexpected upload response.', 200, 'BAD_RESPONSE', '/sdk/upload');
    }
    return data;
  }

  async fetchConfig(): Promise<SdkConfigResponse> {
    return this.request<SdkConfigResponse>('GET', '/sdk/config');
  }

  async requestHuman(visitorToken: string): Promise<TicketStatusData> {
    return this.request<TicketStatusData>('POST', '/sdk/human-request', { visitorToken });
  }

  async fetchTicketStatus(visitorToken: string): Promise<TicketStatusData> {
    return this.request<TicketStatusData>('GET', '/sdk/ticket-status', undefined, undefined, {
      'X-Visitor-Token': visitorToken,
    });
  }
}
