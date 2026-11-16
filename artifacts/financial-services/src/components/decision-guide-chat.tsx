import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowUp, Eraser, Lock, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { askDecisionGuide, type GuideContext, type GuideMessage } from '@workspace/api-client-react';
import { usePrefs } from '@/lib/prefs';
import { guideCopy } from '@/lib/guide-copy';
import { classifyGuideError, type GuideError } from '@/lib/guide-error';

const MAX_MSG = 1500;
const MAX_HISTORY = 12;
const MAX_CONTENT = 6000;

type Props = { context: GuideContext; resetKey: number; title: string };

export function DecisionGuideChat({ context, resetKey, title }: Props) {
  const { lang, amt, fmt, dict } = usePrefs();
  const c = guideCopy[lang];
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GuideError | null>(null);
  const [inputErr, setInputErr] = useState<'empty' | 'long' | null>(null);

  // Latest values read at send time.
  const ctxRef = useRef(context); ctxRef.current = context;
  const langRef = useRef(lang); langRef.current = lang;
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resetKey === 0) return;
    abortRef.current?.abort();
    reqId.current++;
    setMessages([]); setPending(null); setLoading(false); setError(null); setInput(''); setInputErr(null);
  }, [resetKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, error]);

  const run = async (text: string, prior: GuideMessage[]) => {
    const id = ++reqId.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPending(text); setLoading(true); setError(null);
    const history = prior.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }));
    try {
      const res = await askDecisionGuide(
        { message: text, language: langRef.current, context: { ...ctxRef.current }, history },
        { signal: ac.signal },
      );
      if (id !== reqId.current) return;
      const reply = (res?.reply ?? '').trim();
      if (!reply) throw new Error('empty');
      setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: reply }]);
      setPending(null);
    } catch (err) {
      if (id !== reqId.current || ac.signal.aborted) return;
      setError(classifyGuideError(err));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    const text = input.trim();
    if (!text) { setInputErr('empty'); taRef.current?.focus(); return; }
    if (text.length > MAX_MSG) { setInputErr('long'); return; }
    setInputErr(null); setInput('');
    void run(text, messages);
  };

  const retry = () => { if (pending && !loading) void run(pending, messages); };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };

  const clear = () => { reqId.current++; setMessages([]); setPending(null); setError(null); };

  const errText = error === 'rate' ? c.errRate
    : error === 'daily' ? c.errDaily
    : error === 'usage' ? c.errUsage
    : error === 'protection' ? c.errProtection
    : error === 'timeout' ? c.errTimeout
    : error === 'network' ? c.errNetwork
    : c.errGeneric;
  const chip = (label: string, v: number) => (
    <span className="num rounded-full bg-card/80 px-2.5 py-1">{label} <b className="font-semibold">{amt(v)}</b> <span className="opacity-60">{dict.currency}</span></span>
  );
  const bubble = (role: 'user' | 'assistant', content: string, i: number | string, dim = false) => (
    <li key={i} data-testid={`msg-${role}-${i}`} className={`rise flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${role === 'user' ? 'rounded-ee-md bg-card text-foreground' : 'rounded-es-md bg-primary text-primary-foreground'} ${dim ? 'opacity-70' : ''}`}>
        <p className="mb-1 text-[11px] font-semibold opacity-60">{role === 'user' ? c.you : c.companion}</p>
        <p dir="auto" className="whitespace-pre-wrap break-words">{content}</p>
      </div>
    </li>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-5 w-5 text-accent" aria-hidden />
        <h2 id="guide-title" className="font-display text-2xl font-semibold">{title}</h2>
        <span data-testid="badge-ai-live" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-semibold text-accent-ink">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative h-2 w-2 rounded-full bg-accent" /></span>
          {c.badge}
        </span>
        <span dir="ltr" data-testid="text-provider" className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">OpenRouter</span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{c.intro}</p>

      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_1.45fr]">
        <aside className="space-y-3 text-xs">
          <div className="rounded-2xl bg-card/70 p-4">
            <p className="mb-2 font-semibold text-muted-foreground">{c.contextLabel}</p>
            <div data-testid="guide-context" className="flex flex-wrap gap-1.5">
              {chip(c.ctxSalary, context.salary)}
              {chip(c.ctxFixed, context.fixedCommitments)}
              {chip(c.ctxSpent, context.totalSpent)}
              {chip(c.ctxOutings, context.outingsSpent)}
              <span className="num rounded-full bg-card/80 px-2.5 py-1">/ <b className="font-semibold">{amt(context.outingsLimit)}</b> <span className="opacity-60">{dict.currency}</span></span>
              <span className="num rounded-full bg-card/80 px-2.5 py-1">{c.ctxPayday(fmt(context.payday))}</span>
            </div>
          </div>
          <p className="flex gap-2 rounded-2xl bg-card/50 p-3 leading-relaxed text-muted-foreground"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /><span>{c.privacy}</span></p>
          <p className="flex gap-2 rounded-2xl bg-card/50 p-3 leading-relaxed text-muted-foreground"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /><span>{c.disclaimer} {c.demoWarn}</span></p>
          <div>
            <p className="mb-2 text-muted-foreground">{c.suggestionsLabel}</p>
            <div className="flex flex-col gap-2">
              {c.suggestions.map((s, i) => (
                <button key={i} type="button" data-testid={`button-suggestion-${i}`} onClick={() => { setInput(s); setInputErr(null); taRef.current?.focus(); }}
                  className="rounded-xl border border-accent/30 bg-card/60 px-3 py-2 text-start text-sm leading-snug transition hover:-translate-y-0.5 hover:border-accent active:scale-[.98]">{s}</button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-h-[380px] flex-col rounded-2xl bg-card/60 p-3 md:p-4">
          <div ref={logRef} className="max-h-[440px] flex-1 overflow-y-auto pe-1">
            {messages.length === 0 && !pending ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-guide text-accent"><Sparkles className="h-5 w-5" aria-hidden /></div>
                <p className="font-display mt-3">{c.emptyTitle}</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">{c.emptyDesc}</p>
              </div>
            ) : (
              <ul aria-label={c.logLabel} aria-live="polite" aria-busy={loading} role="log" className="space-y-3">
                {messages.map((m, i) => bubble(m.role, m.content, i))}
                {pending && bubble('user', pending, 'pending', !!error)}
                {loading && (
                  <li data-testid="status-thinking" className="flex justify-start">
                    <div className="w-[70%] space-y-2 rounded-2xl rounded-es-md bg-primary/10 px-4 py-3">
                      <p className="text-[11px] font-semibold text-primary">{c.thinking}</p>
                      <div className="h-2.5 w-full animate-pulse rounded-full bg-primary/20" />
                      <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-primary/20" />
                    </div>
                  </li>
                )}
              </ul>
            )}
            {error && (
              <div role="alert" data-testid="status-guide-error" className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1">{errText}</span>
                <button type="button" data-testid="button-guide-retry" onClick={retry} disabled={loading} className="flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" aria-hidden />{c.retry}</button>
              </div>
            )}
          </div>

          <form onSubmit={submit} noValidate className="mt-3 border-t border-border/70 pt-3">
            <label htmlFor="guide-input" className="sr-only">{c.inputLabel}</label>
            <textarea id="guide-input" ref={taRef} data-testid="input-guide" dir="auto" rows={3} value={input} maxLength={MAX_MSG}
              onChange={(e) => { setInput(e.target.value); if (inputErr) setInputErr(null); }} onKeyDown={onKey}
              placeholder={c.placeholder} aria-invalid={!!inputErr} aria-describedby="guide-hint"
              className={`w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20 ${inputErr ? 'border-destructive' : 'border-input'}`} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p id="guide-hint" className={`flex-1 text-xs ${inputErr ? 'text-destructive' : 'text-muted-foreground'}`}>
                {inputErr === 'empty' ? c.errEmpty : inputErr === 'long' ? c.errTooLong : c.hint}
                <span className="num ms-2 opacity-70">{c.counter(fmt(input.length), fmt(MAX_MSG))}</span>
              </p>
              <button type="button" data-testid="button-guide-clear" onClick={clear} disabled={loading || (messages.length === 0 && !pending)}
                className="flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"><Eraser className="h-3.5 w-3.5" aria-hidden />{c.clear}</button>
              <button type="submit" data-testid="button-guide-send" disabled={loading} aria-busy={loading}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-60">
                {loading ? c.sending : c.send}<ArrowUp className={`h-4 w-4 ${loading ? 'animate-bounce' : ''}`} aria-hidden />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
