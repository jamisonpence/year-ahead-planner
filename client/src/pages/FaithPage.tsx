import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Plus, Pencil, Trash2, X, Check, Search, ChevronDown, ChevronUp,
  ExternalLink, BookOpen, Flame, Heart, Mic2, MoreHorizontal, BookMarked,
  Tag, Calendar, User2, Lock, Users, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { SacredText, SavedPassage, FaithPractice, Sermon, PrayerItem } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────
type SubView = "texts" | "practices" | "teachings" | "prayer";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(s?: string | null) {
  if (!s) return "";
  try { return format(parseISO(s), "MMM d, yyyy"); } catch { return s; }
}

function parseTags(json?: string | null): string[] {
  try { return JSON.parse(json ?? "[]"); } catch { return []; }
}

function parsePassages(json?: string | null): SavedPassage[] {
  try { return JSON.parse(json ?? "[]"); } catch { return []; }
}

// ── Common Suggestions ────────────────────────────────────────────────────────
const PRACTICE_SUGGESTIONS = [
  "Prayer", "Meditation", "Fasting", "Sabbath", "Tithing",
  "Pilgrimage", "Breathwork", "Journaling", "Worship", "Serving",
];

// ── Bible API helpers ──────────────────────────────────────────────────────────
const REF_TRANSLATIONS = [
  { value: "kjv",  label: "KJV — King James" },
  { value: "web",  label: "WEB — World English" },
  { value: "asv",  label: "ASV — American Standard" },
  { value: "bbe",  label: "BBE — Basic English" },
  { value: "ylt",  label: "YLT — Young's Literal" },
];

const SEARCH_TRANSLATIONS = [
  { value: "KJV",  label: "KJV" },
  { value: "ESV",  label: "ESV" },
  { value: "NKJV", label: "NKJV" },
  { value: "NLT",  label: "NLT" },
  { value: "NIV",  label: "NIV" },
];

const BIBLE_BOOK_NAMES: Record<number, string> = {
  1:"Genesis",2:"Exodus",3:"Leviticus",4:"Numbers",5:"Deuteronomy",
  6:"Joshua",7:"Judges",8:"Ruth",9:"1 Samuel",10:"2 Samuel",
  11:"1 Kings",12:"2 Kings",13:"1 Chronicles",14:"2 Chronicles",
  15:"Ezra",16:"Nehemiah",17:"Esther",18:"Job",19:"Psalms",20:"Proverbs",
  21:"Ecclesiastes",22:"Song of Solomon",23:"Isaiah",24:"Jeremiah",
  25:"Lamentations",26:"Ezekiel",27:"Daniel",28:"Hosea",29:"Joel",
  30:"Amos",31:"Obadiah",32:"Jonah",33:"Micah",34:"Nahum",
  35:"Habakkuk",36:"Zephaniah",37:"Haggai",38:"Zechariah",39:"Malachi",
  40:"Matthew",41:"Mark",42:"Luke",43:"John",44:"Acts",
  45:"Romans",46:"1 Corinthians",47:"2 Corinthians",48:"Galatians",
  49:"Ephesians",50:"Philippians",51:"Colossians",52:"1 Thessalonians",
  53:"2 Thessalonians",54:"1 Timothy",55:"2 Timothy",56:"Titus",
  57:"Philemon",58:"Hebrews",59:"James",60:"1 Peter",61:"2 Peter",
  62:"1 John",63:"2 John",64:"3 John",65:"Jude",66:"Revelation",
};

const STATUS_COLORS: Record<string, string> = {
  "Active": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Exploring": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "Paused": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400",
  "Reading": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Want to Read": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400",
  "Answered": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};


