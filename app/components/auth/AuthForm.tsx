"use client";

import type { FormEvent, ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";
import { FormMessage } from "@/app/components/auth/AuthLayout";
import { CaptchaButton, Turnstile, type TurnstileController } from "@/app/components/auth/Turnstile";
import type { AuthFailure } from "@/lib/auth/passwordAuth";

/**
 * The frame every auth form shares: the fields (children), then the failure message, an optional
 * extra notice, the Turnstile check and the submit button. `className` is the form's own layout
 * (gap, width, or a card around it); the column and `text-left` are built in.
 *
 * While `submitting` the whole form is disabled through its <fieldset>, so no field needs a
 * `disabled` prop of its own. The submit button spins during that time.
 *
 * Captcha: pass the page's `useTurnstile()` controller. By default the check guards the submit
 * button (it waits on / asks for the token). `captchaGuardsSubmit={false}` is for a form whose
 * submit needs no token but which has another action that does (the code page's "send a new
 * code"): the widget then stays hidden until that action asks for it.
 *
 * `onCancel` turns the button row into the compact settings layout: small submit + "Cancel".
 * Without it the submit button is full width.
 */
export function AuthForm({
  onSubmit,
  className,
  submitting,
  failure,
  notice,
  captcha,
  captchaGuardsSubmit = true,
  submitLabel,
  submitDisabled,
  submitVariant,
  onCancel,
  children,
}: {
  onSubmit: (event: FormEvent) => void;
  className?: string;
  submitting: boolean;
  failure: AuthFailure | null;
  notice?: ReactNode;
  captcha?: TurnstileController;
  captchaGuardsSubmit?: boolean;
  submitLabel: ReactNode;
  submitDisabled?: boolean;
  submitVariant?: "primary" | "secondary";
  onCancel?: () => void;
  children: ReactNode;
}) {
  const buttonProps = {
    type: "submit" as const,
    variant: submitVariant,
    size: onCancel ? ("sm" as const) : ("md" as const),
    className: onCancel ? undefined : "w-full",
    loading: submitting,
    disabled: submitDisabled,
    children: submitLabel,
  };
  const submitButton =
    captcha && captchaGuardsSubmit ? <CaptchaButton captcha={captcha} {...buttonProps} /> : <Button {...buttonProps} />;

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={submitting} className={`flex min-w-0 flex-col text-left ${className ?? ""}`}>
        {children}
        {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
        {notice}
        {captcha && <Turnstile captcha={captcha} lazy={!captchaGuardsSubmit} />}
        {onCancel ? (
          <div className="flex gap-2.5">
            {submitButton}
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          submitButton
        )}
      </fieldset>
    </form>
  );
}
