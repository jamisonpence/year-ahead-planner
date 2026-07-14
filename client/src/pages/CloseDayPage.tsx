import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { HabitWithStats } from "@shared/schema";
import { Check, Moon, PenLine, ArrowRight, Flame, Loader2 } from "lucide-react";

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

/**
 * Evening close-out: the 60-second end-of-day ritual.
 * Check off habits, jot one line about today, set one thing for tomorrow.
 * Reached from the 9pm "Close out your day" push.
 */
export default function CloseDayPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const today = todayStr();

  const { data: habits = [], isLoading } = useQuery<HabitWithStats[]>({ queryKey: ["/api/habits"] });

  const toggleHabit = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/habits/${id}/complete/${today}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/habits"] }),
  });

  // One line about today → quick journal entry
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const saveNote = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/journal", {
        date: today,
        content: note.trim(),
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setNoteSaved(true);
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
    },
  });

  // One thing for tomorrow → task due tomorrow
  const [tomorrow, setTomorrow] = useState("");
  const [tomorrowSaved, setTomorrowSaved] = useState(false);
  const saveTomorrow = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/general-tasks", {
        title: tomorrow.trim(),
        priority: "medium",
        completed: false,
        dueDate: tomorrowStr(),
      }),
    onSuccess: () => {
      setTomorrowSaved(true);
      qc.invalidateQueries({ queryKey: ["/api/general-tasks"] });
    },
  });

  const doneCount = habits.filter(h => h.completions.some(c => c.date === today)).length;
  const allDone = habits.length > 0 && doneCount === habits.length;

  function finish() {
    if (note.trim() && !noteSaved) saveNote.mutate();
    if (tomorrow.trim() && !tomorrowSaved) saveTomorrow.mutate();
    navigate("/dashboard");
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-3">
          <Moon size={22} className="text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold">Close out your day</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · a minute to wrap up
        </p>
      </div>

      {/* ── Habits ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-1.5"><Flame size={14} className="text-amber-500" /> Today's habits</p>
          {habits.length > 0 && (
            <span className={`text-xs font-medium ${allDone ? "text-emerald-500" : "text-muted-foreground"}`}>
              {doneCount}/{habits.length}{allDone ? " 🎉" : ""}
            </span>
          )}
        </div>
        {isLoading && <p className="text-xs text-muted-foreground py-2">Loading…</p>}
        {!isLoading && habits.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No habits yet — build one in Habits and it'll show up here each evening.</p>
        )}
        {habits.map(h => {
          const done = h.completions.some(c => c.date === today);
          return (
            <button
              key={h.id}
              onClick={() => toggleHabit.mutate(h.id)}
              disabled={toggleHabit.isPending}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:border-primary/40"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  done ? "bg-emerald-500 border-emerald-500" : "border-border"
                }`}
              >
                {done && <Check size={13} className="text-white" />}
              </span>
              <span className="text-lg leading-none">{h.emoji}</span>
              <span className={`flex-1 text-sm font-medium ${done ? "line-through opacity-60" : ""}`}>{h.title}</span>
              {h.streakCurrent > 0 && (
                <span className="text-xs text-amber-500 font-semibold flex items-center gap-0.5 shrink-0">
                  <Flame size={11} />{h.streakCurrent}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── One line about today ─────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><PenLine size={14} className="text-primary" /> One line about today</p>
        {noteSaved ? (
          <p className="text-sm text-emerald-500 flex items-center gap-1.5 py-1"><Check size={14} /> Saved to your Journal</p>
        ) : (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="What stood out? Even a sentence counts."
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all resize-none"
          />
        )}
      </div>

      {/* ── Tomorrow ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><ArrowRight size={14} className="text-primary" /> One thing for tomorrow</p>
        {tomorrowSaved ? (
          <p className="text-sm text-emerald-500 flex items-center gap-1.5 py-1"><Check size={14} /> Added to Tasks, due tomorrow</p>
        ) : (
          <input
            value={tomorrow}
            onChange={e => setTomorrow(e.target.value)}
            placeholder="e.g. Book the dentist appointment"
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
          />
        )}
      </div>

      <button
        onClick={finish}
        disabled={saveNote.isPending || saveTomorrow.isPending}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
      >
        {saveNote.isPending || saveTomorrow.isPending
          ? <Loader2 size={15} className="animate-spin" />
          : <Moon size={15} />}
        Done — see you tomorrow
      </button>
    </div>
  );
}
