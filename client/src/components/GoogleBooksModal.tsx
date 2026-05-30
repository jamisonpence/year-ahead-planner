import { useState, useEffect } from "react";
import { BookOpen, Search, Clock, Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface GBVolume {
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

export function buildBookPayload(vol: GBVolume): Record<string, any> {
  const info = vol.volumeInfo;
  const rawThumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
  const coverUrl = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : null;
  return {
    title: info.title,
    author: info.authors?.join(", ") || null,
    series: null,
    seriesNumber: null,
    genre: info.categories?.[0] ?? null,
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
}

export default function GoogleBooksModal({
  open, onClose, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: Record<string, any>) => void;
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
      try {
        const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query.trim())}&maxResults=20&printType=books`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const gbRes = await fetch(gbUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!gbRes.ok) throw new Error(`GB:${gbRes.status}`);
        const gbData = await gbRes.json() as any;
        setResults((gbData.items ?? []).map((v: any) => ({
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
        })));
        return;
      } catch (e: any) {
        lastErr = e?.name === "AbortError" ? "GB timeout" : String(e?.message ?? e);
      }
      // Open Library fallback
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query.trim())}&limit=20`;
      const olCtrl = new AbortController();
      const olT = setTimeout(() => olCtrl.abort(), 10000);
      const olRes = await fetch(olUrl, { signal: olCtrl.signal });
      clearTimeout(olT);
      if (!olRes.ok) throw new Error(`OL:${olRes.status}`);
      const olData = await olRes.json() as any;
      setResults((olData.docs ?? []).map((doc: any) => ({
        id: doc.key ?? doc.isbn?.[0] ?? String(Math.random()),
        volumeInfo: {
          title: doc.title ?? "Unknown Title",
          authors: doc.author_name ?? [],
          publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
          pageCount: doc.number_of_pages_median ?? undefined,
          categories: doc.subject ? [doc.subject[0]] : undefined,
          imageLinks: doc.cover_i ? { thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` } : undefined,
        },
      })));
    } catch (e: any) {
      toast({ title: "Search failed", description: `Book search unavailable (${lastErr || String(e?.message ?? e)}). Try again.`, variant: "destructive" });
    } finally { setLoading(false); }
  }

  function addBook(vol: GBVolume) {
    setAddingId(vol.id);
    onAdd(buildBookPayload(vol));
    setAddedIds((prev) => new Set([...prev, vol.id]));
    toast({ title: `✓ Added "${vol.volumeInfo.title}"` });
    setAddingId(null);
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
                autoFocus
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
                const thumb = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "").replace(/^http:\/\//, "https://");
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
                        {info.publishedDate && <span className="text-[10px] text-muted-foreground">{info.publishedDate.slice(0, 4)}</span>}
                        {info.pageCount && <span className="text-[10px] text-muted-foreground">{info.pageCount}p</span>}
                      </div>
                      <button
                        onClick={() => !added && addBook(vol)}
                        disabled={added || isAdding}
                        className={`mt-2 w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors ${
                          added ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" : "hover:bg-secondary"
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
