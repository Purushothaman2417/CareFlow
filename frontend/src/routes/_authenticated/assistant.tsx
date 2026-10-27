import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Send } from "lucide-react";

import { ApiError, askAssistant, type AssistantMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Symptom assistant — CareFlow" },
      {
        name: "description",
        content: "Describe symptoms and get AI guidance on urgency and which specialist to see.",
      },
      { property: "og:title", content: "Symptom assistant — CareFlow" },
      {
        property: "og:description",
        content: "AI decision support for choosing the right specialist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const SAMPLE_PROMPTS = [
  "I have had an itchy rash on both forearms for three days. I have no fever or breathing problems.",
  "I have had a mild headache since this morning and would like to know what symptoms would make it urgent.",
  "My child has had a cough and a low fever since yesterday. What kind of clinician should I contact?",
  "I have mild knee soreness after a long walk, with no fall or difficulty bearing weight.",
] as const;

function renderMd(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>");
    return <p key={i} className="min-h-2" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

function AssistantPage() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const reply = await askAssistant(next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "The assistant is unavailable. Please try again.",
      );
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Symptom assistant</h1>
          <p className="mt-1 text-muted-foreground">
            Describe how you feel. You'll get possible causes, urgency and the specialist to see.
            Not a diagnosis.
          </p>
        </div>

        <div className="surface-card min-h-80 space-y-4 p-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Bot className="size-10 text-primary" />
              <p>Choose an example prompt or describe your symptoms.</p>
              <div className="flex w-full flex-wrap justify-center gap-2 px-4">
                {SAMPLE_PROMPTS.map((prompt, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal py-2 text-left"
                    onClick={() => setInput(prompt)}
                    disabled={busy}
                  >
                    Example {index + 1}
                  </Button>
                ))}
              </div>
              <p className="max-w-xl text-xs">
                Assistant conversations are temporary and are not saved to your records.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
                    : "max-w-[90%] space-y-1 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground"
                }
              >
                {m.role === "user" ? m.content : renderMd(m.content)}
              </div>
            ))
          )}
          {busy ? <p className="text-sm text-muted-foreground">Thinking…</p> : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Describe your symptoms…"
            rows={2}
          />
          <Button onClick={send} disabled={busy || !input.trim()} className="h-auto">
            <Send className="size-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Ready to book?{" "}
          <Link to="/doctors" className="text-primary underline">
            Find a doctor
          </Link>
        </p>
      </div>
    </>
  );
}
