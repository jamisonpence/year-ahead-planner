import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, BookOpen, BookMarked, Check, Trash2, Pencil, MoreHorizontal,
  Flame, Search, Clock, X, Send, Users, Inbox, CornerUpRight, Target,
  Calendar, ChevronRight, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { bookProgress, daysUntil, BOOK_STATUSES, GENRE_TAGS, readingStreak } from "@/lib/plannerUtils";
import BookFormModal from "@/components/modals/BookFormModal";
import ReadingSessionModal from "@/components/modals/ReadingSessionModal";
import type { BookWithSessions, Book, ReadingSession, BookRecommendationWithUser, PublicUser, ReadingGoal } from "@shared/schema";

const STATUS_TABS = [
  { value: "current",  label: "Reading"   },
  { value: "backlog",  label: "Up Next"   },
  { value: "paused",   label: "Paused"    },
  { value: "finished", label: "Finished"  },
  { value: "recommendations", label: "Recommendations" },
];

// ── Book Search Modal (Open Library) ─────────────────────────────────────────
interface GBVolume {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    description?: string;
  };
}

function GoogleBooksModal({
  open, onClose, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: any) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GBVolume[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setAddedIds(new Set()); }
  }, [open]);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true);
    let lastErr = "";
    try {
      // ── Try 1: Google Books (most reliable, no auth required) ────────────────
      try {
        const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query.trim())}&maxResults=20&printType=books`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const gbRes = await fetch(gbUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!gbRes.ok) throw new Error(`GB:${gbRes.status}`);
        const gbData = await gbRes.json() as any;
        const gbNorm: GBVolume[] = (gbData.items ?? []).map((v: any) => ({
          id: v.id,
          volumeInfo: {
            title: v.volumeInfo?.title ?? "Unknown Title",
            authors: v.volumeInfo?.authors ?? [],
            publishedDate: v.volumeInfo?.publishedDate,
            pageCount: v.volumeInfo?.pageCount,
            categories: v.volumeInfo?.categories,
            imageLinks: v.volumeInfo?.imageLinks ? {
              thumbnail: (v.volumeInfo.imageLinks.thumbnail ?? v.volumeInfo.imageLinks.smallThumbnail ?? "").replace(/^http:\/\//, "https://"),
            } : undefined,
          },
        }));
        setResults(gbNorm);
        return;
      } catch (e: any) {
        lastErr = e?.name === "AbortError" ? "GB timeout" : String(e?.message ?? e);
        console.warn("[book-search] Google Books failed:", lastErr, "— trying Open Library");
      }

      // ── Try 2: Open Library fallback ─────────────────────────────────────────
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query.trim())}&limit=20`;
      const olCtrl = new AbortController();
      const olT = setTimeout(() => olCtrl.abort(), 10000);
      const olRes = await fetch(olUrl, { signal: olCtrl.signal });
      clearTimeout(olT);
      if (!olRes.ok) throw new Error(`OL:${olRes.status}`);
      const olData = await olRes.json() as any;
      const olNorm: GBVolume[] = (olData.docs ?? []).map((doc: any) => ({
        id: doc.key ?? doc.isbn?.[0] ?? String(Math.random()),
        volumeInfo: {
          title: doc.title ?? "Unknown Title",
          authors: doc.author_name ?? [],
          publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
          pageCount: doc.number_of_pages_median ?? undefined,
          categories: doc.subject ? [doc.subject[0]] : undefined,
          imageLinks: doc.cover_i ? { thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` } : undefined,
        },
      }));
      setResults(olNorm);
    } catch (e: any) {
      const reason = lastErr || String(e?.message ?? e);
      console.error("[book-search] Both sources failed:", reason);
      toast({ title: "Search failed", description: `Book search unavailable (${reason}). Try again in a moment.`, variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function addBook(vol: GBVolume) {
    setAddingId(vol.id);
    try {
      const info = vol.volumeInfo;
      const rawThumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
      // Google returns http:// — upgrade to https://
      const coverUrl = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : null;
      const year = (info.publishedDate || "").slice(0, 4);
      const category = info.categories?.[0] ?? null;

      const payload = {
        title: info.title,
        author: info.authors?.join(", ") || null,
        series: null,
        seriesNumber: null,
        genre: category ?? null,
        status: "backlog",
        totalPages: info.pageCount || null,
        pagesRead: 0,
        startDate: null,
        targetFinishDate: null,
        finishDate: null,
        notes: null,
        highlights: null,
        linkedGoalId: null,
        coverColor: null,
        coverUrl,
      };

      onAdd(payload);
      setAddedIds((prev) => new Set([...prev, vol.id]));
      toast({ title: `✓ Added "${info.title}"` });
    } catch {
      toast({ title: "Failed to add book", variant: "destructive" });
    } finally { setAddingId(null); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen size={16} /> Find Books
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0 border-b">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search by title, author, or ISBN…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              />
            </div>
            <Button size="sm" onClick={doSearch} disabled={loading || !query.trim()}>
              {loading ? <Clock size={14} className="animate-spin" /> : "Search"}
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-muted animate-pulse h-52" />
              ))}
            </div>
          )}
          {!loading && results.length === 0 && query && (
            <div className="text-center py-10 text-muted-foreground text-sm">No results found.</div>
          )}
          {!loading && results.length === 0 && !query && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <BookOpen size={36} className="mx-auto mb-2 opacity-20" />
              Search for books to add them to your reading list.
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {results.map((vol) => {
                const info = vol.volumeInfo;
                const thumb = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
                  .replace(/^http:\/\//, "https://");
                const added = addedIds.has(vol.id);
                const isAdding = addingId === vol.id;
                return (
                  <div key={vol.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                    {thumb ? (
                      <img src={thumb} alt={info.title} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-muted flex items-center justify-center">
                        <BookOpen size={28} className="opacity-20" />
                      </div>
                    )}
                    <div className="p-2 flex flex-col flex-1">
                      <p className="text-xs font-semibold line-clamp-2 leading-tight">{info.title}</p>
                      {info.authors && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{info.authors.join(", ")}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {info.publishedDate && (
                          <span className="text-[10px] text-muted-foreground">{info.publishedDate.slice(0, 4)}</span>
                        )}
                        {info.pageCount && (
                          <span className="text-[10px] text-muted-foreground">{info.pageCount}p</span>
                        )}
                      </div>
                      <button
                        onClick={() => !added && addBook(vol)}
                        disabled={added || isAdding}
                        className={`mt-auto mt-2 w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors ${
                          added
                            ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                            : "hover:bg-secondary"
                        }`}
                      >
                        {isAdding ? <Clock size={12} className="animate-spin" /> : added ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ user }: { user: { name: string; avatarUrl?: string | null } }) {
  if (user.avatarUrl) return <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Recommend Modal ───────────────────────────────────────────────────────────
function RecommendModal({ open, onClose, book }: {
  open: boolean;
  onClose: () => void;
  book: BookWithSessions | null;
}) {
  const { toast } = useToast();
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friends"); return r.json(); },
    enabled: open,
  });

  useEffect(() => {
    if (open) { setSelectedFriendId(null); setNote(""); }
  }, [open, book]);

  const sendMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/book-recommendations", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/book-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: `Recommended "${book?.title}"` });
      onClose();
    },
    onError: () => toast({ title: "Failed to send recommendation", variant: "destructive" }),
  });

  function handleSend() {
    if (!book || !selectedFriendId) return;
    sendMut.mutate({
      toUserId: selectedFriendId,
      bookTitle: book.title,
      bookAuthor: book.author || null,
      coverUrl: (book as any).coverUrl || null,
      notes: note.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send size={15} /> Recommend a Book
          </DialogTitle>
        </DialogHeader>

        {book && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border">
            {(book as any).coverUrl ? (
              <img src={(book as any).coverUrl} alt={book.title} className="w-10 h-14 object-cover rounded shrink-0" />
            ) : (
              <div className="w-10 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                <BookOpen size={16} className="opacity-30" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold line-clamp-2">{book.title}</p>
              {book.author && <p className="text-xs text-muted-foreground">{book.author}</p>}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Send to</label>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                <Users size={18} className="mx-auto mb-1 opacity-30" />
                No friends yet — connect with people in the Friends tab
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id === selectedFriendId ? null : f.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedFriendId === f.id
                        ? "border-primary bg-primary/10"
                        : "hover:bg-secondary border-border"
                    }`}
                  >
                    <Avatar user={f} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    </div>
                    {selectedFriendId === f.id && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Note (optional)</label>
            <textarea
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Why you'd recommend it…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSend} disabled={!selectedFriendId || sendMut.isPending} className="gap-1.5">
            <Send size={13} /> Send Recommendation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Recommendations Tab ───────────────────────────────────────────────────────
function RecommendationsTab({ books }: { books: BookWithSessions[] }) {
  const { toast } = useToast();

  const { data: recs } = useQuery<{ received: BookRecommendationWithUser[]; sent: BookRecommendationWithUser[] }>({
    queryKey: ["/api/book-recommendations"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/book-recommendations"); return r.json(); },
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/book-recommendations/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/book-recommendations"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/book-recommendations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/book-recommendations"] }),
  });

  const addToListMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/books", body),
    onSuccess: (_, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      toast({ title: `Added "${vars.title}" to your reading list` });
    },
  });

  function handleAddToList(rec: BookRecommendationWithUser) {
    addToListMut.mutate({
      title: rec.bookTitle,
      author: rec.bookAuthor || null,
      coverUrl: rec.coverUrl || null,
      status: "backlog",
      pagesRead: 0,
    } as any);
  }

  const received = recs?.received ?? [];
  const sent = recs?.sent ?? [];

  return (
    <div className="space-y-6">
      {/* Received */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={15} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Recommended to You</h3>
          {received.length > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium">{received.length}</span>
          )}
        </div>
        {received.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            No recommendations yet — friends can recommend books to you from their reading list
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {received.map((rec) => (
              <div key={rec.id} className="border rounded-xl bg-card overflow-hidden">
                <div className="flex gap-3 p-4">
                  {rec.coverUrl ? (
                    <img src={rec.coverUrl} alt={rec.bookTitle} className="w-12 h-16 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded flex items-center justify-center shrink-0">
                      <BookOpen size={18} className="opacity-20" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm line-clamp-2">{rec.bookTitle}</p>
                    {rec.bookAuthor && <p className="text-xs text-muted-foreground mt-0.5">{rec.bookAuthor}</p>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Avatar user={rec.fromUser} />
                      <span className="text-xs text-muted-foreground">from <span className="font-medium text-foreground">{rec.fromUser.name}</span></span>
                    </div>
                    {rec.notes && (
                      <p className="text-xs italic text-muted-foreground mt-1.5 line-clamp-2">"{rec.notes}"</p>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 h-7 text-xs"
                    onClick={() => handleAddToList(rec)}
                    disabled={addToListMut.isPending}
                  >
                    <Plus size={12} /> Add to Reading List
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => dismissMut.mutate(rec.id)}
                  >
                    <X size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CornerUpRight size={15} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Sent by You</h3>
        </div>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            You haven't recommended any books yet — use the ··· menu on any book
          </p>
        ) : (
          <div className="space-y-2">
            {sent.map((rec) => (
              <div key={rec.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                {rec.coverUrl ? (
                  <img src={rec.coverUrl} alt={rec.bookTitle} className="w-8 h-11 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-11 bg-muted rounded flex items-center justify-center shrink-0">
                    <BookOpen size={12} className="opacity-20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{rec.bookTitle}</p>
                  {rec.bookAuthor && <p className="text-xs text-muted-foreground">{rec.bookAuthor}</p>}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">to <span className="font-medium text-foreground">{rec.toUser.name}</span></span>
                    <span className="text-xs text-muted-foreground">· {format(parseISO(rec.createdAt), "MMM d")}</span>
                  </div>
                </div>
                {rec.notes && <p className="text-xs italic text-muted-foreground max-w-32 line-clamp-2 hidden sm:block">"{rec.notes}"</p>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteMut.mutate(rec.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReadingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("current");
  const [genreFilter, setGenreFilter] = useState("all");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") === "1") setTab("recommendations");
  }, []);
  useEffect(() => {
    if (tab !== "recommendations") return;
    apiRequest("POST", "/api/shares/mark-read", { type: "books" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] })).catch(() => {});
  }, [tab]);
  const [bookModal, setBookModal] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);
  const [gbooksOpen, setGbooksOpen] = useState(false);
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [editSession, setEditSession] = useState<ReadingSession | null>(null);
  const [sessionBookId, setSessionBookId] = useState<number | undefined>();
  const [recommendBook, setRecommendBook] = useState<BookWithSessions | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null); // null = new
  // Goal form state
  const [gLabel, setGLabel]         = useState("");
  const [gTarget, setGTarget]       = useState("12");
  const [gTimeframe, setGTimeframe] = useState<"year" | "month" | "quarter" | "custom">("year");
  const [gStart, setGStart]         = useState("");
  const [gEnd, setGEnd]             = useState("");
  // Book-assignment state within modal
  const [addingBookId, setAddingBookId]     = useState<number | null>(null);
  const [addingBookDate, setAddingBookDate] = useState("");
  const [bookSearch, setBookSearch]         = useState("");

  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: readingGoals = [] } = useQuery<ReadingGoal[]>({ queryKey: ["/api/reading/goals"] });

  // For backward-compat memos, use the first goal if any
  const currentYear = new Date().getFullYear();

  const saveGoalMut = useMutation({
    mutationFn: (payload: object) =>
      editingGoalId !== null
        ? apiRequest("PATCH", `/api/reading/goals/${editingGoalId}`, payload)
        : apiRequest("POST", "/api/reading/goals", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reading/goals"] });
      toast({ title: editingGoalId !== null ? "Reading goal saved!" : "Reading goal created!" });
      setGoalModalOpen(false);
    },
  });

  const deleteGoalMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/reading/goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reading/goals"] });
      toast({ title: "Reading goal deleted" });
      setGoalModalOpen(false);
    },
  });

  const updateBookDateMut = useMutation({
    mutationFn: ({ id, targetFinishDate }: { id: number; targetFinishDate: string | null }) =>
      apiRequest("PATCH", `/api/books/${id}`, { targetFinishDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      setAddingBookId(null);
      setAddingBookDate("");
    },
  });

  // Precompute timeframe dates helper
  function getTimeframeDates(tf: typeof gTimeframe): { start: string; end: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (tf === "year")    return { start: `${y}-01-01`,           end: `${y}-12-31` };
    if (tf === "month")   return { start: format(new Date(y, m, 1), "yyyy-MM-dd"), end: format(new Date(y, m + 1, 0), "yyyy-MM-dd") };
    if (tf === "quarter") {
      const q = Math.floor(m / 3);
      return { start: format(new Date(y, q * 3, 1), "yyyy-MM-dd"), end: format(new Date(y, q * 3 + 3, 0), "yyyy-MM-dd") };
    }
    return { start: gStart, end: gEnd };
  }

  function openNewGoalModal() {
    setEditingGoalId(null);
    setGLabel("");
    setGTarget("12");
    setGTimeframe("year");
    setGStart("");
    setGEnd("");
    setGoalModalOpen(true);
  }

  function openEditGoalModal(rg: ReadingGoal) {
    setEditingGoalId(rg.id);
    setGLabel(rg.label ?? "");
    setGTarget(String(rg.booksTarget ?? 12));
    if (rg.startDate && rg.endDate) {
      const yd = getTimeframeDates("year"); const md = getTimeframeDates("month"); const qd = getTimeframeDates("quarter");
      if (rg.startDate === yd.start && rg.endDate === yd.end) setGTimeframe("year");
      else if (rg.startDate === md.start && rg.endDate === md.end) setGTimeframe("month");
      else if (rg.startDate === qd.start && rg.endDate === qd.end) setGTimeframe("quarter");
      else { setGTimeframe("custom"); setGStart(rg.startDate); setGEnd(rg.endDate); }
    } else {
      setGTimeframe("year");
    }
    setGoalModalOpen(true);
  }

  function handleSaveGoal() {
    const n = parseInt(gTarget);
    if (!n || n < 1) return;
    const { start, end } = gTimeframe === "custom" ? { start: gStart, end: gEnd } : getTimeframeDates(gTimeframe);
    if (!start || !end) return;
    saveGoalMut.mutate({ booksTarget: n, year: parseInt(start.slice(0, 4)), label: gLabel.trim() || null, startDate: start, endDate: end });
  }

  const allSessions = useMemo(() => books.flatMap((b) => b.sessions ?? []), [books]);
  const streak = readingStreak(allSessions);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/books/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/books"] }); toast({ title: "Book removed" }); },
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/books", d),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/books"] }),
  });

  const markFinished = useMutation({
    mutationFn: (b: BookWithSessions) => apiRequest("PATCH", `/api/books/${b.id}`, {
      status: "finished", finishDate: new Date().toISOString().split("T")[0], pagesRead: b.totalPages ?? b.pagesRead,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/books"] }),
  });

  const filtered = useMemo(() => {
    return books
      .filter((b) => b.status === tab)
      .filter((b) => genreFilter === "all" || b.genre === genreFilter);
  }, [books, tab, genreFilter]);

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    books.forEach((b) => { m[b.status] = (m[b.status] ?? 0) + 1; });
    return m;
  }, [books]);

  const isRecsTab = tab === "recommendations";

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-5 overflow-x-hidden w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold">Reading</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800 shrink-0">
              <Flame size={13} />{streak}d streak
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={openNewGoalModal} className="gap-1.5">
            <Target size={13} /> Add Goal
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGbooksOpen(true)} className="gap-1.5">
            <Search size={13} /> Find Books
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditSession(null); setSessionBookId(undefined); setSessionModal(true); }} className="gap-1.5">
            <Plus size={13} /><BookMarked size={13} />Log Session
          </Button>
          <Button size="sm" onClick={() => { setEditBook(null); setBookModal(true); }} className="gap-1.5">
            <Plus size={13} /><BookOpen size={13} />Add Book
          </Button>
        </div>
      </div>

      {/* Reading Goal Banners */}
      {readingGoals.length > 0 && (
        <div className="space-y-2">
          {readingGoals.map((rg) => {
            const start = rg.startDate ?? `${currentYear}-01-01`;
            const end   = rg.endDate   ?? `${currentYear}-12-31`;
            const finished = books.filter((b) => {
              if (b.status !== "finished") return false;
              const fd = (b as any).finishDate as string | null;
              return fd && fd >= start && fd <= end;
            }).length;
            const planned = books.filter((b) => {
              if (b.status === "finished") return false;
              const tfd = b.targetFinishDate;
              return tfd && tfd >= start && tfd <= end;
            }).length;
            const total = rg.booksTarget;
            const pct = Math.min(100, Math.round((finished / total) * 100));
            const rangeLabel = rg.startDate && rg.endDate
              ? `${format(parseISO(rg.startDate), "MMM d")} – ${format(parseISO(rg.endDate), "MMM d, yyyy")}`
              : String(currentYear);
            return (
              <div key={rg.id} className="p-3 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <Target size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-amber-900 dark:text-amber-200 truncate">
                        {rg.label || "Reading Goal"}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{pct}%</span>
                        <button
                          onClick={() => openEditGoalModal(rg)}
                          className="p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800/40 text-amber-600 dark:text-amber-400 transition-colors"
                          title="Edit goal"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => { if (confirm("Delete this reading goal? Books won't be removed.")) deleteGoalMut.mutate(rg.id); }}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-amber-600/60 dark:text-amber-400/60 hover:text-red-500 transition-colors"
                          title="Delete goal"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Calendar size={11} className="text-amber-600/70 dark:text-amber-400/70 shrink-0" />
                      <span className="text-xs text-amber-700/80 dark:text-amber-300/80">{rangeLabel}</span>
                    </div>
                    <Progress value={pct} className="h-1.5 mb-1.5" />
                    <div className="flex items-center gap-3 text-xs text-amber-700/80 dark:text-amber-300/80">
                      <span><span className="font-bold text-amber-900 dark:text-amber-200">{finished}</span> finished</span>
                      <span>of {total} goal</span>
                      {planned > 0 && <span className="ml-auto">{planned} planned</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit overflow-x-auto max-w-full">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === t.value ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {tabCounts[t.value] ? <span className="text-xs opacity-60">{tabCounts[t.value]}</span> : null}
          </button>
        ))}
      </div>

      {/* Genre filter — hidden on Recommendations tab */}
      {!isRecsTab && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setGenreFilter("all")} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${genreFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>All</button>
          {GENRE_TAGS.map((g) => (
            <button key={g} onClick={() => setGenreFilter(g)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${genreFilter === g ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>{g}</button>
          ))}
        </div>
      )}

      {/* Recommendations tab */}
      {isRecsTab && <RecommendationsTab books={books} />}

      {/* Book grid — hidden on Recommendations tab */}
      {!isRecsTab && (filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No books here yet</p>
          <p className="text-sm mt-1">Use <strong>Find Books</strong> to search Google Books, or add one manually</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((book) => {
            const pct = bookProgress(book);
            const daysLeft = book.targetFinishDate ? daysUntil(book.targetFinishDate) : null;
            const coverUrl = (book as any).coverUrl as string | null;
            return (
              <div key={book.id} className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                {/* Cover image or color band */}
                {coverUrl ? (
                  <div className="relative h-48 bg-muted overflow-hidden">
                    <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                      <p className="font-semibold text-sm text-white leading-tight line-clamp-2">{book.title}</p>
                      {book.author && <p className="text-xs text-white/70 mt-0.5">{book.author}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="h-2" style={{ backgroundColor: book.coverColor || "#1e3a5f" }} />
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      {!coverUrl && (
                        <>
                          <p className="font-semibold text-sm leading-tight">{book.title}</p>
                          {book.author && <p className="text-xs text-muted-foreground mt-0.5">{book.author}</p>}
                        </>
                      )}
                      {book.series && <p className="text-xs text-muted-foreground">{book.series}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditBook(book); setBookModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                        {book.status === "current" && (
                          <>
                            <DropdownMenuItem onClick={() => { setSessionBookId(book.id); setSessionModal(true); }}><BookMarked size={13} className="mr-2" />Log Session</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => markFinished.mutate(book)}><Check size={13} className="mr-2" />Mark Finished</DropdownMenuItem>
                          </>
                        )}
                        {book.status === "backlog" && (
                          <DropdownMenuItem onClick={() => apiRequest("PATCH", `/api/books/${book.id}`, { status: "current", startDate: new Date().toISOString().split("T")[0] }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/books"] }))}>
                            <BookOpen size={13} className="mr-2" />Start Reading
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRecommendBook(book)}><Send size={13} className="mr-2" />Recommend to Friend</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMut.mutate(book.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Genre + status */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {book.genre && <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary text-muted-foreground">{book.genre}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full status-${book.status}`}>
                      {BOOK_STATUSES.find((s) => s.value === book.status)?.label}
                    </span>
                  </div>

                  {/* Progress */}
                  {book.totalPages ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{book.pagesRead} / {book.totalPages} pages</span>
                        <span className="text-xs font-semibold">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  ) : null}

                  {/* Deadline */}
                  {daysLeft !== null && (
                    <p className={`text-xs mt-2 ${daysLeft <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                      {daysLeft < 0 ? "Overdue" : `${daysLeft}d to finish`} · {format(parseISO(book.targetFinishDate!), "MMM d")}
                    </p>
                  )}
                  {book.finishDate && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">Finished {format(parseISO(book.finishDate), "MMM d, yyyy")}</p>}

                  {/* Recent sessions */}
                  {book.status === "current" && book.sessions && book.sessions.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Last session: {format(parseISO(book.sessions[0].date), "MMM d")} · {book.sessions[0].pagesRead}p</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modals */}
      <BookFormModal open={bookModal} onClose={() => { setBookModal(false); setEditBook(null); }} editBook={editBook} />
      {sessionModal && <ReadingSessionModal open onClose={() => { setSessionModal(false); setSessionBookId(undefined); }} books={books} editSession={editSession} defaultBookId={sessionBookId} />}
      <GoogleBooksModal
        open={gbooksOpen}
        onClose={() => setGbooksOpen(false)}
        onAdd={(payload) => createMut.mutate(payload)}
      />
      <RecommendModal
        open={!!recommendBook}
        onClose={() => setRecommendBook(null)}
        book={recommendBook}
      />

      {/* Reading Goal Modal */}
      <Dialog open={goalModalOpen} onOpenChange={(o) => { if (!o) setGoalModalOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Target size={16} /> {editingGoalId !== null ? "Edit Reading Goal" : "New Reading Goal"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Goal name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal Name (optional)</label>
              <Input
                placeholder="e.g. Summer Reading 2026, Q1 Challenge…"
                value={gLabel}
                onChange={(e) => setGLabel(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Timeframe */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Timeframe</label>
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {(["year", "month", "quarter", "custom"] as const).map((tf) => {
                  const labels = { year: "This Year", month: "This Month", quarter: "This Quarter", custom: "Custom" };
                  return (
                    <button
                      key={tf}
                      onClick={() => { setGTimeframe(tf); if (tf !== "custom") { const d = getTimeframeDates(tf); setGStart(d.start); setGEnd(d.end); } }}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${gTimeframe === tf ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-border"}`}
                    >
                      {labels[tf]}
                    </button>
                  );
                })}
              </div>
              {gTimeframe === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Start date</label>
                    <Input type="date" value={gStart} onChange={(e) => setGStart(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">End date</label>
                    <Input type="date" value={gEnd} onChange={(e) => setGEnd(e.target.value)} className="text-sm" />
                  </div>
                </div>
              ) : (
                (() => {
                  const d = getTimeframeDates(gTimeframe);
                  return d.start && d.end ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar size={11} />
                      {format(parseISO(d.start), "MMM d, yyyy")} – {format(parseISO(d.end), "MMM d, yyyy")}
                    </p>
                  ) : null;
                })()
              )}
            </div>

            {/* Book count target */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Books Target</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button onClick={() => setGTarget(String(Math.max(1, parseInt(gTarget || "1") - 1)))} className="px-3 py-2 text-sm hover:bg-secondary transition-colors font-bold">−</button>
                  <Input
                    type="number" min={1} max={500}
                    value={gTarget}
                    onChange={(e) => setGTarget(e.target.value)}
                    className="w-16 text-center text-lg font-bold border-0 focus-visible:ring-0 rounded-none"
                  />
                  <button onClick={() => setGTarget(String(Math.min(500, parseInt(gTarget || "0") + 1)))} className="px-3 py-2 text-sm hover:bg-secondary transition-colors font-bold">+</button>
                </div>
                <span className="text-sm text-muted-foreground">books to read</span>
              </div>
            </div>

            {/* Books in this goal — computed from current modal window state */}
            {(() => {
              const modalStart = gTimeframe !== "custom" ? getTimeframeDates(gTimeframe).start : gStart;
              const modalEnd   = gTimeframe !== "custom" ? getTimeframeDates(gTimeframe).end   : gEnd;

              const modalBooksPlanned = books.filter((b) => {
                if (b.status === "finished") return false;
                const tfd = b.targetFinishDate;
                return tfd && tfd >= (modalStart || "") && tfd <= (modalEnd || "");
              });
              const modalBooksFinished = books.filter((b) => {
                if (b.status !== "finished") return false;
                const fd = (b as any).finishDate as string | null;
                return fd && fd >= (modalStart || "") && fd <= (modalEnd || "");
              });
              const assignedIds = new Set([...modalBooksPlanned, ...modalBooksFinished].map((b) => b.id));

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Books in This Goal</label>
                    <span className="text-xs text-muted-foreground">
                      {modalBooksPlanned.length + modalBooksFinished.length} assigned
                    </span>
                  </div>

                  {/* Assigned books: planned + finished */}
                  {(modalBooksPlanned.length > 0 || modalBooksFinished.length > 0) && (
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {[...modalBooksPlanned, ...modalBooksFinished].map((book) => {
                        const isFinished = book.status === "finished";
                        const date = isFinished ? (book as any).finishDate : book.targetFinishDate;
                        return (
                          <div key={book.id} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-secondary/40">
                            {(book as any).coverUrl ? (
                              <img src={(book as any).coverUrl} alt={book.title} className="w-6 h-8 object-cover rounded shrink-0" />
                            ) : (
                              <div className="w-6 h-8 rounded shrink-0 bg-muted flex items-center justify-center">
                                <BookOpen size={10} className="opacity-40" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{book.title}</p>
                              {book.author && <p className="text-[10px] text-muted-foreground truncate">{book.author}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isFinished ? (
                                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Done</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">by {date ? format(parseISO(date), "MMM d") : "—"}</span>
                              )}
                              {!isFinished && (
                                <button
                                  onClick={() => updateBookDateMut.mutate({ id: book.id, targetFinishDate: null })}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove from goal"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add a book to the goal */}
                  <div className="border rounded-xl p-3 space-y-2 bg-secondary/20">
                    <p className="text-xs font-medium text-muted-foreground">Add a book with a target finish date</p>
                    <Input
                      placeholder="Search your reading list…"
                      value={bookSearch}
                      onChange={(e) => setBookSearch(e.target.value)}
                      className="text-xs h-8"
                    />
                    {(() => {
                      const q = bookSearch.trim().toLowerCase();
                      const unassigned = books.filter((b) => {
                        if (b.status === "finished") return false;
                        if (assignedIds.has(b.id)) return false;
                        if (!q) return true;
                        return b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q);
                      }).slice(0, 5);
                      if (!unassigned.length && !q) return <p className="text-[10px] text-muted-foreground text-center py-1">All your backlog/current books are already assigned</p>;
                      if (!unassigned.length) return <p className="text-[10px] text-muted-foreground text-center py-1">No books match "{bookSearch}"</p>;
                      return (
                        <div className="space-y-1">
                          {unassigned.map((book) => (
                            <div key={book.id}>
                              {addingBookId === book.id ? (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                                  <BookOpen size={11} className="text-primary shrink-0" />
                                  <span className="text-xs flex-1 truncate">{book.title}</span>
                                  <Input
                                    type="date"
                                    value={addingBookDate}
                                    min={modalStart || undefined}
                                    max={modalEnd || undefined}
                                    onChange={(e) => setAddingBookDate(e.target.value)}
                                    className="h-6 text-xs w-32 shrink-0"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => { if (addingBookDate) updateBookDateMut.mutate({ id: book.id, targetFinishDate: addingBookDate }); }}
                                    disabled={!addingBookDate}
                                    className="shrink-0 p-1 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/80 transition-colors"
                                  >
                                    <Check size={11} />
                                  </button>
                                  <button onClick={() => { setAddingBookId(null); setAddingBookDate(""); }} className="shrink-0 p-1 text-muted-foreground hover:text-foreground">
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddingBookId(book.id); setAddingBookDate(modalEnd || ""); setBookSearch(""); }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left"
                                >
                                  {(book as any).coverUrl ? (
                                    <img src={(book as any).coverUrl} alt={book.title} className="w-5 h-7 object-cover rounded shrink-0" />
                                  ) : (
                                    <div className="w-5 h-7 rounded shrink-0 bg-muted flex items-center justify-center">
                                      <BookOpen size={9} className="opacity-40" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{book.title}</p>
                                    {book.author && <p className="text-[10px] text-muted-foreground truncate">{book.author}</p>}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground capitalize shrink-0">{book.status}</span>
                                  <Plus size={11} className="text-primary shrink-0" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-5 py-3 border-t shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {editingGoalId !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (confirm("Delete this reading goal? Books won't be removed.")) deleteGoalMut.mutate(editingGoalId); }}
                  disabled={deleteGoalMut.isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                >
                  <Trash2 size={12} /> Delete Goal
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setGoalModalOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSaveGoal}
                disabled={saveGoalMut.isPending || !gTarget || parseInt(gTarget) < 1 || (gTimeframe === "custom" && (!gStart || !gEnd))}
                className="gap-1.5"
              >
                <Check size={13} /> {editingGoalId !== null ? "Save Goal" : "Create Goal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
