import React from "react";
import { ChatbotProvider, ChatbotWidget } from "@onedeskpro/chatbot-react";
import { DEFAULT_API_BASE_URL } from "@onedeskpro/chatbot-core";
import { CHATBOT_API_BASE_URL, CHATBOT_API_KEY } from "../chatbot-config";

export function DefaultWidgetDemo() {
  return (
    <div>
      <Section
        label="01"
        title="Default Floating Widget"
        description="The SDK injects a self-contained chat widget into the bottom-right corner via Shadow DOM. It doesn't affect your styles."
      >
        <Card>
          {!CHATBOT_API_KEY ? (
            <Callout type="warning">
              Copy <code>.env.local.example</code> → <code>.env.local</code> and
              set <code>VITE_CHATBOT_API_KEY</code> to see the live widget.
            </Callout>
          ) : (
            <Callout type="success">
              API key detected. Look for the chat button in the bottom-right
              corner.
            </Callout>
          )}

          <CodeBlock>{`import { ChatbotProvider, ChatbotWidget } from '@onedeskpro/chatbot-react';

function App() {
  return (
    <ChatbotProvider
      apiKey="ak_your_key"
      apiBaseUrl="${DEFAULT_API_BASE_URL}"
      chatbotName="Onedesk Pro Assistant"
      primaryColor="#2563EB"
      theme="auto"
      position="bottom-right"
      welcomeMessage="Hello! How can I help you today?"
    >
      <YourApp />
      <ChatbotWidget />
    </ChatbotProvider>
  );
}`}</CodeBlock>
        </Card>
      </Section>

      <Section
        label="02"
        title="Configuration Options"
        description="All ChatbotProvider props and their defaults."
      >
        <Card>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--gray-200)" }}>
                {["Prop", "Type", "Default", "Description"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      color: "var(--gray-500)",
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONFIG_ROWS.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid var(--gray-100)" }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <code>{row[0]}</code>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      color: "var(--gray-500)",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    {row[1]}
                  </td>
                  <td
                    style={{ padding: "10px 12px", color: "var(--gray-500)" }}
                  >
                    {row[2]}
                  </td>
                  <td
                    style={{ padding: "10px 12px", color: "var(--gray-700)" }}
                  >
                    {row[3]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      {/* Live widget — only mounts when API key is present */}
      {CHATBOT_API_KEY && (
        <ChatbotProvider
          apiKey={CHATBOT_API_KEY}
          apiBaseUrl={CHATBOT_API_BASE_URL}
          chatbotName="Onedesk Pro Assistant"
          primaryColor="#2563EB"
          theme="auto"
          position="bottom-right"
          welcomeMessage="Hello! How can I help you today?"
          placeholder="Ask me anything…"
        >
          <ChatbotWidget />
        </ChatbotProvider>
      )}
    </div>
  );
}

const CONFIG_ROWS = [
  ["apiKey", "string", "—", "Required. Your ak_… key from the portal."],
  [
    "apiBaseUrl",
    "string",
    DEFAULT_API_BASE_URL,
    "Base URL of the Onedesk Pro API.",
  ],
  [
    "chatbotName",
    "string",
    '"AI Assistant"',
    "Name shown in the widget header.",
  ],
  [
    "primaryColor",
    "string",
    '"#2563EB"',
    "Hex colour used to generate the full palette.",
  ],
  [
    "theme",
    '"light" | "dark" | "auto"',
    '"auto"',
    'Colour theme. "auto" follows the OS preference.',
  ],
  [
    "position",
    '"bottom-right" | "bottom-left"',
    '"bottom-right"',
    "Anchor position on screen.",
  ],
  [
    "welcomeMessage",
    "string",
    '""',
    "First message shown when the chat opens.",
  ],
  ["placeholder", "string", '"Type your message…"', "Input placeholder text."],
  ["autoOpen", "boolean", "false", "Open the widget automatically on load."],
  ["requestTimeoutMs", "number", "30000", "Abort an API request after this many ms."],
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 48 }}>
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
          {label}
        </span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--gray-900)" }}>
          {title}
        </h2>
      </div>
      <p style={{ color: "var(--gray-500)", marginBottom: 20, fontSize: 14 }}>
        {description}
      </p>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Callout({
  type,
  children,
}: {
  type: "warning" | "success";
  children: React.ReactNode;
}) {
  const colors = {
    warning: { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E" },
    success: { bg: "#ECFDF5", border: "#6EE7B7", text: "#065F46" },
  }[type];
  return (
    <div
      style={{
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`,
        color: colors.text,
        padding: "12px 20px",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        borderRadius: 0,
        borderTop: "1px solid var(--gray-200)",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}
