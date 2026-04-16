import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { Plus, BookOpen, BookMarked, Check, Trash2, Pencil, MoreHorizontal, Flame, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { bookProgress, daysUntil, BOOK_STATUSES, GENRE_TAGS, readingStreak } from "@/lib/plannerUtils";
import BookFormModal from "@/components/modals/BookFormModal";
import ReadingSessionModal from "@/components/modals/ReadingSessionModal";
import type { BookWithSessions, Book, ReadingSession } from "@shared/schema";

const STATUS_TABS = [
  { value: "current",  label: "Reading"   },
  { value: "backlog",  label: "Up Next"   },
  { value: "paused",   label: "Paused"    },
  { value: "finished", label: "Finished"  },
];

export default function ReadingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("current");
  const [genreFilter, setGenreFilter] = useState("all");
  const [bookModal, setBookModal] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [editSession, setEditSession] = useState<ReadingSession | null>(null);
  const [sessionBookId, setSessionBookId] = useState<number | undefined>();

  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });

  const allSessions = useMemo(() => books.flatMap((b) => b.sessions ?? []), [books]);
  const streak = readingStreak(allSessions);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/books/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/books"] }); toast({ title: "Book removed" }); },
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Reading</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
              <Flame size={13} />{streak}d streak
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditSession(null); setSessionBookId(undefined); setSessionModal(true); }} className="gap-1.5">
            <Plus size={13} /><BookMarked size={13} />Log Session
          </Button>
          <Button size="sm" onClick={() => { setEditBook(null); setBookModal(true); }} className="gap-1.5">
            <Plus size={13} /><BookOpen size={13} />Add Book
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === t.value ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {tabCounts[t.value] ? <span className="text-xs opacity-60">{tabCounts[t.value]}</span> : null}
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setGenreFilter("all")} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${genreFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>All</button>
        {GENRE_TAGS.map((g) => (
          <button key={g} onClick={() => setGenreFilter(g)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${genreFilter === g ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>{g}</button>
        ))}
      </div>

      {/* Book grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No books here yet</p>
          <p className="text-sm mt-1">Add a book to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((book) => {
            const pct = bookProgress(book);
            const daysLeft = book.targetFinishDate ? daysUntil(book.targetFinishDate) : null;
            return (
              <div key={book.id} className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                {/* Color band */}
                <div className="h-2" style={{ backgroundColor: book.coverColor || "#1e3a5f" }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight">{book.title}</p>
                      {book.author && <p className="text-xs text-muted-foreground mt-0.5">{book.author}</p>}
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
      )}

      {/* Modals */}
      <BookFormModal open={bookModal} onClose={() => { setBookModal(false); setEditBook(null); }} editBook={editBook} />
      {sessionModal && <ReadingSessionModal open onClose={() => { setSessionModal(false); setSessionBookId(undefined); }} books={books} editSession={editSession} defaultBookId={sessionBookId} />}
    </div>
  );
}
