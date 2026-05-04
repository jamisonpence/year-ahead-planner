import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isAfter, startOfDay, addDays } from "date-fns";
import {
  Landmark, Users, BookOpen, Zap, Newspaper, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Phone, Mail, Globe, Star, Vote, Calendar,
  CheckCircle2, Circle, ExternalLink, Tag, Search, Loader2, PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  PoliticalOfficial, PoliticalIssue, PoliticalElection, CivicAction, PoliticalNewsSource,
} from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────

const LEVELS = ["Federal", "State", "Local"];
const PARTIES = ["Democrat", "Republican", "Independent", "Green", "Libertarian", "Other"];
const POSITIONS = ["support", "oppose", "neutral", "undecided"] as const;
const POSITION_META: Record<string, { label: string; color: string }> = {
  support:   { label: "Support",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  oppose:    { label: "Oppose",    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  neutral:   { label: "Neutral",   color: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  undecided: { label: "Undecided", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};
const ISSUE_CATEGORIES = [
  "Economy", "Healthcare", "Education", "Environment", "Immigration",
  "Criminal Justice", "Foreign Policy", "Gun Policy", "Housing", "Infrastructure",
  "Social Issues", "Taxation", "Veterans", "Other",
];
const ELECTION_LEVELS = ["Federal", "State", "Local", "Primary", "Special"];
const ACTION_TYPES = [
  { value: "voted",       label: "Voted",                   emoji: "🗳️" },
  { value: "called",      label: "Called representative",   emoji: "📞" },
  { value: "emailed",     label: "Emailed representative",  emoji: "✉️" },
  { value: "attended",    label: "Attended event/rally",    emoji: "📢" },
  { value: "volunteered", label: "Volunteered",             emoji: "🤝" },
  { value: "donated",     label: "Donated",                 emoji: "💰" },
  { value: "petition",    label: "Signed petition",         emoji: "📜" },
  { value: "letter",      label: "Wrote letter",            emoji: "📝" },
  { value: "canvassed",   label: "Canvassed",               emoji: "🚶" },
  { value: "other",       label: "Other",                   emoji: "⚡" },
];
const BIAS_OPTIONS = ["left", "center-left", "center", "center-right", "right"];
const BIAS_META: Record<string, { label: string; color: string }> = {
  "left":         { label: "Left",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "center-left":  { label: "Center-Left",  color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  "center":       { label: "Center",       color: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  "center-right": { label: "Center-Right", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  "right":        { label: "Right",        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};
const SOURCE_TYPES = ["Newspaper", "TV", "Podcast", "Newsletter", "Website", "Radio", "Other"];
const PARTY_COLORS: Record<string, string> = {
  Democrat:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Republican:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Independent: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Green:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Libertarian: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${props.className ?? ""}`} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={3} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none ${props.className ?? ""}`} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${props.className ?? ""}`} />
  );
}
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star size={16} className={n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
        </button>
      ))}
    </div>
  );
}
function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

// ── US States ─────────────────────────────────────────────────────────────────

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "D.C." },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" }, { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" },
];

// ── Congress.gov search component ─────────────────────────────────────────────

type CongressMember = {
  bioguideId: string;
  name: string;
  title: string;
  chamber: "Senate" | "House";
  party: string;
  state: string;
  district: string | null;
  website: string | null;
  imageUrl: string | null;
};

function CongressSearch({
  existingOfficials,
  onAdd,
}: {
  existingOfficials: PoliticalOfficial[];
  onAdd: (member: CongressMember) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [stateCode, setStateCode] = useState("");
  const [searchedState, setSearchedState] = useState("");
  const [members, setMembers] = useState<CongressMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Pre-populate addedIds based on existing officials (match by name)
  const existingNames = new Set(existingOfficials.map(o => o.name.toLowerCase().trim()));

  async function search() {
    if (!stateCode) return;
    setLoading(true);
    setError("");
    setMembers([]);
    try {
      const r = await apiRequest("GET", `/api/politics/congress/members?state=${stateCode}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load members");
      setMembers(data);
      setSearchedState(stateCode);
      setAddedIds(new Set());
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(member: CongressMember) {
    setAddingIds(prev => new Set(prev).add(member.bioguideId));
    try {
      await onAdd(member);
      setAddedIds(prev => new Set(prev).add(member.bioguideId));
    } finally {
      setAddingIds(prev => { const s = new Set(prev); s.delete(member.bioguideId); return s; });
    }
  }

  async function addAll() {
    const toAdd = members.filter(m => !addedIds.has(m.bioguideId) && !existingNames.has(m.name.toLowerCase().trim()));
    for (const m of toAdd) await handleAdd(m);
  }

  const senators = members.filter(m => m.chamber === "Senate");
  const houseMembers = members.filter(m => m.chamber === "House");
  const allAdded = members.length > 0 && members.every(m => addedIds.has(m.bioguideId) || existingNames.has(m.name.toLowerCase().trim()));
  const stateName = US_STATES.find(s => s.code === searchedState)?.name ?? searchedState;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Search size={14} />Find from Congress.gov
      </Button>
    );
  }

  return (
    <div className="border rounded-xl bg-secondary/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Landmark size={15} className="text-primary" />
          Find Federal Representatives
        </h3>
        <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-secondary transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* State picker + search */}
      <div className="flex gap-2">
        <Select
          value={stateCode}
          onChange={e => setStateCode(e.target.value)}
          className="flex-1"
        >
          <option value="">Select a state…</option>
          {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </Select>
        <Button size="sm" onClick={search} disabled={!stateCode || loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? "Loading…" : "Search"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {members.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {members.length} current federal members for <strong>{stateName}</strong>
            </p>
            {!allAdded && (
              <Button size="sm" variant="outline" onClick={addAll} className="gap-1.5 text-xs h-7">
                <PlusCircle size={12} />Add All {stateName} Reps
              </Button>
            )}
          </div>

          {/* Senators */}
          {senators.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">U.S. Senators</p>
              <div className="space-y-1.5">
                {senators.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
              </div>
            </div>
          )}

          {/* House */}
          {houseMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">U.S. House of Representatives ({houseMembers.length} members)</p>
              <div className="space-y-1.5">
                {houseMembers.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground/60">Data from <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className="underline">Congress.gov</a></p>
    </div>
  );
}

function MemberRow({
  member, existingNames, addedIds, addingIds, onAdd,
}: {
  member: CongressMember;
  existingNames: Set<string>;
  addedIds: Set<string>;
  addingIds: Set<string>;
  onAdd: (m: CongressMember) => Promise<void>;
}) {
  const alreadyExists = existingNames.has(member.name.toLowerCase().trim());
  const justAdded = addedIds.has(member.bioguideId);
  const isAdding = addingIds.has(member.bioguideId);
  const done = alreadyExists || justAdded;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border">
      {member.imageUrl && (
        <img src={member.imageUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover shrink-0 bg-secondary" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{member.name}</span>
          {member.party && (
            <Badge className={PARTY_COLORS[member.party] ?? "bg-secondary text-muted-foreground"}>{member.party}</Badge>
          )}
          {member.district && <Badge className="bg-secondary text-muted-foreground">Dist. {member.district}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{member.title}</p>
      </div>
      <button
        onClick={() => !done && !isAdding && onAdd(member)}
        disabled={done || isAdding}
        className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
          done
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 cursor-default"
            : isAdding
              ? "bg-secondary text-muted-foreground cursor-wait"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {isAdding ? <Loader2 size={11} className="animate-spin" /> : done ? <Check size={11} /> : <Plus size={11} />}
        {done ? (alreadyExists ? "In list" : "Added") : isAdding ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { id: "officials",    label: "Representatives", icon: Users    },
  { id: "issues",       label: "Issues",          icon: BookOpen  },
  { id: "elections",    label: "Elections",       icon: Vote      },
  { id: "civic",        label: "Civic Actions",   icon: Zap       },
  { id: "news",         label: "News Sources",    icon: Newspaper },
];

// ── Officials Tab ──────────────────────────────────────────────────────────────

function OfficialsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: officials = [] } = useQuery<PoliticalOfficial[]>({
    queryKey: ["/api/politics/officials"],
    queryFn: () => apiRequest("GET", "/api/politics/officials").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalOfficial>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/officials", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }); setShowForm(false); setForm({}); toast({ title: "Official added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/officials/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }); setEditing(null); setForm({}); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/officials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }),
  });

  function openEdit(o: PoliticalOfficial) { setEditing(o.id); setForm(o); setShowForm(true); }
  function cancel() { setEditing(null); setForm({}); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  async function addFromCongress(member: CongressMember): Promise<void> {
    return new Promise((resolve, reject) => {
      createMut.mutate(
        {
          name: member.name,
          title: member.title,
          level: "federal",
          party: member.party,
          district: member.district ?? undefined,
          website: member.website ?? undefined,
        },
        { onSuccess: () => resolve(), onError: (e) => reject(e) }
      );
    });
  }

  const grouped = LEVELS.reduce((acc, level) => {
    acc[level] = officials.filter(o => (o.level ?? "").toLowerCase() === level.toLowerCase());
    return acc;
  }, {} as Record<string, PoliticalOfficial[]>);
  const ungrouped = officials.filter(o => !o.level || !LEVELS.map(l => l.toLowerCase()).includes(o.level.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Congress.gov search */}
      <CongressSearch existingOfficials={officials} onAdd={addFromCongress} />

      {!showForm ? (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Manually</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Official" : "Add Official"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Smith" />
            </Field>
            <Field label="Title">
              <Input value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. U.S. Senator" />
            </Field>
            <Field label="Level">
              <Select value={form.level ?? ""} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                <option value="">Select level…</option>
                {LEVELS.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Party">
              <Select value={form.party ?? ""} onChange={e => setForm(f => ({ ...f, party: e.target.value }))}>
                <option value="">Select party…</option>
                {PARTIES.map(p => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="District / State">
              <Input value={form.district ?? ""} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="e.g. TX-7" />
            </Field>
            <Field label="Term Ends">
              <Input type="date" value={form.termEnd ?? ""} onChange={e => setForm(f => ({ ...f, termEnd: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(202) 555-0100" />
            </Field>
            <Field label="Email">
              <Input value={form.email ?? ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@senate.gov" />
            </Field>
            <Field label="Website">
              <Input value={form.website ?? ""} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Key positions, voting record, notes…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {officials.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No representatives added yet. Track your elected officials at every level.</p>
      )}

      {[...LEVELS, "Other"].map(level => {
        const group = level === "Other" ? ungrouped : grouped[level] ?? [];
        if (group.length === 0) return null;
        return (
          <div key={level}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{level}</h3>
            <div className="space-y-2">
              {group.map(o => (
                <div key={o.id} className="border rounded-xl bg-card">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{o.name}</span>
                        {o.title && <span className="text-xs text-muted-foreground">{o.title}</span>}
                        {o.party && <Badge className={PARTY_COLORS[o.party] ?? "bg-secondary text-muted-foreground"}>{o.party}</Badge>}
                        {o.district && <Badge className="bg-secondary text-muted-foreground">{o.district}</Badge>}
                      </div>
                      {o.termEnd && (
                        <p className="text-xs text-muted-foreground mt-0.5">Term ends {format(parseISO(o.termEnd), "MMM yyyy")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEdit(o); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                      <button onClick={e => { e.stopPropagation(); deleteMut.mutate(o.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
                      {expandedId === o.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedId === o.id && (
                    <div className="px-4 pb-4 border-t pt-3 space-y-2 text-sm">
                      {o.phone && (
                        <a href={`tel:${o.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                          <Phone size={13} />{o.phone}
                        </a>
                      )}
                      {o.email && (
                        <a href={`mailto:${o.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                          <Mail size={13} />{o.email}
                        </a>
                      )}
                      {o.website && (
                        <a href={o.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline transition-colors">
                          <Globe size={13} />Official website <ExternalLink size={11} />
                        </a>
                      )}
                      {o.notes && <p className="text-muted-foreground text-xs mt-2 whitespace-pre-wrap">{o.notes}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Issues Tab ─────────────────────────────────────────────────────────────────

function IssuesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: issues = [] } = useQuery<PoliticalIssue[]>({
    queryKey: ["/api/politics/issues"],
    queryFn: () => apiRequest("GET", "/api/politics/issues").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalIssue>>({ importance: 3, position: "neutral" });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState("All");

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/issues", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }); setShowForm(false); setForm({ importance: 3, position: "neutral" }); toast({ title: "Issue added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/issues/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }); setEditing(null); setForm({ importance: 3, position: "neutral" }); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/issues/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }),
  });

  function openEdit(i: PoliticalIssue) { setEditing(i.id); setForm(i); setShowForm(true); }
  function cancel() { setEditing(null); setForm({ importance: 3, position: "neutral" }); setShowForm(false); }
  function submit() {
    if (!form.topic?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  const categories = ["All", ...Array.from(new Set(issues.map(i => i.category).filter(Boolean)))];
  const filtered = filterCat === "All" ? issues : issues.filter(i => i.category === filterCat);

  return (
    <div className="space-y-4">
      {!showForm ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Issue</Button>
          {categories.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {categories.map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterCat === c ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Issue" : "Add Issue"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Topic *">
              <Input value={form.topic ?? ""} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Universal Healthcare" />
            </Field>
            <Field label="Category">
              <Select value={form.category ?? ""} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select category…</option>
                {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="My Position">
              <Select value={form.position ?? "neutral"} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}>
                {POSITIONS.map(p => <option key={p} value={p}>{POSITION_META[p].label}</option>)}
              </Select>
            </Field>
            <Field label="Importance">
              <StarRating value={form.importance ?? 3} onChange={v => setForm(f => ({ ...f, importance: v }))} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Context, nuance, research…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {issues.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No issues tracked yet. Add topics you care about and your position on them.</p>
      )}

      <div className="space-y-2">
        {filtered.map(issue => (
          <div key={issue.id} className="border rounded-xl px-4 py-3 bg-card flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{issue.topic}</span>
                {issue.position && <Badge className={POSITION_META[issue.position]?.color ?? "bg-secondary"}>{POSITION_META[issue.position]?.label}</Badge>}
                {issue.category && <Badge className="bg-secondary text-muted-foreground"><Tag size={10} className="mr-1" />{issue.category}</Badge>}
              </div>
              {issue.importance && (
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={11} className={i < issue.importance! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
                  ))}
                </div>
              )}
              {issue.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{issue.notes}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(issue)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
              <button onClick={() => deleteMut.mutate(issue.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Elections Tab ──────────────────────────────────────────────────────────────

function ElectionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: elections = [] } = useQuery<PoliticalElection[]>({
    queryKey: ["/api/politics/elections"],
    queryFn: () => apiRequest("GET", "/api/politics/elections").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalElection>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/elections", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }); setShowForm(false); setForm({}); toast({ title: "Election added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/elections/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }); setEditing(null); setForm({}); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/elections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }),
  });
  const toggleVotedMut = useMutation({
    mutationFn: ({ id, voted }: { id: number; voted: boolean }) => apiRequest("PATCH", `/api/politics/elections/${id}`, { voted }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }),
  });

  function openEdit(e: PoliticalElection) { setEditing(e.id); setForm(e); setShowForm(true); }
  function cancel() { setEditing(null); setForm({}); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  const today = startOfDay(new Date());
  const upcoming = elections.filter(e => !e.date || isAfter(parseISO(e.date), today));
  const past = elections.filter(e => e.date && isBefore(parseISO(e.date), today));

  function electionStatus(e: PoliticalElection) {
    if (!e.date) return null;
    const d = parseISO(e.date);
    if (isBefore(d, today)) return e.voted ? "voted" : "missed";
    if (isBefore(d, addDays(today, 30))) return "soon";
    return "upcoming";
  }

  const statusMeta: Record<string, { label: string; color: string }> = {
    voted:    { label: "Voted ✓",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    missed:   { label: "Missed",    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    soon:     { label: "Coming up", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    upcoming: { label: "Upcoming",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  };

  function ElectionCard({ e }: { e: PoliticalElection }) {
    const status = electionStatus(e);
    return (
      <div className="border rounded-xl bg-card">
        <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
          <button
            onClick={ev => { ev.stopPropagation(); toggleVotedMut.mutate({ id: e.id, voted: !e.voted }); }}
            className="mt-0.5 shrink-0 transition-colors"
          >
            {e.voted
              ? <CheckCircle2 size={18} className="text-emerald-500" />
              : <Circle size={18} className="text-muted-foreground/40 hover:text-muted-foreground" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{e.name}</span>
              {e.level && <Badge className="bg-secondary text-muted-foreground">{e.level}</Badge>}
              {status && <Badge className={statusMeta[status].color}>{statusMeta[status].label}</Badge>}
            </div>
            {e.date && <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(e.date), "MMMM d, yyyy")}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={ev => { ev.stopPropagation(); openEdit(e); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
            <button onClick={ev => { ev.stopPropagation(); deleteMut.mutate(e.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
            {expandedId === e.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expandedId === e.id && (
          <div className="px-4 pb-4 border-t pt-3 space-y-1.5 text-sm">
            {e.registrationDeadline && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar size={12} />Registration deadline: {format(parseISO(e.registrationDeadline), "MMM d, yyyy")}</p>
            )}
            {e.pollingLocation && (
              <p className="text-xs text-muted-foreground">📍 {e.pollingLocation}</p>
            )}
            {e.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-2">{e.notes}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Election</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Election" : "Add Election"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Election Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 2026 Midterm Elections" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date ?? ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Level">
              <Select value={form.level ?? ""} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                <option value="">Select level…</option>
                {ELECTION_LEVELS.map(l => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Registration Deadline">
              <Input type="date" value={form.registrationDeadline ?? ""} onChange={e => setForm(f => ({ ...f, registrationDeadline: e.target.value }))} />
            </Field>
            <Field label="Polling Location" className="col-span-2">
              <Input value={form.pollingLocation ?? ""} onChange={e => setForm(f => ({ ...f, pollingLocation: e.target.value }))} placeholder="Address or polling location name" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Key races, ballot measures, candidates…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {elections.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No elections tracked yet. Add upcoming elections and check them off when you've voted.</p>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Upcoming</h3>
          <div className="space-y-2">{upcoming.map(e => <ElectionCard key={e.id} e={e} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Past</h3>
          <div className="space-y-2">{past.map(e => <ElectionCard key={e.id} e={e} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Civic Actions Tab ──────────────────────────────────────────────────────────

function CivicActionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: actions = [] } = useQuery<CivicAction[]>({
    queryKey: ["/api/politics/civic-actions"],
    queryFn: () => apiRequest("GET", "/api/politics/civic-actions").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<CivicAction>>({ date: new Date().toISOString().slice(0, 10), type: "voted" });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/civic-actions", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }); setShowForm(false); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); toast({ title: "Action logged" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/civic-actions/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }); setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/civic-actions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }),
  });

  function openEdit(a: CivicAction) { setEditing(a.id); setForm(a); setShowForm(true); }
  function cancel() { setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); setShowForm(false); }
  function submit() {
    if (!form.type || !form.date) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  // Stats
  const totalActions = actions.length;
  const typeCounts = ACTION_TYPES.map(t => ({ ...t, count: actions.filter(a => a.type === t.value).length })).filter(t => t.count > 0);

  return (
    <div className="space-y-4">
      {totalActions > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-xl px-3 py-2.5 bg-card text-center">
            <div className="text-2xl font-bold">{totalActions}</div>
            <div className="text-xs text-muted-foreground">Total Actions</div>
          </div>
          {typeCounts.slice(0, 3).map(t => (
            <div key={t.value} className="border rounded-xl px-3 py-2.5 bg-card text-center">
              <div className="text-2xl font-bold">{t.count}</div>
              <div className="text-xs text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Log Action</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Action" : "Log Civic Action"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type *">
              <Select value={form.type ?? "voted"} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </Select>
            </Field>
            <Field label="Date *">
              <Input type="date" value={form.date ?? ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Description">
              <Input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you do?" />
            </Field>
            <Field label="Official / Organization">
              <Input value={form.official ?? ""} onChange={e => setForm(f => ({ ...f, official: e.target.value }))} placeholder="Rep. Jane Smith, ACLU…" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Log"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {actions.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No civic actions logged yet. Start tracking your engagement — voting, calling reps, volunteering, and more.</p>
      )}

      <div className="space-y-2">
        {actions.map(action => {
          const meta = ACTION_TYPES.find(t => t.value === action.type);
          return (
            <div key={action.id} className="border rounded-xl px-4 py-3 bg-card flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5 shrink-0">{meta?.emoji ?? "⚡"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{meta?.label ?? action.type}</span>
                  {action.official && <Badge className="bg-secondary text-muted-foreground">{action.official}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">{format(parseISO(action.date), "MMM d, yyyy")}</span>
                </div>
                {action.description && <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>}
                {action.notes && <p className="text-xs text-muted-foreground/70 mt-0.5">{action.notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(action)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                <button onClick={() => deleteMut.mutate(action.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── News Sources Tab ───────────────────────────────────────────────────────────

function NewsSourcesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: sources = [] } = useQuery<PoliticalNewsSource[]>({
    queryKey: ["/api/politics/news-sources"],
    queryFn: () => apiRequest("GET", "/api/politics/news-sources").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalNewsSource>>({ reliability: 3 });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/news-sources", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }); setShowForm(false); setForm({ reliability: 3 }); toast({ title: "Source added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/news-sources/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }); setEditing(null); setForm({ reliability: 3 }); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/news-sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }),
  });

  function openEdit(s: PoliticalNewsSource) { setEditing(s.id); setForm(s); setShowForm(true); }
  function cancel() { setEditing(null); setForm({ reliability: 3 }); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Source</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Source" : "Add News Source"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. NPR, The Atlantic…" />
            </Field>
            <Field label="Type">
              <Select value={form.type ?? ""} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="">Select type…</option>
                {SOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="URL">
              <Input value={form.url ?? ""} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </Field>
            <Field label="Bias">
              <Select value={form.bias ?? ""} onChange={e => setForm(f => ({ ...f, bias: e.target.value }))}>
                <option value="">Select bias…</option>
                {BIAS_OPTIONS.map(b => <option key={b} value={b}>{BIAS_META[b].label}</option>)}
              </Select>
            </Field>
            <Field label="Reliability">
              <StarRating value={form.reliability ?? 3} onChange={v => setForm(f => ({ ...f, reliability: v }))} />
            </Field>
            <Field label="Topics">
              <Input value={form.topics ?? ""} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} placeholder="e.g. Politics, Economy, Foreign" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Why you follow this source, caveats…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {sources.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No news sources added yet. Track the outlets you follow and rate their reliability.</p>
      )}

      <div className="space-y-2">
        {sources.map(source => (
          <div key={source.id} className="border rounded-xl bg-card">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{source.name}</span>
                  {source.type && <Badge className="bg-secondary text-muted-foreground">{source.type}</Badge>}
                  {source.bias && <Badge className={BIAS_META[source.bias]?.color ?? "bg-secondary"}>{BIAS_META[source.bias]?.label}</Badge>}
                </div>
                {source.reliability && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} className={i < source.reliability! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); openEdit(source); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                <button onClick={e => { e.stopPropagation(); deleteMut.mutate(source.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
                {expandedId === source.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </div>
            </div>
            {expandedId === source.id && (
              <div className="px-4 pb-4 border-t pt-3 space-y-2 text-sm">
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline text-xs">
                    <Globe size={12} />{source.url} <ExternalLink size={10} />
                  </a>
                )}
                {source.topics && <p className="text-xs text-muted-foreground"><Tag size={11} className="inline mr-1" />{source.topics}</p>}
                {source.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{source.notes}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PoliticsPage() {
  const [activeTab, setActiveTab] = useState("officials");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <Landmark size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Politics & Civic Life</h1>
          <p className="text-sm text-muted-foreground">Track your representatives, issues, elections, and civic engagement</p>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 flex-wrap border-b">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "officials"  && <OfficialsTab />}
      {activeTab === "issues"     && <IssuesTab />}
      {activeTab === "elections"  && <ElectionsTab />}
      {activeTab === "civic"      && <CivicActionsTab />}
      {activeTab === "news"       && <NewsSourcesTab />}
    </div>
  );
}
