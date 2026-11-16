import { Router, type IRouter } from "express";
import { AskDecisionGuideBody, AskDecisionGuideResponse } from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { guideSystemPrompt } from "../lib/decision-guide";
import { createUsageLimiter, type UsageDecision } from "../lib/guide-usage";

const usageLimiter = createUsageLimiter();
export function createDecisionGuideRouter({
  provider = openrouter,
  usageGuard = (caller) => usageLimiter.reserve(caller),
  timeoutMs = 45_000,
}: {
  provider?: Pick<typeof openrouter, "chat">;
  usageGuard?: (caller: string) => Promise<UsageDecision>;
  timeoutMs?: number;
} = {}): IRouter {
const router: IRouter = Router();
const windowMs = 60_000;
let windowStart = Date.now();
let windowRequests = 0;
let activeRequests = 0;
const callers = new Map<string, number>();

// MVP limits are process-local, not durable or shared between instances.
// No message bodies, budget data, or provider credentials are logged or stored.
router.post("/openrouter/decision-guide", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = AskDecisionGuideBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.message.trim() ||
      parsed.data.history.some((m) => !m.content.trim()) ||
      parsed.data.context.outingsSpent > parsed.data.context.totalSpent) {
    res.status(400).json({ error: "INVALID_INPUT" });
    return;
  }

  const now = Date.now();
  if (now - windowStart >= windowMs) {
    windowStart = now;
    windowRequests = 0;
    callers.clear();
  }
  const caller = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const count = callers.get(caller) ?? 0;
  if (windowRequests >= 20 || count >= 8 || activeRequests >= 3) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowMs - now + windowStart) / 1000))));
    res.status(429).json({ error: "RATE_LIMITED" });
    return;
  }
  windowRequests++;
  callers.set(caller, count + 1);
  activeRequests++;

  let usageAdmission: UsageDecision;
  try {
    usageAdmission = await usageGuard(caller);
    if (!usageAdmission.allowed) {
      activeRequests--;
      if (usageAdmission.retryAfter) res.setHeader("Retry-After", String(usageAdmission.retryAfter));
      res.status(429).json({ error: usageAdmission.error });
      return;
    }
  } catch {
    activeRequests--;
    req.log.warn("AI usage protection unavailable; provider call blocked");
    res.setHeader("Retry-After", "30");
    res.status(503).json({ error: "USAGE_PROTECTION_UNAVAILABLE" });
    return;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", onClose);

  try {
    if (res.destroyed) return;
    const input = parsed.data;
    const completion = await provider.chat.completions.create({
      model: "google/gemini-2.5-flash-lite",
      max_tokens: 8192,
      messages: [
        { role: "system", content: guideSystemPrompt(input) },
        ...input.history,
        { role: "user", content: input.message.trim() },
      ],
    // Avoid silently repeating potentially billable provider requests.
    }, { signal: controller.signal, maxRetries: 0 });

    const reply = completion.choices[0]?.message.content?.trim();
    const output = AskDecisionGuideResponse.safeParse({ reply });
    if (!output.success || completion.choices[0]?.finish_reason === "length") {
      req.log.warn("Decision guide provider returned an incomplete response");
      if (!res.destroyed) res.status(502).json({ error: "AI_UNAVAILABLE" });
      return;
    }
    if (!res.destroyed) res.json(output.data);
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? err.status : undefined;
    req.log.warn({ providerStatus: typeof status === "number" ? status : undefined, timedOut }, "Decision guide request failed");
    if (res.destroyed) return;
    if (timedOut) {
      res.status(504).json({ error: "AI_TIMEOUT" });
    } else if (status === 429) {
      res.setHeader("Retry-After", "30");
      res.status(429).json({ error: "RATE_LIMITED" });
    } else {
      res.status(502).json({ error: "AI_UNAVAILABLE" });
    }
  } finally {
    clearTimeout(timer);
    res.off("close", onClose);
    activeRequests--;
    if (usageAdmission.allowed) await usageAdmission.release();
  }
});

return router;
}

export default createDecisionGuideRouter();
