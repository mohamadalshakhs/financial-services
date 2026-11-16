import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Bell, CalendarDays, Coffee, Info, Languages, Moon, Pencil, Plus, Sun, Trash2, Users, Wallet, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePrefs } from '@/lib/prefs';
import type { SectionId } from '@/lib/i18n';
import { parseNum, parseMoney, filsToStr, fromFils, totals, type Config, type Expense, type Kind } from '@/lib/finance';
import { DecisionGuideChat } from '@/components/decision-guide-chat';
import { ProfileGate } from '@/components/profile-gate';
import { ProfileBudgetSetup } from '@/components/profile-budget-setup';
import {
  getGetFinancialProfilesQueryKey,
  getGetProfileFinancialDataQueryKey,
  useCreateFinancialProfile,
  useGetFinancialProfiles,
  useGetProfileFinancialData,
  useSaveProfileFinancialData,
  type FinancialProfile,
  type FinancialProfilesResponse,
  type GuideContext,
} from '@workspace/api-client-react';

type DraftKey = 'salary' | 'outingLimit' | 'payday';
const SECTIONS: SectionId[] = ['overview', 'add', 'alerts', 'guide'];
const EMPTY_CONFIG: Config = { salary: 0, fixed: 0, outingLimit: 0, payday: 1 };

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dict: d, dir, theme, toggleLang, toggleTheme, fmt, amt, money } = usePrefs();
  const profilesQuery = useGetFinancialProfiles();
  const createProfile = useCreateFinancialProfile();
  const saveProfileData = useSaveProfileFinancialData();
  const [activeProfile, setActiveProfile] = useState<FinancialProfile | null>(null);
  const profileId = activeProfile?.id ?? '';
  const profileData = useGetProfileFinancialData(profileId, {
    query: { enabled: !!activeProfile, queryKey: getGetProfileFinancialDataQueryKey(profileId) },
  });
  const resetKey = 0;
  const [cfg, setCfg] = useState<Config>(EMPTY_CONFIG);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [dirty, setDirty] = useState(false);
  const [saveRetry, setSaveRetry] = useState(0);
  const [setupSaveError, setSetupSaveError] = useState(false);
  const revision = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const activeProfileIdRef = useRef<string | null>(null);
  const initializedProfileId = useRef<string | null>(null);
  const saveMutationRef = useRef(saveProfileData.mutateAsync);
  saveMutationRef.current = saveProfileData.mutateAsync;
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Record<DraftKey, string>>({ salary: '', outingLimit: '', payday: '' });
  const [draftErr, setDraftErr] = useState<Partial<Record<DraftKey, true>>>({});
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [addErr, setAddErr] = useState<{ title?: true; amount?: true }>({});
  const [kind, setKind] = useState<Kind>('outing');
  const [flashId, setFlashId] = useState<string | null>(null);
  const nextId = useRef(100);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    activeProfileIdRef.current = profileId || null;
    if (!activeProfile) {
      setStorageReady(false);
      return;
    }
    if (initializedProfileId.current === profileId && storageReady) return;
    setStorageStatus('loading');
    if (profileData.isError) {
      setStorageReady(false);
      setStorageStatus('error');
      return;
    }
    if (profileData.isLoading || profileData.isFetching || !profileData.data) return;
    const snapshot = profileData.data.data;
    if (!snapshot) {
      setStorageReady(false);
      setStorageStatus('ready');
      return;
    }
    initializedProfileId.current = profileId;
    setCfg(snapshot.cfg);
    setExpenses(snapshot.expenses);
    nextId.current = Math.max(99, ...snapshot.expenses.map((expense) => expense.id)) + 1;
    setDirty(false);
    setStorageReady(true);
    setStorageStatus('ready');
  }, [activeProfile, profileId, profileData.data, profileData.isError, profileData.isFetching, profileData.isLoading]);

  useEffect(() => {
    if (!storageReady || !dirty) return;
    const savedRevision = revision.current;
    const savingProfileId = profileId;
    const snapshot = { cfg, expenses };
    const timer = window.setTimeout(() => {
      if (activeProfileIdRef.current === savingProfileId) setStorageStatus('saving');
      const request = saveQueue.current
        .catch(() => undefined)
        .then(() => saveMutationRef.current({ profileId: savingProfileId, data: snapshot }))
        .then((saved) => {
          queryClient.setQueryData(
            getGetProfileFinancialDataQueryKey(savingProfileId),
            { data: saved },
          );
          if (activeProfileIdRef.current === savingProfileId && revision.current === savedRevision) {
            setDirty(false);
            setStorageStatus('ready');
          }
        })
        .catch(() => {
          if (activeProfileIdRef.current === savingProfileId && revision.current === savedRevision) setStorageStatus('error');
        });
      saveQueue.current = request;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [storageReady, dirty, cfg, expenses, saveRetry, profileId, queryClient]);

  const markDirty = () => {
    revision.current += 1;
    setDirty(true);
  };
  const retryStorage = () => {
    if (!storageReady) void profileData.refetch();
    else setSaveRetry((value) => value + 1);
  };

  const chooseProfile = (profile: FinancialProfile) => {
    initializedProfileId.current = null;
    revision.current += 1;
    setStorageReady(false);
    setDirty(false);
    setStorageStatus('loading');
    setTitle('');
    setAmount('');
    setAddErr({});
    setDraftErr({});
    setEditOpen(false);
    setKind('outing');
    setSetupSaveError(false);
    setActiveProfile(profile);
  };

  const switchProfile = () => {
    if (dirty || storageStatus === 'saving' || saveProfileData.isPending) return;
    initializedProfileId.current = null;
    revision.current += 1;
    setActiveProfile(null);
    setStorageReady(false);
    setDirty(false);
    setSetupSaveError(false);
  };

  const handleCreateProfile = (name: string) => {
    createProfile.mutate({ data: { name } }, {
      onSuccess: (profile) => {
        const profilesKey = getGetFinancialProfilesQueryKey();
        const current = queryClient.getQueryData<FinancialProfilesResponse>(profilesKey);
        queryClient.setQueryData<FinancialProfilesResponse>(profilesKey, {
          profiles: [...(current?.profiles ?? []).filter((item) => item.id !== profile.id), profile],
        });
        chooseProfile(profile);
      },
    });
  };

  const saveInitialBudget = async (config: Config) => {
    if (!activeProfile) return;
    const savingProfileId = profileId;
    setSetupSaveError(false);
    try {
      const saved = await saveProfileData.mutateAsync({
        profileId: savingProfileId,
        data: { cfg: config, expenses: [] },
      });
      queryClient.setQueryData(
        getGetProfileFinancialDataQueryKey(savingProfileId),
        { data: saved },
      );
      if (activeProfileIdRef.current !== savingProfileId) return;
      initializedProfileId.current = savingProfileId;
      setCfg(saved.cfg);
      setExpenses(saved.expenses);
      nextId.current = 100;
      setDirty(false);
      setStorageReady(true);
      setStorageStatus('ready');
    } catch {
      if (activeProfileIdRef.current === savingProfileId) setSetupSaveError(true);
    }
  };

  const KD = ({ v, className = '' }: { v: number; className?: string }) => (
    <span className={`num ${className}`}>{amt(v)} <span className="text-[0.55em] font-medium opacity-70">{d.currency}</span></span>
  );

  const t = useMemo(() => totals(expenses, cfg), [expenses, cfg]);
  const guideContext = useMemo<GuideContext>(() => {
    return {
      salary: fromFils(cfg.salary), fixedCommitments: fromFils(cfg.fixed), totalSpent: t.spent,
      outingsSpent: t.outSpent, outingsLimit: fromFils(cfg.outingLimit), payday: cfg.payday,
    };
  }, [cfg, t]);
  const outLimit = fromFils(cfg.outingLimit);
  const expTitle = (e: Expense) => e.title ?? (e.seedKey ? d.seed[e.seedKey] : '');

  const focus = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1400);
    if (id === 'add') setTimeout(() => titleRef.current?.focus(), 450);
  };

  const addExpense = (e: FormEvent) => {
    e.preventDefault();
    if (!storageReady) return;
    const n = parseMoney(amount);
    const errs = { title: !title.trim() || title.trim().length > 120 || undefined, amount: !(n !== null && n > 0) || undefined } as { title?: true; amount?: true };
    setAddErr(errs);
    if (errs.title || errs.amount) {
      toast({ title: d.toastMissingTitle, description: d.toastMissingDesc });
      return;
    }
    setExpenses((xs) => [{ id: nextId.current++, title: title.trim(), fils: n!, kind, day: 'now' }, ...xs]);
    markDirty();
    setTitle(''); setAmount('');
    toast({ title: d.toastAddedTitle, description: d.toastAddedDesc });
  };

  const openEdit = () => {
    setDraft({ salary: filsToStr(cfg.salary), outingLimit: filsToStr(cfg.outingLimit), payday: String(cfg.payday) });
    setDraftErr({});
    setEditOpen(true);
  };
  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!storageReady) return;
    const s = parseMoney(draft.salary), o = parseMoney(draft.outingLimit), p = parseNum(draft.payday);
    const errs: Partial<Record<DraftKey, true>> = {};
    if (!(s !== null && s > 0)) errs.salary = true;
    if (o === null) errs.outingLimit = true;
    if (!(Number.isInteger(p) && p >= 1 && p <= 31)) errs.payday = true;
    setDraftErr(errs);
    if (Object.keys(errs).length) {
      toast({ title: d.toastCheckTitle, description: d.toastCheckDesc });
      return;
    }
    setCfg((c) => ({ ...c, salary: s!, outingLimit: o!, payday: p }));
    markDirty();
    setEditOpen(false);
    toast({ title: d.toastSavedTitle, description: d.toastSavedDesc });
  };
  const alerts = [
    t.outLeft < 0
      ? { tone: 'hot', text: d.alertOver(money(-t.outLeft)) }
      : outLimit === 0
        ? { tone: 'warm', text: d.alertZeroBudget }
        : t.outPct >= 70
          ? { tone: 'warm', text: d.alertWarm(fmt(Math.round(t.outPct)), money(t.outLeft)) }
          : { tone: 'calm', text: d.alertCalm(money(t.outLeft)) },
    { tone: 'calm', text: t.days === 0 ? d.alertPaydayToday(fmt(cfg.payday)) : d.alertDays(fmt(t.days), fmt(cfg.payday)) },
    { tone: 'warm', text: d.alertExample },
  ];

  const ring = (id: string) => (flashId === id ? 'flash' : '');
  const card = 'rounded-[1.6rem] border border-card-border bg-card';
  const inputCls = 'w-full rounded-xl border bg-background px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20';
  const errCls = (bad?: boolean) => (bad ? 'border-destructive' : 'border-input');
  const ctrlBtn = 'grid h-9 min-w-9 place-items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95';

  const fields: [DraftKey, string, string][] = [['salary', d.fSalary, d.errSalary], ['outingLimit', d.fOuting, d.errOuting], ['payday', d.fPayday, d.errPayday]];

  if (!activeProfile) {
    return (
      <ProfileGate
        profiles={profilesQuery.data?.profiles ?? []}
        isLoading={profilesQuery.isLoading}
        isError={profilesQuery.isError}
        isCreating={createProfile.isPending}
        createError={createProfile.isError}
        onRetry={() => void profilesQuery.refetch()}
        onCreate={handleCreateProfile}
        onSelect={chooseProfile}
      />
    );
  }

  if (!storageReady && storageStatus === 'error') {
    return (
      <div dir={dir} className="grid min-h-[100dvh] place-items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-[1.6rem] border border-card-border bg-card p-7">
          <p className="text-sm text-muted-foreground">{activeProfile.name}</p>
          <h1 className="font-display mt-2 text-2xl font-semibold">{dir === 'rtl' ? 'تعذر تحميل الميزانية' : 'Budget couldn’t be loaded'}</h1>
          <p data-testid="status-budget-error" className="mt-2 text-sm leading-6 text-muted-foreground">{dir === 'rtl' ? 'لم تتغير أي بيانات. تحقق من الاتصال وحاول مرة أخرى.' : 'No information was changed. Check your connection and try again.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button data-testid="button-retry-storage" onClick={retryStorage} className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">{d.storageStatus.retry}</button>
            <button data-testid="button-switch-profile" onClick={switchProfile} className="rounded-xl border border-border px-5 py-3 font-semibold">{dir === 'rtl' ? 'تبديل الملف' : 'Switch profile'}</button>
          </div>
        </div>
      </div>
    );
  }

  if (profileData.data?.data === null && !profileData.isFetching && !profileData.isError) {
    return (
      <ProfileBudgetSetup
        profileName={activeProfile.name}
        isSaving={saveProfileData.isPending}
        saveError={setupSaveError}
        onSave={saveInitialBudget}
        onSwitchProfile={switchProfile}
      />
    );
  }

  if (!storageReady) {
    return (
      <div dir={dir} className="grid min-h-[100dvh] place-items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm rounded-[1.6rem] border border-card-border bg-card p-6">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-5 h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-muted" />
          <p data-testid="status-budget-loading" role="status" className="mt-6 text-sm text-muted-foreground">{dir === 'rtl' ? 'جاري تحميل ميزانية' : 'Loading budget for'} {activeProfile.name}…</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 md:gap-3 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Wallet className="h-4 w-4" aria-hidden /></div>
            <span dir="ltr" className="font-display truncate text-base font-semibold sm:text-lg">Financial services</span>
          </div>
            <div data-testid="status-active-profile" className="ms-2 flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              <span className="max-w-28 truncate font-medium sm:max-w-40">{activeProfile.name}</span>
              <button data-testid="button-switch-profile" onClick={switchProfile} disabled={dirty || storageStatus === 'saving' || saveProfileData.isPending} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:cursor-wait disabled:opacity-50" aria-label={dir === 'rtl' ? 'تبديل الملف العائلي' : 'Switch family profile'}>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />{dir === 'rtl' ? 'تبديل' : 'Switch'}
              </button>
            </div>
          <nav aria-label={d.mainNav} className="ms-auto hidden gap-1 text-sm lg:flex">
            {SECTIONS.map((id) => (
              <button key={id} data-testid={`nav-${id}`} onClick={() => focus(id)} className="rounded-full px-3 py-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">{d.nav[id]}</button>
            ))}
          </nav>
          <button data-testid="button-toggle-lang" onClick={toggleLang} aria-label={d.switchLangLabel} className={`${ctrlBtn} ms-auto flex sm:ms-0`}>
            <Languages className="h-3.5 w-3.5" aria-hidden /><span lang={d.switchLang === 'English' ? 'en' : 'ar'}>{d.switchLang}</span>
          </button>
          <button data-testid="button-toggle-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? d.themeToLight : d.themeToDark} aria-pressed={theme === 'dark'} className={ctrlBtn}>
            {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pt-10">
        <div className="rise mb-6 flex items-start gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm text-secondary-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="flex-1">{d.profileNotice}</p>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
            <span data-testid="storage-status" role="status" aria-live="polite" className={storageStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{d.storageStatus[storageStatus]}</span>
            {storageStatus === 'error' && <button data-testid="button-retry-storage" onClick={retryStorage} className="rounded-full px-2 py-1 font-semibold text-primary hover:bg-background">{d.storageStatus.retry}</button>}
          </div>
        </div>

        <section id="overview" className={`grid scroll-mt-24 gap-4 md:grid-cols-[1.35fr_1fr] ${ring('overview')} rounded-[1.8rem]`}>
          <div className="rise relative overflow-hidden rounded-[1.8rem] bg-primary p-6 text-primary-foreground md:p-9">
            <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-accent/30" />
            <div className="pointer-events-none absolute -bottom-24 end-24 h-56 w-56 rounded-full border-[28px] border-primary-foreground/10" />
            <p className="relative text-sm opacity-80">{d.greeting(activeProfile.name)}</p>
            <p data-testid="text-per-day" className="font-display relative mt-3 text-5xl font-bold leading-none md:text-6xl"><KD v={t.perDay} /></p>
            <p className="relative mt-3 text-sm opacity-85">{t.days === 0 ? d.paydayToday : d.daysLeft(fmt(t.days))}</p>
            <div className="relative mt-8 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-primary-foreground/10 p-4">
                <p className="opacity-75">{d.remaining}</p>
                <p data-testid="text-remaining" className={`font-display mt-1 text-2xl font-semibold ${t.remaining < 0 ? 'text-accent' : ''}`}><KD v={t.remaining} /></p>
              </div>
              <div className="rounded-2xl bg-primary-foreground/10 p-4">
                <p className="opacity-75">{d.salary}</p>
                <p data-testid="text-salary" className="font-display mt-1 text-2xl font-semibold"><KD v={fromFils(cfg.salary)} /></p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className={`rise ${card} p-6`} style={{ animationDelay: '.1s' }}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4 text-accent" aria-hidden />{d.outingBudget}</p>
                <button data-testid="button-edit-limit" onClick={openEdit} disabled={!storageReady} className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50" aria-label={d.editSettings}><Pencil className="h-4 w-4" aria-hidden /></button>
              </div>
              <p data-testid="text-outing-left" className="font-display mt-2 text-4xl font-bold"><KD v={t.outLeft} className={t.outLeft < 0 ? 'text-destructive' : ''} /></p>
              <p className="text-sm text-muted-foreground">{d.leftOfLimit} <span className="num">{money(outLimit)}</span></p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={d.outingProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.outPct)}>
                <div className="h-full rounded-full bg-accent transition-transform duration-700 ease-out ltr:origin-left rtl:origin-right" style={{ transform: `scaleX(${t.outPct / 100})` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{d.spentOnOutings(money(t.outSpent))}</p>
            </div>
            <button data-testid="button-edit-payday" onClick={openEdit} disabled={!storageReady} aria-label={d.editSettings} className={`rise ${card} group flex items-center gap-4 p-5 text-start transition hover:-translate-y-0.5 disabled:opacity-50`} style={{ animationDelay: '.18s' }}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary"><CalendarDays className="h-5 w-5" aria-hidden /></div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{d.paydayTitle}</p>
                <p data-testid="text-payday" className="font-display num text-lg font-semibold">{d.paydayValue(fmt(cfg.payday))}</p>
              </div>
              <span className="text-xs text-primary opacity-70 transition group-hover:opacity-100">{d.edit}</span>
            </button>
          </div>
        </section>

        <p className="num mt-3 text-xs text-muted-foreground">{d.formula(money(fromFils(cfg.fixed)), money(t.spent))}</p>

        <div className="mt-10 grid gap-6 md:grid-cols-[1fr_1.15fr]">
          <div className="space-y-6">
            <section id="add" aria-labelledby="add-title" className={`scroll-mt-24 ${card} p-6 ${ring('add')}`}>
              <h2 id="add-title" className="font-display text-xl font-semibold">{d.addTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d.addSub}</p>
              <form onSubmit={addExpense} noValidate className="mt-5 space-y-3">
                <div>
                  <label htmlFor="exp-title" className="mb-1 block text-sm text-muted-foreground">{d.titleLabel}</label>
                  <input id="exp-title" ref={titleRef} data-testid="input-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={d.titlePh} maxLength={120} disabled={!storageReady} aria-invalid={!!addErr.title} aria-describedby={addErr.title ? 'exp-title-err' : undefined} className={`${inputCls} ${errCls(addErr.title)} disabled:opacity-60`} />
                  {addErr.title && <p id="exp-title-err" className="mt-1 text-xs text-destructive">{d.errTitle}</p>}
                </div>
                <div className="flex gap-3">
                  <div className="w-1/2">
                    <label htmlFor="exp-amount" className="mb-1 block text-sm text-muted-foreground">{d.amountLabel}</label>
                    <input id="exp-amount" data-testid="input-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" type="number" min="0" step="0.001" placeholder={d.amountPh} disabled={!storageReady} aria-invalid={!!addErr.amount} aria-describedby={addErr.amount ? 'exp-amount-err' : undefined} className={`num ${inputCls} ${errCls(addErr.amount)} disabled:opacity-60`} />
                  </div>
                  <div className="w-1/2">
                    <span id="kind-label" className="mb-1 block text-sm text-muted-foreground">{d.kindLabel}</span>
                    <div role="radiogroup" aria-labelledby="kind-label" className="flex h-[50px] rounded-xl bg-muted p-1 text-sm">
                      {(['outing', 'basic'] as const).map((k) => (
                        <button type="button" role="radio" aria-checked={kind === k} key={k} data-testid={`toggle-kind-${k}`} disabled={!storageReady} onClick={() => setKind(k)} className={`flex-1 rounded-lg transition disabled:opacity-60 ${kind === k ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground'}`}>{d.kind[k]}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {addErr.amount && <p id="exp-amount-err" className="text-xs text-destructive">{d.errAmount}</p>}
                <button data-testid="button-add-expense" disabled={!storageReady} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[.98] disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden />{d.addBtn}</button>
              </form>
            </section>

            <section id="alerts" aria-labelledby="alerts-title" className={`scroll-mt-24 ${card} p-6 ${ring('alerts')}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="alerts-title" className="font-display flex items-center gap-2 text-xl font-semibold"><Bell className="h-5 w-5 text-accent" aria-hidden />{d.alertsTitle}</h2>
                <span className="text-xs text-muted-foreground">{d.alertsNote}</span>
              </div>
              <ul className="mt-4 space-y-2.5" aria-live="polite">
                {alerts.map((a, i) => (
                  <li key={i} data-testid={`alert-${i}`} className={`num rounded-2xl px-4 py-3 text-sm leading-relaxed transition ${a.tone === 'hot' ? 'bg-destructive/10 text-destructive' : a.tone === 'warm' ? 'bg-accent/12 text-accent-ink' : 'bg-secondary text-secondary-foreground'}`}>{a.text}</li>
                ))}
              </ul>
            </section>
          </div>

          <section id="recent" aria-labelledby="recent-title" className={`${card} p-6`}>
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="font-display text-xl font-semibold">{d.recentTitle}</h2>
              <button data-testid="button-focus-add" onClick={() => focus('add')} aria-label={d.newBtnLabel} className="text-sm text-primary hover:underline">{d.newBtn}</button>
            </div>
            {expenses.length === 0 ? (
              <div className="mt-10 flex flex-col items-center py-10 text-center text-muted-foreground">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-secondary"><Coffee className="h-6 w-6 text-primary" aria-hidden /></div>
                <p className="mt-3 font-display text-foreground">{d.emptyTitle}</p>
                <p className="text-sm">{d.emptyDesc}</p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {expenses.map((e) => (
                  <li key={e.id} data-testid={`row-expense-${e.id}`} className="rise group flex items-center gap-3 py-3.5">
                    <span className={`h-9 w-1.5 rounded-full ${e.kind === 'outing' ? 'bg-accent' : 'bg-primary/60'}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" dir={e.title ? 'auto' : undefined}>{expTitle(e)}</p>
                      <p className="text-xs text-muted-foreground">{d.kind[e.kind]} · {d.day[e.day]}</p>
                    </div>
                    <KD v={fromFils(e.fils)} className="font-display font-semibold" />
                  <button data-testid={`button-delete-${e.id}`} disabled={!storageReady} aria-label={d.deleteLabel(expTitle(e))} onClick={() => { setExpenses((xs) => xs.filter((x) => x.id !== e.id)); markDirty(); toast({ title: d.toastDeletedTitle, description: d.toastDeletedDesc }); }} className="rounded-full p-2 text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section id="guide" aria-labelledby="guide-title" className={`mt-10 scroll-mt-24 overflow-hidden rounded-[1.8rem] border border-accent/30 bg-guide p-6 md:p-9 ${ring('guide')}`}>
          <DecisionGuideChat context={guideContext} resetKey={resetKey} title={d.guideTitle} />
        </section>
      </main>

      <nav aria-label={d.mobileNav} className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-full border border-border bg-card/95 p-1.5 text-xs shadow-lg backdrop-blur lg:hidden">
        {SECTIONS.map((id) => (
          <button key={id} data-testid={`mnav-${id}`} onClick={() => focus(id)} className="rounded-full px-3 py-2 transition active:bg-secondary">{d.mnav[id]}</button>
        ))}
      </nav>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir={dir} closeLabel={d.close} className="rounded-3xl text-start">
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle className="font-display">{d.dlgTitle}</DialogTitle>
            <DialogDescription>{d.dlgDesc}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} noValidate className="space-y-3">
            {fields.map(([k, l, err]) => (
              <div key={k} className="text-sm">
                <label htmlFor={`f-${k}`} className="text-muted-foreground">{l}</label>
              <input id={`f-${k}`} data-testid={`input-${k}`} type="number" inputMode={k === 'payday' ? 'numeric' : 'decimal'} min={k === 'payday' ? 1 : 0} max={k === 'payday' ? 31 : undefined} step={k === 'payday' ? 1 : 0.001} value={draft[k]} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} disabled={!storageReady} aria-invalid={!!draftErr[k]} aria-describedby={`f-${k}-help`} className={`num mt-1 w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:border-primary disabled:opacity-60 ${errCls(draftErr[k])}`} />
                <p id={`f-${k}-help`} className={`mt-1 text-xs ${draftErr[k] ? 'text-destructive' : 'text-muted-foreground'}`}>{draftErr[k] ? err : k === 'payday' ? d.fPaydayHint : ''}</p>
              </div>
            ))}
            <button data-testid="button-save-settings" disabled={!storageReady} className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">{d.saveBtn}</button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
