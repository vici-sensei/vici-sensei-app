"use client";

import { useState, type ReactNode } from "react";
import { fieldHint, fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { FieldError, PasswordMessage } from "@/app/components/auth/AuthLayout";
import { PasswordField } from "@/app/components/auth/PasswordField";
import { emailFieldError, passwordFieldError } from "@/lib/auth/passwordAuth";

/** Labelled email input. By default it also shows the "enter a valid email" line under it: as soon
 * as the person types something that isn't an address yet, or once they leave the field still
 * invalid -- so it owns the `touched` flag. `validate={false}` is for the places where the line
 * would only be noise (the code page, where the address is just being re-confirmed); a `hint` can
 * stand in for it. */
export function EmailField({
  id,
  value,
  onChange,
  label = "Email",
  validate = true,
  hint,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  validate?: boolean;
  hint?: ReactNode;
}) {
  const [touched, setTouched] = useState(false);
  const error = validate ? emailFieldError(value, touched) : null;

  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={error ? true : undefined}
        aria-describedby={validate ? `${id}-error` : undefined}
        className={textInput}
      />
      {validate && <FieldError id={`${id}-error`}>{error}</FieldError>}
      {hint && <p className={fieldHint}>{hint}</p>}
    </div>
  );
}

/** Labelled password input with the show/hide toggle. `validate` (the default) adds the line under
 * it that shows the password rule while the field is empty and the first problem once the person
 * has typed something that doesn't meet it -- for a NEW password, and for the login field, which
 * has always applied the same rule. `validate={false}` is for "current password" boxes, where the
 * server's answer is the only judge. `labelAside` sits at the right end of the label row ("Forgot
 * password?"). */
export function PasswordFormField({
  id,
  label = "Password",
  labelAside,
  autoComplete,
  value,
  onChange,
  validate = true,
  autoFocus,
}: {
  id: string;
  label?: string;
  labelAside?: ReactNode;
  autoComplete: "new-password" | "current-password";
  value: string;
  onChange: (value: string) => void;
  validate?: boolean;
  autoFocus?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const error = validate ? passwordFieldError(value, touched) : null;
  const labelEl = (
    <label htmlFor={id} className={fieldLabel}>
      {label}
    </label>
  );

  return (
    <div>
      {labelAside ? (
        <div className="flex items-baseline justify-between">
          {labelEl}
          {labelAside}
        </div>
      ) : (
        labelEl
      )}
      <PasswordField
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={error ? true : undefined}
        aria-describedby={validate ? `${id}-hint` : undefined}
        autoFocus={autoFocus}
      />
      {validate && <PasswordMessage id={`${id}-hint`} error={error} empty={value.length === 0} />}
    </div>
  );
}
