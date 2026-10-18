import React, { useRef, useEffect } from "react";
import { ChatbotProvider, useChatbot } from "@onedeskpro/chatbot-react";
import type { ChatMessage } from "@onedeskpro/chatbot-types";
import { DEFAULT_API_BASE_URL } from "@onedeskpro/chatbot-core";
import { CHATBOT_API_BASE_URL, CHATBOT_API_KEY } from "../chatbot-config";

// ─── Custom chat UI built on useChatbot() ─────────────────────────────────────

function CustomChat() {
  const {
    messages,
    sendMessage,
    sendAttachments,
    submitIdentify,
    requestHuman,
    resetSession,
    isLoading,
    isReady,
    needsIdentify,
    mode,
    error,
  } = useChatbot();
  const [input, setInput] = React.useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const isClosed = mode === "closed";

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || isClosed) return;
    setInput("");
    // Keep focus so the user can type the next message while waiting.
    inputRef.current?.focus();
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleFiles = async (files: FileList | null) => {
    const picked = files ? Array.from(files) : [];
    if (picked.length === 0 || isLoading || isClosed) return;
    const caption = input.trim();
    setInput("");
    await sendAttachments(picked, caption);
    inputRef.current?.focus();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: 520,
        background: "#fff",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        boxShadow: "var(--shadow)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--gray-200)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--gray-50)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: "var(--brand)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>
        <div>
          <div
            style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-900)" }}
          >
            Onedesk Pro Assistant
          </div>
          <div style={{ fontSize: 11, color: "#22C55E", fontWeight: 500 }}>
            ● Online
          </div>
        </div>
      </div>

      {needsIdentify ? (
        <IdentifyForm
          disabled={!isReady || isLoading}
          error={error}
          onSubmit={submitIdentify}
        />
      ) : (
        <>
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && !isLoading && <EmptyState />}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && mode === "ai" && <TypingIndicator />}

        {mode === "waiting" && <ModeNote>Waiting for a human agent…</ModeNote>}
        {mode === "human" && <ModeNote>You are chatting with a human agent.</ModeNote>}
        {isClosed && (
          <ModeNote>
            This conversation is closed.{" "}
            <button onClick={resetSession} style={LINK_BUTTON_STYLE}>
              Start a new one
            </button>
          </ModeNote>
        )}
        {mode === "ai" && messages.length > 0 && !isLoading && (
          <ModeNote>
            <button onClick={() => void requestHuman()} style={LINK_BUTTON_STYLE}>
              Talk to a person
            </button>
          </ModeNote>
        )}

        {error && (
          <div
            style={{
              alignSelf: "center",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#DC2626",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--gray-200)",
          display: "flex",
          gap: 10,
          background: "#fff",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,audio/*,application/pdf,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isLoading || isClosed}
          aria-label="Attach files"
          title="Attach files"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: "1px solid var(--gray-200)",
            background: "#fff",
            color: "var(--gray-500)",
            cursor: isLoading || isClosed ? "not-allowed" : "pointer",
            opacity: isLoading || isClosed ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type a message…"
          disabled={isClosed}
          style={{
            flex: 1,
            border: "1px solid var(--gray-200)",
            borderRadius: 24,
            padding: "10px 18px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
            color: "var(--gray-900)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--brand)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--gray-200)";
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={isLoading || isClosed || !input.trim()}
          aria-label="Send message"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: "none",
            background: "var(--brand)",
            color: "#fff",
            cursor: isLoading || isClosed || !input.trim() ? "not-allowed" : "pointer",
            opacity: isLoading || isClosed || !input.trim() ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
        </>
      )}
    </div>
  );
}

const LINK_BUTTON_STYLE: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  color: "var(--brand)",
  fontSize: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

const FIELD_STYLE: React.CSSProperties = {
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  color: "var(--gray-900)",
  background: "#fff",
};

function ModeNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ alignSelf: "center", fontSize: 12, color: "var(--gray-500)" }}>
      {children}
    </div>
  );
}

// A visitor has to identify before the first message; the built-in widget ships
// this form, a custom UI brings its own.
function IdentifyForm({
  disabled,
  error,
  onSubmit,
}: {
  disabled: boolean;
  error: string | null;
  onSubmit: (payload: { name: string; phone: string; email?: string }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !name.trim() || !phone.trim()) return;
    void onSubmit({ name, phone, ...(email.trim() ? { email } : {}) });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "24px 20px",
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>
        Tell us who you are to start chatting
      </p>
      <input
        aria-label="Name"
        placeholder="Your name"
        autoComplete="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={FIELD_STYLE}
      />
      <input
        aria-label="Phone"
        placeholder="Phone with country code, e.g. +8801712345678"
        type="tel"
        autoComplete="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={FIELD_STYLE}
      />
      <input
        aria-label="Email (optional)"
        placeholder="Email (optional)"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={FIELD_STYLE}
      />
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled}
        style={{
          border: "none",
          borderRadius: 8,
          padding: "10px 16px",
          background: "var(--brand)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Start chatting
      </button>
    </form>
  );
}

const SENDER_LABELS: Record<ChatMessage["message"]["type"], string> = {
  human: "You",
  ai: "Assistant",
  agent: "Agent",
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const isHuman = message.message.type === "human";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isHuman ? "flex-end" : "flex-start",
        gap: 4,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "10px 15px",
          borderRadius: isHuman ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isHuman ? "var(--brand)" : "var(--gray-100)",
          color: isHuman ? "#fff" : "var(--gray-900)",
          fontSize: 14,
          lineHeight: 1.5,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          opacity: message.pending ? 0.6 : 1,
        }}
      >
        {(message.message.attachments ?? []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: message.message.content ? 6 : 0 }}>
            {(message.message.attachments ?? []).map((attachment) =>
              attachment.type.startsWith("image/") && attachment.url ? (
                <a key={attachment.url} href={attachment.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    style={{ display: "block", maxWidth: 200, maxHeight: 200, borderRadius: 10 }}
                  />
                </a>
              ) : (
                <a
                  key={attachment.url || attachment.fileName}
                  href={attachment.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "underline", fontSize: 13 }}
                >
                  📎 {attachment.fileName}
                </a>
              )
            )}
          </div>
        )}
        {message.message.content}
      </div>
      <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
        {SENDER_LABELS[message.message.type]}
        {message.pending ? " · Uploading…" : ""}
      </span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
      <div
        style={{
          background: "var(--gray-100)",
          borderRadius: "18px 18px 18px 4px",
          padding: "12px 16px",
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              background: "var(--gray-400)",
              borderRadius: "50%",
              animation: `bounce 1.2s ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--gray-500)",
        paddingTop: 40,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          background: "var(--brand-light)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--brand)">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
      </div>
      <p style={{ fontWeight: 600, color: "var(--gray-700)" }}>
        Start a conversation
      </p>
      <p style={{ fontSize: 13 }}>
        Type a message below to chat with the assistant.
      </p>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export function HeadlessDemo() {
  return (
    <div>
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--brand)",
              background: "var(--brand-light)",
              padding: "2px 8px",
              borderRadius: 4,
              letterSpacing: "0.08em",
            }}
          >
            HEADLESS
          </span>
          <h2
            style={{ fontSize: 20, fontWeight: 700, color: "var(--gray-900)" }}
          >
            Custom UI with <code>useChatbot()</code>
          </h2>
        </div>
        <p style={{ color: "var(--gray-500)", fontSize: 14 }}>
          Use the <code>useChatbot()</code> hook to build any UI you want —
          complete control over layout, styling, and behaviour. No Shadow DOM,
          no built-in widget.
        </p>
      </div>

      {!CHATBOT_API_KEY ? (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FCD34D",
            color: "#92400E",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 32,
          }}
        >
          Copy <code>.env.local.example</code> → <code>.env.local</code> and set{" "}
          <code>VITE_CHATBOT_API_KEY</code> to try the live chat.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        {/* Live UI */}
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--gray-700)",
              marginBottom: 12,
            }}
          >
            Live preview
          </h3>
          {CHATBOT_API_KEY ? (
            <ChatbotProvider
              apiKey={CHATBOT_API_KEY}
              apiBaseUrl={CHATBOT_API_BASE_URL}
              chatbotName="Onedesk Pro Assistant"
              welcomeMessage="Hello! How can I help you today?"
            >
              <CustomChat />
            </ChatbotProvider>
          ) : (
            <div
              style={{
                height: 520,
                background: "#fff",
                border: "1px solid var(--gray-200)",
                borderRadius: "var(--radius)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gray-300)",
                fontSize: 14,
              }}
            >
              No API key configured
            </div>
          )}
        </div>

        {/* Code */}
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--gray-700)",
              marginBottom: 12,
            }}
          >
            Source code
          </h3>
          <pre
            style={{
              fontSize: 12,
              lineHeight: 1.65,
              borderRadius: "var(--radius)",
            }}
          >
            <code>{CODE_SNIPPET}</code>
          </pre>

          <div
            style={{
              marginTop: 20,
              background: "#fff",
              border: "1px solid var(--gray-200)",
              borderRadius: "var(--radius)",
              padding: 20,
            }}
          >
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              Hook return values
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <tbody>
                {HOOK_FIELDS.map(([name, type, desc]) => (
                  <tr
                    key={name}
                    style={{ borderBottom: "1px solid var(--gray-100)" }}
                  >
                    <td style={{ padding: "7px 0", fontFamily: "monospace" }}>
                      <code>{name}</code>
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        color: "var(--gray-500)",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {type}
                    </td>
                    <td
                      style={{
                        padding: "7px 0",
                        color: "var(--gray-700)",
                        paddingLeft: 8,
                      }}
                    >
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const HOOK_FIELDS: [string, string, string][] = [
  ["messages", "ChatMessage[]", "All messages in the session"],
  ["isLoading", "boolean", "True while a request is in flight"],
  ["isReady", "boolean", "Config loaded and the agent can answer"],
  ["needsIdentify", "boolean", "True until the visitor has identified"],
  ["mode", "'ai' | 'waiting' | 'human' | 'closed'", "Who owns the conversation"],
  ["isOpen", "boolean", "Widget open state"],
  ["error", "string | null", "Last error message"],
  ["visitorToken", "string | null", "Token of the identified visitor"],
  ["submitIdentify", "({ name, phone, email? }) => Promise", "Identify the visitor"],
  ["sendMessage", "(text) => Promise", "Send a message to the API"],
  ["requestHuman", "() => Promise", "Hand the conversation to a human agent"],
  ["resetSession", "() => void", "Clear a closed conversation"],
  ["open / close / toggle", "() => void", "Control the built-in widget"],
];

const CODE_SNIPPET = `import { ChatbotProvider, useChatbot }
  from '@onedeskpro/chatbot-react';

function MyChatUI() {
  const {
    messages,
    sendMessage,
    submitIdentify,
    requestHuman,
    needsIdentify,
    mode,
    isLoading,
  } = useChatbot();

  const [input, setInput] = useState('');

  // A visitor identifies before the first message.
  if (needsIdentify) {
    return <IdentifyForm onSubmit={submitIdentify} />;
  }

  return (
    <div className="chat-window">
      {messages.map(msg => (
        <Bubble key={msg.id} message={msg} />
      ))}
      {isLoading && <TypingDots />}
      {mode === 'ai' && (
        <button onClick={requestHuman}>Talk to a person</button>
      )}

      <input
        value={input}
        disabled={mode === 'closed'}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')
            sendMessage(input).then(() => setInput(''));
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ChatbotProvider
      apiKey="ak_your_key"
      apiBaseUrl="${DEFAULT_API_BASE_URL}"
    >
      <MyChatUI />
    </ChatbotProvider>
  );
}`;
