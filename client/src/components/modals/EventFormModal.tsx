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
import { EVENT_CATEGORIES, RECURRENCE_OPTIONS } from "@/lib/plannerUtils";
import type { Event, InsertEvent } from "@shared/schema";

export default function EventFormModal({ open, onClose, editEvent }: {
  open: boolean; onClose: () => void; editEvent: Event | null;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState("other");
  const [recurring, setRecurring] = useState("none");
  const [description, setDesc] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(editEvent?.title ?? ""); setDate(editEvent?.date ?? "");
      setEndDate(editEvent?.endDate ?? ""); setCategory(editEvent?.category ?? "other");
      setRecurring(editEvent?.recurring ?? "none"); setDesc(editEvent?.description ?? "");
    }
  }, [open, editEvent]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  const createMut = useMutation({ mutationFn: (d: InsertEvent) => apiRequest("POST", "/api/events", d), onSuccess: () => { inv(); toast({ title: "Event added" }); onClose(); } });
  const updateMut = useMutation({ mutationFn: (d: Partial<InsertEvent>) => apiRequest("PATCH", `/api/events/${editEvent?.id}`, d), onSuccess: () => { inv(); toast({ title: "Event updated" }); onClose(); } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const p: InsertEvent = { title: title.trim(), date, endDate: endDate || null, category, recurring, description: description.trim() || null, color: null };
    editEvent ? updateMut.mutate(p) : createMut.mutate(p);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editEvent ? "Edit Event" : "Add Event"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>End Date <span className="text-muted-foreground text-xs">(opt)</span></Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Repeats</Label>
              <Select value={recurring} onValueChange={setRecurring}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECURRENCE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Notes <span className="text-muted-foreground text-xs">(opt)</span></Label><Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editEvent ? "Save" : "Add Event"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
