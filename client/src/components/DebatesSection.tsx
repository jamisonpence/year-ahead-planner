// Extracted from PoliticsPage — Debates now live in Messenger.
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isAfter, startOfDay, addDays } from "date-fns";
import {
  Landmark, Users, BookOpen, Zap, Newspaper, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Phone, Mail, Globe, Star, Vote, Calendar,
  CheckCircle2, Circle, ExternalLink, Tag, Search, Loader2, PlusCircle,
  DollarSign, MapPin, Clock, Users2, TrendingDown, Compass, Sparkles,
  ChevronRight, RefreshCw, ArrowRight, MessageSquare, ThumbsUp, Share2,
  Copy, UserPlus, Lock, Link, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  PoliticalOfficial, PoliticalIssue, PoliticalElection, CivicAction, PoliticalNewsSource,
  TabCollaborationWithUser,
} from "@shared/schema";

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={3} className={`w-full border rounded-lg px-3 py-2 text-base md:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none ${props.className ?? ""}`} />;
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}


// ── Debates Tab ───────────────────────────────────────────────────────────────

// ── Dynamic side colors — assigned by index so any label gets a distinct color ──
const SIDE_PALETTE = [
  { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", bar: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", emoji: "✅" },
  { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",               bar: "bg-red-400",     border: "border-red-200 dark:border-red-900",         dot: "bg-red-400",     text: "text-red-500 dark:text-red-400",         emoji: "❌" },
  { color: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",           bar: "bg-stone-400",   border: "border-stone-200 dark:border-stone-700",     dot: "bg-stone-400",   text: "text-stone-500 dark:text-stone-400",     emoji: "⚖️" },
  { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",            bar: "bg-blue-500",    border: "border-blue-200 dark:border-blue-800",       dot: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400",       emoji: "💬" },
  { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",        bar: "bg-amber-400",   border: "border-amber-200 dark:border-amber-800",     dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",     emoji: "🔶" },
  { color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",    bar: "bg-violet-500",  border: "border-violet-200 dark:border-violet-800",   dot: "bg-violet-500",  text: "text-violet-600 dark:text-violet-400",   emoji: "💜" },
];

const DEFAULT_SIDES = ["For", "Against", "Neutral"];

/** Parse the sides JSON stored on a debate, falling back to defaults */
function parseSides(sidesJson?: string | null): string[] {
  if (!sidesJson) return DEFAULT_SIDES;
  try { const arr = JSON.parse(sidesJson); return Array.isArray(arr) && arr.length >= 2 ? arr : DEFAULT_SIDES; }
  catch { return DEFAULT_SIDES; }
}

/** Get color palette entry for a given side label within a sides array */
function sideStyle(sides: string[], label: string) {
  const idx = sides.findIndex(s => s.toLowerCase() === label?.toLowerCase());
  return SIDE_PALETTE[idx >= 0 ? idx % SIDE_PALETTE.length : 2];
}

/** Renders a single citation card */
function CitationCard({ url, title }: { url: string; title?: string | null }) {
  let domain = url;
  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors group"
    >
      <FileText size={11} className="text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="text-[11px] font-medium text-blue-800 dark:text-blue-200 truncate">{title}</p>}
        <p className="text-[10px] text-blue-500 dark:text-blue-400 truncate">{domain}</p>
      </div>
      <ExternalLink size={10} className="text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function DebateThread({ debateId, currentUserId }: { debateId: number; currentUserId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent]         = useState("");
  const [side, setSide]               = useState("");   // set to first side once debate loads
  const [citationUrl, setCitationUrl] = useState("");
  const [citationTitle, setCitationTitle] = useState("");
  const [showCitation, setShowCitation]   = useState(false);
  const [posting, setPosting]         = useState(false);
  const [upvoting, setUpvoting]       = useState<number | null>(null);
  const [layout, setLayout]           = useState<"split" | "unified">("split");

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["debate-thread", debateId],
    queryFn: () => apiRequest("GET", `/api/politics/debates/${debateId}`).then(r => r.json()),
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const posts: any[]        = data?.posts ?? [];
  const myUpvotes: number[] = data?.myUpvotes ?? [];
  const debate              = data?.debate;

  // Dynamic sides from the debate definition
  const sides = parseSides(debate?.sides);

  // Initialize side selection to first side once debate loads
  React.useEffect(() => {
    if (sides.length > 0 && !side) setSide(sides[0]);
  }, [debate?.sides]);

  // Group posts by side label (case-insensitive match)
  const postsBySide = (label: string) => posts.filter(p => p.side?.toLowerCase() === label.toLowerCase());
  const total = posts.length || 1;

  async function submitPost() {
    if (!content.trim()) return;
    setPosting(true);
    try {
      const r = await apiRequest("POST", `/api/politics/debates/${debateId}/posts`, {
        content: content.trim(),
        side,
        citationUrl: citationUrl.trim() || undefined,
        citationTitle: citationTitle.trim() || undefined,
      });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error ?? "Failed"); }
      setContent(""); setCitationUrl(""); setCitationTitle(""); setShowCitation(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["debates-list"] });
    } catch (e: any) {
      toast({ title: "Failed to post", description: e.message, variant: "destructive" });
    } finally { setPosting(false); }
  }

  async function handleUpvote(postId: number) {
    setUpvoting(postId);
    try {
      await apiRequest("POST", `/api/politics/debates/${debateId}/posts/${postId}/upvote`, {});
      refetch();
    } finally { setUpvoting(null); }
  }

  async function deletePost(postId: number) {
    await apiRequest("DELETE", `/api/politics/debates/${debateId}/posts/${postId}`, {});
    refetch();
    qc.invalidateQueries({ queryKey: ["debates-list"] });
  }

  function PostCard({ p }: { p: any }) {
    const style  = sideStyle(sides, p.side);
    const isUpvoted = myUpvotes.includes(p.id);
    const isOwn = p.userId === currentUserId;
    return (
      <div className={`rounded-xl border bg-card p-3 space-y-2 ${style.border}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${style.color}`}>
            {(p.displayName ?? "A").charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold">{p.displayName ?? "Anonymous"}</span>
          {p.side && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.color}`}>{p.side}</span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {p.createdAt ? format(new Date(p.createdAt), "MMM d, h:mm a") : ""}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{p.content}</p>
        {p.citationUrl && <CitationCard url={p.citationUrl} title={p.citationTitle} />}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={() => handleUpvote(p.id)}
            disabled={upvoting === p.id}
            className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border transition-all ${
              isUpvoted ? "bg-violet-500/20 border-violet-400/40 text-violet-500" : "border-secondary text-muted-foreground hover:border-violet-400/40 hover:text-violet-500"
            }`}
          >
            {upvoting === p.id ? <Loader2 size={10} className="animate-spin" /> : <ThumbsUp size={10} />}
            {p.upvoteCount ?? 0}
          </button>
          {isOwn && (
            <button onClick={() => deletePost(p.id)} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
              <Trash2 size={9} />Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />Loading discussion…</div>;

  const colCount = Math.min(sides.length, 4);

  return (
    <div className="space-y-4">

      {/* ── Slim stats bar ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
          {sides.map((s, i) => {
            const st = SIDE_PALETTE[i % SIDE_PALETTE.length];
            return (
              <span key={s} className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                <span className={st.text}>{s}</span>
                <span className="text-muted-foreground font-normal">· {postsBySide(s).length}</span>
              </span>
            );
          })}
          <span className="ml-auto text-[10px] text-muted-foreground">{posts.length} argument{posts.length !== 1 ? "s" : ""} · {data?.memberCount ?? 1} participant{(data?.memberCount ?? 1) !== 1 ? "s" : ""}</span>
        </div>
        {posts.length > 0 && (
          <div className="h-1 flex">
            {sides.map((s, i) => {
              const st = SIDE_PALETTE[i % SIDE_PALETTE.length];
              const pct = Math.round((postsBySide(s).length / total) * 100);
              return <div key={s} className={`${st.bar} transition-all`} style={{ width: `${pct}%` }} />;
            })}
          </div>
        )}
      </div>

      {/* ── Layout toggle ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">View:</span>
        <button onClick={() => setLayout("split")} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${layout === "split" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
          Side by Side
        </button>
        <button onClick={() => setLayout("unified")} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${layout === "unified" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
          Chronological
        </button>
      </div>

      {/* ── Side-by-Side layout — all sides in columns (up to 4) ── */}
      {layout === "split" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
          {sides.slice(0, 4).map((s, i) => {
            const st = SIDE_PALETTE[i % SIDE_PALETTE.length];
            const sidePosts = postsBySide(s);
            return (
              <div key={s} className="space-y-2 min-w-0">
                <div className={`flex items-center gap-2 pb-1 border-b ${st.border}`}>
                  <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                  <span className={`text-xs font-bold ${st.text}`}>{s} · {sidePosts.length}</span>
                </div>
                {sidePosts.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-4 italic">No arguments yet</p>
                  : sidePosts.map(p => <PostCard key={p.id} p={p} />)
                }
              </div>
            );
          })}
        </div>
      )}

      {/* ── Chronological layout ── */}
      {layout === "unified" && (
        <div className="space-y-2">
          {posts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No arguments yet — be the first to share your view.</p>}
          {posts.map((p: any) => <PostCard key={p.id} p={p} />)}
        </div>
      )}

      {/* ── New argument composer ── */}
      {debate?.status !== "closed" ? (
        <div className="border rounded-xl p-3 bg-secondary/20 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Add Your Argument</p>

          {/* Dynamic side selector */}
          <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${Math.min(sides.length, 3)}, 1fr)` }}>
            {sides.map((s, i) => {
              const st = SIDE_PALETTE[i % SIDE_PALETTE.length];
              const active = side === s;
              return (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`text-xs py-2 px-1 rounded-lg border font-semibold transition-all flex flex-col items-center gap-0.5 ${
                    active ? `${st.color} border-transparent` : "border-secondary text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <span>{st.emoji}</span>
                  <span className="truncate max-w-full">{s}</span>
                </button>
              );
            })}
          </div>

          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitPost(); }}
            placeholder={`Share your perspective as "${side}"… (⌘↵ to post)`}
            rows={3}
            className="text-sm resize-none"
          />

          {/* Citation toggle */}
          <div>
            <button onClick={() => setShowCitation(p => !p)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <Link size={11} />
              {showCitation ? "Remove citation" : "Cite an article or source"}
              {showCitation ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showCitation && (
              <div className="mt-2 space-y-1.5 p-2.5 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">📎 Article / Source</p>
                <input value={citationUrl} onChange={e => setCitationUrl(e.target.value)} placeholder="https://example.com/article" type="url"
                  className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-2.5 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input value={citationTitle} onChange={e => setCitationTitle(e.target.value)} placeholder="Article title (optional)"
                  className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-2.5 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-blue-400" />
                {citationUrl && (
                  <div className="pt-1">
                    <p className="text-[10px] text-muted-foreground mb-1">Preview:</p>
                    <CitationCard url={citationUrl} title={citationTitle || null} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={submitPost} disabled={posting || !content.trim() || !side} className="gap-1.5">
              {posting ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              Post Argument
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2 flex items-center justify-center gap-1.5">
          <Lock size={11} />This debate is closed to new arguments.
        </p>
      )}
    </div>
  );
}

function DebateFriendInvite({ debateId, currentUserId }: { debateId: number; currentUserId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState<number | null>(null);

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
    enabled: open,
  });

  const { data: members = [], refetch: refetchMembers } = useQuery<any[]>({
    queryKey: ["debate-members", debateId],
    queryFn: () => apiRequest("GET", `/api/politics/debates/${debateId}/members`).then(r => r.json()),
    enabled: open,
  });

  const memberIds = new Set(members.map((m: any) => m.id));

  async function invite(friendId: number, friendName: string) {
    setInviting(friendId);
    try {
      const r = await apiRequest("POST", `/api/politics/debates/${debateId}/invite`, { friendId });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error ?? "Failed"); }
      refetchMembers();
      toast({ title: `${friendName} added to the debate` });
    } catch (e: any) {
      toast({ title: "Failed to add friend", description: e.message, variant: "destructive" });
    } finally { setInviting(null); }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] font-medium border rounded-lg px-2 py-1 hover:bg-violet-500/10 hover:border-violet-400/50 hover:text-violet-500 transition-colors"
      >
        <UserPlus size={9} />Add Friend
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border bg-card shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold">Invite a Friend</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
          </div>
          {friends.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No friends yet. Add friends from the People tab.</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {friends.map((f: any) => {
                const isIn = memberIds.has(f.id) || f.id === currentUserId;
                return (
                  <div key={f.id} className="flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-secondary/40">
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-violet-600">
                      {f.avatarUrl
                        ? <img src={f.avatarUrl} alt={f.name} className="w-7 h-7 rounded-full object-cover" />
                        : f.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-xs font-medium truncate">{f.name}</span>
                    {isIn ? (
                      <span className="text-[10px] text-emerald-500 flex items-center gap-0.5 shrink-0">
                        <Check size={10} />Joined
                      </span>
                    ) : (
                      <button
                        onClick={() => invite(f.id, f.name)}
                        disabled={inviting === f.id}
                        className="shrink-0 text-[10px] font-medium text-violet-600 hover:text-violet-700 border border-violet-400/40 rounded-md px-2 py-0.5 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                      >
                        {inviting === f.id ? <Loader2 size={9} className="animate-spin" /> : "Invite"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DebatesSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeDebateId, setActiveDebateId] = useState<number | null>(null);
  const [showCreate, setShowCreate]         = useState(false);
  const [showJoin, setShowJoin]             = useState(false);
  const [newTitle, setNewTitle]             = useState("");
  const [newDesc, setNewDesc]               = useState("");
  const [newIssue, setNewIssue]             = useState("");
  const [joinCode, setJoinCode]             = useState("");
  const [newSides, setNewSides]             = useState<string[]>(["For", "Against", "Neutral"]);
  const [showCustomSides, setShowCustomSides] = useState(false);
  const [joining, setJoining]               = useState(false);
  const [creating, setCreating]             = useState(false);
  const [copiedCode, setCopiedCode]         = useState<string | null>(null);
  // Edit debate state
  const [editingDebateId, setEditingDebateId] = useState<number | null>(null);
  const [editTitle, setEditTitle]           = useState("");
  const [editDesc, setEditDesc]             = useState("");
  const [editIssue, setEditIssue]           = useState("");
  const [editSides, setEditSides]           = useState<string[]>(["For", "Against", "Neutral"]);
  const [showEditSides, setShowEditSides]   = useState(false);
  const [saving, setSaving]                 = useState(false);

  // Current user id (read from query cache via /api/user)
  const { data: me } = useQuery<any>({ queryKey: ["/api/user"], queryFn: () => apiRequest("GET", "/api/user").then(r => r.json()), staleTime: Infinity });
  const currentUserId = me?.id ?? 0;

  const { data: debates = [], isLoading } = useQuery<any[]>({
    queryKey: ["debates-list"],
    queryFn: () => apiRequest("GET", "/api/politics/debates").then(r => r.json()),
  });

  const activeDebate = debates.find(d => d.id === activeDebateId);

  async function createDebate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const validSides = newSides.map(s => s.trim()).filter(Boolean);
      const r = await apiRequest("POST", "/api/politics/debates", { title: newTitle.trim(), description: newDesc.trim() || undefined, issueRef: newIssue.trim() || undefined, sides: validSides.length >= 2 ? validSides : ["For", "Against", "Neutral"] });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["debates-list"] });
      setShowCreate(false); setNewTitle(""); setNewDesc(""); setNewIssue(""); setNewSides(["For", "Against", "Neutral"]); setShowCustomSides(false);
      setActiveDebateId(d.id);
      toast({ title: "Debate created", description: `Share code: ${d.shareCode}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  }

  async function joinDebate() {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const r = await apiRequest("POST", "/api/politics/debates/join", { shareCode: joinCode.trim().toUpperCase() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Not found");
      qc.invalidateQueries({ queryKey: ["debates-list"] });
      setShowJoin(false); setJoinCode("");
      setActiveDebateId(d.id);
      toast({ title: `Joined "${d.title}"` });
    } catch (e: any) {
      toast({ title: "Failed to join", description: e.message, variant: "destructive" });
    } finally { setJoining(false); }
  }

  async function closeDebate(id: number) {
    await apiRequest("PATCH", `/api/politics/debates/${id}`, { status: "closed" });
    qc.invalidateQueries({ queryKey: ["debates-list"] });
    qc.invalidateQueries({ queryKey: ["debate-thread", id] });
  }

  async function deleteDebate(id: number) {
    await apiRequest("DELETE", `/api/politics/debates/${id}`, {});
    qc.invalidateQueries({ queryKey: ["debates-list"] });
    if (activeDebateId === id) setActiveDebateId(null);
  }

  function openEditDebate(d: any) {
    setEditingDebateId(d.id);
    setEditTitle(d.title ?? "");
    setEditDesc(d.description ?? "");
    setEditIssue(d.issueRef ?? "");
    setEditSides(parseSides(d.sides));
    setShowEditSides(false);
  }

  async function saveEditDebate() {
    if (!editTitle.trim() || !editingDebateId) return;
    setSaving(true);
    try {
      const validSides = editSides.map(s => s.trim()).filter(Boolean);
      const r = await apiRequest("PATCH", `/api/politics/debates/${editingDebateId}`, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        issueRef: editIssue.trim() || null,
        sides: JSON.stringify(validSides.length >= 2 ? validSides : ["For", "Against", "Neutral"]),
      });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error ?? "Failed"); }
      qc.invalidateQueries({ queryKey: ["debates-list"] });
      qc.invalidateQueries({ queryKey: ["debate-thread", editingDebateId] });
      setEditingDebateId(null);
      toast({ title: "Debate updated" });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  // ── Active debate view ─────────────────────────────────────────────────────
  if (activeDebateId && activeDebate) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-2">
          <button onClick={() => setActiveDebateId(null)} className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0">
            <ChevronRight size={16} className="rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base leading-tight">{activeDebate.title}</h2>
            {activeDebate.description && <p className="text-xs text-muted-foreground mt-0.5">{activeDebate.description}</p>}
            {activeDebate.issueRef && (
              <Badge className="mt-1 bg-primary/10 text-primary text-[10px]">{activeDebate.issueRef}</Badge>
            )}
            {/* Action buttons — below the title so it never gets squeezed */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {/* Add Friend */}
              <DebateFriendInvite debateId={activeDebate.id} currentUserId={currentUserId} />
              {/* Share code */}
              <button
                onClick={() => copyCode(activeDebate.shareCode)}
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold border rounded-lg px-2 py-1 hover:bg-secondary/60 transition-colors"
              >
                {copiedCode === activeDebate.shareCode ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                {activeDebate.shareCode}
              </button>
              {/* Edit / Close / Delete for owner */}
              {activeDebate.isOwn && (
                <button onClick={() => openEditDebate(activeDebate)} className="text-[10px] text-muted-foreground hover:text-primary border rounded-lg px-2 py-1 transition-colors flex items-center gap-1">
                  <Pencil size={9} />Edit
                </button>
              )}
              {activeDebate.isOwn && activeDebate.status === "open" && (
                <button onClick={() => closeDebate(activeDebate.id)} className="text-[10px] text-muted-foreground hover:text-amber-500 border rounded-lg px-2 py-1 transition-colors flex items-center gap-1">
                  <Lock size={9} />Close
                </button>
              )}
              {activeDebate.isOwn && (
                <button onClick={() => deleteDebate(activeDebate.id)} className="text-[10px] text-muted-foreground hover:text-destructive border rounded-lg px-2 py-1 transition-colors flex items-center gap-1">
                  <Trash2 size={9} />Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline edit form */}
        {editingDebateId === activeDebate.id && (
          <div className="border rounded-xl p-4 bg-secondary/20 space-y-3">
            <h3 className="font-semibold text-sm">Edit Debate</h3>
            <div className="space-y-2">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Debate topic"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={editIssue}
                onChange={e => setEditIssue(e.target.value)}
                placeholder="Issue category (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Background or context (optional)"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            {/* Sides editor */}
            <div>
              <button
                type="button"
                onClick={() => setShowEditSides(p => !p)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Tag size={11} />Edit sides
                {showEditSides ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showEditSides && (
                <div className="mt-2 space-y-2 p-3 border rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground">Rename or add sides (2–4).</p>
                  {editSides.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                        style={{ background: ["rgb(16,185,129,0.2)","rgb(239,68,68,0.2)","rgb(156,163,175,0.2)","rgb(168,85,247,0.2)"][i % 4] }}>
                        {["✓","✗","·","◆"][i % 4]}
                      </span>
                      <input
                        value={s}
                        onChange={e => setEditSides(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`Side ${i + 1}`}
                        className="flex-1 border rounded-lg px-2.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      {editSides.length > 2 && (
                        <button type="button" onClick={() => setEditSides(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {editSides.length < 4 && (
                    <button type="button" onClick={() => setEditSides(prev => [...prev, ""])} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Plus size={11} />Add a side
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEditDebate} disabled={saving || !editTitle.trim()} className="gap-1.5">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingDebateId(null)}><X size={13} /></Button>
            </div>
          </div>
        )}

        <DebateThread debateId={activeDebateId} currentUserId={currentUserId} />
      </div>
    );
  }

  // ── Debate list ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Hero banner */}
      <div className="rounded-xl border bg-gradient-to-r from-violet-500/5 to-blue-500/5 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
            <MessageSquare size={16} className="text-violet-500" />
          </div>
          <div>
            <p className="font-bold text-sm">Debate with Friends</p>
            <p className="text-xs text-muted-foreground">Create a debate topic, share the code, and discuss issues together</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setShowCreate(true); setShowJoin(false); }} className="gap-1.5">
            <Plus size={13} />New Debate
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setShowJoin(true); setShowCreate(false); }} className="gap-1.5">
            <UserPlus size={13} />Join with Code
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border rounded-xl p-4 bg-secondary/20 space-y-3">
          <h3 className="font-semibold text-sm">New Debate</h3>
          <div className="space-y-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Debate topic (e.g. Should the US increase foreign aid?)"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={newIssue}
              onChange={e => setNewIssue(e.target.value)}
              placeholder="Issue category (optional, e.g. Foreign Policy)"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Background or context (optional)"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Sides customizer */}
          <div>
            <button
              type="button"
              onClick={() => setShowCustomSides(p => !p)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Tag size={11} />
              Customize debate sides
              {showCustomSides ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showCustomSides && (
              <div className="mt-2 space-y-2 p-3 border rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground">Name the positions participants can argue (2–4 sides).</p>
                {newSides.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                      style={{ background: [
                        "rgb(16,185,129,0.2)","rgb(239,68,68,0.2)","rgb(156,163,175,0.2)","rgb(168,85,247,0.2)"
                      ][i % 4] }}
                    >
                      {["✓","✗","·","◆"][i % 4]}
                    </span>
                    <input
                      value={s}
                      onChange={e => setNewSides(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                      placeholder={`Side ${i + 1}`}
                      className="flex-1 border rounded-lg px-2.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    {newSides.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setNewSides(prev => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {newSides.length < 4 && (
                  <button
                    type="button"
                    onClick={() => setNewSides(prev => [...prev, ""])}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Plus size={11} />Add a side
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={createDebate} disabled={creating || !newTitle.trim()} className="gap-1.5">
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewSides(["For", "Against", "Neutral"]); setShowCustomSides(false); }}><X size={13} /></Button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="border rounded-xl p-4 bg-secondary/20 space-y-3">
          <h3 className="font-semibold text-sm">Join a Debate</h3>
          <p className="text-xs text-muted-foreground">Ask a friend to share their 6-character debate code.</p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter code (e.g. AB3X7K)"
              maxLength={6}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono uppercase bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button size="sm" onClick={joinDebate} disabled={joining || joinCode.trim().length < 4} className="gap-1.5">
              {joining ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}Join
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowJoin(false)}><X size={13} /></Button>
          </div>
        </div>
      )}

      {/* Debates list */}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground justify-center">
          <Loader2 size={13} className="animate-spin" />Loading debates…
        </div>
      )}

      {!isLoading && debates.length === 0 && !showCreate && (
        <div className="text-center py-10 space-y-2">
          <MessageSquare size={28} className="mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No debates yet.</p>
          <p className="text-xs text-muted-foreground">Create a topic and invite friends with a share code to discuss issues together.</p>
        </div>
      )}

      {debates.length > 0 && (
        <div className="space-y-2">
          {debates.map((d: any) => {
            const isOwn = d.isOwn;
            return (
              <div
                key={d.id}
                className="w-full text-left border rounded-xl bg-card overflow-hidden"
              >
                <div
                  className="px-4 py-3 flex items-start gap-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => setActiveDebateId(d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{d.title}</span>
                      {d.status === "closed" && (
                        <Badge className="bg-secondary text-muted-foreground text-[10px] flex items-center gap-0.5"><Lock size={8} />Closed</Badge>
                      )}
                      {isOwn && <Badge className="bg-violet-500/15 text-violet-500 text-[10px]">Creator</Badge>}
                      {d.issueRef && <Badge className="bg-primary/10 text-primary text-[10px]">{d.issueRef}</Badge>}
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MessageSquare size={10} />{d.postCount ?? 0} post{d.postCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Users2 size={10} />{d.memberCount ?? 1} participant{(d.memberCount ?? 1) !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground ml-auto">{d.shareCode}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                </div>
                {isOwn && (
                  <div className="px-4 py-2 border-t flex items-center gap-2 bg-secondary/10">
                    <button
                      onClick={e => { e.stopPropagation(); setActiveDebateId(d.id); openEditDebate(d); }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <Pencil size={10} />Edit
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteDebate(d.id); }}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={10} />Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Civic Actions Tab ──────────────────────────────────────────────────────────

