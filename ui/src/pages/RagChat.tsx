import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Loader2, Bot, User, ChevronDown, ChevronUp, FileText, Sparkles, MessageSquareText, Search, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { api, type ChatMessage, type ChatSource } from '@/lib/serverComm';

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
};

let nextId = 0;
function createId(): string {
  nextId += 1;
  return `msg-${nextId}-${Date.now()}`;
}

function SourcesPanel({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 border-2 border-foreground px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-secondary hover:bg-secondary/80 transition-colors shadow-[2px_2px_0_0_var(--color-foreground)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        <FileText className="w-3.5 h-3.5" />
        {sources.length} source{sources.length > 1 ? 's' : ''} used
        {open ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 animate-neo-slide-up" style={{ animationDelay: '0s' }}>
          {sources.map((source, i) => (
            <div
              key={`${source.documentName}-${i}`}
              className="border-3 border-foreground border-l-[6px] border-l-primary bg-card p-3 text-sm shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b-2 border-foreground/10">
                <span className="font-bold truncate" title={source.documentName}>{source.documentName}</span>
                <span className="text-xs font-black uppercase bg-emerald-200 dark:bg-emerald-400/30 text-emerald-900 dark:text-emerald-100 px-2 py-0.5 border-2 border-foreground shrink-0">
                  {(source.similarity * 100).toFixed(1)}% match
                </span>
              </div>
              <p className="text-muted-foreground line-clamp-4 whitespace-pre-wrap leading-relaxed">
                {source.chunkText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isLatest }: { message: DisplayMessage, isLatest: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 md:gap-4 ${isUser ? 'flex-row-reverse' : ''} ${isLatest ? 'animate-neo-slide-up' : ''}`}>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground shadow-[3px_3px_0_0_var(--color-foreground)] ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
        }`}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>
      <div className={`max-w-[85%] md:max-w-[75%] space-y-2 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block border-3 border-foreground px-5 py-3 text-sm md:text-base whitespace-pre-wrap shadow-[4px_4px_0_0_var(--color-foreground)] leading-relaxed text-left ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border-l-[6px] border-l-accent'
          }`}
        >
          {message.content}
        </div>
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="text-left">
            <SourcesPanel sources={message.sources} />
          </div>
        )}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  { icon: FileSearch, text: 'Summarize my documents' },
  { icon: Sparkles, text: 'What are the key takeaways?' },
  { icon: Search, text: 'Find important dates or deadlines' }
];

export function RagChat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const doSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: DisplayMessage = {
      id: createId(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError('');
    setIsLoading(true);

    try {
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await api.sendChatMessage(trimmed, history);

      const assistantMessage: DisplayMessage = {
        id: createId(),
        role: 'assistant',
        content: response.reply,
        sources: response.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    void doSubmit(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    void doSubmit(prompt);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="relative border-b-3 border-foreground px-6 py-5 shrink-0 overflow-hidden bg-card">
        <div className="absolute top-0 right-0 w-24 h-24 bg-secondary border-3 border-foreground rotate-12 -z-10 translate-x-4 -translate-y-8 opacity-50" />
        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
          <MessageSquareText className="w-8 h-8 text-primary" />
          RAG Chat
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl font-medium">
          Ask questions about your uploaded documents. Responses are powered by Gemini and grounded in your data.
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background/50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto animate-neo-slide-up">
            <div className="border-3 border-foreground bg-card p-8 md:p-12 shadow-[8px_8px_0_0_var(--color-foreground)] w-full text-center relative overflow-hidden">
              {/* Decorative shapes */}
              <div className="absolute top-4 -left-6 w-16 h-16 bg-primary border-3 border-foreground rotate-12 shadow-[4px_4px_0_0_var(--color-foreground)]" />
              <div className="absolute top-8 right-6 w-10 h-10 bg-accent border-3 border-foreground rounded-full shadow-[2px_2px_0_0_var(--color-foreground)]" />
              <div className="absolute bottom-10 -left-4 w-12 h-12 bg-emerald-400 border-3 border-foreground -rotate-12 shadow-[3px_3px_0_0_var(--color-foreground)]" />
              <div className="absolute -bottom-6 right-8 w-20 h-20 bg-secondary border-3 border-foreground rotate-45 shadow-[4px_4px_0_0_var(--color-foreground)]" />

              <div className="bg-accent text-accent-foreground w-20 h-20 mx-auto flex items-center justify-center border-3 border-foreground shadow-[4px_4px_0_0_var(--color-foreground)] mb-6 z-10 relative hover:-translate-y-1 transition-transform">
                <Bot className="h-10 w-10" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 z-10 relative">
                How can I help?
              </h2>
              <p className="text-muted-foreground text-lg mb-10 max-w-md mx-auto z-10 relative">
                Ask a question about your documents, or try one of the suggestions below to get started.
              </p>

              <div className="flex flex-col gap-3 max-w-md mx-auto z-10 relative">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickPrompt(prompt.text)}
                    className="group flex items-center gap-3 p-3 border-3 border-foreground bg-background hover:bg-primary/10 transition-colors shadow-[3px_3px_0_0_var(--color-foreground)] hover:shadow-[2px_2px_0_0_var(--color-foreground)] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none text-left"
                  >
                    <prompt.icon className="w-5 h-5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="font-bold">{prompt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 max-w-4xl mx-auto pb-4">
            {messages.map((message, i) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                isLatest={i === messages.length - 1} 
              />
            ))}
            {isLoading && (
              <div className="flex gap-4 animate-neo-slide-up">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground shadow-[3px_3px_0_0_var(--color-foreground)] bg-accent text-accent-foreground animate-pulse">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-3 border-3 border-foreground border-l-[6px] border-l-accent bg-card px-5 py-3 shadow-[4px_4px_0_0_var(--color-foreground)] w-fit">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="border-t-3 border-b-3 border-foreground bg-destructive/10 px-6 py-3 shrink-0 flex items-start gap-3">
          <Bot className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="font-black uppercase text-sm text-destructive">Error</p>
            <p className="text-sm font-bold">{error}</p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t-3 border-foreground p-4 md:p-6 bg-card shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto items-end relative group">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your documents..."
              rows={1}
              disabled={isLoading}
              className="w-full resize-none border-3 border-foreground bg-background px-4 py-3 min-h-[52px] text-base font-medium placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary focus-visible:bg-primary/5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 shadow-[5px_5px_0_0_var(--color-foreground)]"
            />
          </div>
          <Button 
            type="submit" 
            size="icon" 
            className="h-[52px] w-[52px] shrink-0 group-focus-within:bg-primary mb-[5px]"
            disabled={isLoading || input.trim().length === 0}
            title="Send Message"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Send className="h-6 w-6" />
            )}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4 font-medium">
          Press <kbd className="font-mono bg-muted px-1.5 py-0.5 text-[11px] leading-none inline-block border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] align-middle mx-0.5">Enter</kbd> to send, <kbd className="font-mono bg-muted px-1.5 py-0.5 text-[11px] leading-none inline-block border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] align-middle mx-0.5">Shift + Enter</kbd> for new line.
        </p>
      </div>
    </div>
  );
}
