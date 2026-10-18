import { describe, expect, it } from 'vitest';
import {
  attachmentProblem,
  extractAttachments,
  formatFileSize,
  isAutoCaption,
  isSafeAttachmentUrl,
} from './attachments';
import { SDK_CHAT_MAX_ATTACHMENTS, SDK_UPLOAD_MAX_BYTES } from './constants';

const fileOfSize = (size: number, name = 'f.bin') =>
  new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });

describe('attachmentProblem', () => {
  it.each([
    { size: SDK_UPLOAD_MAX_BYTES - 1, ok: true },
    { size: SDK_UPLOAD_MAX_BYTES, ok: true },
    { size: SDK_UPLOAD_MAX_BYTES + 1, ok: false },
  ])('should return ok=$ok when a file is $size bytes', ({ size, ok }) => {
    // Arrange
    const files = [fileOfSize(size, 'big.bin')];

    // Act
    const problem = attachmentProblem(files);

    // Assert
    expect(problem === null).toBe(ok);
    if (!ok) expect(problem).toContain('big.bin');
  });

  it.each([
    { count: SDK_CHAT_MAX_ATTACHMENTS - 1, ok: true },
    { count: SDK_CHAT_MAX_ATTACHMENTS, ok: true },
    { count: SDK_CHAT_MAX_ATTACHMENTS + 1, ok: false },
  ])('should return ok=$ok when $count files are picked', ({ count, ok }) => {
    // Arrange
    const files = Array.from({ length: count }, (_, i) => fileOfSize(1, `${i}.bin`));

    // Act
    const problem = attachmentProblem(files);

    // Assert
    expect(problem === null).toBe(ok);
  });

  it('should accept an empty list', () => {
    expect(attachmentProblem([])).toBeNull();
  });
});

describe('isSafeAttachmentUrl', () => {
  it.each([
    ['https://cdn.example.com/a.png', true],
    ['http://cdn.example.com/a.png', true],
    ['blob:https://site.example/uuid', true],
    ['javascript:alert(1)', false],
    ['data:image/png;base64,AAAA', false],
    ['', false],
  ])('should return %s → %s', (url, expected) => {
    expect(isSafeAttachmentUrl(url)).toBe(expected);
  });
});

describe('extractAttachments', () => {
  it('should keep well-formed http attachments and drop the rest when the payload is inbox-shaped', () => {
    // Arrange
    const payload = {
      attachments: [
        { type: 'image/png', url: 'https://cdn.example.com/a.png', fileName: 'a.png', size: 10 },
        { type: 'image/png', url: 'javascript:alert(1)', fileName: 'evil.png', size: 10 },
        { url: 'https://cdn.example.com/b' },
        'nope',
        null,
      ],
    };

    // Act
    const result = extractAttachments(payload);

    // Assert
    expect(result).toEqual([
      { type: 'image/png', url: 'https://cdn.example.com/a.png', fileName: 'a.png', size: 10 },
      { type: 'application/octet-stream', url: 'https://cdn.example.com/b', fileName: 'attachment', size: 0 },
    ]);
  });

  it.each([null, undefined, 'text', 42, {}, { attachments: 'x' }])(
    'should return an empty list when the payload is %p',
    (payload) => {
      expect(extractAttachments(payload)).toEqual([]);
    },
  );
});

describe('isAutoCaption', () => {
  const attachments = [{ type: 'image/png', url: 'https://x/a.png', fileName: 'a.png', size: 1 }];

  it.each([
    ['', true],
    ['a.png', true],
    ['3 files', true],
    ['Image', true],
    ['Here is the receipt', false],
  ])('should treat %p as auto caption=%s when attachments are present', (content, expected) => {
    expect(isAutoCaption(content, attachments)).toBe(expected);
  });

  it('should keep text when there are no attachments', () => {
    expect(isAutoCaption('Image', [])).toBe(false);
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [10 * 1024, '10 KB'],
    [1024 * 1024, '1.0 MB'],
    [-1, ''],
  ])('should format %d bytes as %p', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
