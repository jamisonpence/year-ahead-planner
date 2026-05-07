import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isAfter, startOfDay, addDays } from "date-fns";
import {
  Landmark, Users, BookOpen, Zap, Newspaper, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Phone, Mail, Globe, Star, Vote, Calendar,
  CheckCircle2, Circle, ExternalLink, Tag, Search, Loader2, PlusCircle,
  DollarSign, MapPin, Clock, Users2, TrendingDown,
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
  phone?: string | null;
  office?: string | null;
  website: string | null;
  imageUrl: string | null;
};

type SearchMode = "state" | "zip" | "name";

function CongressSearch({
  existingOfficials,
  onAdd,
}: {
  existingOfficials: PoliticalOfficial[];
  onAdd: (member: CongressMember) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>("zip");

  // Search inputs
  const [stateCode, setStateCode] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [searchedLabel, setSearchedLabel] = useState("");
  const [members, setMembers] = useState<CongressMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Result filters (state mode only)
  const [nameFilter, setNameFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState<"All" | "Senate" | "House">("All");
  const [partyFilter, setPartyFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("");

  const existingNames = new Set(existingOfficials.map(o => o.name.toLowerCase().trim()));

  function resetFilters() {
    setNameFilter(""); setChamberFilter("All"); setPartyFilter("All"); setDistrictFilter("");
  }
  function clearResults() {
    setMembers([]); setError(""); resetFilters(); setAddedIds(new Set());
  }

  async function search() {
    setLoading(true);
    setError("");
    setMembers([]);
    resetFilters();
    try {
      let url = "";
      let label = "";
      if (mode === "state") {
        if (!stateCode) { setError("Please select a state."); setLoading(false); return; }
        url = `/api/politics/congress/members?state=${stateCode}`;
        label = US_STATES.find(s => s.code === stateCode)?.name ?? stateCode;
      } else if (mode === "zip") {
        if (!/^\d{5}$/.test(zipInput.trim())) { setError("Please enter a valid 5-digit ZIP code."); setLoading(false); return; }
        url = `/api/politics/whoismyrep?zip=${zipInput.trim()}`;
        label = `ZIP ${zipInput.trim()}`;
      } else {
        if (!nameInput.trim()) { setError("Please enter a last name."); setLoading(false); return; }
        url = `/api/politics/whoismyrep?name=${encodeURIComponent(nameInput.trim())}`;
        label = `"${nameInput.trim()}"`;
      }
      const r = await apiRequest("GET", url);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load members");
      setMembers(data);
      setSearchedLabel(label);
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

  // Apply all filters to get visible members
  const filtered = members.filter(m => {
    if (chamberFilter !== "All" && m.chamber !== chamberFilter) return false;
    if (partyFilter !== "All" && m.party !== partyFilter) return false;
    if (districtFilter && m.district !== districtFilter) return false;
    if (nameFilter && !m.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    return true;
  });

  async function addAllVisible() {
    const toAdd = filtered.filter(m => !addedIds.has(m.bioguideId) && !existingNames.has(m.name.toLowerCase().trim()));
    for (const m of toAdd) await handleAdd(m);
  }

  // Available parties in current result set
  const availableParties = ["All", ...Array.from(new Set(members.map(m => m.party).filter(Boolean))).sort()];
  // Available districts in current result set
  const availableDistricts = Array.from(new Set(members.filter(m => m.district).map(m => m.district!))).sort((a, b) => Number(a) - Number(b));

  const filteredSenators = filtered.filter(m => m.chamber === "Senate");
  const filteredHouse = filtered.filter(m => m.chamber === "House");
  const allVisibleAdded = filtered.length > 0 && filtered.every(m => addedIds.has(m.bioguideId) || existingNames.has(m.name.toLowerCase().trim()));
  const filtersActive = chamberFilter !== "All" || partyFilter !== "All" || districtFilter !== "" || nameFilter !== "";

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Search size={14} />Find Representatives
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
        <button onClick={() => { setOpen(false); clearResults(); }} className="p-1 rounded hover:bg-secondary transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {([
          { id: "zip",   label: "By ZIP Code" },
          { id: "state", label: "By State"    },
          { id: "name",  label: "By Name"     },
        ] as { id: SearchMode; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setMode(tab.id); clearResults(); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search input row */}
      <div className="flex gap-2">
        {mode === "zip" && (
          <input
            value={zipInput}
            onChange={e => setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Enter ZIP code (e.g. 10001)"
            maxLength={5}
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        {mode === "state" && (
          <Select value={stateCode} onChange={e => setStateCode(e.target.value)} className="flex-1">
            <option value="">Select a state…</option>
            {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
        )}
        {mode === "name" && (
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Enter last name (e.g. Smith)"
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        <Button size="sm" onClick={search} disabled={loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {mode === "zip" && <p className="text-xs text-muted-foreground -mt-2">Finds your 2 senators + your exact House representative for that ZIP code</p>}
      {mode === "name" && <p className="text-xs text-muted-foreground -mt-2">Search by last name across all current members of Congress</p>}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Filters — shown once results are loaded */}
      {members.length > 0 && (
        <>
          <div className="space-y-2 pt-1 border-t">
            <p className="text-xs font-medium text-muted-foreground">Filter results</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Name search */}
              <div className="col-span-2 relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <input
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full border rounded-lg pl-7 pr-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {nameFilter && (
                  <button onClick={() => setNameFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Chamber */}
              <Select value={chamberFilter} onChange={e => setChamberFilter(e.target.value as any)}>
                <option value="All">All chambers</option>
                <option value="Senate">Senate only</option>
                <option value="House">House only</option>
              </Select>

              {/* Party */}
              <Select value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
                {availableParties.map(p => <option key={p} value={p}>{p === "All" ? "All parties" : p}</option>)}
              </Select>

              {/* District — only useful when House is visible */}
              {chamberFilter !== "Senate" && availableDistricts.length > 0 && (
                <Select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
                  <option value="">All districts</option>
                  {availableDistricts.map(d => <option key={d} value={d}>District {d}</option>)}
                </Select>
              )}

              {/* Reset filters */}
              {filtersActive && (
                <button
                  onClick={() => { setNameFilter(""); setChamberFilter("All"); setPartyFilter("All"); setDistrictFilter(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline text-left self-center"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filtersActive
                ? <><strong>{filtered.length}</strong> of {members.length} members match</>
                : <><strong>{members.length}</strong> current federal members for <strong>{searchedLabel}</strong></>
              }
            </p>
            {!allVisibleAdded && filtered.length > 0 && (
              <Button size="sm" variant="outline" onClick={addAllVisible} className="gap-1.5 text-xs h-7">
                <PlusCircle size={12} />
                {filtersActive ? `Add ${filtered.length} shown` : `Add All ${searchedLabel} Reps`}
              </Button>
            )}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No members match your filters.</p>
          )}

          {/* Senators */}
          {filteredSenators.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">U.S. Senators</p>
              <div className="space-y-1.5">
                {filteredSenators.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
              </div>
            </div>
          )}

          {/* House */}
          {filteredHouse.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                U.S. House of Representatives ({filteredHouse.length}{filtersActive && members.filter(m => m.chamber === "House").length !== filteredHouse.length ? ` of ${members.filter(m => m.chamber === "House").length}` : ""} members)
              </p>
              <div className="space-y-1.5">
                {filteredHouse.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
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

// ── Voting Records components ──────────────────────────────────────────────────

function VoteRow({ vote, isFederal }: { vote: any; isFederal: boolean }) {
  const raw = (vote.memberVote ?? "").trim().toUpperCase();
  const voteColor =
    raw.startsWith("YEA") || raw === "YES" || raw === "AYE" || raw === "Y"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
      : raw.startsWith("NAY") || raw === "NO" || raw === "N"
        ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
        : "text-muted-foreground bg-secondary";

  let dateStr = "";
  try { dateStr = vote.voteDate ? format(new Date(vote.voteDate), "MMM d, yyyy") : ""; } catch { dateStr = vote.voteDate ?? ""; }

  return (
    <div className="flex items-start gap-2.5 py-2 border-b last:border-0">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${voteColor}`}>
        {vote.memberVote || "—"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{vote.billNumber}</span>
          {dateStr && <span className="text-[10px] text-muted-foreground">{dateStr}</span>}
        </div>
        {vote.billDescription && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{vote.billDescription}</p>
        )}
      </div>
      {vote.url && (
        <a href={vote.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-primary hover:text-primary/70 transition-colors mt-1"
          title="View on LegiScan">
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function VotingRecords({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const isState = official.level?.toLowerCase() === "state";

  // For LegiScan lookups, we use name-based matching — no real bioguideId required
  const extId: string | null | undefined = (official as any).externalId;
  const isWimrId = !!extId?.startsWith("wimr-");
  const hasFederalName = isFederal && !!official.name;

  const [shown, setShown] = useState(false);
  const [cachedPeopleId, setCachedPeopleId] = useState<string | null>(
    extId && isState && !isWimrId ? extId : null
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Both federal and state use LegiScan name lookup; need a name to proceed
  const enabled = shown && (isFederal ? hasFederalName : isState);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["votes", official.id, cachedPeopleId],
    queryFn: async () => {
      setFetchError(null);
      try {
        if (isFederal) {
          const idSegment = (extId && !isWimrId) ? extId : "lookup";
          const p = new URLSearchParams();
          if (official.name) p.set("name", official.name);
          if (official.title) p.set("title", official.title);
          const r = await apiRequest("GET", `/api/politics/votes/federal/${idSegment}?${p}`);
          return r.json();
        }
        // State: use cached peopleId or auto-lookup by name+stateCode
        const params = new URLSearchParams();
        const pid = cachedPeopleId ?? (extId && !isWimrId ? extId : undefined);
        if (pid) params.set("peopleId", pid);
        if (official.name) params.set("name", official.name);
        if ((official as any).stateCode) params.set("stateCode", (official as any).stateCode);
        const r = await apiRequest("GET", `/api/politics/votes/state?${params}`);
        const body = await r.json();
        if (body.peopleId && body.peopleId !== cachedPeopleId) setCachedPeopleId(body.peopleId);
        return body.votes ?? body;
      } catch (e: any) {
        const msg: string = e?.message ?? String(e);
        setFetchError(msg);
        throw e;
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!isFederal && !isState) return null;

  const votes: any[] = Array.isArray(data) ? data : [];

  return (
    <div className="mt-3">
      <button
        onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Vote size={12} />
        {shown ? "Hide" : "Show"} recent votes
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />Loading voting record…
            </div>
          )}
          {isError && (
            <div className="py-2 space-y-1">
              <p className="text-xs text-destructive">Could not load voting record.</p>
              {fetchError && <p className="text-[11px] text-destructive/70 font-mono break-all">{fetchError}</p>}
            </div>
          )}
          {!isLoading && !isError && votes.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No voting records found.</p>
          )}
          {votes.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-semibold">
                {votes.length} most recent votes · {isFederal ? (official.title?.toLowerCase().includes("senator") ? "Senate.gov" : "Clerk.house.gov") : "LegiScan"}
              </p>
              <div>
                {votes.map((v, i) => <VoteRow key={i} vote={v} isFederal={isFederal} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campaign Finance component ────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function CampaignFinance({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const extId: string | null | undefined = (official as any).externalId;
  // FEC lookup only needs name+state+office — works even without a bioguideId
  const canLookup = isFederal && !!official.name;

  const [shown, setShown] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fecOffice = official.title?.toLowerCase().includes("senator") ? "S" : "H";
  const stateCode = (official as any).stateCode ?? "";
  const idSegment = (extId && !extId.startsWith("wimr-")) ? extId : "lookup";

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["finance", official.id],
    queryFn: async () => {
      setFetchError(null);
      try {
        const p = new URLSearchParams();
        if (official.name)  p.set("name",   official.name);
        if (stateCode)      p.set("state",  stateCode);
        p.set("office", fecOffice);
        const r = await apiRequest("GET", `/api/politics/finance/federal/${idSegment}?${p}`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(`${r.status}: ${JSON.stringify(body)}`);
        }
        return r.json();
      } catch (e: any) {
        setFetchError(e?.message ?? String(e));
        throw e;
      }
    },
    enabled: shown && canLookup,
    staleTime: 30 * 60 * 1000, // 30 min — FEC data doesn't change often
    retry: false,
  });

  if (!canLookup) return null;

  const totalRaised     = data?.totalRaised     ?? 0;
  const individualTotal = data?.individualTotal ?? 0;
  const pacTotal        = data?.pacTotal        ?? 0;
  const otherTotal      = Math.max(0, totalRaised - individualTotal - pacTotal);
  const indivPct  = totalRaised > 0 ? Math.round((individualTotal / totalRaised) * 100) : 0;
  const pacPct    = totalRaised > 0 ? Math.round((pacTotal        / totalRaised) * 100) : 0;
  const otherPct  = totalRaised > 0 ? Math.round((otherTotal      / totalRaised) * 100) : 0;
  const cycleLabel = data?.cycle ? `${data.cycle - 1}–${data.cycle}` : "";

  return (
    <div className="mt-3">
      <button
        onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <DollarSign size={12} />
        {shown ? "Hide" : "Show"} campaign finance
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />Loading campaign finance…
            </div>
          )}
          {isError && (
            <div className="py-2 space-y-1">
              <p className="text-xs text-destructive">Could not load campaign finance data.</p>
              {fetchError && <p className="text-[11px] text-destructive/70 font-mono break-all">{fetchError}</p>}
            </div>
          )}
          {!isLoading && !isError && data && (
            <div className="mt-1 space-y-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                FEC · {cycleLabel} election cycle
              </p>

              {/* Total raised */}
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{fmt$(totalRaised)}</span>
                <span className="text-xs text-muted-foreground">total raised</span>
              </div>

              {/* Funding breakdown bar — Individual / PAC / Other (transfers, party, loans…) */}
              {totalRaised > 0 && (
                <div className="space-y-1.5">
                  <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
                    <div className="bg-blue-500 transition-all" style={{ width: `${indivPct}%` }} />
                    <div className="bg-amber-500 transition-all" style={{ width: `${pacPct}%` }} />
                    <div className="bg-slate-400 transition-all" style={{ width: `${otherPct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-blue-500 shrink-0" />
                      <span className="text-muted-foreground">Individual</span>
                      <span className="font-medium">{fmt$(individualTotal)}</span>
                      <span className="text-muted-foreground">({indivPct}%)</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0" />
                      <span className="text-muted-foreground">PAC</span>
                      <span className="font-medium">{fmt$(pacTotal)}</span>
                      <span className="text-muted-foreground">({pacPct}%)</span>
                    </span>
                    {otherTotal > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-slate-400 shrink-0" />
                        <span className="text-muted-foreground">Other</span>
                        <span className="font-medium">{fmt$(otherTotal)}</span>
                        <span className="text-muted-foreground">({otherPct}%)</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Top individual donors */}
              {data.topDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top donors</p>
                  <div className="space-y-1.5">
                    {data.topDonors.map((d: any, i: number) => {
                      const maxAmt = data.topDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const detail = [d.occupation, d.employer].filter((s: string) => s && !["N/A","NONE","RETIRED","SELF-EMPLOYED","HOMEMAKER","NOT EMPLOYED","INFORMATION REQUESTED"].includes((s ?? "").toUpperCase())).map(tc).join(" · ");
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium truncate block">{tc(d.name)}</span>
                              {detail && <span className="text-[9px] text-muted-foreground/70 truncate block">{detail}</span>}
                            </div>
                            <span className="text-[11px] font-semibold text-primary shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top individuals from organizations */}
              {data.topOrgDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top individual donors from organizations</p>
                  <div className="space-y-1.5">
                    {data.topOrgDonors.map((d: any, i: number) => {
                      const maxAmt = data.topOrgDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      return (
                        <div key={i} className="rounded-md border bg-secondary/30 p-2 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold truncate">{tc(d.name)}</p>
                              <p className="text-[10px] text-primary/80 font-medium truncate">{tc(d.employer)}</p>
                              {d.occupation && !["N/A","NONE"].includes(d.occupation.toUpperCase()) && <p className="text-[9px] text-muted-foreground/60 truncate">{tc(d.occupation)}</p>}
                            </div>
                            <span className="text-[12px] font-bold text-emerald-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-emerald-400/15 overflow-hidden">
                            <div className="h-full bg-emerald-400/50 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top PAC / company donors */}
              {data.topPacDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top company &amp; PAC donors</p>
                  <div className="space-y-1.5">
                    {data.topPacDonors.map((d: any, i: number) => {
                      const maxAmt = data.topPacDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const displayName = tc(d.name.replace(/\bPAC\b|\bSUPER PAC\b|\bFUND\b|\bCOMMITTEE\b/gi, "").trim().replace(/\s+/g, " "));
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate" title={tc(d.name)}>{displayName}</span>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top employers of contributors */}
              {data.topContributors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top employers of contributors</p>
                  <div className="space-y-1">
                    {data.topContributors.slice(0, 5).map((c: any, i: number) => {
                      const barPct = data.topContributors[0]?.total > 0 ? Math.round((c.total / data.topContributors[0].total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-medium truncate">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{fmt$(c.total)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary/40 rounded-full" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <a href={data.fecUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                <ExternalLink size={10} />FEC.gov · {data.candidateName}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campaign Spending (Representatives) ───────────────────────────────────────

function CampaignSpending({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const canLookup = isFederal && !!official.name;
  const [shown, setShown] = useState(false);
  const fecOffice = official.title?.toLowerCase().includes("senator") ? "S" : "H";
  const stateCode = (official as any).stateCode ?? "";

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["spending", official.id],
    queryFn: async () => {
      const p = new URLSearchParams({ name: official.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/spending/federal?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: shown && canLookup,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  if (!canLookup) return null;

  const sp = data ?? {};
  const categories: any[] = sp.byPurpose ?? [];
  const totalSpent: number = sp.totalDisbursements ?? 0;
  const topVendors: any[] = sp.topVendors ?? [];
  const maxCat = categories[0]?.total ?? 1;

  return (
    <div className="mt-3">
      <button onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
        <TrendingDown size={12} />
        {shown ? "Hide" : "Show"} campaign spending
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2 space-y-3">
          {isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin" />Loading spending data…</div>}
          {isError && <p className="text-xs text-destructive py-1">{(error as Error)?.message ?? "Could not load spending data."}</p>}
          {!isLoading && !isError && data && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{fmt$(totalSpent)}</span>
                <span className="text-xs text-muted-foreground">total spent · {sp.cycleLabel ?? ""}</span>
              </div>

              {categories.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Spending by category</p>
                  <div className="space-y-1.5">
                    {categories.map((c: any, i: number) => {
                      const pct = totalSpent > 0 ? Math.round((c.total / totalSpent) * 100) : 0;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate">{c.purpose}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-muted-foreground">{pct}%</span>
                              <span className="text-[11px] font-semibold">{fmt$(c.total)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.round((c.total / maxCat) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {topVendors.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top vendors paid</p>
                  <div className="space-y-1.5">
                    {topVendors.map((v: any, i: number) => {
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const maxV = topVendors[0]?.total ?? 1;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium truncate">{tc(v.name)}</p>
                              {v.purpose && <p className="text-[9px] text-muted-foreground/60 truncate">{v.purpose}</p>}
                            </div>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(v.total)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/50 rounded-full" style={{ width: `${Math.round((v.total / maxV) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sp.fecUrl && (
                <a href={sp.fecUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                  <ExternalLink size={10} />View full FEC disbursements
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Government Spending in Representative's State/District ───────────────────

function GovernmentSpending({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const canLookup = isFederal && !!((official as any).stateCode);
  const [shown, setShown] = useState(false);
  const stateCode = (official as any).stateCode ?? "";
  const isSenate  = official.title?.toLowerCase().includes("senator");
  const fecOffice = isSenate ? "S" : "H";
  const district  = (official as any).district ?? "";

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["gov-spending", official.id],
    queryFn: async () => {
      const p = new URLSearchParams({ state: stateCode, office: fecOffice });
      if (district) p.set("district", String(district).replace(/\D/g, ""));
      const r = await apiRequest("GET", `/api/politics/spending/government?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: shown && canLookup,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (!canLookup) return null;

  const sp = data ?? {};
  const totalSpending: number  = sp.totalSpending    ?? 0;
  const awardTypes: any[]      = sp.awardTypeAmounts ?? [];
  const programs: any[]        = sp.topPrograms      ?? [];
  const agencies: any[]        = sp.topAgencies      ?? [];
  const recipients: any[]      = sp.recipientTypes   ?? [];
  const maxProgram   = programs[0]?.amount   ?? 1;
  const maxAgency    = agencies[0]?.amount   ?? 1;
  const maxRecipient = recipients[0]?.amount ?? 1;

  const typeBarColor: Record<string, string> = {
    "Contracts":       "bg-blue-500",
    "Grants":          "bg-emerald-500",
    "Direct Payments": "bg-orange-500",
    "Loans":           "bg-purple-500",
  };

  const SpendingBar = ({ amount, max, color }: { amount: number; max: number; color: string }) => (
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(2, (amount / max) * 100)}%` }} />
    </div>
  );

  return (
    <div className="mt-3">
      <button onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
        <Landmark size={12} />
        {shown ? "Hide" : "Show"} federal spending in {isSenate ? `${stateCode} (statewide)` : `district ${district}`}
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2 space-y-4">
          {isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin" />Loading federal spending data…</div>}
          {isError  && <p className="text-xs text-destructive py-1">{(error as Error)?.message ?? "Could not load spending data."}</p>}
          {!isLoading && !isError && data && (
            <>
              {/* ── Header ── */}
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold">{fmt$(totalSpending)}</span>
                  <span className="text-xs text-muted-foreground">in {sp.state} (statewide) · FY{sp.fiscalYear}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Total federal awards in state · Programs &amp; agencies below
                  {sp.hasDistrict ? ` filtered to district ${sp.district}` : ""} · Source: USASpending.gov
                </p>
              </div>

              {/* ── Where the money goes (by type) ── */}
              {awardTypes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Where the money goes</p>
                  <div className="space-y-2.5">
                    {awardTypes.map((t: any) => (
                      <div key={t.label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${typeBarColor[t.label] ?? "bg-primary"}`} />
                            <span className="text-[11px] font-semibold">{t.label}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{t.description}</span>
                          </div>
                          <span className="text-[11px] font-bold shrink-0 ml-2">{fmt$(t.amount)}</span>
                        </div>
                        <div className="ml-3.5">
                          <SpendingBar amount={t.amount} max={totalSpending || 1} color={typeBarColor[t.label] ?? "bg-primary"} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Top federal programs (CFDA) ── */}
              {programs.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Spending by program{sp.hasDistrict ? ` · district ${sp.district}` : ""}
                  </p>
                  <div className="rounded-md border border-border/50 overflow-hidden divide-y divide-border/40">
                    {programs.map((p: any, i: number) => (
                      <div key={i} className="px-2.5 py-2 space-y-1 bg-card hover:bg-secondary/20 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold block truncate">{p.name}</span>
                            {p.code && <span className="text-[9px] text-muted-foreground/50">CFDA {p.code}</span>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[12px] font-bold block">{fmt$(p.amount)}</span>
                            {p.pct != null && <span className="text-[9px] text-muted-foreground">{p.pct}% of top programs</span>}
                          </div>
                        </div>
                        <SpendingBar amount={p.amount} max={maxProgram} color="bg-emerald-500/70" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Top awarding agencies ── */}
              {agencies.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top federal agencies</p>
                  <div className="space-y-2">
                    {agencies.map((a: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{a.name}</span>
                          <span className="text-[11px] font-bold shrink-0">{fmt$(a.amount)}</span>
                        </div>
                        <SpendingBar amount={a.amount} max={maxAgency} color="bg-blue-500/60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Who receives the money ── */}
              {recipients.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Who receives it</p>
                  <div className="space-y-2">
                    {recipients.map((r: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{r.label}</span>
                          <span className="text-[11px] font-bold shrink-0">{fmt$(r.amount)}</span>
                        </div>
                        <SpendingBar amount={r.amount} max={maxRecipient} color="bg-amber-500/60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sp.usaSpendingUrl && (
                <a href={sp.usaSpendingUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                  <ExternalLink size={10} />View full profile on USASpending.gov
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Civic Elections Lookup ────────────────────────────────────────────────────

function LocationCard({ loc }: { loc: any }) {
  const addr = [loc.line1, loc.line2, loc.city, loc.state, loc.zip].filter(Boolean).join(", ");
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1">
      {loc.name && <p className="text-xs font-semibold">{loc.name}</p>}
      {addr && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-start gap-1.5 text-[11px] text-primary hover:underline"
        >
          <MapPin size={11} className="mt-0.5 shrink-0" />{addr}
        </a>
      )}
      {loc.hours && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock size={11} />{loc.hours}</p>}
      {(loc.startDate || loc.endDate) && (
        <p className="text-[11px] text-muted-foreground">
          {loc.startDate && loc.endDate ? `${loc.startDate} – ${loc.endDate}` : loc.startDate ?? loc.endDate}
        </p>
      )}
      {loc.notes && <p className="text-[11px] text-muted-foreground italic">{loc.notes}</p>}
    </div>
  );
}

// ── Upcoming Elections Panel ───────────────────────────────────────────────────

// ── FEC name normalizer ────────────────────────────────────────────────────────
// FEC returns names as "LAST, FIRST MIDDLE NICK" — convert to "First Last" for URLs & display

function normalizeFecName(raw: string): string {
  const tc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (raw.includes(",")) {
    const [last, rest = ""] = raw.split(",");
    const first = rest.trim().split(/\s+/)[0] ?? "";
    return [first, last].filter(Boolean).map(tc).join(" ");
  }
  return raw.split(/\s+/).map(tc).join(" ");
}

// Build external search URLs from a normalized name
function ballotpediaUrl(rawName: string): string {
  // Use Ballotpedia search so any name variant finds the right politician
  return `https://ballotpedia.org/wiki/index.php?search=${encodeURIComponent(normalizeFecName(rawName))}`;
}

// ── Policy topic categorization (client-side) ─────────────────────────────────

const POLICY_BUCKETS: Array<{ label: string; emoji: string; keywords: string[] }> = [
  { label: "Healthcare",        emoji: "🏥", keywords: ["health", "medical", "medicare", "medicaid", "prescription", "drug", "hospital", "insurance", "opioid", "affordable care", "mental health"] },
  { label: "Economy & Taxes",   emoji: "💵", keywords: ["tax", "budget", "fiscal", "deficit", "debt", "trade", "tariff", "jobs", "employment", "wage", "workforce", "small business", "economic"] },
  { label: "Defense & Veterans",emoji: "🎖️", keywords: ["defense", "military", "veteran", "armed forces", "national security", "army", "navy", "air force", "pentagon"] },
  { label: "Environment",       emoji: "🌿", keywords: ["climate", "energy", "clean", "environment", "epa", "emissions", "carbon", "oil", "gas", "renewable", "solar", "wind", "conservation"] },
  { label: "Immigration",       emoji: "🌐", keywords: ["immigr", "border", "asylum", "daca", "refugee", "visa", "citizenship", "undocumented"] },
  { label: "Education",         emoji: "📚", keywords: ["education", "school", "student", "university", "college", "loan", "teacher", "pell", "literacy"] },
  { label: "Gun Policy",        emoji: "🔫", keywords: ["gun", "firearm", "second amendment", "background check", "weapon"] },
  { label: "Foreign Policy",    emoji: "🌍", keywords: ["foreign", "israel", "ukraine", "china", "russia", "nato", "diplomacy", "sanction", "international aid"] },
  { label: "Criminal Justice",  emoji: "⚖️", keywords: ["crime", "criminal", "justice", "police", "law enforcement", "prison", "sentencing", "fentanyl", "opioid"] },
  { label: "Social Issues",     emoji: "🤝", keywords: ["abortion", "lgbtq", "civil rights", "discrimination", "women", "gender", "reproductive"] },
];

function categorizeVotes(votes: any[]): Array<{
  label: string; emoji: string; yea: number; nay: number;
  examples: Array<{ text: string; vote: string }>;
}> {
  return POLICY_BUCKETS.map(bucket => {
    const matching = votes.filter(v => {
      const text = `${v.billNumber ?? ""} ${v.billDescription ?? ""}`.toLowerCase();
      return bucket.keywords.some(kw => text.includes(kw));
    });
    const yea = matching.filter(v => /yea|yes|aye/i.test(v.memberVote ?? "")).length;
    const nay = matching.filter(v => /nay|no/i.test(v.memberVote ?? "")).length;
    const examples = matching
      .slice(0, 3)
      .map(v => ({ text: (v.billDescription || v.billNumber || "").trim(), vote: (v.memberVote || "").trim() }))
      .filter(e => e.text);
    return { ...bucket, yea, nay, examples };
  }).filter(b => b.yea + b.nay > 0)
    .sort((a, b) => (b.yea + b.nay) - (a.yea + a.nay));
}

// ── Per-candidate Finance + Votes + Positions panel ───────────────────────────

function CandidateDetails({
  candidate, office, stateCode,
}: {
  candidate: any; office: string; stateCode: string; isFecSource: boolean;
}) {
  const [tab, setTab] = useState<"finance" | "spending" | "votes" | "positions">("finance");
  const [aiSummary, setAiSummary]     = useState<string | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError,   setAiError]       = useState<string | null>(null);
  const isSenate  = /senate/i.test(office);
  const title     = isSenate ? "Senator" : "Representative";
  const fecOffice = isSenate ? "S" : "H";

  // Finance query
  const finQuery = useQuery<any>({
    queryKey: ["cand-finance", candidate.name, stateCode, fecOffice],
    queryFn: async () => {
      const p = new URLSearchParams({ name: candidate.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/finance/federal/lookup?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: tab === "finance",
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Normalize FEC name ("LAST, FIRST MIDDLE" → "First Last") for APIs and URLs
  const displayName = normalizeFecName(candidate.name);

  // Votes query — also enabled when Positions tab is open (needed for topic analysis)
  const votesQuery = useQuery<any>({
    queryKey: ["cand-votes", candidate.name, title],
    queryFn: async () => {
      // Pass raw FEC name so server can extract all possible first initials
      const p = new URLSearchParams({ name: candidate.name, title });
      const r = await apiRequest("GET", `/api/politics/votes/federal/lookup?${p}`);
      return r.json();
    },
    enabled: tab === "votes" || tab === "positions",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Spending query — FEC Schedule B disbursements by purpose
  const spendingQuery = useQuery<any>({
    queryKey: ["cand-spending", candidate.name, stateCode, fecOffice],
    queryFn: async () => {
      const p = new URLSearchParams({ name: candidate.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/spending/federal?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: tab === "spending",
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const fin = finQuery.data;
  const totalRaised     = fin?.totalRaised     ?? 0;
  const individualTotal = fin?.individualTotal ?? 0;
  const pacTotal        = fin?.pacTotal        ?? 0;
  const otherTotal      = Math.max(0, totalRaised - individualTotal - pacTotal);
  const indivPct  = totalRaised > 0 ? Math.round((individualTotal / totalRaised) * 100) : 0;
  const pacPct    = totalRaised > 0 ? Math.round((pacTotal        / totalRaised) * 100) : 0;
  const otherPct  = totalRaised > 0 ? Math.round((otherTotal      / totalRaised) * 100) : 0;
  const cycleLabel = fin?.cycle ? `${fin.cycle - 1}–${fin.cycle}` : "";
  const votes: any[] = Array.isArray(votesQuery.data) ? votesQuery.data : [];
  const topicBreakdown = categorizeVotes(votes);

  // Generate AI candidate summary
  const generateSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const topContributors = (fin?.topContributors ?? []).map((c: any) => ({ name: c.name, total: c.total }));
      const r = await apiRequest("POST", "/api/politics/candidate/summary", {
        displayName,
        office,
        state: stateCode,
        party: candidate.party ?? undefined,
        topContributors,
        topicBreakdown: topicBreakdown.map(b => ({
          label: b.label, yea: b.yea, nay: b.nay,
          examples: b.examples.slice(0, 2),
        })),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      const data = await r.json();
      setAiSummary(data.summary ?? "No summary returned.");
    } catch (e: any) {
      setAiError(e.message ?? "Failed to generate summary.");
    } finally {
      setAiLoading(false);
    }
  };

  // Build external links using normalized "First Last" form of the FEC name
  const bpUrl = ballotpediaUrl(candidate.name);
  const vsUrl = `https://www.votesmart.org/candidates/search?query=${encodeURIComponent(displayName)}`;
  const cgUrl = `https://www.congress.gov/members?q=${encodeURIComponent(JSON.stringify({ search: displayName }))}`;

  const TABS = [
    { id: "finance",   label: "💰 Finance" },
    { id: "spending",  label: "💸 Spending" },
    { id: "votes",     label: "🗳️ Votes" },
    { id: "positions", label: "📋 Positions" },
  ] as const;

  return (
    <div className="mt-2 rounded-lg border bg-secondary/20 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
              tab === t.id
                ? "bg-background border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Finance tab ── */}
      {tab === "finance" && (
        <div className="px-3 py-2.5">
          {finQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 size={11} className="animate-spin" />Loading…</div>}
          {finQuery.isError && <p className="text-[11px] text-destructive py-1">{(finQuery.error as any)?.message ?? "Could not load finance data."}</p>}
          {fin && totalRaised === 0 && <p className="text-[11px] text-muted-foreground italic py-1">No FEC finance data found for this candidate.</p>}
          {fin && totalRaised > 0 && (
            <div className="space-y-2.5">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold">FEC · {cycleLabel}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold">{fmt$(totalRaised)}</span>
                <span className="text-[11px] text-muted-foreground">total raised</span>
              </div>
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary">
                  <div className="bg-blue-500" style={{ width: `${indivPct}%` }} />
                  <div className="bg-amber-500" style={{ width: `${pacPct}%` }} />
                  <div className="bg-slate-400" style={{ width: `${otherPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-blue-500" />Individual {fmt$(individualTotal)} ({indivPct}%)</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-amber-500" />PAC {fmt$(pacTotal)} ({pacPct}%)</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-slate-400" />Other {fmt$(otherTotal)} ({otherPct}%)</span>
                </div>
              </div>
              {/* Top 5 individual donors */}
              {fin.topDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top donors</p>
                  <div className="space-y-1.5">
                    {fin.topDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const donorName = tc(d.name);
                      const detail = [d.occupation, d.employer].filter((s: string) => s && !["N/A","NONE","RETIRED","SELF-EMPLOYED","HOMEMAKER","NOT EMPLOYED","INFORMATION REQUESTED"].includes((s ?? "").toUpperCase())).map(tc).join(" · ");
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium truncate block">{donorName}</span>
                              {detail && <span className="text-[9px] text-muted-foreground/70 truncate block">{detail}</span>}
                            </div>
                            <span className="text-[11px] font-semibold text-primary shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top individuals linked to organizations */}
              {fin.topOrgDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top individual donors from organizations</p>
                  <div className="space-y-2">
                    {fin.topOrgDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topOrgDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const donorName  = tc(d.name);
                      const employer   = tc(d.employer);
                      const occupation = d.occupation && !["N/A","NONE"].includes(d.occupation.toUpperCase()) ? tc(d.occupation) : "";
                      return (
                        <div key={i} className="rounded-md border bg-secondary/30 p-2 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold truncate">{donorName}</p>
                              <p className="text-[10px] text-primary/80 font-medium truncate">{employer}</p>
                              {occupation && <p className="text-[9px] text-muted-foreground/60 truncate">{occupation}</p>}
                            </div>
                            <span className="text-[12px] font-bold text-emerald-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-emerald-400/15 overflow-hidden">
                            <div className="h-full bg-emerald-400/50 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top PAC / company donors */}
              {fin.topPacDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top company &amp; PAC donors</p>
                  <div className="space-y-1.5">
                    {fin.topPacDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topPacDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      // Strip common PAC suffixes for cleaner display, keep original as tooltip
                      const displayName = tc(d.name.replace(/\bPAC\b|\bSUPER PAC\b|\bFUND\b|\bCOMMITTEE\b/gi, "").trim().replace(/\s+/g, " "));
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate" title={tc(d.name)}>{displayName}</span>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top employers of contributors */}
              {fin.topContributors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top employers of contributors</p>
                  <div className="space-y-1">
                    {fin.topContributors.slice(0, 5).map((c: any, i: number) => {
                      const maxAmt = fin.topContributors[0]?.total ?? 1;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] truncate">{c.name}</div>
                            <div className="h-1 rounded-full bg-primary/20 mt-0.5 overflow-hidden">
                              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.round((c.total / maxAmt) * 100)}%` }} />
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{fmt$(c.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {fin.fecUrl && (
                <a href={fin.fecUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                  <ExternalLink size={9} />View full FEC profile
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Spending tab ── */}
      {tab === "spending" && (
        <div className="px-3 py-2.5 space-y-3">
          {spendingQuery.isLoading && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
              <Loader2 size={11} className="animate-spin" />Loading spending data…
            </div>
          )}
          {spendingQuery.isError && (
            <p className="text-[11px] text-muted-foreground italic py-1">{(spendingQuery.error as Error)?.message ?? "Could not load spending data."}</p>
          )}
          {spendingQuery.data && (() => {
            const sp = spendingQuery.data;
            const categories: any[] = sp.byPurpose ?? [];
            const totalSpent: number = sp.totalDisbursements ?? 0;
            const topVendors: any[] = sp.topVendors ?? [];
            const maxCat = categories[0]?.total ?? 1;
            return (
              <div className="space-y-3">
                {/* Total disbursements */}
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold">{fmt$(totalSpent)}</span>
                  <span className="text-[10px] text-muted-foreground">total spent · {sp.cycleLabel ?? ""}</span>
                </div>

                {/* Spending by category */}
                {categories.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Spending by category</p>
                    <div className="space-y-1.5">
                      {categories.map((c: any, i: number) => {
                        const pct = totalSpent > 0 ? Math.round((c.total / totalSpent) * 100) : 0;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium truncate">{c.purpose}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-muted-foreground">{pct}%</span>
                                <span className="text-[11px] font-semibold">{fmt$(c.total)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                              <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.round((c.total / maxCat) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top vendors */}
                {topVendors.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top vendors paid</p>
                    <div className="space-y-1.5">
                      {topVendors.map((v: any, i: number) => {
                        const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                        const maxV = topVendors[0]?.total ?? 1;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium truncate">{tc(v.name)}</p>
                                {v.purpose && <p className="text-[9px] text-muted-foreground/60 truncate">{v.purpose}</p>}
                              </div>
                              <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(v.total)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                              <div className="h-full bg-amber-400/50 rounded-full transition-all" style={{ width: `${Math.round((v.total / maxV) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sp.fecUrl && (
                  <a href={sp.fecUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink size={9} />View full FEC disbursements
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Votes tab ── */}
      {tab === "votes" && (
        <div className="px-3 py-2.5">
          {votesQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 size={11} className="animate-spin" />Loading…</div>}
          {votesQuery.isError && <p className="text-[11px] text-muted-foreground italic py-1">No voting record found — this candidate may not currently hold office.</p>}
          {!votesQuery.isLoading && !votesQuery.isError && votes.length === 0 && <p className="text-[11px] text-muted-foreground italic py-1">No recent votes found — this candidate may not currently hold federal office.</p>}
          {votes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold">{votes.length} recent votes</p>
              {votes.map((v: any, i: number) => <VoteRow key={i} vote={v} isFederal={true} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Positions tab ── */}
      {tab === "positions" && (
        <div className="px-3 py-2.5 space-y-3">

          {/* AI candidate overview */}
          <div className="rounded-lg border bg-secondary/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold">✨ AI Voter Overview</p>
                <p className="text-[9px] text-muted-foreground/70">Nonpartisan summary based on voting data & finance</p>
              </div>
              <button
                onClick={generateSummary}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {aiLoading ? <><Loader2 size={10} className="animate-spin" />Generating…</> : "Generate"}
              </button>
            </div>
            {aiError && (
              <p className="text-[10px] text-red-400 leading-snug">{aiError}</p>
            )}
            {aiSummary && (
              <div className="border-t border-border/30 pt-2 space-y-1">
                {aiSummary.split(/\n+/).filter(Boolean).map((para, i) => (
                  <p key={i} className="text-[11px] text-foreground/90 leading-relaxed">{para}</p>
                ))}
                <p className="text-[9px] text-muted-foreground/40 pt-0.5 italic">Generated by Claude AI · For informational purposes only</p>
              </div>
            )}
          </div>

          {/* Voting pattern by policy topic */}
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">
              Voting pattern by issue {votes.length > 0 ? `· from ${votes.length} recent votes` : ""}
            </p>
            {votesQuery.isLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" />Analyzing votes…
              </div>
            )}
            {!votesQuery.isLoading && topicBreakdown.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                {votesQuery.isError || votes.length === 0
                  ? "No voting record available — this candidate may not currently hold office."
                  : "No votes matched known policy topics."}
              </p>
            )}
            {topicBreakdown.length > 0 && (
              <div className="space-y-2">
                {topicBreakdown.map(b => {
                  const total = b.yea + b.nay;
                  const yeaPct = Math.round((b.yea / total) * 100);
                  const stance    = yeaPct >= 65 ? "Generally Supports" : yeaPct <= 35 ? "Generally Opposes" : "Mixed Record";
                  const stanceCls = yeaPct >= 65 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                                  : yeaPct <= 35 ? "text-red-400 bg-red-400/10 border-red-400/20"
                                  : "text-amber-400 bg-amber-400/10 border-amber-400/20";
                  return (
                    <div key={b.label} className="rounded-lg border bg-secondary/20 p-2.5 space-y-2">
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold">{b.emoji} {b.label}</span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${stanceCls}`}>
                          {stance}
                        </span>
                      </div>

                      {/* Vote bar */}
                      <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
                        <div className="bg-emerald-500 transition-all" style={{ width: `${yeaPct}%` }} />
                        <div className="bg-red-400 transition-all" style={{ width: `${100 - yeaPct}%` }} />
                      </div>

                      {/* Vote tally */}
                      <div className="flex justify-between text-[10px]">
                        <span className="text-emerald-400 font-medium">✓ {b.yea} voted for</span>
                        <span className="text-red-400 font-medium">✗ {b.nay} voted against</span>
                      </div>

                      {/* Example votes */}
                      {b.examples.length > 0 && (
                        <div className="border-t border-border/30 pt-2 space-y-1.5">
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Recent votes</p>
                          {b.examples.map((ex, i) => {
                            const isYea = /yea|yes|aye/i.test(ex.vote);
                            const isNay = /nay|no/i.test(ex.vote);
                            return (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className={`text-[10px] font-bold shrink-0 mt-px ${isYea ? "text-emerald-400" : isNay ? "text-red-400" : "text-muted-foreground"}`}>
                                  {isYea ? "✓" : isNay ? "✗" : "·"}
                                </span>
                                <p className="text-[10px] text-muted-foreground leading-snug">{ex.text}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Research links */}
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Research their stated positions</p>
            <div className="space-y-1">
              {[
                { label: "Ballotpedia", url: bpUrl, note: "Policy positions & biography" },
                { label: "VoteSmart",   url: vsUrl, note: "Issue positions & ratings" },
                { label: "Congress.gov",url: cgUrl, note: "Sponsored legislation" },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md border bg-background hover:bg-secondary/50 transition-colors">
                  <div>
                    <p className="text-[11px] font-medium text-primary">{link.label}</p>
                    <p className="text-[9px] text-muted-foreground">{link.note}</p>
                  </div>
                  <ExternalLink size={10} className="text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contests + candidates for one election ─────────────────────────────────────

function ElectionCandidates({ electionId, stateCode }: { electionId: string; stateCode: string }) {
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["election-candidates", electionId, stateCode],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/politics/elections/candidates?electionId=${encodeURIComponent(electionId)}&state=${encodeURIComponent(stateCode)}`
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      return r.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />Loading candidates…
    </div>
  );
  if (isError) return (
    <p className="px-4 py-2 text-[11px] text-muted-foreground italic">
      {(error as any)?.message ?? "Could not load candidates for this election."}
    </p>
  );

  const contests: any[] = data?.contests ?? [];
  const isFecSource = data?.source === "fec";

  if (contests.length === 0) return (
    <p className="px-4 py-3 text-[11px] text-muted-foreground italic border-t">
      Candidate data isn't available yet for this election — check back closer to the election date.
    </p>
  );

  return (
    <div className="border-t">
      {isFecSource && (
        <div className="px-4 py-2 bg-amber-500/10 border-b">
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Ballot-specific candidates not yet available — showing federal candidates who have filed with the FEC for this state.
          </p>
        </div>
      )}
      <div className="divide-y">
        {contests.map((c: any, ci: number) => (
          <div key={ci} className="px-4 py-2.5 space-y-2">
            <div>
              <p className="text-[11px] font-semibold">{c.office}</p>
              {c.district && <p className="text-[10px] text-muted-foreground">{c.district}</p>}
            </div>
            <div className="space-y-2">
              {(c.candidates ?? []).map((k: any, ki: number) => {
                const key = `${ci}-${ki}-${k.name}`;
                const isOpen = expandedCandidate === key;
                return (
                  <div key={ki} className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedCandidate(isOpen ? null : key)}
                      >
                        {isOpen ? <ChevronUp size={11} className="text-muted-foreground shrink-0" /> : <ChevronDown size={11} className="text-muted-foreground shrink-0" />}
                        <span className="text-[11px] font-medium">{k.name}</span>
                      </button>
                      {k.party && (
                        <Badge className={`text-[10px] ${PARTY_COLORS[k.party] ?? "bg-secondary text-muted-foreground"}`}>
                          {k.party}
                        </Badge>
                      )}
                      <div className="flex gap-2 ml-auto">
                        {k.url && (
                          <a href={k.url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                            <Globe size={10} />{isFecSource ? "FEC" : "Website"}
                          </a>
                        )}
                        {k.phone && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Phone size={10} />{k.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <CandidateDetails
                        candidate={k}
                        office={c.office}
                        stateCode={stateCode}
                        isFecSource={isFecSource}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingElectionsPanel() {
  const [state, setState] = useState("TX");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: elections = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ["upcoming-elections", state],
    queryFn: async () => {
      const qs = state ? `?state=${encodeURIComponent(state)}` : "";
      const r = await apiRequest("GET", `/api/politics/elections/upcoming${qs}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return r.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Group by month
  const byMonth: Record<string, any[]> = {};
  for (const e of elections) {
    const key = e.date ? format(new Date(e.date + "T12:00:00"), "MMMM yyyy") : "Unknown";
    (byMonth[key] ??= []).push(e);
  }

  function stateFromOcd(ocdId: string | null) {
    if (!ocdId) return state || "TX";
    const m = ocdId.match(/\/state:([a-z]+)/);
    return m ? m[1].toUpperCase() : (state || "TX");
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Vote size={14} className="text-primary" />
          <h3 className="font-semibold text-sm">Upcoming Elections</h3>
          <span className="text-[10px] text-muted-foreground">through 2028 · federal always shown</span>
        </div>
        <select
          value={state}
          onChange={e => { setState(e.target.value); setExpandedId(null); }}
          className="text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All States</option>
          {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />Loading elections…
        </div>
      )}
      {isError && (
        <p className="text-xs text-destructive px-4 py-3">Could not load elections. Check GOOGLE_CIVIC_API_KEY.</p>
      )}
      {!isLoading && !isError && elections.length === 0 && (
        <p className="text-xs text-muted-foreground px-4 py-6 text-center">No elections found for the selected state in the next 12 months.</p>
      )}
      {!isLoading && !isError && Object.keys(byMonth).length > 0 && (
        <div className="divide-y">
          {Object.entries(byMonth).map(([month, group]) => (
            <div key={month}>
              <div className="px-4 py-1.5 bg-secondary/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{month}</span>
              </div>
              <div className="divide-y">
                {group.map((e: any) => {
                  const isOpen = expandedId === e.id;
                  const isFederal = e.federal || e.ocdId === "ocd-division/country:us";
                  const sc = isFederal ? (state || "TX") : stateFromOcd(e.ocdId);
                  const isHardcoded = (e.id as string).startsWith("fed-");
                  return (
                    <div key={e.id}>
                      <button
                        className="w-full flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors text-left"
                        onClick={() => !isHardcoded && setExpandedId(isOpen ? null : e.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12px] font-medium leading-tight">{e.name}</p>
                            {isFederal && (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[9px]">Federal</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {e.date ? format(new Date(e.date + "T12:00:00"), "MMM d, yyyy") : ""}
                          </p>
                          {e.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 italic">{e.description}</p>
                          )}
                        </div>
                        {!isHardcoded && (
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            {isOpen
                              ? <ChevronUp size={13} className="text-muted-foreground" />
                              : <ChevronDown size={13} className="text-muted-foreground" />}
                          </div>
                        )}
                      </button>
                      {isOpen && !isHardcoded && <ElectionCandidates electionId={e.id} stateCode={sc} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CivicElectionsLookup() {
  const [address, setAddress]       = useState("");
  const [submitted, setSubmitted]   = useState("");
  const [openSection, setOpenSection] = useState<string | null>("polling");

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["civic-elections", submitted],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/politics/elections/civic?address=${encodeURIComponent(submitted)}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      return r.json();
    },
    enabled: !!submitted,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  function lookup() {
    if (address.trim()) setSubmitted(address.trim());
  }

  const vi = data?.voterInfo;

  function Section({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
    if (count === 0) return null;
    const open = openSection === id;
    return (
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 bg-card hover:bg-secondary/50 transition-colors"
          onClick={() => setOpenSection(open ? null : id)}
        >
          <span className="text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            <Badge className="bg-secondary text-muted-foreground">{count}</Badge>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </button>
        {open && <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-card">{children}</div>}
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={15} className="text-primary shrink-0" />
        <h3 className="font-semibold text-sm">My Elections & Ballot</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">via Google Civic</span>
      </div>

      {/* Address input */}
      <div className="flex gap-2">
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="Enter your registered address (e.g. 123 Main St, Austin TX 78701)"
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button size="sm" onClick={lookup} disabled={isLoading || !address.trim()} className="gap-1.5 shrink-0">
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {isLoading ? "Looking up…" : "Look up"}
        </Button>
      </div>

      {isError && (
        <p className="text-xs text-destructive">{(error as any)?.message ?? "Could not load election data."}</p>
      )}

      {data && (
        <div className="space-y-2">
          {/* Active election banner */}
          {vi?.election && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
              <p className="text-xs font-semibold text-primary">{vi.election.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {vi.election.date ? format(new Date(vi.election.date + "T12:00:00"), "MMMM d, yyyy") : ""}
              </p>
            </div>
          )}

          {/* Key Dates */}
          {vi && (vi.election?.date || vi.earlyVotingWindow) && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 bg-card border-b">
                <span className="text-xs font-semibold">Key Dates</span>
              </div>
              <div className="bg-card divide-y">
                {vi.earlyVotingWindow?.start && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">Early Voting Begins</span>
                    <span className="text-[11px] font-medium">
                      {format(new Date(vi.earlyVotingWindow.start + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
                {vi.earlyVotingWindow?.end && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">Last Day of Early Voting</span>
                    <span className="text-[11px] font-medium">
                      {format(new Date(vi.earlyVotingWindow.end + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
                {vi.election?.date && (
                  <div className="flex items-center justify-between px-3 py-2 bg-primary/5">
                    <span className="text-[11px] font-semibold text-primary">Election Day</span>
                    <span className="text-[11px] font-bold text-primary">
                      {format(new Date(vi.election.date + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resources */}
          {vi?.adminLinks && Object.values(vi.adminLinks).some(v => v && typeof v === "string") && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 bg-card border-b">
                <span className="text-xs font-semibold">Voter Resources</span>
              </div>
              <div className="bg-card px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {vi.adminLinks.registrationUrl && (
                  <a href={vi.adminLinks.registrationUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Register to Vote
                  </a>
                )}
                {vi.adminLinks.registrationConfirmationUrl && (
                  <a href={vi.adminLinks.registrationConfirmationUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Check Registration
                  </a>
                )}
                {vi.adminLinks.absenteeUrl && (
                  <a href={vi.adminLinks.absenteeUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Mail / Absentee Ballot
                  </a>
                )}
                {vi.adminLinks.ballotInfoUrl && (
                  <a href={vi.adminLinks.ballotInfoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Sample Ballot
                  </a>
                )}
                {vi.adminLinks.electionInfoUrl && (
                  <a href={vi.adminLinks.electionInfoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Election Calendar
                  </a>
                )}
                {vi.adminLinks.electionRulesUrl && (
                  <a href={vi.adminLinks.electionRulesUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Voting Rules
                  </a>
                )}
              </div>
              {vi.adminLinks.voterServices?.length > 0 && (
                <div className="px-3 pb-2.5 pt-0 border-t">
                  <ul className="space-y-0.5 mt-1.5">
                    {vi.adminLinks.voterServices.map((s: string, i: number) => (
                      <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 w-1 h-1 rounded-full bg-muted-foreground/40 inline-block" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Polling location */}
          {vi?.pollingLocations?.length > 0 && (
            <Section id="polling" label="Polling Location" count={vi.pollingLocations.length}>
              <div className="space-y-2">
                {vi.pollingLocations.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Early voting */}
          {vi?.earlyVoteSites?.length > 0 && (
            <Section id="early" label="Early Voting Sites" count={vi.earlyVoteSites.length}>
              <div className="space-y-2">
                {vi.earlyVoteSites.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Drop boxes */}
          {vi?.dropOffLocations?.length > 0 && (
            <Section id="dropoff" label="Ballot Drop-Off Locations" count={vi.dropOffLocations.length}>
              <div className="space-y-2">
                {vi.dropOffLocations.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Contests */}
          {vi?.contests?.length > 0 && (
            <Section id="contests" label="Contests on Your Ballot" count={vi.contests.length}>
              <div className="space-y-3">
                {vi.contests.map((c: any, i: number) => (
                  <div key={i} className="space-y-1.5 pb-2 border-b last:border-0">
                    <div>
                      <p className="text-[11px] font-semibold">{c.office}</p>
                      {c.district && <p className="text-[10px] text-muted-foreground">{c.district}</p>}
                    </div>
                    <div className="space-y-1">
                      {c.candidates?.map((k: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium">{k.name}</span>
                          {k.party && (
                            <Badge className={PARTY_COLORS[k.party] ?? "bg-secondary text-muted-foreground text-[10px]"}>
                              {k.party}
                            </Badge>
                          )}
                          <div className="flex gap-2 ml-auto">
                            {k.url && (
                              <a href={k.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                <Globe size={10} />Website
                              </a>
                            )}
                            {k.phone && (
                              <a href={`tel:${k.phone}`} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                                <Phone size={10} />{k.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {vi && !vi.election && vi.contests?.length === 0 && vi.pollingLocations?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No active election data found for this address right now.</p>
          )}
        </div>
      )}
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
          stateCode: member.state ?? undefined,
          // Only store real Congress.gov bioguideIds — WIMR results use fake "wimr-N-Name" IDs
          externalId: member.bioguideId.startsWith("wimr-") ? undefined : member.bioguideId,
          phone: member.phone ?? undefined,
          website: member.website ?? undefined,
          notes: member.office ? `Office: ${member.office}` : undefined,
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
            <Field label="District">
              <Input value={form.district ?? ""} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="e.g. TX-7" />
            </Field>
            {(form.level === "state") && (
              <Field label="State">
                <Select value={form.stateCode ?? ""} onChange={e => setForm(f => ({ ...f, stateCode: e.target.value }))}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </Select>
              </Field>
            )}
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
                      <VotingRecords official={o} />
                      <CampaignFinance official={o} />
                      <CampaignSpending official={o} />
                      <GovernmentSpending official={o} />
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
      <UpcomingElectionsPanel />
      <CivicElectionsLookup />

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
