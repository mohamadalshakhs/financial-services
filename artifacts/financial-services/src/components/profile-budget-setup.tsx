import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Languages, Moon, Sun, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { usePrefs } from '@/lib/prefs';
import { parseMoney, parseNum, type Config } from '@/lib/finance';

type SetupValues = {
  salary: string;
  outingLimit: string;
  payday: string;
};

type ProfileBudgetSetupProps = {
  profileName: string;
  isSaving: boolean;
  saveError: boolean;
  onSave: (config: Config) => Promise<void>;
  onSwitchProfile: () => void;
};

export function ProfileBudgetSetup({
  profileName, isSaving, saveError, onSave, onSwitchProfile,
}: ProfileBudgetSetupProps) {
  const { dict: d, dir, theme, toggleLang, toggleTheme } = usePrefs();
  const schema = z.object({
    salary: z.string().refine((value) => {
      const amount = parseMoney(value);
      return amount !== null && amount > 0;
    }, { message: d.errSalary }),
    outingLimit: z.string().refine((value) => parseMoney(value) !== null, { message: d.errOuting }),
    payday: z.string().refine((value) => {
      const day = parseNum(value);
      return Number.isInteger(day) && day >= 1 && day <= 31;
    }, { message: d.errPayday }),
  });
  const form = useForm<SetupValues>({
    resolver: zodResolver(schema),
    defaultValues: { salary: '', outingLimit: '', payday: '' },
    mode: 'onSubmit',
  });
  const submit = async (values: SetupValues) => {
    const salary = parseMoney(values.salary);
    const outingLimit = parseMoney(values.outingLimit);
    const payday = parseNum(values.payday);
    if (salary === null || outingLimit === null || !Number.isInteger(payday)) return;
    await onSave({ salary, fixed: 0, outingLimit, payday });
  };

  const langLabel = dir === 'rtl' ? 'English' : 'العربية';

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
          <p className="mb-4 text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{dir === 'rtl' ? 'ملف جديد' : 'A fresh start'}</p>
          <h1 className="font-display max-w-xl text-4xl font-bold leading-tight md:text-6xl">{d.setupTitle}</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">{d.setupDescription}</p>
        </section>

        <section data-testid="status-profile-setup" className="rise rounded-[1.8rem] border border-card-border bg-card p-5 shadow-sm sm:p-8" style={{ animationDelay: '.12s' }}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{dir === 'rtl' ? 'الملف الحالي' : 'Current profile'}</p>
              <h2 className="font-display mt-1 truncate text-2xl font-semibold">{profileName}</h2>
            </div>
            <Button data-testid="button-switch-profile-setup" variant="outline" onClick={onSwitchProfile} disabled={isSaving}>{d.setupSwitchProfile}</Button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-5">
              <FormField control={form.control} name="salary" render={({ field }) => (
                <FormItem>
                  <FormLabel>{d.fSalary}</FormLabel>
                  <FormControl><Input {...field} data-testid="input-setup-salary" type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" placeholder="0.000" disabled={isSaving} /></FormControl>
                  <FormMessage data-testid="status-setup-salary-error" />
                </FormItem>
              )} />
              <FormField control={form.control} name="payday" render={({ field }) => (
                <FormItem>
                  <FormLabel>{d.fPayday}</FormLabel>
                  <FormControl><Input {...field} data-testid="input-setup-payday" type="number" min="1" max="31" step="1" inputMode="numeric" dir="ltr" placeholder="1–31" disabled={isSaving} /></FormControl>
                  <FormDescription>{d.fPaydayHint}</FormDescription>
                  <FormMessage data-testid="status-setup-payday-error" />
                </FormItem>
              )} />
              <FormField control={form.control} name="outingLimit" render={({ field }) => (
                <FormItem>
                  <FormLabel>{d.fOuting}</FormLabel>
                  <FormControl><Input {...field} data-testid="input-setup-outing-limit" type="number" min="0" step="0.001" inputMode="decimal" dir="ltr" placeholder="0.000" disabled={isSaving} /></FormControl>
                  <FormMessage data-testid="status-setup-outing-error" />
                </FormItem>
              )} />
              {saveError && <p data-testid="status-setup-save-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{d.setupSaveError}</p>}
              <Button data-testid="button-save-profile-setup" type="submit" className="w-full rounded-xl py-6" disabled={isSaving}>
                {isSaving ? d.setupSaving : d.setupSave}
              </Button>
            </form>
          </Form>
        </section>
      </main>
    </div>
  );
}
