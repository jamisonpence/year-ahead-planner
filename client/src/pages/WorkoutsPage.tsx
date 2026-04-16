import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { Plus, Dumbbell, Flame, Star, Pencil, Trash2, MoreHorizontal, LayoutTemplate, ClipboardList, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { workoutStreak, weeklyWorkoutStats, getRecentPRs, WORKOUT_TYPE_LABELS } from "@/lib/plannerUtils";
import WorkoutLogModal from "@/components/modals/WorkoutLogModal";
import WorkoutTemplateModal from "@/components/modals/WorkoutTemplateModal";
import type { WorkoutLog, WorkoutTemplate } from "@shared/schema";

export default function WorkoutsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"logs" | "templates">("logs");
  const [logModal, setLogModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [editLog, setEditLog] = useState<WorkoutLog | null>(null);
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null);

  const { data: logs = [] } = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });

  const streak = workoutStreak(logs);
  const { completed: wkCompleted, planned: wkPlanned } = weeklyWorkoutStats(logs, templates);
  const recentPRs = getRecentPRs(logs);

  const deleteLog = useMutation({ mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-logs/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-logs"] }); toast({ title: "Log deleted" }); } });
  const deleteTemplate = useMutation({ mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-templates/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); toast({ title: "Template deleted" }); } });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Workouts</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(210_80%_48%)] bg-[hsl(210_80%_48%/0.1)] px-2.5 py-1 rounded-full border border-[hsl(210_80%_48%/0.3)]">
              <Flame size={13} />{streak}d streak
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditTemplate(null); setTemplateModal(true); }} className="gap-1.5"><Plus size={13} /><LayoutTemplate size={13} />Template</Button>
          <Button size="sm" onClick={() => { setEditLog(null); setLogModal(true); }} className="gap-1.5"><Plus size={13} /><ClipboardList size={13} />Log Workout</Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{wkCompleted}</p>
          <p className="text-xs text-muted-foreground">Done this week</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{wkPlanned}</p>
          <p className="text-xs text-muted-foreground">Planned</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{streak}d</p>
          <p className="text-xs text-muted-foreground">Current streak</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{logs.filter((l) => l.completed).length}</p>
          <p className="text-xs text-muted-foreground">Total logged</p>
        </div>
      </div>

      {/* Recent PRs */}
      {recentPRs.length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Zap size={15} className="text-amber-500" /><span className="text-sm font-semibold">Recent PRs</span></div>
          <div className="flex gap-3 flex-wrap">
            {recentPRs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <Star size={12} className="text-amber-500" fill="currentColor" />
                <div>
                  <p className="text-xs font-semibold">{pr.exercise}</p>
                  <p className="text-xs text-muted-foreground">{pr.weight} lb · {format(parseISO(pr.date), "MMM d")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setTab("logs")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === "logs" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          <ClipboardList size={14} />Workout Logs <span className="text-xs opacity-60">{logs.length}</span>
        </button>
        <button onClick={() => setTab("templates")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === "templates" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          <LayoutTemplate size={14} />Templates <span className="text-xs opacity-60">{templates.length}</span>
        </button>
      </div>

      {/* Workout Logs */}
      {tab === "logs" && (
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Dumbbell size={40} className="mx-auto mb-4 opacity-20" /><p className="font-medium">No workouts logged yet</p></div>
          ) : logs.map((log) => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(log.exercisesJson); } catch {}
            const prs = exercises.filter((e) => e.isPR);
            return (
              <div key={log.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(210_80%_48%/0.12)] text-[hsl(210_80%_48%)] flex items-center justify-center shrink-0">
                      <Dumbbell size={17} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{log.name}</p>
                        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{WORKOUT_TYPE_LABELS[log.workoutType] ?? log.workoutType}</span>
                        {prs.length > 0 && <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5"><Star size={9} fill="currentColor" />{prs.length} PR{prs.length > 1 ? "s" : ""}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(log.date), "EEE, MMM d, yyyy")}{log.durationMinutes ? ` · ${log.durationMinutes} min` : ""}</p>
                      {exercises.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {exercises.slice(0, 5).map((ex, i) => (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                              {ex.name}{ex.isPR ? " ⭐" : ""}
                              {ex.sets?.length ? ` ${ex.sets.length}×` : ""}
                            </span>
                          ))}
                          {exercises.length > 5 && <span className="text-xs text-muted-foreground">+{exercises.length - 5}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditLog(log); setLogModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteLog.mutate(log.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates */}
      {tab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><LayoutTemplate size={40} className="mx-auto mb-4 opacity-20" /><p className="font-medium">No templates yet</p><p className="text-sm mt-1">Create a template for your recurring workouts</p></div>
          ) : templates.map((t) => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(t.exercisesJson); } catch {}
            return (
              <div key={t.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{WORKOUT_TYPE_LABELS[t.workoutType] ?? t.workoutType}</span>
                      {t.scheduledDay && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground capitalize">{t.scheduledDay}</span>}
                      {t.recurring !== "none" && <span className="text-xs border border-border px-1.5 py-0.5 rounded text-muted-foreground">{t.recurring === "weekly" ? "Weekly" : t.recurring}</span>}
                    </div>
                    {exercises.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {exercises.map((ex, i) => {
                          // Handle both new (sets=array) and old (sets=number) formats
                          const setCount = Array.isArray(ex.sets) ? ex.sets.length : (ex.sets ?? 0);
                          const setsSummary = Array.isArray(ex.sets)
                            ? ex.sets.map((s: any) => `${s.reps}×${s.weight}lb`).join(', ')
                            : `${ex.sets}×${ex.reps} @ ${ex.weight}lb`;
                          return (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground" title={setsSummary}>
                              {ex.name} · {setCount} sets
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditLog(null); setLogModal(true); }}><ClipboardList size={13} className="mr-2" />Log this workout</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditTemplate(t); setTemplateModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WorkoutLogModal open={logModal} onClose={() => { setLogModal(false); setEditLog(null); }} templates={templates} editLog={editLog} />
      <WorkoutTemplateModal open={templateModal} onClose={() => { setTemplateModal(false); setEditTemplate(null); }} editTemplate={editTemplate} />
    </div>
  );
}
