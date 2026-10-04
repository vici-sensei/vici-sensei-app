"use client";

import { useState, type InputHTMLAttributes } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { textInput } from "@/app/components/ui/formClasses";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** `new-password` for sign up / reset (lets password managers offer a strong one),
   * `current-password` for login. */
  autoComplete: "new-password" | "current-password";
}

/** Password input with a show/hide toggle -- which is also why sign up needs no "repeat password"
 * box: the person can check what they typed. */
export function PasswordField({ className, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className={`${textInput} pr-11 ${className ?? ""}`}
        // Password managers and spellcheck have no business with this field.
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted transition-colors hover:text-white"
      >
        {visible ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
      </button>
    </div>
  );
}
