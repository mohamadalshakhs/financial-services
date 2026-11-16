import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowRight, CircleAlert, Languages, Moon, Plus, ShieldAlert, Sun, Users, Wallet } from 'lucide-react';
import { usePrefs } from '@/lib/prefs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { FinancialProfile } from '@workspace/api-client-react';

type ProfileGateProps = {
  profiles: FinancialProfile[];
  isLoading: boolean;
  isError: boolean;
  isCreating: boolean;
  createError: boolean;
  onRetry: () => void;
  onCreate: (name: string) => void;
  onSelect: (profile: FinancialProfile) => void;
};

export function ProfileGate({
  profiles, isLoading, isError, isCreating, createError, onRetry, onCreate, onSelect,
}: ProfileGateProps) {
  const { dict: d, dir, theme, toggleLang, toggleTheme } = usePrefs();
  const [showForm, setShowForm] = useState(false);
  const profileSchema = z.object({
    name: z.string().trim()
      .min(1, { message: dir === 'rtl' ? 'اكتب اسماً للملف.' : 'Enter a profile name.' })
      .max(40, { message: dir === 'rtl' ? 'الاسم لا يتجاوز ٤٠ حرفاً.' : 'Use 40 characters or fewer.' }),
  });
  type ProfileValues = z.infer<typeof profileSchema>;
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '' },
    mode: 'onSubmit',
  });
  const langLabel = dir === 'rtl' ? 'English' : 'العربية';

  const submit = (values: ProfileValues) => onCreate(values.name.trim());

  return (
    <div dir={dir} className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/85">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 md:px-8">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><Wallet className="h-4 w-4" aria-hidden /></div>
          <span dir="ltr" className="font-display text-lg font-semibold">Financial services</span>
          <div className="ms-auto flex items-center gap-2">
            <Button data-testid="button-toggle-lang" variant="outline" size="sm" onClick={toggleLang} aria-label={d.switchLangLabel}><Languages aria-hidden />{langLabel}</Button>
            <Button data-testid="button-toggle-theme" variant="outline" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? d.themeToLight : d.themeToDark} aria-pressed={theme === 'dark'}>{theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl content-center gap-8 px-4 py-10 md:grid-cols-[.9fr_1.1fr] md:gap-16 md:px-8">
        <section className="rise flex flex-col justify-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{dir === 'rtl' ? 'مساحة عائلية' : 'A shared family space'}</p>
          <h1 className="font-display max-w-xl text-4xl font-bold leading-tight md:text-6xl">
            {dir === 'rtl' ? 'كل راتب له مساحته.' : 'A little room for everyone’s money.'}
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            {dir === 'rtl'
              ? 'اختر ملف أحد أفراد العائلة لمتابعة راتبه ومصاريفه وميزانية طلعاته بشكل مستقل.'
              : 'Choose a family member to see their salary, everyday spending and outing budget—kept separate from everyone else.'}
          </p>
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-accent/30 bg-guide p-4 text-sm leading-6">
            <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
            <p>{dir === 'rtl'
              ? 'لكل ملف رمز PIN من ٤ أرقام على هذا المتصفح. هذا قفل خصوصية بسيط، مو تسجيل دخول يحمي البيانات بالكامل.'
              : 'Each profile has its own four-digit PIN on this browser. It is a simple privacy lock, not full account security.'}</p>
          </div>
        </section>

        <section className="rise rounded-[1.8rem] border border-card-border bg-card p-5 shadow-sm sm:p-8" style={{ animationDelay: '.12s' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{dir === 'rtl' ? 'ابدأ من هنا' : 'Start here'}</p>
              <h2 className="font-display mt-1 text-2xl font-semibold">{dir === 'rtl' ? 'من يستخدم الميزانية؟' : 'Who’s using this budget?'}</h2>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><Users className="h-5 w-5" aria-hidden /></div>
          </div>

          {isLoading ? (
            <div data-testid="status-profiles-loading" role="status" className="mt-7 space-y-3">
              <div className="h-[68px] animate-pulse rounded-2xl bg-muted" />
              <div className="h-[68px] animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : isError ? (
            <div className="mt-7 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-start gap-3 text-sm">
                <CircleAlert className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
                <p data-testid="status-profiles-error">{dir === 'rtl' ? 'تعذر تحميل الملفات. تحقق من الاتصال وحاول مرة ثانية.' : 'Profiles could not be loaded. Check your connection and try again.'}</p>
              </div>
              <Button data-testid="button-retry-profiles" variant="outline" className="mt-4" onClick={onRetry}>{dir === 'rtl' ? 'إعادة المحاولة' : 'Try again'}</Button>
            </div>
          ) : (
            <>
              {profiles.length > 0 && !showForm && (
                <div className="mt-6 space-y-2" data-testid="list-profiles">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      data-testid={`button-select-profile-${profile.id}`}
                      onClick={() => onSelect(profile)}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-background/55 p-4 text-start transition hover:border-primary/50 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-display font-semibold text-primary">{profile.name.trim().slice(0, 1).toLocaleUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span data-testid={`text-profile-name-${profile.id}`} className="block truncate font-semibold">{profile.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{dir === 'rtl' ? 'ميزانية ومصاريف مستقلة' : 'Separate budget and expenses'}</span>
                      </span>
                      <ArrowRight className={`h-4 w-4 text-muted-foreground transition group-hover:text-primary ${dir === 'rtl' ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                  ))}
                  <Button data-testid="button-show-create-profile" variant="outline" className="mt-3 w-full rounded-xl py-6" onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4" aria-hidden />{dir === 'rtl' ? 'إضافة ملف عائلي' : 'Add a family profile'}
                  </Button>
                </div>
              )}

              {(profiles.length === 0 || showForm) && (
                <div className="mt-7">
                  {profiles.length === 0 && (
                    <div data-testid="status-profile-empty" className="mb-5 rounded-xl bg-secondary/70 px-4 py-3 text-sm text-secondary-foreground">
                      {dir === 'rtl' ? 'ما فيه ملفات محفوظة لهذا المتصفح. أنشئ أول ملف للمتابعة.' : 'No profiles are saved in this browser yet. Create the first one to continue.'}
                    </div>
                  )}
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{dir === 'rtl' ? 'اسم فرد العائلة' : 'Family member’s name'}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-profile-name" maxLength={40} autoComplete="off" placeholder={dir === 'rtl' ? 'مثال: سعود' : 'e.g. Saud'} disabled={isCreating} />
                            </FormControl>
                            <FormDescription>{dir === 'rtl' ? 'من حرف إلى ٤٠ حرفاً.' : '1–40 characters.'}</FormDescription>
                            <FormMessage data-testid="status-profile-validation" />
                          </FormItem>
                        )}
                      />
                      {createError && (
                        <p data-testid="status-profile-create-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {dir === 'rtl' ? 'ما قدرنا ننشئ الملف. قد يكون الاسم مستخدماً؛ جرّب اسماً آخر.' : 'We couldn’t create this profile. The name may already be in use; try another.'}
                        </p>
                      )}
                      <Button data-testid="button-create-profile" type="submit" disabled={isCreating} className="w-full rounded-xl py-6">
                        <Plus className="h-4 w-4" aria-hidden />
                        {isCreating ? (dir === 'rtl' ? 'جاري إنشاء الملف…' : 'Creating profile…') : (dir === 'rtl' ? 'إنشاء الملف والمتابعة' : 'Create profile and continue')}
                      </Button>
                    </form>
                  </Form>
                  {profiles.length > 0 && (
                    <Button data-testid="button-cancel-create-profile" variant="ghost" className="mt-2 w-full" onClick={() => { setShowForm(false); form.reset(); }}>
                      {dir === 'rtl' ? 'العودة للملفات' : 'Back to profiles'}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
