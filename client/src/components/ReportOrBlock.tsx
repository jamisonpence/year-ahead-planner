/**
 * Report and block controls for user-generated content.
 *
 * App Store Guideline 1.2 requires an app carrying user-generated content to let people
 * report objectionable content and block abusive users. MyLifos has a feed, direct messages
 * and political debates, so it needs both — and the controls have to be reachable from the
 * content itself, not buried in Settings, or a reviewer will not find them.
 *
 * One component for all three surfaces so the wording, the reason list and the confirmation
 * behaviour cannot drift apart between them.
 */
import { useState } from "react";
import { Flag, Ban } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ReportTargetType = "feed_post" | "feed_comment" | "message" | "debate_post" | "user";

const REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate",       label: "Hate speech" },
  { value: "sexual",     label: "Sexual content" },
  { value: "violence",   label: "Violence or threats" },
  { value: "spam",       label: "Spam" },
  { value: "other",      label: "Something else" },
];

export default function ReportOrBlock({
  targetType,
  targetId,
  targetUserId,
  targetUserName,
  onBlocked,
  className = "",
}: {
  targetType: ReportTargetType;
  targetId: number;
  /** Author of the content. Omit only when reporting a user directly. */
  targetUserId?: number;
  targetUserName?: string;
  /** Called after a successful block so the caller can refetch. */
  onBlocked?: () => void;
  className?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitReport() {
    if (!reason) return;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/reports", { targetType, targetId, targetUserId, reason, details });
      setOpen(false);
      setReason(null);
      setDetails("");
      // Say what happens next. "Reported" alone leaves people wondering whether anything
      // will come of it, which is the complaint behind most reporting flows.
      toast({
        title: "Report submitted",
        description: "Thanks — we review reports and will act on this one if it breaks the rules.",
      });
    } catch {
      toast({ title: "Couldn't submit the report", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function block() {
    if (!targetUserId) return;
    const who = targetUserName ?? "this person";
    if (!window.confirm(
      `Block ${who}?\n\nYou won't see each other's posts or messages, and you'll be removed as friends. You can undo this in Settings.`
    )) return;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/blocks", { userId: targetUserId });
      setOpen(false);
      toast({ title: `Blocked ${who}` });
      onBlocked?.();
    } catch {
      toast({ title: "Couldn't block this user", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report or block"
        title="Report or block"
        className={`p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors ${className}`}
      >
        <Flag size={13} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Report this content</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {REASONS.map(r => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  reason === r.value ? "border-primary bg-primary/5 font-medium" : "hover:bg-secondary"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
          />

          <div className="flex gap-2">
            <Button onClick={submitReport} disabled={!reason || busy} className="flex-1" size="sm">
              {busy ? "Sending…" : "Submit report"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>

          {targetUserId != null && (
            <>
              <div className="h-px bg-border" />
              {/* Separated from reporting on purpose: blocking is immediate and affects the
                  relationship, reporting is a request for someone else to look. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={block}
                disabled={busy}
                className="w-full gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Ban size={14} />
                Block {targetUserName ?? "this user"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
