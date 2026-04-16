import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BOOK_STATUSES, GENRE_TAGS, COVER_COLORS } from "@/lib/plannerUtils";
import type { Book, InsertBook } from "@shared/schema";

export default function BookFormModal({ open, onClose, editBook }: {
  open: boolean; onClose: () => void; editBook: Book | null;
}) {
  const { toast } = useToast();
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

  useEffect(() => {
    if (open) {
      setTitle(editBook?.title ?? ""); setAuthor(editBook?.author ?? "");
      setSeries(editBook?.series ?? ""); setGenre(editBook?.genre ?? "");
      setStatus(editBook?.status ?? "backlog");
      setTotalPages(editBook?.totalPages?.toString() ?? "");
      setPagesRead(editBook?.pagesRead?.toString() ?? "0");
      setStartDate(editBook?.startDate ?? ""); setTargetDate(editBook?.targetFinishDate ?? "");
      setNotes(editBook?.notes ?? ""); setCoverColor(editBook?.coverColor ?? COVER_COLORS[0]);
    }
  }, [open, editBook]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/books"] });
  const createMut = useMutation({ mutationFn: (d: InsertBook) => apiRequest("POST", "/api/books", d), onSuccess: () => { inv(); toast({ title: "Book added" }); onClose(); } });
  const updateMut = useMutation({ mutationFn: (d: Partial<InsertBook>) => apiRequest("PATCH", `/api/books/${editBook?.id}`, d), onSuccess: () => { inv(); toast({ title: "Book updated" }); onClose(); } });

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
    };
    editBook ? updateMut.mutate(p) : createMut.mutate(p);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editBook ? "Edit Book" : "Add Book"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" /></div>
            <div className="space-y-1.5"><Label>Series</Label><Input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Series name" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Genre</Label>
              <Select value={genre} onValueChange={setGenre}><SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger><SelectContent>{GENRE_TAGS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BOOK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Total Pages</Label><Input type="number" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} placeholder="300" /></div>
            <div className="space-y-1.5"><Label>Pages Read</Label><Input type="number" value={pagesRead} onChange={(e) => setPagesRead(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Target Finish</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Cover Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COVER_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setCoverColor(c)}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${coverColor === c ? "border-primary scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editBook ? "Save" : "Add Book"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
