import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Languages, LockKeyhole, Moon, ShieldCheck, Sun, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePrefs } from '@/lib/prefs';
import {
  createProfilePin,
  hasProfilePin,
  normalizePinInput,
  verifyProfilePin,
} from '@/lib/profile-pin';
import type { FinancialProfile } from '@workspace/api-client-react';

type ProfilePinGateProps = {
  profile: FinancialProfile;
  onUnlock: () => void;
  onCancel: () => void;
};

type GateMode = 'checking' | 'create' | 'unlock' | 'error';

export function ProfilePinGate({ profile, onUnlock, onCancel }: ProfilePinGateProps) {
  const { dir, theme, toggleLang, toggleTheme } = usePrefs();
  const [mode, setMode] = useState<GateMode>('checking');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setPin('');
    setConfirmPin('');
    setError('');
    try {
      setMode(hasProfilePin(profile.id) ? 'unlock' : 'create');
    } catch {
      setMode('error');
    }
  }, [profile.id]);

  const langLabel = dir === 'rtl' ? 'English' : 'العربية';
  const isCreating = mode === 'create';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(pin)) {
      setError(dir === 'rtl' ? 'أدخل ٤ أرقام بالضبط.' : 'Enter exactly four digits.');
      return;
    }

    if (isCreating && pin !== confirmPin) {
      setError(dir === 'rtl' ? 'الرمزان غير متطابقين.' : 'The PINs do not match.');
      setConfirmPin('');
      return;
    }

    setIsWorking(true);
    try {
      if (isCreating) {
        await createProfilePin(profile.id, pin);
      } else if (!await verifyProfilePin(profile.id, pin)) {
        setError(dir === 'rtl' ? 'الرمز غير صحيح. حاول مرة ثانية.' : 'That PIN is incorrect. Try again.');
        setPin('');
        return;
      }
      onUnlock();
    } catch {
      setError(dir === 'rtl'
        ? 'تعذر حفظ أو التحقق من الرمز في هذا المتصفح. تأكد من تفعيل التخزين الآمن.'
        : 'The PIN could not be saved or checked in this browser. Check secure storage support.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div dir={dir} className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/85">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 md:px-8">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" aria-hidden />
          </div>
          <span dir="ltr" className="font-display text-lg font-semibold">Financial services</span>
          <div className="ms-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleLang}>
              <Languages aria-hidden />{langLabel}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark'
                ? (dir === 'rtl' ? 'تفعيل الوضع الفاتح' : 'Switch to light mode')
                : (dir === 'rtl' ? 'تفعيل الوضع الداكن' : 'Switch to dark mode')}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl place-items-center px-4 py-10 md:px-8">
        <section className="w-full max-w-md rounded-[1.8rem] border border-card-border bg-card p-6 shadow-sm sm:p-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            {mode === 'unlock' ? <LockKeyhole className="h-5 w-5" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{profile.name}</p>
          <h1 className="font-display mt-1 text-2xl font-semibold">
            {mode === 'checking'
              ? (dir === 'rtl' ? 'جاري التحقق…' : 'Checking security…')
              : mode === 'unlock'
                ? (dir === 'rtl' ? 'أدخل رمز PIN' : 'Enter your PIN')
                : mode === 'create'
                  ? (dir === 'rtl' ? 'أنشئ رمز PIN من ٤ أرقام' : 'Create a four-digit PIN')
                  : (dir === 'rtl' ? 'تعذر فتح قفل الرمز' : 'Could not load the PIN lock')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {mode === 'unlock'
              ? (dir === 'rtl' ? `أدخل الرمز لفتح ملف ${profile.name}.` : `Enter the PIN to open ${profile.name}’s profile.`)
              : mode === 'create'
                ? (dir === 'rtl' ? 'اختَر رمزاً لهذا الملف. ستحتاجه عند فتحه من هذا المتصفح.' : 'Choose a PIN for this profile. You’ll need it when opening this profile in this browser.')
                : mode === 'error'
                  ? (dir === 'rtl' ? 'تعذر قراءة إعداد الرمز المحفوظ لهذا الملف.' : 'The saved PIN settings for this profile could not be read.')
                  : (dir === 'rtl' ? 'لحظة واحدة…' : 'Just a moment…')}
          </p>

          {mode === 'checking' ? (
            <div role="status" className="mt-7 h-12 animate-pulse rounded-xl bg-muted" />
          ) : mode === 'error' ? (
            <div className="mt-7 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p role="alert" className="text-sm leading-6 text-destructive">
                {dir === 'rtl'
                  ? 'لا يمكن تجاوز الرمز بأمان. ارجع لقائمة الملفات أو فعّل التخزين المحلي في المتصفح.'
                  : 'The PIN cannot be bypassed safely. Return to the profile list or enable local storage in this browser.'}
              </p>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
              <div>
                <label htmlFor="profile-pin" className="mb-2 block text-sm font-medium">
                  {dir === 'rtl' ? 'رمز PIN' : 'PIN'}
                </label>
                <Input
                  id="profile-pin"
                  data-testid="input-profile-pin"
                  type="password"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  onChange={(event) => { setPin(normalizePinInput(event.target.value)); setError(''); }}
                  aria-label={dir === 'rtl' ? 'رمز PIN من ٤ أرقام' : 'Four-digit PIN'}
                  className="h-14 text-center font-mono text-xl tracking-[.55em]"
                  autoFocus
                  disabled={isWorking}
                />
              </div>

              {isCreating && (
                <div>
                  <label htmlFor="profile-pin-confirm" className="mb-2 block text-sm font-medium">
                    {dir === 'rtl' ? 'أكد الرمز' : 'Confirm PIN'}
                  </label>
                  <Input
                    id="profile-pin-confirm"
                    data-testid="input-profile-pin-confirm"
                    type="password"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(event) => { setConfirmPin(normalizePinInput(event.target.value)); setError(''); }}
                    aria-label={dir === 'rtl' ? 'تأكيد رمز PIN' : 'Confirm four-digit PIN'}
                    className="h-14 text-center font-mono text-xl tracking-[.55em]"
                    disabled={isWorking}
                  />
                </div>
              )}

              <p className="rounded-xl bg-secondary/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
                {dir === 'rtl'
                  ? 'قفل خصوصية لهذا المتصفح فقط، وليس تسجيل دخول أو حماية قوية للبيانات.'
                  : 'This is a privacy lock for this browser, not account sign-in or strong data protection.'}
              </p>

              {error && (
                <p data-testid="status-profile-pin-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button data-testid="button-submit-profile-pin" type="submit" className="w-full rounded-xl py-6" disabled={isWorking || pin.length !== 4 || (isCreating && confirmPin.length !== 4)}>
                {isWorking
                  ? (dir === 'rtl' ? 'جاري التحقق…' : 'Checking…')
                  : isCreating
                    ? (dir === 'rtl' ? 'حفظ الرمز وفتح الملف' : 'Save PIN and open profile')
                    : (dir === 'rtl' ? 'فتح الملف' : 'Unlock profile')}
              </Button>
            </form>
          )}

          <Button
            data-testid="button-cancel-profile-pin"
            variant="ghost"
            className="mt-3 w-full"
            onClick={onCancel}
            disabled={isWorking}
          >
            <ArrowLeft className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} aria-hidden />
            {dir === 'rtl' ? 'العودة للملفات' : 'Back to profiles'}
          </Button>
        </section>
      </main>
    </div>
  );
}
