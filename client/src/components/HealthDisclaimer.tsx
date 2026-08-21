/**
 * Shown wherever MyLifos gives health guidance rather than merely recording it.
 *
 * The distinction matters. Logging a weight or a workout needs no disclaimer — the app is a
 * notebook. But calculating someone's TDEE from the Mifflin-St Jeor equation and handing
 * them a daily calorie target is a recommendation, and it should say what it is.
 *
 * Two reasons this exists. Apple asks for it of health apps under Guideline 1.4.1, and
 * independently it is the honest thing to put next to a number that tells a person how much
 * to eat. The eating-disorder line is deliberate: a calorie target is exactly the kind of
 * feature that can harm someone with that history, and a quiet, non-preachy pointer to
 * professional support costs a sentence.
 *
 * Kept visually quiet on purpose — present and readable, but not a banner that people learn
 * to scroll past.
 */
import { Info } from "lucide-react";

export default function HealthDisclaimer({
  variant = "default",
  className = "",
}: {
  /** "nutrition" adds the disordered-eating line, which only makes sense next to intake targets. */
  variant?: "default" | "nutrition";
  className?: string;
}) {
  return (
    <p
      className={`flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground/80 ${className}`}
      role="note"
    >
      <Info size={12} className="shrink-0 mt-0.5" aria-hidden />
      <span>
        These figures are estimates generated from the details you entered, not medical advice.
        Check with a doctor or registered dietitian before making significant changes, especially
        if you have a health condition, are pregnant, or take medication that affects diet or
        activity.
        {variant === "nutrition" && (
          <>
            {" "}
            If tracking intake is affecting your relationship with food, the{" "}
            <a
              href="https://www.allianceforeatingdisorders.com/find-treatment/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              National Alliance for Eating Disorders
            </a>{" "}
            helpline can help.
          </>
        )}
      </span>
    </p>
  );
}
