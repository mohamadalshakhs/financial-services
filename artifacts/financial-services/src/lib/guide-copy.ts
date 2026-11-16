import type { Lang } from '@/lib/i18n';

export type GuideCopy = {
  badge: string; intro: string; provider: string;
  disclaimer: string; privacy: string; demoWarn: string;
  contextLabel: string; ctxSalary: string; ctxFixed: string; ctxSpent: string; ctxOutings: string; ctxPayday: (d: string) => string;
  suggestionsLabel: string; suggestions: string[];
  inputLabel: string; placeholder: string; hint: string; counter: (n: string, max: string) => string;
  send: string; sending: string; clear: string; retry: string;
  you: string; companion: string; thinking: string; emptyTitle: string; emptyDesc: string;
  errGeneric: string; errRate: string; errDaily: string; errUsage: string; errProtection: string;
  errTimeout: string; errNetwork: string; errEmpty: string; errTooLong: string;
  logLabel: string;
};

const ar: GuideCopy = {
  badge: 'مساعد ذكاء اصطناعي حقيقي',
  intro: 'اسأله عن أي طلعة أو عزيمة قبل ما توافق. يقرا أرقامك الحالية ويعطيك رأي هادي، بس ما يغيّر أي شي في مصاريفك.',
  provider: 'عبر OpenRouter',
  disclaimer: 'الذكاء الاصطناعي ممكن يغلط. خذ كلامه كرأي، مو نصيحة مالية رسمية.',
  privacy: 'لما ترسل، رسالتك وأرقام ميزانيتك الحالية (الراتب، الالتزامات، المصروف، حد الطلعات، يوم الراتب) تنرسل لـ OpenRouter. أسماء المصاريف ما تنرسل. لا تكتب معلومات حساسة.',
  demoWarn: 'الأرقام تجريبية، فالرد مبني على مثال مو على وضعك الحقيقي.',
  contextLabel: 'الأرقام اللي بتنرسل مع سؤالك',
  ctxSalary: 'الراتب', ctxFixed: 'التزامات ثابتة', ctxSpent: 'المصروف', ctxOutings: 'الطلعات',
  ctxPayday: (d) => `الراتب يوم ${d}`,
  suggestionsLabel: 'أسئلة جاهزة (تنكتب في الخانة بس، ما تنرسل)',
  suggestions: [
    'الشباب بيروحون مطعم ستيك الخميس، تقريباً ١٨ د.ك للشخص. أروح؟',
    'كيف أعتذر عن طلعة غالية بدون ما أبين بخيل؟',
    'كم أقدر أصرف على الطلعات باقي هالشهر وأنا مرتاح؟',
  ],
  inputLabel: 'اكتب موقفك أو سؤالك',
  placeholder: 'مثلاً: زميلي عازمنا على كافيه جديد بعد الدوام...',
  hint: 'Enter للإرسال، Shift + Enter لسطر جديد',
  counter: (n, max) => `${n} / ${max}`,
  send: 'اسأل', sending: 'يفكر...', clear: 'مسح المحادثة', retry: 'حاول مرة ثانية',
  you: 'أنت', companion: 'رفيقك', thinking: 'يقرا أرقامك ويفكر...',
  emptyTitle: 'ما فيه محادثة للحين',
  emptyDesc: 'اختر سؤال جاهز أو اكتب موقفك. ما نرسل شي إلا لما تضغط اسأل.',
  errGeneric: 'ما قدرنا نجيب رد الحين. جرّب مرة ثانية.',
  errRate: 'طلبات كثيرة بوقت قصير. استنى شوي وجرّب مرة ثانية.',
  errDaily: 'وصل المساعد لحد الأسئلة اليومي. تقدر ترجع بعد منتصف الليل بتوقيت UTC. مصاريفك وأرقامك ما تغيّرت.',
  errUsage: 'وصل المساعد لحد الاستخدام المتاح حالياً. نحتاج نزيد الحد قبل ما يستقبل أسئلة جديدة. باقي التطبيق يشتغل عادي.',
  errProtection: 'وقفنا المساعد مؤقتاً لأن حماية الاستخدام مو متاحة الحين. جرّب لاحقاً، وباقي التطبيق يشتغل عادي.',
  errTimeout: 'الرد طوّل أكثر من اللازم. جرّب مرة ثانية.',
  errNetwork: 'فيه مشكلة في الاتصال. تأكد من الإنترنت وجرّب.',
  errEmpty: 'اكتب سؤالك أول.',
  errTooLong: 'الرسالة طويلة، اختصرها شوي.',
  logLabel: 'المحادثة مع المساعد',
};

const en: GuideCopy = {
  badge: 'Real AI assistant',
  intro: 'Ask about any outing or invite before you say yes. It reads your current numbers and gives a calm take, but never changes your expenses.',
  provider: 'via OpenRouter',
  disclaimer: 'AI can make mistakes. Treat replies as a perspective, not official financial advice.',
  privacy: 'When you send, your message and current budget numbers (salary, commitments, spending, outing limit, payday) go to OpenRouter. Expense names are not sent. Do not type sensitive information.',
  demoWarn: 'These are demo numbers, so replies are based on an example, not your real situation.',
  contextLabel: 'Numbers sent with your question',
  ctxSalary: 'Salary', ctxFixed: 'Fixed', ctxSpent: 'Spent', ctxOutings: 'Outings',
  ctxPayday: (d) => `Payday on day ${d}`,
  suggestionsLabel: 'Starter questions (fills the box only, nothing is sent)',
  suggestions: [
    'The guys are going to a steakhouse Thursday, about 18 KD each. Should I go?',
    'How do I turn down a pricey outing without looking cheap?',
    'How much can I comfortably spend on outings for the rest of the month?',
  ],
  inputLabel: 'Describe your situation or question',
  placeholder: 'e.g. A colleague invited us to a new cafe after work...',
  hint: 'Enter to send, Shift + Enter for a new line',
  counter: (n, max) => `${n} / ${max}`,
  send: 'Ask', sending: 'Thinking...', clear: 'Clear chat', retry: 'Try again',
  you: 'You', companion: 'Companion', thinking: 'Reading your numbers and thinking...',
  emptyTitle: 'No conversation yet',
  emptyDesc: 'Pick a starter or type your own. Nothing is sent until you press Ask.',
  errGeneric: 'Could not get a reply right now. Please try again.',
  errRate: 'Too many requests in a short time. Wait a moment and try again.',
  errDaily: 'The assistant has reached its daily question limit. Please return after midnight UTC. Your expenses and numbers are unchanged.',
  errUsage: 'The assistant has reached its current usage allowance. The allowance needs to be increased before new questions can be answered. The rest of the app still works.',
  errProtection: 'The assistant is temporarily paused because usage protection is unavailable. Please try later. The rest of the app still works.',
  errTimeout: 'The reply took too long. Please try again.',
  errNetwork: 'Connection problem. Check your internet and try again.',
  errEmpty: 'Type your question first.',
  errTooLong: 'That message is too long, please shorten it.',
  logLabel: 'Conversation with the assistant',
};

export const guideCopy: Record<Lang, GuideCopy> = { ar, en };
