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
import { Plus, Trash2, Star } from "lucide-react";
import { todayStr, WORKOUT_TYPES, WORKOUT_TYPE_LABELS } from "@/lib/plannerUtils";
import type { WorkoutTemplate, WorkoutLog, InsertWorkoutLog, LoggedExercise, LoggedSet } from "@shared/schema";

export default function WorkoutLogModal({ open, onClose, templates, editLog }: {
  open: boolean; onClose: () => void; templates: WorkoutTemplate[];
  editLog: WorkoutLog | null;
}) {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState("__none__");
  const [name, setName] = useState("");
  const [wType, setWType] = useState("custom");
  const [date, setDate] = useState(todayStr());
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);

  useEffect(() => {
    if (open) {
      if (editLog) {
        setTemplateId(editLog.templateId?.toString() ?? "__none__");
        setName(editLog.name); setWType(editLog.workoutType);
        setDate(editLog.date); setDuration(editLog.durationMinutes?.toString() ?? "");
        setNotes(editLog.notes ?? "");
        try { setExercises(JSON.parse(editLog.exercisesJson)); } catch { setExercises([]); }
      } else {
        setTemplateId("__none__"); setName(""); setWType("custom"); setDate(todayStr());
        setDuration(""); setNotes(""); setExercises([]);
      }
    }
  }, [open, editLog]);

  // When template is selected, prefill from template
  useEffect(() => {
    if (templateId && templateId !== "__none__") {
      const t = templates.find((t) => t.id === parseInt(templateId));
      if (t) {
        setName(t.name); setWType(t.workoutType);
        try {
          const tex = JSON.parse(t.exercisesJson) as any[];
          setExercises(tex.map((ex: any) => ({
            name: ex.name, isPR: false, notes: ex.notes || "",
            // New format: sets is already an array of {reps, weight}
            // Old format: sets was a count number with top-level reps/weight
            sets: Array.isArray(ex.sets)
              ? ex.sets.map((s: any) => ({ reps: s.reps ?? 8, weight: s.weight ?? 0 }))
              : Array.from({ length: ex.sets || 3 }, () => ({ reps: ex.reps || 8, weight: ex.weight || 0 })),
          })));
        } catch { setExercises([]); }
      }
    }
  }, [templateId]);

  const addExercise = () => setExercises((prev) => [...prev, { name: "", sets: [{ reps: 8, weight: 0 }], isPR: false, notes: "" }]);
  const removeExercise = (i: number) => setExercises((prev) => prev.filter((_, idx) => idx !== i));
  const updateEx = (i: number, field: keyof LoggedExercise, val: any) =>
    setExercises((prev) => prev.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));
  const addSet = (i: number) => setExercises((prev) => prev.map((ex, idx) => idx === i ? { ...ex, sets: [...ex.sets, { reps: 8, weight: 0 }] } : ex));
  const removeSet = (ei: number, si: number) => setExercises((prev) => prev.map((ex, idx) => idx === ei ? { ...ex, sets: ex.sets.filter((_, si2) => si2 !== si) } : ex));
  const updateSet = (ei: number, si: number, field: keyof LoggedSet, val: number) =>
    setExercises((prev) => prev.map((ex, idx) => idx === ei ? { ...ex, sets: ex.sets.map((s, si2) => si2 === si ? { ...s, [field]: val } : s) } : ex));

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/workout-logs"] });
  const createMut = useMutation({ mutationFn: (d: InsertWorkoutLog) => apiRequest("POST", "/api/workout-logs", d), onSuccess: () => { inv(); toast({ title: "Workout logged" }); onClose(); } });
  const updateMut = useMutation({ mutationFn: (d: Partial<InsertWorkoutLog>) => apiRequest("PATCH", `/api/workout-logs/${editLog?.id}`, d), onSuccess: () => { inv(); toast({ title: "Workout updated" }); onClose(); } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const p: InsertWorkoutLog = {
      templateId: (templateId && templateId !== "__none__") ? parseInt(templateId) : null,
      date, name: name.trim(), workoutType: wType,
      durationMinutes: duration ? parseInt(duration) : null,
      notes: notes.trim() || null, completed: true,
      exercisesJson: JSON.stringify(exercises), linkedGoalId: null,
    };
    editLog ? updateMut.mutate(p) : createMut.mutate(p);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editLog ? "Edit Workout" : "Log Workout"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {templates.length > 0 && (
            <div className="space-y-1.5"><Label>Load from Template <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">— None —</SelectItem>{templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Workout Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day A" required /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={wType} onValueChange={setWType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WORKOUT_TYPES.map((t) => <SelectItem key={t} value={t}>{WORKOUT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" /></div>
          </div>

          {/* Exercises */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Exercises</Label>
              <Button type="button" size="sm" variant="outline" onClick={addExercise} className="h-7 text-xs gap-1"><Plus size={12} />Add Exercise</Button>
            </div>
            {exercises.map((ex, ei) => (
              <div key={ei} className="border rounded-xl p-3 space-y-2 bg-secondary/20">
                <div className="flex items-center gap-2">
                  <Input value={ex.name} onChange={(e) => updateEx(ei, "name", e.target.value)} placeholder="Exercise name" className="flex-1 h-8 text-sm" />
                  <button type="button" onClick={() => updateEx(ei, "isPR", !ex.isPR)} className={`p-1.5 rounded ${ex.isPR ? "text-amber-500" : "text-muted-foreground"}`} title="Mark as PR"><Star size={14} fill={ex.isPR ? "currentColor" : "none"} /></button>
                  <button type="button" onClick={() => removeExercise(ei)} className="p-1.5 rounded text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground px-1">
                    <span>Reps</span><span>Weight (lb)</span><span></span>
                  </div>
                  {ex.sets.map((s, si) => (
                    <div key={si} className="grid grid-cols-3 gap-1 items-center">
                      <Input type="number" value={s.reps} onChange={(e) => updateSet(ei, si, "reps", +e.target.value)} className="h-7 text-xs" />
                      <Input type="number" value={s.weight} onChange={(e) => updateSet(ei, si, "weight", +e.target.value)} className="h-7 text-xs" step="2.5" />
                      <button type="button" onClick={() => removeSet(ei, si)} className="text-muted-foreground hover:text-destructive flex justify-center"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addSet(ei)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"><Plus size={10} />Add set</button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editLog ? "Save" : "Log Workout"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
