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
import { Plus, Trash2, Copy } from "lucide-react";
import { WORKOUT_TYPES, WORKOUT_TYPE_LABELS, RECURRENCE_OPTIONS } from "@/lib/plannerUtils";
import type { WorkoutTemplate, InsertWorkoutTemplate, TemplateExercise, TemplateSet } from "@shared/schema";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

const blankExercise = (): TemplateExercise => ({
  name: "",
  sets: [{ reps: 12, weight: 0 }, { reps: 10, weight: 0 }, { reps: 8, weight: 0 }],
  restSeconds: 90,
  notes: "",
});

export default function WorkoutTemplateModal({ open, onClose, editTemplate }: {
  open: boolean; onClose: () => void; editTemplate: WorkoutTemplate | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [wType, setWType] = useState("custom");
  const [scheduledDay, setScheduledDay] = useState("__none__");
  const [recurring, setRecurring] = useState("weekly");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);

  useEffect(() => {
    if (open) {
      setName(editTemplate?.name ?? "");
      setWType(editTemplate?.workoutType ?? "custom");
      setScheduledDay(editTemplate?.scheduledDay ?? "__none__");
      setRecurring(editTemplate?.recurring ?? "weekly");
      setNotes(editTemplate?.notes ?? "");
      if (editTemplate?.exercisesJson) {
        try {
          const parsed = JSON.parse(editTemplate.exercisesJson);
          // Migrate old format (sets: number) → new format (sets: array)
          const migrated = parsed.map((ex: any) => {
            if (typeof ex.sets === "number") {
              // Old flat format — build array from sets count + single reps/weight
              return {
                name: ex.name ?? "",
                sets: Array.from({ length: ex.sets }, () => ({ reps: ex.reps ?? 8, weight: ex.weight ?? 0 })),
                restSeconds: ex.restSeconds ?? 90,
                notes: ex.notes ?? "",
              };
            }
            return ex;
          });
          setExercises(migrated);
        } catch { setExercises([]); }
      } else {
        setExercises([]);
      }
    }
  }, [open, editTemplate]);

  // ── Exercise-level mutations ─────────────────────────────────────────────
  const addExercise = () => setExercises((p) => [...p, blankExercise()]);
  const removeExercise = (ei: number) => setExercises((p) => p.filter((_, i) => i !== ei));
  const updateExName = (ei: number, val: string) =>
    setExercises((p) => p.map((ex, i) => i === ei ? { ...ex, name: val } : ex));
  const updateExRest = (ei: number, val: number) =>
    setExercises((p) => p.map((ex, i) => i === ei ? { ...ex, restSeconds: val } : ex));
  const updateExNotes = (ei: number, val: string) =>
    setExercises((p) => p.map((ex, i) => i === ei ? { ...ex, notes: val } : ex));

  // ── Set-level mutations ──────────────────────────────────────────────────
  const addSet = (ei: number) =>
    setExercises((p) => p.map((ex, i) => {
      if (i !== ei) return ex;
      // Default the new set to the last set's values as a starting point
      const last = ex.sets[ex.sets.length - 1] ?? { reps: 8, weight: 0 };
      return { ...ex, sets: [...ex.sets, { reps: last.reps, weight: last.weight }] };
    }));
  const removeSet = (ei: number, si: number) =>
    setExercises((p) => p.map((ex, i) => {
      if (i !== ei || ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.filter((_, j) => j !== si) };
    }));
  const updateSet = (ei: number, si: number, field: keyof TemplateSet, val: number) =>
    setExercises((p) => p.map((ex, i) =>
      i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }
    ));
  // Duplicate a set
  const dupeSet = (ei: number, si: number) =>
    setExercises((p) => p.map((ex, i) => {
      if (i !== ei) return ex;
      const copy = { ...ex.sets[si] };
      const newSets = [...ex.sets.slice(0, si + 1), copy, ...ex.sets.slice(si + 1)];
      return { ...ex, sets: newSets };
    }));

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] });
  const createMut = useMutation({
    mutationFn: (d: InsertWorkoutTemplate) => apiRequest("POST", "/api/workout-templates", d),
    onSuccess: () => { inv(); toast({ title: "Template created" }); onClose(); },
    onError: () => toast({ title: "Error saving template", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertWorkoutTemplate>) => apiRequest("PATCH", `/api/workout-templates/${editTemplate?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Template updated" }); onClose(); },
    onError: () => toast({ title: "Error saving template", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const p: InsertWorkoutTemplate = {
      name: name.trim(),
      workoutType: wType,
      scheduledDay: (scheduledDay && scheduledDay !== "__none__") ? scheduledDay : null,
      recurring,
      notes: notes.trim() || null,
      linkedGoalId: null,
      exercisesJson: JSON.stringify(exercises),
    };
    editTemplate ? updateMut.mutate(p) : createMut.mutate(p);
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTemplate ? "Edit Template" : "Create Workout Template"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day A" required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={wType} onValueChange={setWType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WORKOUT_TYPES.map((t) => <SelectItem key={t} value={t}>{WORKOUT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scheduled Day</Label>
              <Select value={scheduledDay} onValueChange={setScheduledDay}>
                <SelectTrigger><SelectValue placeholder="Any day" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any day</SelectItem>
                  {DAYS.map((d) => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select value={recurring} onValueChange={setRecurring}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RECURRENCE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Exercises */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Exercises</Label>
              <Button type="button" size="sm" variant="outline" onClick={addExercise} className="h-7 text-xs gap-1">
                <Plus size={12} /> Add Exercise
              </Button>
            </div>

            {exercises.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4 border rounded-xl border-dashed">
                No exercises yet — click "Add Exercise" to start building
              </p>
            )}

            {exercises.map((ex, ei) => (
              <div key={ei} className="border rounded-xl bg-secondary/20 overflow-hidden">
                {/* Exercise header */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{ei + 1}</span>
                  <Input
                    value={ex.name}
                    onChange={(e) => updateExName(ei, e.target.value)}
                    placeholder="Exercise name (e.g. Bench Press)"
                    className="flex-1 h-8 text-sm font-medium"
                  />
                  <button type="button" onClick={() => removeExercise(ei)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Sets table */}
                <div className="px-3 pb-1">
                  {/* Column headers */}
                  <div className="grid grid-cols-[28px_1fr_1fr_60px_32px] gap-1.5 px-1 mb-1">
                    <span className="text-xs text-muted-foreground text-center">Set</span>
                    <span className="text-xs text-muted-foreground text-center">Reps</span>
                    <span className="text-xs text-muted-foreground text-center">Weight (lb)</span>
                    <span></span>
                    <span></span>
                  </div>

                  {ex.sets.map((s, si) => (
                    <div key={si} className="grid grid-cols-[28px_1fr_1fr_60px_32px] gap-1.5 items-center mb-1">
                      {/* Set number badge */}
                      <span className="text-xs text-muted-foreground text-center font-medium">{si + 1}</span>

                      {/* Reps */}
                      <Input
                        type="number"
                        value={s.reps}
                        onChange={(e) => updateSet(ei, si, "reps", +e.target.value)}
                        className="h-7 text-sm text-center px-1"
                        min={1}
                      />

                      {/* Weight */}
                      <Input
                        type="number"
                        value={s.weight}
                        onChange={(e) => updateSet(ei, si, "weight", +e.target.value)}
                        className="h-7 text-sm text-center px-1"
                        step={2.5}
                        min={0}
                      />

                      {/* Dupe button */}
                      <button
                        type="button"
                        onClick={() => dupeSet(ei, si)}
                        title="Duplicate set"
                        className="flex items-center justify-center h-7 w-full rounded border border-border text-muted-foreground hover:text-foreground hover:bg-background transition-colors text-xs gap-0.5"
                      >
                        <Copy size={11} /> Copy
                      </button>

                      {/* Remove set */}
                      <button
                        type="button"
                        onClick={() => removeSet(ei, si)}
                        disabled={ex.sets.length <= 1}
                        className="flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  {/* Add set row */}
                  <button
                    type="button"
                    onClick={() => addSet(ei)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-1 mt-0.5"
                  >
                    <Plus size={11} /> Add set
                  </button>
                </div>

                {/* Rest time + notes */}
                <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 border-t mt-1">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rest between sets (seconds)</p>
                    <Input
                      type="number"
                      value={ex.restSeconds}
                      onChange={(e) => updateExRest(ei, +e.target.value)}
                      className="h-7 text-xs"
                      step={15}
                      min={0}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes (optional)</p>
                    <Input
                      value={ex.notes}
                      onChange={(e) => updateExNotes(ei, e.target.value)}
                      placeholder="e.g. keep elbows tucked"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Template notes */}
          <div className="space-y-1.5">
            <Label>Template Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="General notes for this workout..." />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Saving..." : editTemplate ? "Save Template" : "Create Template"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
