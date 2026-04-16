import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { todayStr } from "@/lib/plannerUtils";
import type { BookWithSessions, ReadingSession, InsertReadingSession } from "@shared/schema";

export default function ReadingSessionModal({ open, onClose, books, editSession, defaultBookId }: {
  open: boolean; onClose: () => void; books: BookWithSessions[];
  editSession: ReadingSession | null; defaultBookId?: number;
}) {
  const { toast } = useToast();
  const [bookId, setBookId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [pages, setPages] = useState("0");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState(true);

  useEffect(() => {
    if (open) {
      setBookId(editSession?.bookId?.toString() ?? defaultBookId?.toString() ?? books[0]?.id?.toString() ?? "");
      setDate(editSession?.date ?? todayStr());
      setPages(editSession?.pagesRead?.toString() ?? "0");
      setDuration(editSession?.durationMinutes?.toString() ?? "");
      setNotes(editSession?.notes ?? "");
      setCompleted(editSession?.completed ?? true);
    }
  }, [open, editSession, defaultBookId, books]);

  const invAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/reading-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/books"] });
  };

  const createMut = useMutation({
    mutationFn: async (d: InsertReadingSession) => {
      const res = await apiRequest("POST", "/api/reading-sessions", d);
      // Also update book pages read
      if (d.completed && d.pagesRead > 0 && d.bookId) {
        const book = books.find((b) => b.id === d.bookId);
        if (book) {
          const newPages = Math.min(book.pagesRead + d.pagesRead, book.totalPages ?? 99999);
          await apiRequest("PATCH", `/api/books/${d.bookId}`, { pagesRead: newPages });
        }
      }
      return res;
    },
    onSuccess: () => { invAll(); toast({ title: "Session logged" }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertReadingSession>) => apiRequest("PATCH", `/api/reading-sessions/${editSession?.id}`, d),
    onSuccess: () => { invAll(); toast({ title: "Session updated" }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId) return;
    const p: InsertReadingSession = {
      bookId: parseInt(bookId), date, pagesRead: parseInt(pages) || 0,
      durationMinutes: duration ? parseInt(duration) : null,
      notes: notes.trim() || null, planned: false, completed, recurring: "none",
    };
    editSession ? updateMut.mutate(p) : createMut.mutate(p);
  };

  const activeBooks = books.filter((b) => b.status !== "backlog");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editSession ? "Edit Reading Session" : "Log Reading Session"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label>Book *</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
              <SelectContent>{activeBooks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Pages Read</Label><Input type="number" value={pages} onChange={(e) => setPages(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Duration (minutes) <span className="text-muted-foreground text-xs">(opt)</span></Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editSession ? "Save" : "Log Session"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
