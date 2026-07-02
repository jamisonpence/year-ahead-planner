// Extracted from RelationshipsPage — Bud Bets now lives in Messenger.
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import FriendsSocialHub from "@/components/FriendsSocialHub";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Users, Pencil, Trash2, MoreHorizontal, Heart,
  Baby, Cake, StickyNote, ChevronDown, ChevronUp,
  UserPlus, FolderPlus, X, Check, Search, UserCheck, Clock,
  UserX, Send, Loader2, Link, Bell, GitMerge,
  Sparkles, LayoutGrid, Bot, Plug, CheckCircle2,
  Trophy, Handshake, Scale, DollarSign, ShieldCheck, ShieldX, Flag, Medal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { BudBet } from "@shared/schema";
import type {
  RelationshipGroup, InsertRelationshipGroup,
  PersonWithSpouse, Person, InsertPerson,
  FriendRequestWithUser, PublicUser,
} from "@shared/schema";

export function BudBetsSection({ friends = [] }: { friends: PublicUser[] }) {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const { data: bets = [], isLoading } = useQuery<BudBet[]>({
    queryKey: ["/api/bud-bets"],
    queryFn: () => apiRequest("GET", "/api/bud-bets").then(r => r.json()),
  });

  const muCreate = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/bud-bets", d).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bud-bets"] }); toast({ title: "Bet created!" }); setCreateOpen(false); },
    onError: () => toast({ title: "Failed to create bet", variant: "destructive" }),
  });
  const muPatch = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/bud-bets/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bud-bets"] }); toast({ title: "Bet updated!" }); setDetailBet(null); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });
  const muDelete = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/bud-bets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bud-bets"] }); toast({ title: "Bet deleted" }); },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailBet, setDetailBet] = useState<BudBet | null>(null);
  const [filterTab, setFilterTab] = useState<"active" | "settled" | "all">("active");

  // Create form state
  const [form, setForm] = useState({ opponentId: null as number | null, arbitratorId: null as number | null, title: "", wager: "", dueDate: "" });
  function resetForm() { setForm({ opponentId: null, arbitratorId: null, title: "", wager: "", dueDate: "" }); }
  const [oppSearch, setOppSearch] = useState("");
  const [arbSearch, setArbSearch] = useState("");
  const [oppOpen, setOppOpen] = useState(false);
  const [arbOpen, setArbOpen] = useState(false);
  function friendName(id: number | null) { return friends.find(f => f.id === id)?.name ?? ""; }
  function filteredFriends(q: string) { const lq = q.toLowerCase(); return friends.filter(f => f.name.toLowerCase().includes(lq) || f.email.toLowerCase().includes(lq)); }

  // ── Integrity score ────────────────────────────────────────────────────────
  function integrityScore(userId: number) {
    let score = 0;
    bets.forEach(b => {
      if (b.status !== "settled") return;
      const isLoser = (b.winnerId && b.creatorId === userId && b.winnerId !== userId) ||
                      (b.winnerId && b.opponentId === userId && b.winnerId !== userId);
      if (!isLoser) return;
      if (b.payoutStatus === "paid") score += 10;
      if (b.payoutStatus === "stiffed") score -= 15;
    });
    return score;
  }

  // ── Record ─────────────────────────────────────────────────────────────────
  function myRecord() {
    let wins = 0, losses = 0, pending = 0;
    bets.forEach(b => {
      if (!me) return;
      if (b.status !== "settled") { if (b.status === "active") pending++; return; }
      if (b.winnerId === me.id) wins++;
      else if (b.creatorId === me.id || b.opponentId === me.id) losses++;
    });
    return { wins, losses, pending };
  }

  const record = myRecord();
  const myIntegrity = me ? integrityScore(me.id) : 0;

  const filtered = bets.filter(b =>
    filterTab === "all" ? true : filterTab === "active" ? b.status === "active" : b.status === "settled"
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  function opponentLabel(b: BudBet) { return b.opponentName || `User #${b.opponentId}`; }
  function arbitratorLabel(b: BudBet) { return b.arbitratorName || (b.arbitratorId ? `User #${b.arbitratorId}` : null); }
  function isMyBet(b: BudBet) { return me && (b.creatorId === me.id || b.opponentId === me.id); }
  function canSettle(b: BudBet) {
    if (!me || b.status !== "active") return false;
    // arbitrator settles if present; otherwise either party
    if (b.arbitratorId) return b.arbitratorId === me.id;
    return b.creatorId === me.id || b.opponentId === me.id;
  }
  function canMarkPaid(b: BudBet) {
    if (!me || b.status !== "settled" || b.payoutStatus === "paid") return false;
    // arbitrator or winner can mark paid
    if (b.arbitratorId) return b.arbitratorId === me.id || b.winnerId === me.id;
    return b.winnerId === me.id;
  }
  function winnerLabel(b: BudBet) {
    if (!b.winnerId) return "—";
    if (b.winnerId === b.creatorId) return "You (creator)";
    if (b.winnerId === b.opponentId) return opponentLabel(b);
    return `User #${b.winnerId}`;
  }
  function integrityColor(score: number) {
    if (score >= 20) return "text-green-600 dark:text-green-400";
    if (score >= 0) return "text-foreground";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <div className="space-y-4">
      {/* ── Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Trophy size={18} className="text-amber-500" /> Bud Bets</h2>
          <p className="text-xs text-muted-foreground">Light-hearted bets with friends. Honor the wager.</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }} className="gap-1.5">
          <Plus size={14} /> New Bet
        </Button>
      </div>

      {/* ── Record + Integrity card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Wins", value: record.wins, color: "text-green-600 dark:text-green-400", icon: <Medal size={16} className="text-green-500" /> },
          { label: "Losses", value: record.losses, color: "text-red-600 dark:text-red-400", icon: <Flag size={16} className="text-red-500" /> },
          { label: "Active", value: record.pending, color: "text-blue-600 dark:text-blue-400", icon: <Scale size={16} className="text-blue-500" /> },
          { label: "Integrity", value: myIntegrity >= 0 ? `+${myIntegrity}` : `${myIntegrity}`, color: integrityColor(myIntegrity), icon: myIntegrity >= 0 ? <ShieldCheck size={16} className="text-green-500" /> : <ShieldX size={16} className="text-red-500" /> },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-3 text-center space-y-1">
            <div className="flex justify-center">{s.icon}</div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Integrity explainer */}
      <div className="rounded-lg border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground flex gap-2 items-start">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-green-500" />
        <span>Pay up → <strong>+10 integrity points</strong>. Get stiffed on payment → <strong>−15 points</strong> for the loser. Your reputation among friends depends on it.</span>
      </div>

      {/* ── Filter tabs */}
      <div className="flex gap-1 p-1 bg-secondary rounded-xl w-fit">
        {(["active", "settled", "all"] as const).map(t => (
          <button key={t} onClick={() => setFilterTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filterTab === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Bets list */}
      {isLoading && <div className="text-center py-10 text-muted-foreground text-sm">Loading bets…</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <Handshake size={36} className="mx-auto opacity-20" />
          <p className="text-sm font-medium">No {filterTab === "all" ? "" : filterTab} bets yet</p>
          <p className="text-xs">Make a friendly wager and hold each other accountable.</p>
          <Button size="sm" variant="outline" onClick={() => { resetForm(); setCreateOpen(true); }} className="gap-1.5 mt-2">
            <Plus size={13} /> Create a Bet
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map(b => (
          <button key={b.id} type="button" onClick={() => setDetailBet(b)}
            className="w-full text-left bg-card border rounded-xl p-4 hover:border-primary/40 transition-colors space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{b.title}</p>
                <p className="text-xs text-muted-foreground">vs {opponentLabel(b)}{arbitratorLabel(b) ? ` · Arbiter: ${arbitratorLabel(b)}` : ""}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {b.status === "active" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">Active</span>}
                {b.status === "settled" && b.payoutStatus === "paid" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">✓ Settled</span>}
                {b.status === "settled" && b.payoutStatus === "pending" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">Awaiting Payment</span>}
                {b.status === "settled" && b.payoutStatus === "stiffed" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">Stiffed</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><DollarSign size={11} /> Wager: <span className="text-foreground font-medium">{b.wager}</span></p>
            {b.status === "settled" && <p className="text-xs text-muted-foreground">Winner: <span className="font-medium text-foreground">{winnerLabel(b)}</span></p>}
            {b.dueDate && b.status === "active" && <p className="text-xs text-muted-foreground">Due: {b.dueDate}</p>}
          </button>
        ))}
      </div>

      {/* ── Create Bet Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle className="flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> New Bud Bet</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">What's the bet? *</label>
              <Input placeholder="e.g. Who wins the Super Bowl" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Wager — what does the loser owe? *</label>
              <Input placeholder="e.g. Dinner and drinks at their choice" value={form.wager} onChange={e => setForm(p => ({ ...p, wager: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Opponent *</label>
              <div className="relative">
                <Input placeholder="Search connected friends…" value={oppOpen ? oppSearch : (friendName(form.opponentId) || "")}
                  onFocus={() => { setOppOpen(true); setOppSearch(""); }}
                  onBlur={() => setTimeout(() => setOppOpen(false), 150)}
                  onChange={e => { setOppSearch(e.target.value); setOppOpen(true); }} />
                {oppOpen && filteredFriends(oppSearch).length > 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredFriends(oppSearch).filter(f => f.id !== form.arbitratorId).map(f => (
                      <button key={f.id} type="button" onMouseDown={() => { setForm(p => ({ ...p, opponentId: f.id })); setOppOpen(false); setOppSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex items-center gap-2">
                        {f.avatarUrl ? <img src={f.avatarUrl} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">{f.name[0]}</div>}
                        <span>{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.opponentId && <div className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"><CheckCircle2 size={12} /> {friendName(form.opponentId)} selected</div>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Impartial arbitrator <span className="text-muted-foreground/60">optional</span></label>
              <div className="relative">
                <Input placeholder="Search connected friends…" value={arbOpen ? arbSearch : (friendName(form.arbitratorId) || "")}
                  onFocus={() => { setArbOpen(true); setArbSearch(""); }}
                  onBlur={() => setTimeout(() => setArbOpen(false), 150)}
                  onChange={e => { setArbSearch(e.target.value); setArbOpen(true); }} />
                {arbOpen && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <button type="button" onMouseDown={() => { setForm(p => ({ ...p, arbitratorId: null })); setArbOpen(false); setArbSearch(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary text-sm text-muted-foreground italic">None</button>
                    {filteredFriends(arbSearch).filter(f => f.id !== form.opponentId).map(f => (
                      <button key={f.id} type="button" onMouseDown={() => { setForm(p => ({ ...p, arbitratorId: f.id })); setArbOpen(false); setArbSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex items-center gap-2">
                        {f.avatarUrl ? <img src={f.avatarUrl} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">{f.name[0]}</div>}
                        <span>{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.arbitratorId && <div className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400"><CheckCircle2 size={12} /> {friendName(form.arbitratorId)} will arbitrate</div>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due date <span className="text-muted-foreground/60">optional</span></label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="rounded-lg bg-secondary/30 border px-3 py-2 text-xs text-muted-foreground">
              💡 If no arbitrator is set, either party can settle the outcome. The winner marks when the loser pays up.
            </div>
          </div>
            <div className="flex gap-2 px-5 py-4 border-t shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!form.title.trim() || !form.wager.trim() || !form.opponentId || muCreate.isPending}
                onClick={() => muCreate.mutate({ title: form.title.trim(), wager: form.wager.trim(), opponentId: form.opponentId, opponentName: friendName(form.opponentId), arbitratorId: form.arbitratorId, arbitratorName: friendName(form.arbitratorId) || null, dueDate: form.dueDate || null, status: "active", payoutStatus: "pending" })}>
                Create Bet
              </Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* ── Bet Detail / Actions Modal */}
      {detailBet && (
        <Dialog open={!!detailBet} onOpenChange={() => setDetailBet(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Scale size={16} /> Bet Details</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <p className="font-semibold">{detailBet.title}</p>
                <p className="text-xs text-muted-foreground">vs <span className="text-foreground font-medium">{opponentLabel(detailBet)}</span></p>
                {arbitratorLabel(detailBet) && <p className="text-xs text-muted-foreground">Arbitrator: <span className="text-foreground font-medium">{arbitratorLabel(detailBet)}</span></p>}
                <p className="text-xs text-muted-foreground">Wager: <span className="text-foreground font-medium">{detailBet.wager}</span></p>
                {detailBet.dueDate && <p className="text-xs text-muted-foreground">Due: {detailBet.dueDate}</p>}
                {detailBet.status === "settled" && <p className="text-xs text-muted-foreground">Winner: <span className="text-foreground font-bold">{winnerLabel(detailBet)}</span></p>}
                <p className="text-xs text-muted-foreground">Created: {new Date(detailBet.createdAt).toLocaleDateString()}</p>
              </div>

              {/* Settle bet — pick winner */}
              {canSettle(detailBet) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Settle — Who Won?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                      onClick={() => muPatch.mutate({ id: detailBet.id, data: { status: "settled", winnerId: detailBet.creatorId, settledAt: new Date().toISOString() } })}>
                      <Trophy size={13} className="text-amber-500" /> Creator won
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                      onClick={() => muPatch.mutate({ id: detailBet.id, data: { status: "settled", winnerId: detailBet.opponentId ?? -1, settledAt: new Date().toISOString() } })}>
                      <Trophy size={13} className="text-amber-500" /> {opponentLabel(detailBet)} won
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" className="w-full text-muted-foreground text-xs"
                    onClick={() => muPatch.mutate({ id: detailBet.id, data: { status: "cancelled" } })}>
                    Cancel this bet
                  </Button>
                </div>
              )}

              {/* Mark payment */}
              {canMarkPaid(detailBet) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => muPatch.mutate({ id: detailBet.id, data: { payoutStatus: "paid", payoutMarkedById: me?.id } })}>
                      <CheckCircle2 size={13} /> Mark Paid Up
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => muPatch.mutate({ id: detailBet.id, data: { payoutStatus: "stiffed", payoutMarkedById: me?.id } })}>
                      <ShieldX size={13} /> Mark Stiffed
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">Stiffing costs the loser 15 integrity points.</p>
                </div>
              )}

              {/* Status display */}
              {detailBet.status === "settled" && detailBet.payoutStatus === "paid" && (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle2 size={13} /> Payment confirmed — integrity maintained!
                </div>
              )}
              {detailBet.status === "settled" && detailBet.payoutStatus === "stiffed" && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <ShieldX size={13} /> Marked as stiffed — −15 integrity points for the loser.
                </div>
              )}

              {/* Delete */}
              {me && detailBet.creatorId === me.id && detailBet.status === "active" && (
                <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive text-xs"
                  onClick={() => { muDelete.mutate(detailBet.id); setDetailBet(null); }}>
                  <Trash2 size={12} className="mr-1.5" /> Delete Bet
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────