// ── Sacred Text Modal ──────────────────────────────────────────────────────────
function TextModal({ text, onClose, onSave }: {
  text: SacredText | null;
  onClose: () => void;
  onSave: (data: Partial<SacredText>) => void;
}) {
  const [title, setTitle] = useState(text?.title ?? "");
  const [author, setAuthor] = useState(text?.author ?? "");
  const [tradition, setTradition] = useState(text?.tradition ?? "");
  const [translation, setTranslation] = useState(text?.translationVersion ?? "");
  const [status, setStatus] = useState(text?.status ?? "Want to Read");
  const [notes, setNotes] = useState(text?.personalNotes ?? "");
  const [coverUrl, setCoverUrl] = useState(text?.coverImageUrl ?? "");

  function handleSave() {
    if (!title.trim()) return;
    onSave({ title, author: author || null, tradition: tradition || null,
      translationVersion: translation || null, status,
      personalNotes: notes || null, coverImageUrl: coverUrl || null });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{text ? "Edit Text" : "Add Sacred Text"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Bhagavad Gita" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Author / Compiler</Label>
              <Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="e.g. Vyasa" />
            </div>
            <div className="space-y-1.5">
              <Label>Tradition</Label>
              <Input value={tradition} onChange={e => setTradition(e.target.value)} placeholder="e.g. Hindu, Sufi, Christian…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Translation / Version</Label>
              <Input value={translation} onChange={e => setTranslation(e.target.value)} placeholder="e.g. ESV, Sahih International…" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {["Want to Read", "Reading", "Completed"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cover Image URL</Label>
            <Input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>Personal Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Reflections, context, intentions…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim()}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Text Search Modal (Open Library) ──────────────────────────────────────────
function TextSearchModal({ onClose, onSelect }: {
  onClose: () => void;
  onSelect: (data: Partial<SacredText>) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ title: string; author: string; coverUrl: string | null; year: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      // Call Open Library directly — minimal URL, no fields filter (avoids 422)
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Open Library ${r.status}`);
      const data = await r.json() as any;
      const items = (data.docs ?? []).map((doc: any) => ({
        title: doc.title ?? "",
        author: (doc.author_name ?? []).join(", "),
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : "",
      }));
      setResults(items);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  if (showManual) {
    return <TextModal text={null} onClose={onClose} onSave={data => { onSelect(data); onClose(); }} />;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find a Sacred Text</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Search by title or author…" className="flex-1" />
            <Button onClick={search} disabled={loading}>
              {loading ? "…" : <Search size={14} />}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {results.map((r, i) => (
                <button key={i} onClick={() => { onSelect({ title: r.title, author: r.author, coverImageUrl: r.coverUrl }); onClose(); }}
                  className="flex items-center gap-3 w-full text-left p-2.5 rounded-lg border hover:bg-secondary/60 transition-colors">
                  {r.coverUrl ? (
                    <img src={r.coverUrl} alt={r.title} className="w-9 h-12 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-9 h-12 bg-stone-100 dark:bg-stone-800 rounded flex items-center justify-center shrink-0">
                      <BookOpen size={14} className="text-stone-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    {r.author && <p className="text-xs text-muted-foreground truncate">{r.author}</p>}
                    {r.year && <p className="text-xs text-muted-foreground">{r.year}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="pt-1 border-t">
            <button onClick={() => setShowManual(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Not found? Enter manually →
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Passage Modal (with Bible API search) ─────────────────────────────────────
function PassageModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (p: SavedPassage) => void;
}) {
  const [mode, setMode] = useState<"bible" | "manual">("bible");
  const [searchMode, setSearchMode] = useState<"reference" | "keyword">("reference");

  // Reference lookup (bible-api.com)
  const [refInput, setRefInput] = useState("");
  const [refTranslation, setRefTranslation] = useState("kjv");
  const [fetchedText, setFetchedText] = useState("");
  const [fetchedRef, setFetchedRef] = useState("");
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState("");

  // Keyword search (bolls.life)
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordTranslation, setKeywordTranslation] = useState("KJV");
  const [searchResults, setSearchResults] = useState<Array<{ book: number; chapter: number; verse: number; text: string }>>([]);
  const [selectedResult, setSelectedResult] = useState<{ book: number; chapter: number; verse: number; text: string } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Manual / shared notes
  const [passage, setPassage] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  async function lookupReference() {
    if (!refInput.trim()) return;
    setRefLoading(true); setRefError(""); setFetchedText(""); setFetchedRef("");
    try {
      const r = await fetch(`https://bible-api.com/${encodeURIComponent(refInput)}?translation=${refTranslation}`);
      if (!r.ok) throw new Error();
      const data = await r.json() as any;
      if (data.error) throw new Error(data.error);
      setFetchedText(data.text?.trim() ?? "");
      setFetchedRef(data.reference ?? refInput);
    } catch {
      setRefError("Passage not found. Try a different reference or translation.");
    }
    setRefLoading(false);
  }

  async function searchKeyword() {
    if (!keywordInput.trim()) return;
    setSearchLoading(true); setSearchError(""); setSearchResults([]); setSelectedResult(null);
    try {
      const r = await fetch(`https://bolls.life/search/${keywordTranslation}/${encodeURIComponent(keywordInput)}/`);
      if (!r.ok) throw new Error();
      const data = await r.json() as any[];
      if (!Array.isArray(data) || data.length === 0) throw new Error("none");
      setSearchResults(data.slice(0, 20));
    } catch (e: any) {
      setSearchError(e?.message === "none" ? "No results found. Try different search terms." : "Search failed. Please try again.");
    }
    setSearchLoading(false);
  }

  function handleSave() {
    let finalPassage = passage;
    let finalReference = reference;
    if (mode === "bible") {
      if (searchMode === "reference") {
        finalPassage = fetchedText;
        finalReference = fetchedRef || refInput;
      } else if (selectedResult) {
        const bookName = BIBLE_BOOK_NAMES[selectedResult.book] ?? `Book ${selectedResult.book}`;
        finalPassage = selectedResult.text;
        finalReference = `${bookName} ${selectedResult.chapter}:${selectedResult.verse} (${keywordTranslation})`;
      }
    }
    if (!finalPassage.trim()) return;
    onSave({ passage: finalPassage, reference: finalReference, notes });
    onClose();
  }

  const canSave = mode === "bible"
    ? (searchMode === "reference" ? !!fetchedText : !!selectedResult)
    : !!passage.trim();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Save a Passage</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">

          {/* Mode toggle */}
          <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-1">
            <button onClick={() => setMode("bible")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors
                ${mode === "bible" ? "bg-white dark:bg-stone-900 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <BookOpen size={12} /> Search Bible
            </button>
            <button onClick={() => setMode("manual")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors
                ${mode === "manual" ? "bg-white dark:bg-stone-900 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Pencil size={12} /> Enter Manually
            </button>
          </div>

          {mode === "bible" && (
            <>
              {/* Search sub-mode pills */}
              <div className="flex gap-2">
                {(["reference", "keyword"] as const).map(m => (
                  <button key={m} onClick={() => setSearchMode(m)}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors
                      ${searchMode === m
                        ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 border-transparent"
                        : "text-muted-foreground border-stone-200 dark:border-stone-700 hover:border-stone-400"}`}>
                    {m === "reference" ? "By Reference" : "By Keyword"}
                  </button>
                ))}
              </div>

              {searchMode === "reference" && (
                <div className="space-y-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label>Reference</Label>
                      <Input value={refInput} onChange={e => setRefInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && lookupReference()}
                        placeholder="e.g. John 3:16, Psalm 23, Romans 8:28-30" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Translation</Label>
                      <select value={refTranslation} onChange={e => setRefTranslation(e.target.value)}
                        className="h-9 rounded-md border bg-background px-2 text-sm">
                        {REF_TRANSLATIONS.map(t => <option key={t.value} value={t.value}>{t.label.split(" ")[0]}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button size="sm" onClick={lookupReference} disabled={refLoading || !refInput.trim()} className="w-full gap-1.5">
                    <Search size={13} /> {refLoading ? "Looking up…" : "Look Up Passage"}
                  </Button>
                  {refError && <p className="text-xs text-destructive">{refError}</p>}
                  {fetchedText && (
                    <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">{fetchedRef}</p>
                      <p className="text-sm leading-relaxed text-foreground italic">"{fetchedText}"</p>
                    </div>
                  )}
                </div>
              )}

              {searchMode === "keyword" && (
                <div className="space-y-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label>Search words or phrase</Label>
                      <Input value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && searchKeyword()}
                        placeholder="e.g. love one another, fear not, I am the" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Translation</Label>
                      <select value={keywordTranslation} onChange={e => setKeywordTranslation(e.target.value)}
                        className="h-9 rounded-md border bg-background px-2 text-sm">
                        {SEARCH_TRANSLATIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button size="sm" onClick={searchKeyword} disabled={searchLoading || !keywordInput.trim()} className="w-full gap-1.5">
                    <Search size={13} /> {searchLoading ? "Searching…" : "Search"}
                  </Button>
                  {searchError && <p className="text-xs text-destructive">{searchError}</p>}
                  {searchResults.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-lg border p-1">
                      <p className="text-[10px] text-muted-foreground px-2 pt-1">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — tap one to select</p>
                      {searchResults.map((r, i) => {
                        const bookName = BIBLE_BOOK_NAMES[r.book] ?? `Book ${r.book}`;
                        const ref = `${bookName} ${r.chapter}:${r.verse}`;
                        const isSel = selectedResult === r;
                        return (
                          <button key={i} onClick={() => setSelectedResult(isSel ? null : r)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors text-sm
                              ${isSel
                                ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700"
                                : "border-transparent hover:bg-secondary/60 hover:border-border"}`}>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">{ref}</p>
                            <p className="leading-relaxed line-clamp-3 text-xs">{r.text}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedResult && (
                    <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
                      <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                        {BIBLE_BOOK_NAMES[selectedResult.book]} {selectedResult.chapter}:{selectedResult.verse} ({keywordTranslation})
                      </p>
                      <p className="text-sm leading-relaxed italic">"{selectedResult.text}"</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === "manual" && (
            <>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="e.g. John 3:16, Quran 2:255, Dhammapada 1:1" />
              </div>
              <div className="space-y-1.5">
                <Label>Passage text</Label>
                <Textarea value={passage} onChange={e => setPassage(e.target.value)} rows={4} placeholder="Enter the passage…" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Your notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="What this means to you…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>Save Passage</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Text Detail View ───────────────────────────────────────────────────────────
function TextDetail({ text, onBack, onUpdated }: {
  text: SacredText;
  onBack: () => void;
  onUpdated: (t: SacredText) => void;
}) {
  const { toast } = useToast();
  const [passageModal, setPassageModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const passages = parsePassages(text.savedPassages);

  const updateMut = useMutation({
    mutationFn: (data: Partial<SacredText>) => apiRequest("PATCH", `/api/sacred-texts/${text.id}`, data).then(r => r.json()),
    onSuccess: (t) => { onUpdated(t); queryClient.invalidateQueries({ queryKey: ["/api/sacred-texts"] }); },
  });

  function addPassage(p: SavedPassage) {
    const updated = [...passages, p];
    updateMut.mutate({ savedPassages: JSON.stringify(updated) }, {
      onSuccess: () => toast({ title: "Passage saved" }),
    });
  }

  function deletePassage(idx: number) {
    const updated = passages.filter((_, i) => i !== idx);
    updateMut.mutate({ savedPassages: JSON.stringify(updated) });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          ← Back
        </button>
      </div>

      <div className="flex gap-5 items-start">
        {text.coverImageUrl ? (
          <img src={text.coverImageUrl} alt={text.title} className="w-20 rounded-lg shadow-sm shrink-0 object-cover" />
        ) : (
          <div className="w-20 h-28 bg-stone-100 dark:bg-stone-800 rounded-lg flex items-center justify-center shrink-0">
            <BookOpen size={24} className="text-stone-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">{text.title}</h2>
              {text.author && <p className="text-sm text-muted-foreground mt-0.5">{text.author}</p>}
            </div>
            <button onClick={() => setEditModal(true)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0">
              <Pencil size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[text.status] ?? "bg-stone-100 text-stone-700"}`}>
              {text.status}
            </span>
            {text.tradition && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                {text.tradition}
              </span>
            )}
            {text.translationVersion && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                {text.translationVersion}
              </span>
            )}
          </div>
        </div>
      </div>

      {text.personalNotes && (
        <div className="bg-stone-50 dark:bg-stone-900/40 rounded-xl p-4 border border-stone-100 dark:border-stone-800">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Personal Notes</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{text.personalNotes}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wide flex items-center gap-2">
            <BookMarked size={13} /> Saved Passages
          </h3>
          <button onClick={() => setPassageModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-secondary transition-colors text-muted-foreground">
            <Plus size={12} /> Save Passage
          </button>
        </div>

        {passages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <BookMarked size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No passages saved yet</p>
            <p className="text-xs mt-1">Save passages that speak to you</p>
          </div>
        ) : (
          <div className="space-y-3">
            {passages.map((p, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-2 group">
                <div className="flex items-start justify-between gap-2">
                  {p.reference && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{p.reference}</p>
                  )}
                  <button onClick={() => deletePassage(i)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <X size={12} />
                  </button>
                </div>
                <p className="text-sm leading-relaxed italic text-foreground">"{p.passage}"</p>
                {p.notes && <p className="text-xs text-muted-foreground border-t pt-2 mt-2">{p.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {passageModal && <PassageModal onClose={() => setPassageModal(false)} onSave={addPassage} />}
      {editModal && (
        <TextModal text={text} onClose={() => setEditModal(false)}
          onSave={data => updateMut.mutate(data, { onSuccess: () => setEditModal(false) })} />
      )}
    </div>
  );
}

// ── Sacred Texts Tab ───────────────────────────────────────────────────────────
function TextsTab() {
  const { toast } = useToast();
  const { data: texts = [] } = useQuery<SacredText[]>({
    queryKey: ["/api/sacred-texts"],
    queryFn: () => apiRequest("GET", "/api/sacred-texts").then(r => r.json()),
  });

  const [searchModal, setSearchModal] = useState(false);
  const [editText, setEditText] = useState<SacredText | null>(null);
  const [detailText, setDetailText] = useState<SacredText | null>(null);
  const [filterTradition, setFilterTradition] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const createMut = useMutation({
    mutationFn: (data: Partial<SacredText>) => apiRequest("POST", "/api/sacred-texts", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sacred-texts"] }); toast({ title: "Text added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Partial<SacredText> & { id: number }) =>
      apiRequest("PATCH", `/api/sacred-texts/${id}`, data).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sacred-texts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sacred-texts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sacred-texts"] }),
  });

  const traditions = useMemo(() => {
    const set = new Set(texts.map(t => t.tradition).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [texts]);

  const filtered = texts.filter(t =>
    (filterTradition === "all" || t.tradition === filterTradition) &&
    (filterStatus === "all" || t.status === filterStatus)
  );

  if (detailText) {
    const live = texts.find(t => t.id === detailText.id) ?? detailText;
    return <TextDetail text={live} onBack={() => setDetailText(null)} onUpdated={() => {}} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select value={filterTradition} onChange={e => setFilterTradition(e.target.value)}
            className="h-8 rounded-lg border bg-background px-3 text-xs">
            <option value="all">All traditions</option>
            {traditions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-8 rounded-lg border bg-background px-3 text-xs">
            <option value="all">All statuses</option>
            {["Want to Read", "Reading", "Completed"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={() => setSearchModal(true)} className="gap-1.5">
          <Plus size={13} /> Add Text
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen size={36} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No sacred texts yet</p>
          <p className="text-sm mt-1">Add a text to begin your study collection</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(text => (
            <div key={text.id}
              className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-all group cursor-pointer"
              onClick={() => setDetailText(text)}>
              <div className="flex gap-3 p-4">
                {text.coverImageUrl ? (
                  <img src={text.coverImageUrl} alt={text.title} className="w-12 h-16 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-12 h-16 bg-stone-100 dark:bg-stone-800 rounded flex items-center justify-center shrink-0">
                    <BookOpen size={16} className="text-stone-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-semibold leading-tight">{text.title}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button onClick={e => e.stopPropagation()}
                          className="p-1 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <MoreHorizontal size={13} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditText(text); }}>
                          <Pencil size={13} className="mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive"
                          onClick={e => { e.stopPropagation(); deleteMut.mutate(text.id); }}>
                          <Trash2 size={13} className="mr-2" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {text.author && <p className="text-xs text-muted-foreground mt-0.5 truncate">{text.author}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[text.status] ?? ""}`}>
                      {text.status}
                    </span>
                    {text.tradition && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        {text.tradition}
                      </span>
                    )}
                  </div>
                  {parsePassages(text.savedPassages).length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <BookMarked size={9} /> {parsePassages(text.savedPassages).length} passage{parsePassages(text.savedPassages).length !== 1 ? "s" : ""} saved
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {searchModal && (
        <TextSearchModal onClose={() => setSearchModal(false)}
          onSelect={data => createMut.mutate(data)} />
      )}
      {editText && (
        <TextModal text={editText} onClose={() => setEditText(null)}
          onSave={data => updateMut.mutate({ ...data, id: editText.id })} />
      )}
    </div>
  );
}

// ── Practices Tab ──────────────────────────────────────────────────────────────
function PracticesTab() {
  const { toast } = useToast();
  const { data: practices = [] } = useQuery<FaithPractice[]>({
    queryKey: ["/api/faith-practices"],
    queryFn: () => apiRequest("GET", "/api/faith-practices").then(r => r.json()),
  });

  const [modal, setModal] = useState(false);
  const [editPractice, setEditPractice] = useState<FaithPractice | null>(null);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("Daily");
  const [dateStarted, setDateStarted] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");

  function openNew() {
    setEditPractice(null); setName(""); setFrequency("Daily");
    setDateStarted(""); setStatus("Active"); setNotes(""); setModal(true);
  }
  function openEdit(p: FaithPractice) {
    setEditPractice(p); setName(p.name); setFrequency(p.frequency ?? "Daily");
    setDateStarted(p.dateStarted ?? ""); setStatus(p.status); setNotes(p.personalNotes ?? "");
    setModal(true);
  }

  const createMut = useMutation({
    mutationFn: (data: Partial<FaithPractice>) => apiRequest("POST", "/api/faith-practices", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/faith-practices"] }); toast({ title: "Practice added" }); setModal(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Partial<FaithPractice> & { id: number }) =>
      apiRequest("PATCH", `/api/faith-practices/${id}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/faith-practices"] }); setModal(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/faith-practices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/faith-practices"] }),
  });

  function handleSave() {
    if (!name.trim()) return;
    const data = { name, frequency: frequency || null, dateStarted: dateStarted || null, status, personalNotes: notes || null };
    if (editPractice) updateMut.mutate({ ...data, id: editPractice.id });
    else createMut.mutate(data);
  }

  const active = practices.filter(p => p.status === "Active");
  const exploring = practices.filter(p => p.status === "Exploring");
  const paused = practices.filter(p => p.status === "Paused");

  function PracticeCard({ p }: { p: FaithPractice }) {
    return (
      <div className="flex items-start justify-between gap-3 p-4 rounded-xl border bg-card group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{p.name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</span>
            {p.frequency && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">{p.frequency}</span>
            )}
          </div>
          {p.dateStarted && <p className="text-xs text-muted-foreground mt-1">Started {fmtDate(p.dateStarted)}</p>}
          {p.personalNotes && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{p.personalNotes}</p>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><Pencil size={13} /></button>
          <button onClick={() => deleteMut.mutate(p.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>
    );
  }

  function Section({ title, items }: { title: string; items: FaithPractice[] }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {items.map(p => <PracticeCard key={p.id} p={p} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} /> Add Practice</Button>
      </div>

      {practices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Flame size={36} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No practices yet</p>
          <p className="text-sm mt-1">Track the spiritual disciplines that matter to you</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Active" items={active} />
          <Section title="Exploring" items={exploring} />
          <Section title="Paused" items={paused} />
        </div>
      )}

      <Dialog open={modal} onOpenChange={() => setModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPractice ? "Edit Practice" : "Add a Practice"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Practice name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning Prayer, Meditation…" />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PRACTICE_SUGGESTIONS.filter(s => !name || s.toLowerCase().includes(name.toLowerCase())).map(s => (
                  <button key={s} onClick={() => setName(s)}
                    className="text-xs px-2.5 py-1 rounded-full border hover:bg-secondary transition-colors text-muted-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <select value={frequency} onChange={e => setFrequency(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {["Daily", "Weekly", "Monthly", "Occasionally"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {["Active", "Exploring", "Paused"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date started</Label>
              <Input type="date" value={dateStarted} onChange={e => setDateStarted(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Personal notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Intentions, reflections, context…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!name.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Teachings Tab ──────────────────────────────────────────────────────────────
function TeachingsTab() {
  const { toast } = useToast();
  const { data: items = [] } = useQuery<Sermon[]>({
    queryKey: ["/api/sermons"],
    queryFn: () => apiRequest("GET", "/api/sermons").then(r => r.json()),
  });

  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<Sermon | null>(null);
  const [filterSpeaker, setFilterSpeaker] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");

  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [takeaways, setTakeaways] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Scripture reference lookup within the teaching modal
  const [scriptureRef, setScriptureRef] = useState("");
  const [scriptureTrans, setScriptureTrans] = useState("kjv");
  const [scriptureText, setScriptureText] = useState("");
  const [scriptureLoading, setScriptureLoading] = useState(false);
  const [scriptureError, setScriptureError] = useState("");

  async function lookupScripture() {
    if (!scriptureRef.trim()) return;
    setScriptureLoading(true); setScriptureError(""); setScriptureText("");
    try {
      const r = await fetch(`https://bible-api.com/${encodeURIComponent(scriptureRef)}?translation=${scriptureTrans}`);
      if (!r.ok) throw new Error();
      const data = await r.json() as any;
      if (data.error) throw new Error(data.error);
      setScriptureText(data.text?.trim() ?? "");
    } catch {
      setScriptureError("Passage not found.");
    }
    setScriptureLoading(false);
  }

  function addScriptureToNotes() {
    if (!scriptureText) return;
    const line = `${scriptureRef.trim()}: "${scriptureText}"`;
    setNotes(prev => prev ? `${prev}\n\n${line}` : line);
    setScriptureRef(""); setScriptureText(""); setScriptureError("");
    toast({ title: "Scripture added to notes" });
  }

  function addScriptureToTakeaways() {
    if (!scriptureText) return;
    const line = `${scriptureRef.trim()}: "${scriptureText}"`;
    setTakeaways(prev => prev ? `${prev}\n${line}` : line);
    setScriptureRef(""); setScriptureText(""); setScriptureError("");
    toast({ title: "Scripture added to takeaways" });
  }

  function resetScripture() {
    setScriptureRef(""); setScriptureText(""); setScriptureError(""); setScriptureLoading(false);
  }
  function openNew() {
    setEditItem(null); setTitle(""); setSpeaker(""); setSource(""); setSourceUrl("");
    setDate(""); setTopic(""); setTakeaways(""); setNotes(""); setTags([]); setTagInput("");
    resetScripture(); setModal(true);
  }
  function openEdit(s: Sermon) {
    setEditItem(s); setTitle(s.title); setSpeaker(s.speaker ?? ""); setSource(s.source ?? "");
    setSourceUrl(s.sourceUrl ?? ""); setDate(s.date ?? ""); setTopic(s.topic ?? "");
    setTakeaways(s.keyTakeaways ?? ""); setNotes(s.personalNotes ?? "");
    setTags(parseTags(s.tags)); setTagInput(""); resetScripture(); setModal(true);
  }

  const createMut = useMutation({
    mutationFn: (data: Partial<Sermon>) => apiRequest("POST", "/api/sermons", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sermons"] }); toast({ title: "Teaching saved" }); setModal(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Partial<Sermon> & { id: number }) =>
      apiRequest("PATCH", `/api/sermons/${id}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sermons"] }); setModal(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sermons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sermons"] }),
  });

  function handleSave() {
    if (!title.trim()) return;
    const data = { title, speaker: speaker || null, source: source || null, sourceUrl: sourceUrl || null,
      date: date || null, topic: topic || null, keyTakeaways: takeaways || null,
      personalNotes: notes || null, tags: JSON.stringify(tags) };
    if (editItem) updateMut.mutate({ ...data, id: editItem.id });
    else createMut.mutate(data);
  }

  function addTag(t: string) {
    const clean = t.trim().toLowerCase();
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setTagInput("");
  }

  const allSpeakers = useMemo(() => Array.from(new Set(items.map(i => i.speaker).filter(Boolean) as string[])).sort(), [items]);
  const allTags = useMemo(() => Array.from(new Set(items.flatMap(i => parseTags(i.tags)))).sort(), [items]);

  const filtered = items.filter(i =>
    (filterSpeaker === "all" || i.speaker === filterSpeaker) &&
    (filterTag === "all" || parseTags(i.tags).includes(filterTag))
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {allSpeakers.length > 0 && (
            <select value={filterSpeaker} onChange={e => setFilterSpeaker(e.target.value)}
              className="h-8 rounded-lg border bg-background px-3 text-xs">
              <option value="all">All teachers</option>
              {allSpeakers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {allTags.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              className="h-8 rounded-lg border bg-background px-3 text-xs">
              <option value="all">All topics</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} /> Add Teaching</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mic2 size={36} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No teachings saved yet</p>
          <p className="text-sm mt-1">Log sermons, lectures, or talks that moved you</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.id} className="rounded-xl border bg-card p-4 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {item.speaker && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User2 size={10} /> {item.speaker}
                      </span>
                    )}
                    {item.source && (
                      <span className="text-xs text-muted-foreground">{item.source}</span>
                    )}
                    {item.date && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar size={10} /> {fmtDate(item.date)}
                      </span>
                    )}
                  </div>
                  {item.topic && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{item.topic}</p>
                  )}
                  {parseTags(item.tags).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parseTags(item.tags).map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.keyTakeaways && (
                    <div className="mt-3 space-y-1">
                      {item.keyTakeaways.split("\n").filter(Boolean).map((line, i) => (
                        <p key={i} className="text-xs text-foreground leading-relaxed flex gap-2">
                          <span className="text-muted-foreground shrink-0">—</span>
                          <span>{line.replace(/^[-•]\s*/, "")}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {item.personalNotes && (
                    <p className="text-xs text-muted-foreground mt-2 border-t pt-2 leading-relaxed">{item.personalNotes}</p>
                  )}
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2" onClick={e => e.stopPropagation()}>
                      <ExternalLink size={10} /> Open source
                    </a>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><Pencil size={13} /></button>
                  <button onClick={() => deleteMut.mutate(item.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={() => setModal(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit Teaching" : "Add a Teaching"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Beatitudes, On Forgiveness…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Teacher / Speaker</Label>
                <Input value={speaker} onChange={e => setSpeaker(e.target.value)} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Church, Podcast, YouTube…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Topic</Label>
                <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Grace, Prayer, Community…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Source URL</Label>
              <Input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" />
            </div>

            {/* ── Scripture Bible Lookup ─────────────────────────────────────── */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/10 p-3 space-y-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <BookOpen size={12} /> Bible Scripture Lookup
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Reference</Label>
                  <Input value={scriptureRef} onChange={e => setScriptureRef(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && lookupScripture()}
                    placeholder="e.g. Romans 8:28, Isaiah 40:31" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Translation</Label>
                  <select value={scriptureTrans} onChange={e => setScriptureTrans(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs">
                    {REF_TRANSLATIONS.map(t => <option key={t.value} value={t.value}>{t.label.split(" ")[0]}</option>)}
                  </select>
                </div>
                <Button size="sm" variant="outline" onClick={lookupScripture}
                  disabled={scriptureLoading || !scriptureRef.trim()} className="h-8 px-2.5">
                  <Search size={13} />
                </Button>
              </div>
              {scriptureError && <p className="text-xs text-destructive">{scriptureError}</p>}
              {scriptureText && (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed italic text-foreground">
                    <span className="font-semibold not-italic text-amber-700 dark:text-amber-400">{scriptureRef} — </span>
                    "{scriptureText}"
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={addScriptureToTakeaways} className="text-xs h-7 px-2.5 gap-1">
                      <Plus size={11} /> Add to Takeaways
                    </Button>
                    <Button size="sm" variant="outline" onClick={addScriptureToNotes} className="text-xs h-7 px-2.5 gap-1">
                      <Plus size={11} /> Add to Notes
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Key takeaways</Label>
              <Textarea value={takeaways} onChange={e => setTakeaways(e.target.value)} rows={4}
                placeholder={"One per line:\nGod meets us in our weakness\nFear is the opposite of faith"} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="grace, suffering, purpose… press Enter" className="flex-1" />
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tags.map(t => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {t}
                      <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-foreground"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Personal notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="How this resonated with you…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!title.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Prayer List Tab ────────────────────────────────────────────────────────────
function PrayerTab() {
  const { toast } = useToast();
  const { data: items = [] } = useQuery<PrayerItem[]>({
    queryKey: ["/api/prayer-items"],
    queryFn: () => apiRequest("GET", "/api/prayer-items").then(r => r.json()),
  });

  const [addModal, setAddModal] = useState(false);
  const [answerModal, setAnswerModal] = useState<PrayerItem | null>(null);
  const [answeredOpen, setAnsweredOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [answerDate, setAnswerDate] = useState(new Date().toISOString().slice(0, 10));
  const [answerReflection, setAnswerReflection] = useState("");

  const createMut = useMutation({
    mutationFn: (data: { description: string; notes?: string }) =>
      apiRequest("POST", "/api/prayer-items", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/prayer-items"] }); toast({ title: "Added to prayer list" }); setAddModal(false); setDesc(""); setNotes(""); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Partial<PrayerItem> & { id: number }) =>
      apiRequest("PATCH", `/api/prayer-items/${id}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/prayer-items"] }); setAnswerModal(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayer-items"] }),
  });

  function markAnswered() {
    if (!answerModal) return;
    updateMut.mutate({ id: answerModal.id, status: "Answered",
      dateAnswered: answerDate, answerReflection: answerReflection || null },
      { onSuccess: () => toast({ title: "Marked as answered 🙏" }) }
    );
  }

  const active = items.filter(p => p.status === "Active");
  const answered = items.filter(p => p.status === "Answered");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddModal(true)} className="gap-1.5"><Plus size={13} /> Add to Prayer List</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Heart size={36} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">Your prayer list is empty</p>
          <p className="text-sm mt-1">Add people and intentions to carry with you</p>
        </div>
      ) : (
        <>
          {/* Active Prayers */}
          <div className="space-y-2">
            {active.length > 0 && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active — {active.length} {active.length === 1 ? "item" : "items"}
              </p>
            )}
            {active.map(item => (
              <div key={item.id} className="rounded-xl border bg-card p-4 group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{item.description}</p>
                    {item.notes && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.notes}</p>}
                    <p className="text-[10px] text-muted-foreground mt-2 opacity-60">Added {fmtDate(item.dateAdded)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setAnswerDate(new Date().toISOString().slice(0, 10)); setAnswerReflection(""); setAnswerModal(item); }}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center gap-1">
                      <Check size={11} /> Answered
                    </button>
                    <button onClick={() => deleteMut.mutate(item.id)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Answered Prayers — collapsible */}
          {answered.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <button onClick={() => setAnsweredOpen(x => !x)}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-secondary/40 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <Heart size={13} className="fill-current" />
                  Answered Prayers — {answered.length}
                </span>
                {answeredOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </button>
              {answeredOpen && (
                <div className="divide-y">
                  {answered.map(item => (
                    <div key={item.id} className="p-4 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed">{item.description}</p>
                          {item.dateAnswered && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                              <Check size={10} /> Answered {fmtDate(item.dateAnswered)}
                            </p>
                          )}
                          {item.answerReflection && (
                            <p className="text-xs text-muted-foreground mt-2 border-t pt-2 leading-relaxed italic">"{item.answerReflection}"</p>
                          )}
                        </div>
                        <button onClick={() => deleteMut.mutate(item.id)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Prayer Modal */}
      <Dialog open={addModal} onOpenChange={setAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add to Prayer List</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Who or what are you praying for? *</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                placeholder="e.g. My mother's health, Peace in our community, Wisdom in a decision I'm facing…" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any context or specific requests…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setAddModal(false)}>Cancel</Button>
              <Button onClick={() => createMut.mutate({ description: desc, notes: notes || undefined })} disabled={!desc.trim()}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Answered Modal */}
      {answerModal && (
        <Dialog open onOpenChange={() => setAnswerModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Mark as Answered</DialogTitle></DialogHeader>
            <div className="space-y-4 py-1">
              <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-900/40 border text-sm text-muted-foreground leading-relaxed">
                {answerModal.description}
              </div>
              <div className="space-y-1.5">
                <Label>Date answered</Label>
                <Input type="date" value={answerDate} onChange={e => setAnswerDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reflection</Label>
                <Textarea value={answerReflection} onChange={e => setAnswerReflection(e.target.value)} rows={3}
                  placeholder="How was this answered? What did you notice or learn?" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setAnswerModal(null)}>Cancel</Button>
                <Button onClick={markAnswered}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Privacy Banner ─────────────────────────────────────────────────────────────
function FaithPrivacyBanner() {
  const { data: settings = [] } = useQuery<{ path: string; visibility: string }[]>({
    queryKey: ["/api/tab-privacy"],
    queryFn: () => apiRequest("GET", "/api/tab-privacy").then(r => r.json()),
  });
  const visibility = settings.find(s => s.path === "/faith")?.visibility ?? "private";
  const isPublic = visibility === "friends";

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs border ${
      isPublic
        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
        : "bg-stone-100 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400"
    }`}>
      <div className="flex items-center gap-1.5">
        {isPublic
          ? <Users size={12} className="shrink-0" />
          : <Lock size={12} className="shrink-0" />}
        <span>
          {isPublic
            ? "Visible to friends on your profile — Sacred Texts, Practices, and Teachings are shared (Prayer List is always private)"
            : "Private — only visible to you"}
        </span>
      </div>
      <Link href="/settings">
        <a className="flex items-center gap-1 font-medium hover:underline shrink-0 whitespace-nowrap">
          <Settings size={11} />
          Change in Settings
        </a>
      </Link>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function FaithPage() {
  const [subView, setSubView] = useState<SubView>("texts");

  const TABS: { id: SubView; label: string; icon: React.ReactNode }[] = [
    { id: "texts",     label: "Sacred Texts",        icon: <BookOpen size={14} /> },
    { id: "practices", label: "Practices",           icon: <Flame size={14} /> },
    { id: "teachings", label: "Teachings",           icon: <Mic2 size={14} /> },
    { id: "prayer",    label: "Prayer List",         icon: <Heart size={14} /> },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <Flame className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Faith & Spirituality</h1>
          <p className="text-xs text-muted-foreground">Personal curation of your spiritual life</p>
        </div>
      </div>

      <FaithPrivacyBanner />

      {/* Sub-navigation */}
      <div className="flex gap-1.5 flex-wrap border-b pb-3">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setSubView(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${subView === tab.id
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-muted-foreground hover:text-foreground hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subView === "texts"     && <TextsTab />}
      {subView === "practices" && <PracticesTab />}
      {subView === "teachings" && <TeachingsTab />}
      {subView === "prayer"    && <PrayerTab />}
    </div>
  );
}
