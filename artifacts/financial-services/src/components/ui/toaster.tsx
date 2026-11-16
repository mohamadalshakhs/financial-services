import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { usePrefs } from '@/lib/prefs';

export function Toaster() {
  const { toasts } = useToast();
  const { dict, dir } = usePrefs();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} dir={dir} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose aria-label={dict.close} />
          </Toast>
        );
      })}
      <ToastViewport dir={dir} />
    </ToastProvider>
  );
}
