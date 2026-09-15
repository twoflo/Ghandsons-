import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import clsx from "clsx";

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 border-brand-600",
  secondary: "bg-white text-ink-800 hover:bg-ink-100 active:bg-ink-200 border-ink-300",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-200 active:bg-ink-300 border-transparent",
  danger: "bg-bad-600 text-white hover:bg-bad-700 active:bg-bad-700 border-bad-600",
  success: "bg-good-600 text-white hover:bg-good-700 active:bg-good-700 border-good-600",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[2.25rem] px-3 text-sm",
  md: "min-h-[var(--tap)] px-4 text-base",
  lg: "min-h-[3.25rem] px-5 text-lg",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg border-2 font-semibold",
    "transition-colors select-none",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  prefetch,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* ----------------------------------- Card ---------------------------------- */

export function Card({
  children,
  className,
  id,
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Component id={id} className={clsx("card", className)}>
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink-900 truncate">{title}</h2>
        {subtitle ? <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------- Fields --------------------------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required ? <span className="text-bad-600 ml-0.5" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("field-input", className)} {...rest} />;
}

export function MoneyInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 font-semibold">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={clsx("field-input tabular pl-7 text-right", className)}
        {...rest}
      />
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx("field-input pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("field-input min-h-24 py-2.5", className)} rows={3} {...rest} />;
}

/* ---------------------------------- Badge ---------------------------------- */

export type BadgeTone = "neutral" | "info" | "good" | "warn" | "bad" | "brand";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-200 text-ink-800 border-ink-300",
  info: "bg-info-50 text-info-700 border-info-500/40",
  good: "bg-good-50 text-good-700 border-good-500/40",
  warn: "bg-warn-50 text-warn-700 border-warn-500/50",
  bad: "bg-bad-50 text-bad-700 border-bad-500/40",
  brand: "bg-brand-50 text-brand-700 border-brand-500/40",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------- Empty state ------------------------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-4xl" aria-hidden="true">{icon}</div> : null}
      <h3 className="text-lg font-bold text-ink-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-ink-600">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- Messages -------------------------------- */

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "good" | "warn" | "bad";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "bg-info-50 border-info-500 text-info-700",
    good: "bg-good-50 border-good-600 text-good-700",
    warn: "bg-warn-50 border-warn-600 text-warn-700",
    bad: "bg-bad-50 border-bad-600 text-bad-700",
  } as const;
  return (
    <div className={clsx("rounded-lg border-l-4 px-4 py-3", tones[tone])} role={tone === "bad" ? "alert" : "status"}>
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={clsx("text-sm", title && "mt-0.5")}>{children}</div>
    </div>
  );
}

/* ----------------------------------- Misc ---------------------------------- */

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-4">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-[var(--tap)] items-center gap-1 -ml-1 pr-2 text-sm font-semibold text-ink-600 hover:text-ink-900"
        >
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
          {subtitle ? <div className="mt-1 text-ink-600">{subtitle}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: BadgeTone;
  href?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-ink-200",
    info: "border-info-500",
    good: "border-good-600",
    warn: "border-warn-600",
    bad: "border-bad-600",
    brand: "border-brand-500",
  };
  const inner = (
    <>
      <p className="text-sm font-semibold text-ink-600">{label}</p>
      <p className="mt-1 text-2xl font-black tabular text-ink-900">{value}</p>
      {sub ? <p className="mt-0.5 text-sm text-ink-500">{sub}</p> : null}
    </>
  );
  const cls = clsx(
    "card block border-l-4 px-4 py-3 transition-colors",
    tones[tone],
    href && "hover:bg-ink-50 active:bg-ink-100",
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function DataList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-ink-200">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-sm font-semibold text-ink-600">{row.label}</dt>
          <dd className="text-right text-ink-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({
  value,
  max,
  tone = "info",
  label,
}: {
  value: number;
  max: number;
  tone?: "info" | "good" | "warn" | "bad";
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bars = { info: "bg-info-600", good: "bg-good-600", warn: "bg-warn-600", bad: "bg-bad-600" };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-ink-200"
    >
      <div className={clsx("h-full rounded-full transition-[width]", bars[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
