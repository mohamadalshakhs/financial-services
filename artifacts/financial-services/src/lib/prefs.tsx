import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type Dict, type Lang } from '@/lib/i18n';

type Theme = 'light' | 'dark';
type Prefs = {
  lang: Lang; dir: 'rtl' | 'ltr'; theme: Theme; dict: Dict;
  toggleLang: () => void; toggleTheme: () => void;
  fmt: (n: number) => string; amt: (n: number) => string; money: (n: number) => string;
};

const LANG_KEY = 'fs-lang';
const THEME_KEY = 'fs-theme';

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { window.localStorage.setItem(key, v); } catch { /* storage unavailable */ }
}
function initialTheme(): Theme {
  const s = read(THEME_KEY);
  if (s === 'light' || s === 'dark') return s;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}
function initialLang(): Lang {
  const s = read(LANG_KEY);
  return s === 'en' || s === 'ar' ? s : 'ar';
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const dict = dictionaries[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useLayoutEffect(() => {
    const el = document.documentElement;
    el.lang = lang; el.dir = dir;
    document.title = dict.meta.title;
    document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]')
      .forEach((m) => m.setAttribute('content', dict.meta.description));
  }, [lang, dir, dict]);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleLang = useCallback(() => setLang((l) => { const n = l === 'ar' ? 'en' : 'ar'; write(LANG_KEY, n); return n; }), []);
  const toggleTheme = useCallback(() => setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; write(THEME_KEY, n); return n; }), []);

  const value = useMemo<Prefs>(() => {
    const loc = lang === 'ar' ? 'ar-KW' : 'en-US';
    const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
    const mf = new Intl.NumberFormat(loc, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const fmt = (n: number) => nf.format(n);
    const amt = (n: number) => mf.format(n);
    return { lang, dir, theme, dict, toggleLang, toggleTheme, fmt, amt, money: (n) => `${amt(n)} ${dict.currency}` };
  }, [lang, dir, theme, dict, toggleLang, toggleTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside PrefsProvider');
  return v;
}
