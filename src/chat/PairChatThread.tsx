import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../ui/use-toast";
import { Send } from "lucide-react";
import { CHAT_MAX_LEN, isSystemMessage, systemMessageText, type ChatMessage } from "./usePairChat";

interface PairChatThreadProps {
  messages: ChatMessage[];
  /** Opaque role string — "mine" bubbles are messages whose sender_role === this. */
  selfRole: string;
  loading: boolean;
  onSend: (text: string) => Promise<boolean>;
  /** Compact styling for the in-call side panel. */
  compact?: boolean;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Presentational chat thread: scrollable message list + input. Fills its
 * parent's height. Used inside the in-call panel.
 */
export function PairChatThread({ messages, selfRole, loading, onSend, compact }: PairChatThreadProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onSend(t);
    setSending(false);
    if (ok) setText("");
    else toast({ title: "Couldn't send message", variant: "destructive" });
  };

  const bubble = compact ? "text-xs px-3 py-1.5 rounded-lg" : "text-sm px-3 py-2 rounded-2xl";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello 👋</p>
        ) : (
          messages.map((m) => {
            if (isSystemMessage(m.body)) {
              return (
                <div key={m.id} className="flex justify-center">
                  <p className="text-[11px] text-muted-foreground italic py-1 text-center">
                    {systemMessageText(m.body)}
                  </p>
                </div>
              );
            }
            const mine = m.sender_role === selfRole;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] ${bubble} ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message…"
          maxLength={CHAT_MAX_LEN}
          className={compact ? "h-8 text-xs" : ""}
          autoFocus
        />
        <Button
          size="icon"
          variant={compact ? "ghost" : "default"}
          className={compact ? "h-8 w-8 shrink-0" : ""}
          onClick={submit}
          disabled={sending || !text.trim()}
        >
          <Send className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </Button>
      </div>
    </div>
  );
}
