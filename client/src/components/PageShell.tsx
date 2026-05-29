import { cn } from "@/lib/utils";

/**
 * PageShell — consistent top-level page wrapper.
 *
 * Desktop layout:
 *   ┌───────────────────────────────────────────────────┐
 *   │  px-4 sm:px-6  pt-5 pb-4                          │
 *   │  [title]                      [action]            │
 *   │  [subtitle]                                       │
 *   ├───────────────────────────────────────────────────┤
 *   │  px-4 sm:px-6  py-3  (controls row, optional)    │
 *   │  [tabs / search / filter row]                     │
 *   ├───────────────────────────────────────────────────┤
 *   │  px-4 sm:px-6  pt-5 pb-8  (content)               │
 *   │  {children}                                       │
 *   └───────────────────────────────────────────────────┘
 *
 * Mobile:
 *   Same structure; header and action stack naturally via flex-wrap
 *   on narrow viewports.
 */

type PageShellSize = "sm" | "default" | "wide";

const MAX_WIDTHS: Record<PageShellSize, string> = {
  sm:      "max-w-4xl",
  default: "max-w-5xl",
  wide:    "max-w-6xl",
};

interface PageShellProps {
  /** Required: page title shown upper-left */
  title: React.ReactNode;
  /** Optional: one-line subtitle shown directly below title */
  subtitle?: string;
  /** Optional: primary action button(s) shown upper-right */
  action?: React.ReactNode;
  /** Optional: secondary controls row (tabs, search, filters) shown below header, above content */
  controls?: React.ReactNode;
  /** Page content */
  children: React.ReactNode;
  /** Extra classes on the content area */
  className?: string;
  /** Container max-width. "default" = max-w-5xl, "sm" = max-w-4xl, "wide" = max-w-6xl */
  size?: PageShellSize;
  /** If true, adds border-b after controls row */
  controlsBorder?: boolean;
}

export default function PageShell({
  title,
  subtitle,
  action,
  controls,
  children,
  className,
  size = "default",
  controlsBorder = true,
}: PageShellProps) {
  return (
    <div className={cn("w-full mx-auto", MAX_WIDTHS[size])}>
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {typeof title === "string" ? (
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            ) : (
              title
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap">
              {action}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary controls row ─────────────────────────────────── */}
      {controls && (
        <div className={cn("px-4 sm:px-6 pb-3", controlsBorder && "border-b")}>
          {controls}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className={cn("px-4 sm:px-6 pt-5 pb-8", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * PageHeader — just the consistent header portion (title + subtitle + action).
 * Use this for full-height panel pages (Goals, Calendar, Habits) that manage
 * their own scroll container below the header.
 */
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  /** Whether to show a bottom border. Default true. */
  border?: boolean;
}

export function PageHeader({ title, subtitle, action, className, border = true }: PageHeaderProps) {
  return (
    <div className={cn(
      "px-4 sm:px-6 py-4 shrink-0 flex items-center justify-between gap-4 flex-wrap",
      border && "border-b",
      className,
    )}>
      <div className="min-w-0">
        {typeof title === "string" ? (
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        ) : (
          title
        )}
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          {action}
        </div>
      )}
    </div>
  );
}
