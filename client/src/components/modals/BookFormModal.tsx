import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BOOK_STATUSES, GENRE_TAGS, COVER_COLORS } from "@/lib/plannerUtils";
import { Search, X, BookOpen, Loader2 } from "lucide-react";
import type { Book, InsertBook } from "@shared/schema";

// ── Google Books / Open Library search ───────────────────────────────────────

interface SearchResult {
  id: string;
  title: string;
  author: string;
  year?: string;
  pageCount?: number;
  genre?: string;
  coverUrl?: string;
}

async function searchBooks(q: string): Promise<SearchResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  // Google Books first
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(trimmed)}&maxResults=8&printType=books`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json() as any;
      const items: SearchResult[] = (data.items ?? []).map((v: any) => {
        const vi = v.volumeInfo ?? {};
        const rawThumb = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || "";
        return {
          id: v.id,
          title: vi.title ?? "Unknown Title",
          author: (vi.authors ?? []).join(", "),
          year: vi.publishedDate?.slice(0, 4),
          pageCount: vi.pageCount ?? undefined,
          genre: vi.categories?.[0] ?? undefined,
          coverUrl: rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined,
        };
      });
      return items;
    }
  } catch (_) { /* fall through to Open Library */ }

  // Open Library fallback
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&limit=8`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json() as any;
      return (data.docs ?? []).slice(0, 8).map((doc: any) => ({
        id: doc.key ?? String(Math.random()),
        title: doc.title ?? "Unknown Title",
        author: (doc.author_name ?? []).join(", "),
        year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        pageCount: doc.number_of_pages_median ?? undefined,
        genre: doc.subject?.[0] ?? undefined,
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
      }));
    }
  } catch (_) { /* ignore */ }

  return [];
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function BookFormModal({ open, onClose, editBook }: {
  open: boolean; onClose: () => void; editBook: Book | null;
}) {
  const { toast } = useToast();

  // ── Form fields ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("backlog");
  const [totalPages, setTotalPages] = useState("");
  const [pagesRead, setPagesRead] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [coverUrl, setCoverUrl] = useState("");

  // ── Search state (only for new books) ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTitle(editBook?.title ?? ""); setAuthor(editBook?.author ?? "");
      setSeries(editBook?.series ?? ""); setGenre(editBook?.genre ?? "");
      setStatus(editBook?.status ?? "backlog");
      setTotalPages(editBook?.totalPages?.toString() ?? "");
      setPagesRead(editBook?.pagesRead?.toString() ?? "0");
      setStartDate(editBook?.startDate ?? ""); setTargetDate(editBook?.targetFinishDate ?? "");
      setNotes(editBook?.notes ?? ""); setCoverColor(editBook?.coverColor ?? COVER_COLORS[0]);
      setCoverUrl((editBook as any)?.coverUrl ?? "");
      // Reset search state
      setSearchQuery(""); setSearchResults([]); setSelectedResult(null); setDropdownOpen(false);
    }
  }, [open, editBook]);

  // ── Debounced search ─────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setDropdownOpen(false); return; }
    setSearchLoading(true);
    try {
      const results = await searchBooks(q);
      setSearchResults(results);
      setDropdownOpen(results.length > 0);
    } catch (_) {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchResults([]); setDropdownOpen(false); return; }
    debounceRef.current = setTimeout(() => runSearch(val), 450);
  }

  function selectResult(r: SearchResult) {
    setSelectedResult(r);
    setDropdownOpen(false);
    setSearchQuery("");
    // Autofill fields
    setTitle(r.title);
    setAuthor(r.author);
    if (r.genre) {
      // Match to a known genre tag if possible
      const matched = GENRE_TAGS.find(g => g.toLowerCase() === (r.genre ?? "").toLowerCase());
      setGenre(matched ?? "");
    }
    if (r.pageCount) setTotalPages(String(r.pageCount));
    if (r.coverUrl) setCoverUrl(r.coverUrl);
  }

  function clearSelection() {
    setSelectedResult(null);
    setTitle(""); setAuthor(""); setGenre(""); setTotalPages(""); setCoverUrl("");
  }

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/books"] });
  const createMut = useMutation({
    mutationFn: (d: InsertBook) => apiRequest("POST", "/api/books", d),
    onSuccess: () => { inv(); toast({ title: "Book added" }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertBook>) => apiRequest("PATCH", `/api/books/${editBook?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Book updated" }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const p: InsertBook = {
      title: title.trim(), author: author.trim() || null, series: series.trim() || null,
      seriesNumber: null, genre: genre || null, status,
      totalPages: totalPages ? parseInt(totalPages) : null,
      pagesRead: parseInt(pagesRead) || 0,
      startDate: startDate || null, targetFinishDate: targetDate || null,
      finishDate: status === "finished" && !editBook?.finishDate ? new Date().toISOString().split("T")[0] : editBook?.finishDate ?? null,
      notes: notes.trim() || null, highlights: null, linkedGoalId: null, coverColor,
      coverUrl: coverUrl || null,
    };
    editBook ? updateMut.mutate(p) : createMut.mutate(p);
  };

  const isAdding = !editBook;
  const isBusy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg flex flex-col h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] sm:h-auto sm:max-h-[92dvh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b">
          <DialogTitle>{editBook ? "Edit Book" : "Add Book"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

            {/* ── Search (new books only) ─────────────────────────────────── */}
            {isAdding && (
              <div className="space-y-1.5" ref={searchRef}>
                <Label>Search for a book</Label>

                {selectedResult ? (
                  /* Selected book chip */
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border bg-secondary/40">
                    {selectedResult.coverUrl ? (
                      <img src={selectedResult.coverUrl} alt={selectedResult.title}
                        className="w-9 h-12 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-9 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                        <BookOpen size={14} className="opacity-30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{selectedResult.title}</p>
                      {selectedResult.author && (
                        <p className="text-xs text-muted-foreground truncate">{selectedResult.author}</p>
                      )}
                      {(selectedResult.year || selectedResult.pageCount) && (
                        <p className="text-xs text-muted-foreground">
                          {[selectedResult.year, selectedResult.pageCount && `${selectedResult.pageCount}p`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={clearSelection}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  /* Search input + dropdown */
                  <div className="relative">
                    <div className="relative flex items-center">
                      {searchLoading
                        ? <Loader2 size={14} className="absolute left-2.5 text-muted-foreground animate-spin" />
                        : <Search size={14} className="absolute left-2.5 text-muted-foreground" />
                      }
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => handleSearchChange(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setDropdownOpen(true)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (searchQuery.trim()) runSearch(searchQuery); } }}
                        placeholder="Title, author, or ISBN…"
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
                      />
                    </div>

                    {/* Dropdown */}
                    {dropdownOpen && searchResults.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                        {searchResults.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectResult(r)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/70 text-left transition-colors border-b last:border-0"
                          >
                            {r.coverUrl ? (
                              <img src={r.coverUrl} alt={r.title} className="w-8 h-11 object-cover rounded shrink-0" />
                            ) : (
                              <div className="w-8 h-11 rounded bg-muted flex items-center justify-center shrink-0">
                                <BookOpen size={12} className="opacity-30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate leading-tight">{r.title}</p>
                              {r.author && <p className="text-xs text-muted-foreground truncate">{r.author}</p>}
                              <p className="text-xs text-muted-foreground">
                                {[r.year, r.pageCount && `${r.pageCount}p`].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Divider */}
                {!selectedResult && (
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Select a result to autofill, or fill in the fields below manually.
                  </p>
                )}
              </div>
            )}

            {/* ── Fields ─────────────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-400">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Book title" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Author</Label><Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author name" /></div>
              <div className="space-y-1.5"><Label>Series</Label><Input value={series} onChange={e => setSeries(e.target.value)} placeholder="Series name" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Genre</Label>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
                  <SelectContent>{GENRE_TAGS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOOK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Total Pages</Label><Input type="number" value={totalPages} onChange={e => setTotalPages(e.target.value)} placeholder="300" /></div>
              <div className="space-y-1.5"><Label>Pages Read</Label><Input type="number" value={pagesRead} onChange={e => setPagesRead(e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Target Finish</Label><Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Cover Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COVER_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setCoverColor(c)}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${coverColor === c ? "border-primary scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          </div>

          <div className="sticky bottom-0 flex gap-2 px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] border-t shrink-0 bg-background">
            <Button type="submit" disabled={isBusy || !title.trim()} className="flex-1">
              {isBusy ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {editBook ? "Save Changes" : "Add Book"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
