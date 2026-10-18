export function buildStyles(primaryColor: string, theme: 'light' | 'dark' | 'auto'): string {
  const lightVars = `
    --ttcb-bg: #ffffff;
    --ttcb-bg-secondary: #f3f4f6;
    --ttcb-text: #111827;
    --ttcb-text-muted: #6b7280;
    --ttcb-border: #e5e7eb;
    --ttcb-user-bubble: ${primaryColor};
    --ttcb-user-text: #ffffff;
    --ttcb-ai-bubble: #f3f4f6;
    --ttcb-ai-text: #111827;
    --ttcb-input-bg: #ffffff;
    --ttcb-shadow: 0 20px 60px rgba(0,0,0,0.15);
    --ttcb-online: #22c55e;
    --ttcb-hint: #9ca3af;
  `;

  const darkVars = `
    --ttcb-bg: #1f2937;
    --ttcb-bg-secondary: #111827;
    --ttcb-text: #f9fafb;
    --ttcb-text-muted: #9ca3af;
    --ttcb-border: #374151;
    --ttcb-user-bubble: ${primaryColor};
    --ttcb-user-text: #ffffff;
    --ttcb-ai-bubble: #374151;
    --ttcb-ai-text: #f9fafb;
    --ttcb-input-bg: #111827;
    --ttcb-shadow: 0 20px 60px rgba(0,0,0,0.4);
    --ttcb-online: #22c55e;
    --ttcb-hint: #9ca3af;
  `;

  let rootVars: string;
  if (theme === 'dark') {
    rootVars = `:host { ${darkVars} }`;
  } else if (theme === 'light') {
    rootVars = `:host { ${lightVars} }`;
  } else {
    rootVars = `
      :host { ${lightVars} }
      @media (prefers-color-scheme: dark) { :host { ${darkVars} } }
    `;
  }

  return `
    ${rootVars}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .ttcb-fab {
      position: fixed;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: ${primaryColor};
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 9999;
    }
    .ttcb-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
    .ttcb-fab svg { width: 24px; height: 24px; fill: #fff; }
    .ttcb-fab.bottom-right { bottom: 24px; right: 24px; }
    .ttcb-fab.bottom-left { bottom: 24px; left: 24px; }

    .ttcb-panel {
      position: fixed;
      width: 380px;
      background: var(--ttcb-bg);
      border: 1px solid var(--ttcb-border);
      border-radius: 16px;
      display: flex; flex-direction: column;
      box-shadow: var(--ttcb-shadow);
      overflow: hidden;
      z-index: 9998;
      transition: opacity 0.2s ease, transform 0.25s ease, height 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .ttcb-panel.ttcb-mode-chat {
      height: 560px;
    }
    .ttcb-panel.ttcb-mode-form,
    .ttcb-panel.ttcb-mode-compact {
      height: auto;
      max-height: min(560px, calc(100vh - 100px));
    }
    .ttcb-panel.bottom-right { bottom: 92px; right: 24px; }
    .ttcb-panel.bottom-left { bottom: 92px; left: 24px; }
    .ttcb-panel.hidden {
      opacity: 0; pointer-events: none;
      transform: translateY(12px) scale(0.97);
    }

    .ttcb-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--ttcb-border);
      display: flex; align-items: center; gap: 10px;
      background: var(--ttcb-bg);
      flex-shrink: 0;
    }
    .ttcb-avatar-wrap {
      flex-shrink: 0;
    }
    .ttcb-avatar {
      width: 40px; height: 40px; border-radius: 10px;
      background: ${primaryColor};
      display: flex; align-items: center; justify-content: center;
    }
    .ttcb-avatar svg { width: 22px; height: 22px; fill: #fff; }
    .ttcb-header-main {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    .ttcb-header-title-row {
      display: flex; align-items: center; gap: 6px;
    }
    .ttcb-header-title {
      font-weight: 700; font-size: 15px; color: var(--ttcb-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ttcb-verified {
      width: 16px; height: 16px; color: ${primaryColor};
      flex-shrink: 0; display: flex;
    }
    .ttcb-verified svg { width: 16px; height: 16px; }
    .ttcb-header-meta {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: var(--ttcb-text-muted);
    }
    .ttcb-meta-online {
      display: inline-flex; align-items: center; gap: 5px;
      color: var(--ttcb-online); font-weight: 500;
    }
    .ttcb-meta-online::before {
      content: '';
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--ttcb-online);
    }
    .ttcb-meta-sep {
      width: 1px; height: 12px; background: var(--ttcb-border);
    }
    .ttcb-meta-replies {
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--ttcb-text-muted);
    }
    .ttcb-meta-replies svg { width: 18px; height: 14px; }
    .ttcb-header-actions {
      display: flex; align-items: center; gap: 3px;
      flex-shrink: 0; align-self: center;
    }
    .ttcb-close-btn, .ttcb-new-session-btn, .ttcb-request-human-btn {
      background: none; border: none; cursor: pointer;
      color: var(--ttcb-text-muted); padding: 6px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
    }
    .ttcb-close-btn:hover, .ttcb-new-session-btn:hover, .ttcb-request-human-btn:hover {
      background: var(--ttcb-bg-secondary);
    }
    .ttcb-close-btn svg { width: 19px; height: 19px; fill: currentColor; }
    .ttcb-new-session-btn svg,
    .ttcb-request-human-btn svg {
      width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2;
    }
    .ttcb-new-session-btn.hidden, .ttcb-request-human-btn.hidden { display: none; }

    .ttcb-mode-banner {
      display: none;
      padding: 10px 16px;
      font-size: 12px;
      line-height: 1.4;
      color: var(--ttcb-text-muted);
      background: var(--ttcb-bg-secondary);
      border-top: 1px solid var(--ttcb-border);
      flex-shrink: 0;
    }
    .ttcb-mode-banner.visible { display: block; }
    .ttcb-mode-banner.waiting { color: var(--ttcb-text); }
    .ttcb-mode-banner.closed {
      color: var(--ttcb-text);
      background: color-mix(in srgb, #ef4444 10%, var(--ttcb-bg-secondary));
    }
    .ttcb-mode-banner.human { color: var(--ttcb-text); }

    .ttcb-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
      font-size: 14px;
      min-height: 120px;
    }
    .ttcb-panel.ttcb-mode-compact .ttcb-messages {
      min-height: 160px;
    }

    .ttcb-empty {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center;
      padding: 32px 16px; flex: 1;
      color: var(--ttcb-text-muted); font-size: 13px;
    }
    .ttcb-empty-icon {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--ttcb-bg-secondary);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
    }
    .ttcb-empty-icon svg { width: 22px; height: 22px; fill: var(--ttcb-text-muted); }
    .ttcb-empty strong { color: var(--ttcb-text); }

    .ttcb-initial-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; flex: 1; padding: 32px 16px;
      color: var(--ttcb-text-muted); font-size: 13px;
    }
    .ttcb-spinner {
      width: 24px; height: 24px;
      border: 2px solid var(--ttcb-border);
      border-top-color: var(--ttcb-text-muted);
      border-radius: 50%;
      animation: ttcb-spin 0.7s linear infinite;
      margin-bottom: 10px;
    }
    @keyframes ttcb-spin { to { transform: rotate(360deg); } }

    .ttcb-msg { display: flex; gap: 8px; max-width: 100%; }
    .ttcb-msg.human { flex-direction: row-reverse; }
    .ttcb-msg-body { display: flex; flex-direction: column; gap: 3px; max-width: 78%; }
    .ttcb-msg.human .ttcb-msg-body { align-items: flex-end; }
    .ttcb-msg-label {
      font-size: 11px; font-weight: 600; color: var(--ttcb-text-muted);
      padding-left: 2px;
    }
    .ttcb-msg-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--ttcb-bg-secondary);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 2px;
    }
    /* Offset past the "Agent" label so the avatar lines up with the bubble */
    .ttcb-msg.agent .ttcb-msg-avatar { margin-top: 22px; }
    .ttcb-msg-avatar svg { width: 13px; height: 13px; fill: var(--ttcb-text-muted); }
    .ttcb-msg.agent .ttcb-msg-avatar svg { fill: none; stroke: var(--ttcb-text-muted); stroke-width: 2; }
    .ttcb-bubble {
      max-width: 100%; padding: 9px 13px;
      border-radius: 16px 16px 16px 4px;
      line-height: 1.5;
      color: var(--ttcb-ai-text);
      background: var(--ttcb-ai-bubble);
      white-space: pre-wrap; word-break: break-word;
      font-size: 14px;
    }
    .ttcb-msg.human .ttcb-bubble {
      background: var(--ttcb-user-bubble);
      color: var(--ttcb-user-text);
      border-radius: 16px 16px 4px 16px;
    }
    .ttcb-msg.agent .ttcb-bubble {
      background: var(--ttcb-bg);
      color: var(--ttcb-text);
      border: 1px solid var(--ttcb-border);
      border-radius: 16px 16px 16px 4px;
    }

    .ttcb-bubble p { margin: 0 0 6px 0; }
    .ttcb-bubble p:last-child { margin-bottom: 0; }
    .ttcb-bubble strong { font-weight: 600; }
    .ttcb-bubble em { font-style: italic; }
    .ttcb-bubble code {
      background: rgba(0,0,0,0.08);
      padding: 1px 5px; border-radius: 3px;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 12px;
    }
    .ttcb-bubble pre {
      background: rgba(0,0,0,0.08);
      padding: 10px 12px; border-radius: 6px;
      overflow-x: auto; margin: 6px 0;
    }
    .ttcb-bubble pre code { background: none; padding: 0; font-size: 12px; }
    .ttcb-bubble h1, .ttcb-bubble h2, .ttcb-bubble h3 {
      font-weight: 600; margin: 8px 0 4px; line-height: 1.3;
    }
    .ttcb-bubble h1 { font-size: 15px; }
    .ttcb-bubble h2 { font-size: 14px; }
    .ttcb-bubble h3 { font-size: 13px; }
    .ttcb-bubble ul, .ttcb-bubble ol { padding-left: 18px; margin: 4px 0; }
    .ttcb-bubble li { margin: 2px 0; }
    .ttcb-bubble a { color: inherit; text-decoration: underline; }

    .ttcb-typing { display: flex; gap: 4px; padding: 8px 2px; align-items: center; }
    .ttcb-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--ttcb-text-muted);
      animation: ttcb-bounce 1.2s infinite;
    }
    .ttcb-typing span:nth-child(2) { animation-delay: 0.15s; }
    .ttcb-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes ttcb-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-5px); opacity: 1; }
    }

    .ttcb-footer {
      border-top: 1px solid var(--ttcb-border);
      padding: 12px;
      background: var(--ttcb-bg);
      flex-shrink: 0;
    }
    .ttcb-form { display: flex; gap: 8px; }
    .ttcb-input {
      flex: 1; padding: 9px 12px;
      border: 1px solid var(--ttcb-border);
      border-radius: 8px;
      font-size: 14px; outline: none;
      background: var(--ttcb-input-bg);
      color: var(--ttcb-text);
      transition: border-color 0.15s;
      font-family: inherit;
    }
    .ttcb-input:focus { border-color: ${primaryColor}; }
    .ttcb-input::placeholder { color: var(--ttcb-text-muted); }
    .ttcb-input:disabled { opacity: 0.6; cursor: not-allowed; }
    .ttcb-send-btn {
      padding: 0 14px; height: 38px;
      background: ${primaryColor}; color: #fff;
      border: none; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s; flex-shrink: 0;
    }
    .ttcb-send-btn:hover { opacity: 0.9; }
    .ttcb-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ttcb-send-btn svg { width: 16px; height: 16px; fill: #fff; }

    .ttcb-identify {
      display: none;
      flex-direction: column;
      gap: 14px;
      padding: 16px 16px 14px;
      overflow-y: auto;
    }
    .ttcb-panel.ttcb-mode-form .ttcb-identify.visible {
      display: flex;
      flex: 0 0 auto;
    }
    .ttcb-identify-form {
      display: flex; flex-direction: column; gap: 14px;
    }
    .ttcb-field { display: flex; flex-direction: column; gap: 6px; }
    .ttcb-field-label-row {
      display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    }
    .ttcb-label {
      font-size: 13px; font-weight: 600; color: var(--ttcb-text);
    }
    .ttcb-label .ttcb-req { color: #ef4444; font-weight: 600; }
    .ttcb-field-hint {
      font-size: 11px; color: var(--ttcb-hint); font-weight: 400;
      white-space: nowrap;
    }
    .ttcb-input-wrap {
      display: flex; align-items: center; gap: 8px;
      border: 1px solid var(--ttcb-border);
      border-radius: 10px;
      padding: 0 12px;
      background: var(--ttcb-input-bg);
      transition: border-color 0.15s;
    }
    .ttcb-input-wrap:focus-within { border-color: ${primaryColor}; }
    .ttcb-input-wrap.disabled { opacity: 0.6; }
    .ttcb-input-icon {
      width: 18px; height: 18px; color: var(--ttcb-text-muted);
      flex-shrink: 0; display: flex;
    }
    .ttcb-input-icon svg { width: 18px; height: 18px; }
    .ttcb-identify-input {
      flex: 1; min-width: 0;
      border: none; outline: none;
      padding: 11px 0;
      font-size: 14px;
      background: transparent;
      color: var(--ttcb-text);
      font-family: inherit;
    }
    .ttcb-identify-input::placeholder { color: var(--ttcb-text-muted); }
    .ttcb-identify-input:disabled { cursor: not-allowed; }

    .ttcb-phone-row {
      display: flex; align-items: stretch;
      border: 1px solid var(--ttcb-border);
      border-radius: 10px;
      background: var(--ttcb-input-bg);
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .ttcb-phone-row:focus-within { border-color: ${primaryColor}; }
    .ttcb-phone-row.disabled { opacity: 0.6; }
    .ttcb-dial-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 0 10px;
      border: none; border-right: 1px solid var(--ttcb-border);
      background: var(--ttcb-bg-secondary);
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      color: var(--ttcb-text);
      flex-shrink: 0;
    }
    .ttcb-dial-btn:disabled { cursor: not-allowed; }
    .ttcb-dial-flag { font-size: 16px; line-height: 1; }
    .ttcb-dial-code { letter-spacing: 0.01em; }
    .ttcb-dial-btn svg {
      width: 14px; height: 14px; color: var(--ttcb-text-muted);
    }
    .ttcb-phone-national {
      flex: 1; min-width: 0;
      border: none; outline: none;
      padding: 11px 12px;
      font-size: 14px;
      background: transparent;
      color: var(--ttcb-text);
      font-family: inherit;
    }
    .ttcb-phone-national::placeholder { color: var(--ttcb-text-muted); }

    .ttcb-country-popover {
      display: none;
      flex-direction: column;
      border: 1px solid var(--ttcb-border);
      border-radius: 10px;
      background: var(--ttcb-bg);
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      max-height: 220px;
      overflow: hidden;
      margin-top: -8px;
    }
    .ttcb-country-popover.open { display: flex; }
    .ttcb-country-search {
      border: none; border-bottom: 1px solid var(--ttcb-border);
      padding: 10px 12px;
      font-size: 13px; outline: none;
      background: var(--ttcb-input-bg);
      color: var(--ttcb-text);
      font-family: inherit;
    }
    .ttcb-country-list {
      overflow-y: auto;
      max-height: 176px;
    }
    .ttcb-country-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none; background: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      color: var(--ttcb-text);
      text-align: left;
    }
    .ttcb-country-item:hover,
    .ttcb-country-item[aria-selected="true"] {
      background: var(--ttcb-bg-secondary);
    }
    .ttcb-country-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ttcb-country-item-dial { color: var(--ttcb-text-muted); flex-shrink: 0; }

    .ttcb-identify-error {
      font-size: 12px; color: #ef4444; min-height: 16px;
      margin-top: -4px;
    }
    .ttcb-identify-submit {
      width: 100%; height: 46px;
      background: ${primaryColor}; color: #fff;
      border: none; border-radius: 999px; cursor: pointer;
      font-size: 15px; font-weight: 600; font-family: inherit;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .ttcb-identify-submit svg {
      width: 18px; height: 18px; stroke: #fff; fill: none;
    }
    .ttcb-identify-submit:hover { opacity: 0.92; }
    .ttcb-identify-submit:disabled { opacity: 0.55; cursor: not-allowed; }

    .ttcb-trust {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 11px; color: var(--ttcb-text-muted);
      padding-bottom: 2px;
    }
    .ttcb-trust svg {
      width: 14px; height: 14px;
      stroke: var(--ttcb-online);
      fill: none;
      flex-shrink: 0;
    }

    .ttcb-form { align-items: center; }
    .ttcb-attach { position: relative; flex-shrink: 0; }
    .ttcb-attach-btn {
      width: 38px; height: 38px; border-radius: 8px;
      border: 1px solid var(--ttcb-border);
      background: var(--ttcb-input-bg); color: var(--ttcb-text-muted);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, border-color 0.15s;
    }
    .ttcb-attach-btn:hover { color: var(--ttcb-text); }
    .ttcb-attach-btn:focus-visible { border-color: ${primaryColor}; outline: none; }
    .ttcb-attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ttcb-attach-btn svg { width: 18px; height: 18px; }
    .ttcb-attach-menu {
      display: none; position: absolute; left: 0; bottom: calc(100% + 8px);
      min-width: 170px; padding: 4px;
      background: var(--ttcb-bg);
      border: 1px solid var(--ttcb-border); border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      z-index: 1;
    }
    .ttcb-attach-menu.open { display: flex; flex-direction: column; }
    .ttcb-attach-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border: none; border-radius: 8px;
      background: none; cursor: pointer;
      font-family: inherit; font-size: 13px; color: var(--ttcb-text);
      text-align: left; width: 100%;
    }
    .ttcb-attach-item:hover, .ttcb-attach-item:focus-visible {
      background: var(--ttcb-bg-secondary); outline: none;
    }
    .ttcb-attach-item svg { width: 16px; height: 16px; color: var(--ttcb-text-muted); flex-shrink: 0; }
    .ttcb-file-input { display: none; }
    .ttcb-form.hidden { display: none; }
    .ttcb-mic-btn {
      width: 38px; height: 38px; border-radius: 8px; flex-shrink: 0;
      border: 1px solid var(--ttcb-border);
      background: var(--ttcb-input-bg); color: var(--ttcb-text-muted);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, border-color 0.15s;
    }
    .ttcb-mic-btn:hover { color: var(--ttcb-text); }
    .ttcb-mic-btn:focus-visible { border-color: ${primaryColor}; outline: none; }
    .ttcb-mic-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ttcb-mic-btn svg { width: 18px; height: 18px; }

    .ttcb-voice-bar, .ttcb-voice-preview {
      display: none; align-items: center; gap: 8px;
      padding: 6px 8px;
      border: 1px solid var(--ttcb-border); border-radius: 10px;
      background: var(--ttcb-input-bg);
    }
    .ttcb-voice-bar.visible, .ttcb-voice-preview.visible { display: flex; }
    .ttcb-voice-dot {
      width: 10px; height: 10px; border-radius: 50%; background: #ef4444; flex-shrink: 0;
      animation: ttcb-pulse 1.1s ease-in-out infinite;
    }
    @keyframes ttcb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .ttcb-voice-time {
      font-size: 13px; font-weight: 500; color: var(--ttcb-text);
      font-variant-numeric: tabular-nums; flex-shrink: 0;
    }
    .ttcb-voice-meter {
      flex: 1; min-width: 0; height: 6px; border-radius: 999px;
      background: var(--ttcb-bg-secondary); overflow: hidden;
    }
    .ttcb-voice-level {
      display: block; height: 100%; width: 4%; border-radius: 999px;
      background: #ef4444; transition: width 0.1s linear;
    }
    .ttcb-voice-audio { flex: 1; min-width: 0; height: 32px; }
    .ttcb-voice-btn {
      width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
      border: 1px solid var(--ttcb-border);
      background: var(--ttcb-bg); color: var(--ttcb-text-muted);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .ttcb-voice-btn:hover { color: var(--ttcb-text); }
    .ttcb-voice-btn.primary { background: ${primaryColor}; border-color: ${primaryColor}; color: #fff; }
    .ttcb-voice-btn.primary:hover { opacity: 0.9; color: #fff; }
    .ttcb-voice-btn svg { width: 15px; height: 15px; }
    .ttcb-voice-btn.primary svg { fill: #fff; }
    .ttcb-voice-btn.primary svg[fill="none"] { fill: none; }

    .ttcb-pending-tray { display: none; gap: 8px; flex-wrap: wrap; padding-bottom: 10px; }
    .ttcb-pending-tray.visible { display: flex; }
    .ttcb-pending-item {
      display: flex; align-items: center; gap: 8px; max-width: 100%;
      padding: 5px 6px 5px 5px;
      border: 1px solid var(--ttcb-border); border-radius: 10px;
      background: var(--ttcb-bg-secondary);
      font-size: 12px; color: var(--ttcb-text);
    }
    .ttcb-pending-thumb {
      width: 36px; height: 36px; border-radius: 6px; object-fit: cover;
      flex-shrink: 0; background: var(--ttcb-bg);
    }
    .ttcb-pending-icon {
      width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--ttcb-bg); color: var(--ttcb-text-muted);
    }
    .ttcb-pending-icon svg { width: 18px; height: 18px; }
    .ttcb-pending-name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ttcb-pending-remove {
      width: 22px; height: 22px; border-radius: 50%; border: none; flex-shrink: 0;
      background: var(--ttcb-bg); color: var(--ttcb-text-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .ttcb-pending-remove:hover { color: var(--ttcb-text); }
    .ttcb-pending-remove svg { width: 12px; height: 12px; fill: currentColor; }
    .ttcb-compose-error { display: none; font-size: 12px; color: #ef4444; padding-bottom: 8px; }
    .ttcb-compose-error.visible { display: block; }

    .ttcb-attachments { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
    .ttcb-msg.human .ttcb-attachments { align-items: flex-end; }
    .ttcb-attachment-image {
      display: block; max-width: 220px; border-radius: 12px; overflow: hidden;
      border: 1px solid var(--ttcb-border); background: var(--ttcb-bg-secondary);
    }
    .ttcb-attachment-image img { display: block; max-width: 100%; max-height: 240px; object-fit: cover; }
    .ttcb-attachment-video { display: block; max-width: 220px; border-radius: 12px; background: #000; }
    .ttcb-attachment-voice { display: flex; flex-direction: column; gap: 2px; width: 220px; max-width: 100%; }
    .ttcb-attachment-audio { display: block; width: 100%; height: 36px; }
    .ttcb-attachment-duration { font-size: 11px; color: var(--ttcb-text-muted); padding-left: 2px; }
    .ttcb-attachment-file {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; max-width: 240px;
      border: 1px solid var(--ttcb-border); border-radius: 12px;
      background: var(--ttcb-bg); color: var(--ttcb-text);
      text-decoration: none; font-size: 13px;
    }
    a.ttcb-attachment-file:hover { border-color: ${primaryColor}; }
    .ttcb-attachment-icon {
      width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--ttcb-bg-secondary); color: var(--ttcb-text-muted);
    }
    .ttcb-attachment-icon svg { width: 16px; height: 16px; }
    .ttcb-attachment-meta { display: flex; flex-direction: column; min-width: 0; }
    .ttcb-attachment-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .ttcb-attachment-size { font-size: 11px; color: var(--ttcb-text-muted); }
    .ttcb-msg.ttcb-pending .ttcb-attachments, .ttcb-msg.ttcb-pending .ttcb-bubble { opacity: 0.6; }
    .ttcb-msg-status { font-size: 11px; color: var(--ttcb-text-muted); padding: 0 2px; }

    .ttcb-footer.hidden, .ttcb-messages.hidden { display: none; }

    @media (max-width: 440px) {
      .ttcb-panel { width: calc(100vw - 16px); right: 8px !important; left: 8px !important; bottom: 84px !important; }
      .ttcb-fab.bottom-right { right: 16px; }
      .ttcb-fab.bottom-left { left: 16px; }
    }
  `;
}
