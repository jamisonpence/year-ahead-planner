import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, ArrowLeft, Check, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionKey =
  | "reading" | "movies" | "music" | "spots"
  | "task" | "note" | "habit_complete" | "task_complete";

interface ActivityItem {
  id: number;
  activityType: string;
  itemType: string;
  itemTitle: string;
  createdAt: string;
}

// ── Section config ────────────────────────────────────────────────────────────

const REPO_SECTIONS: { key: SectionKey; emoji: string; label: string; sub: string }[] = [
  { key: "reading", emoji: "📚", label: "Reading",  sub: "Add a book"          },
  { key: "movies",  emoji: "🎬", label: "Movies",   sub: "Add to watch list"   },
  { key: "music",   emoji: "🎵", label: "Music",    sub: "Add artist or song"  },
  { key: "spots",   emoji: "📍", label: "Places",   sub: "Add a spot or place" },
];

const QUICK_LOG_SECTIONS: { key: SectionKey; emoji: string; label: string; sub: string }[] = [
  { key: "task",          emoji: "✅", label: "Add Task",       sub: "Create a new task"       },
  { key: "note",          emoji: "📝", label: "Add Note",       sub: "Capture a quick thought" },
  { key: "habit_complete",emoji: "🔥", label: "Log Habit",      sub: "Mark a habit done today" },
  { key: "task_complete", emoji: "☑️", label: "Log Task",       sub: "Complete a pending task" },
];

const ALL_SECTIONS = [...REPO_SECTIONS, ...QUICK_LOG_SECTIONS];

const SECTION_EMOJI: Record<string, string> = Object.fromEntries(
  ALL_SECTIONS.map(s => [s.key, s.emoji])
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function entityEmoji(itemType: string): string {
  const map: Record<string, string> = {
    book: "📚", movie: "🎬", show: "🎬", artist: "🎵", song: "🎵",
    recipe: "🍽️", spot: "📍", quote: "💬", art: "🎨",
    workout: "💪", plant: "🌿", hobby: "✨",
  };
  return map[itemType?.toLowerCase()] ?? "✦";
}

// ── Form: Input + Button shared UI ───────────────────────────────────────────

function FormInput({
  label, value, onChange, placeholder, required, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; multiline?: boolean;
}) {
  const cls = "w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-all resize-none";
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {multiline
        ? <textarea className={cls} rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
    </div>
  );
}

function SegmentPicker<T extends string>({
  label, options, value, onChange,
}: {
  label: string; options: { value: T; label: string }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${value === opt.value
                ? "bg-violet-500 border-violet-500 text-white"
                : "bg-secondary/50 border-transparent hover:bg-secondary"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmitButton({ loading, disabled, label = "Add" }: { loading: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm
        hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center gap-2 transition-all shadow-sm"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      {loading ? "Adding…" : label}
    </button>
  );
}

// ── Per-section forms ─────────────────────────────────────────────────────────

function ReadingForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/books", { title, author: author || undefined, status: "want_to_read" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/books"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Book title" value={title} onChange={setTitle} placeholder="e.g. Atomic Habits" required />
      <FormInput label="Author" value={author} onChange={setAuthor} placeholder="e.g. James Clear" />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function MoviesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<"movie" | "show">("movie");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/movies", { title, mediaType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[{ value: "movie", label: "Movie" }, { value: "show", label: "TV Show" }]}
        value={mediaType}
        onChange={setMediaType}
      />
      <FormInput label="Title" value={title} onChange={setTitle} placeholder={mediaType === "movie" ? "e.g. Inception" : "e.g. Severance"} required />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function MusicForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [artistName, setArtistName] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [addSong, setAddSong] = useState(false);
  const mut = useMutation({
    mutationFn: async () => {
      const artistRes = await apiRequest("POST", "/api/music/artists", { name: artistName });
      const artist = await artistRes.json();
      if (addSong && songTitle.trim() && artist?.id) {
        await apiRequest("POST", "/api/music/songs", { artistId: artist.id, title: songTitle });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/music"] });
      qc.invalidateQueries({ queryKey: ["/api/feed/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/user/summary"] });
      onSuccess();
    },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (artistName.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Artist / Band" value={artistName} onChange={setArtistName} placeholder="e.g. Hozier" required />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAddSong(!addSong)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0
            ${addSong ? "bg-violet-500 border-violet-500" : "border-border"}`}
        >
          {addSong && <Check size={11} className="text-white" />}
        </button>
        <span className="text-xs text-muted-foreground">Also add a specific song</span>
      </div>
      {addSong && (
        <FormInput label="Song title" value={songTitle} onChange={setSongTitle} placeholder="e.g. Take Me to Church" />
      )}
      <SubmitButton loading={mut.isPending} disabled={!artistName.trim()} />
    </form>
  );
}

function RecipesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const FOOD_EMOJIS = ["🍽️","🍕","🍜","🍱","🥗","🍝","🥘","🍛","🍣","🥙","🍔","🥞","🍰","☕","🍷"];
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recipes", { name, emoji }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/recipes"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Recipe name" value={name} onChange={setName} placeholder="e.g. Lemon Pasta" required />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Pick an emoji</label>
        <div className="flex flex-wrap gap-2">
          {FOOD_EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors
                ${emoji === e ? "bg-violet-500/20 ring-2 ring-violet-500/50" : "bg-secondary/50 hover:bg-secondary"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function SpotsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"restaurant" | "bar" | "cafe" | "park" | "museum" | "other">("restaurant");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spots", { name, type }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spots"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[
          { value: "restaurant", label: "Restaurant" },
          { value: "bar",        label: "Bar"         },
          { value: "cafe",       label: "Café"        },
          { value: "park",       label: "Park"        },
          { value: "museum",     label: "Museum"      },
          { value: "other",      label: "Other"       },
        ]}
        value={type}
        onChange={setType}
      />
      <FormInput label="Place name" value={name} onChange={setName} placeholder="e.g. Blue Bottle Coffee" required />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function QuotesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"inspiration" | "wisdom" | "humor" | "life" | "other">("inspiration");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/quotes", { text, category }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quotes"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Quote" value={text} onChange={setText} placeholder="Enter the quote…" required multiline />
      <SegmentPicker
        label="Category"
        options={[
          { value: "inspiration", label: "Inspiration" },
          { value: "wisdom",      label: "Wisdom"      },
          { value: "humor",       label: "Humor"       },
          { value: "life",        label: "Life"        },
          { value: "other",       label: "Other"       },
        ]}
        value={category}
        onChange={setCategory}
      />
      <SubmitButton loading={mut.isPending} disabled={!text.trim()} />
    </form>
  );
}

function ArtForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState<"painting" | "sculpture" | "photography" | "digital" | "print" | "other">("painting");
  const [artist, setArtist] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/art", { title, medium, artist: artist || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/art"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Artwork title" value={title} onChange={setTitle} placeholder="e.g. Starry Night" required />
      <FormInput label="Artist" value={artist} onChange={setArtist} placeholder="e.g. Van Gogh" />
      <SegmentPicker
        label="Medium"
        options={[
          { value: "painting",     label: "Painting"     },
          { value: "sculpture",    label: "Sculpture"    },
          { value: "photography",  label: "Photography"  },
          { value: "digital",      label: "Digital"      },
          { value: "print",        label: "Print"        },
          { value: "other",        label: "Other"        },
        ]}
        value={medium}
        onChange={setMedium}
      />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function WorkoutsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [name, setName] = useState("");
  const [workoutType, setWorkoutType] = useState<"strength" | "cardio" | "yoga" | "hiit" | "sports" | "other">("strength");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/workout-logs", { date: today, name: name || workoutType, workoutType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/workout-logs"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[
          { value: "strength", label: "Strength" },
          { value: "cardio",   label: "Cardio"   },
          { value: "yoga",     label: "Yoga"      },
          { value: "hiit",     label: "HIIT"      },
          { value: "sports",   label: "Sports"    },
          { value: "other",    label: "Other"     },
        ]}
        value={workoutType}
        onChange={setWorkoutType}
      />
      <FormInput label="Name (optional)" value={name} onChange={setName} placeholder={`e.g. Morning ${workoutType} session`} />
      <SubmitButton loading={mut.isPending} label="Log Workout" />
    </form>
  );
}

function PlantsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [lightNeeds, setLightNeeds] = useState<"low" | "medium" | "bright" | "direct">("medium");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plants", { name, lightNeeds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/plants"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Plant name" value={name} onChange={setName} placeholder="e.g. Monstera Deliciosa" required />
      <SegmentPicker
        label="Light needs"
        options={[
          { value: "low",    label: "Low"    },
          { value: "medium", label: "Medium" },
          { value: "bright", label: "Bright" },
          { value: "direct", label: "Direct sun" },
        ]}
        value={lightNeeds}
        onChange={setLightNeeds}
      />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function HobbiesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [hobbyType, setHobbyType] = useState<"sports" | "arts" | "gaming" | "music" | "cooking" | "collecting" | "outdoor" | "other">("other");
  const [skillLevel, setSkillLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hobbies", { name, hobbyType, skillLevel, status: "active" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hobbies"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Hobby name" value={name} onChange={setName} placeholder="e.g. Watercolor painting" required />
      <SegmentPicker
        label="Category"
        options={[
          { value: "sports",     label: "Sports"     },
          { value: "arts",       label: "Arts"        },
          { value: "gaming",     label: "Gaming"      },
          { value: "music",      label: "Music"       },
          { value: "cooking",    label: "Cooking"     },
          { value: "collecting", label: "Collecting"  },
          { value: "outdoor",    label: "Outdoor"     },
          { value: "other",      label: "Other"       },
        ]}
        value={hobbyType}
        onChange={setHobbyType}
      />
      <SegmentPicker
        label="Skill level"
        options={[
          { value: "beginner",     label: "Beginner"     },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced",     label: "Advanced"     },
        ]}
        value={skillLevel}
        onChange={setSkillLevel}
      />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

// ── Quick Log: Add Task ───────────────────────────────────────────────────────
function TaskForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/general-tasks", { title, priority, completed: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/general-tasks"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Task" value={title} onChange={setTitle} placeholder="e.g. Call the dentist" required />
      <SegmentPicker label="Priority"
        options={[{ value:"low",label:"Low" },{ value:"medium",label:"Medium" },{ value:"high",label:"High" }]}
        value={priority} onChange={setPriority} />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} label="Add Task" />
    </form>
  );
}

// ── Quick Log: Add Note ───────────────────────────────────────────────────────
function NoteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/journal", { title: title || "Quick Note", content, date: today, mood: "neutral", isPrivate: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (content.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Title (optional)" value={title} onChange={setTitle} placeholder="e.g. Meeting notes" />
      <FormInput label="Note" value={content} onChange={setContent} placeholder="What's on your mind?" required multiline />
      <SubmitButton loading={mut.isPending} disabled={!content.trim()} label="Save Note" />
    </form>
  );
}

// ── Quick Log: Mark Habit Done ────────────────────────────────────────────────
function HabitCompleteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const { data: habits = [] } = useQuery<any[]>({ queryKey: ["/api/habits"] });
  const [selected, setSelected] = useState<number | null>(null);
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/habits/${selected}/complete/${today}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/habits"] }); onSuccess(); },
  });
  if (!habits.length) return <p className="text-sm text-muted-foreground text-center py-6">No habits set up yet. Add habits in the Habits page first.</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Select the habit you completed today:</p>
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {habits.map((h: any) => (
          <button key={h.id} type="button" onClick={() => setSelected(h.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${selected === h.id ? "border-violet-500 bg-violet-500/10" : "border-border hover:bg-secondary"}`}>
            <span className="text-xl leading-none shrink-0">{h.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{h.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{h.category}</p>
            </div>
            {selected === h.id && <Check size={15} className="text-violet-500 shrink-0" />}
          </button>
        ))}
      </div>
      <SubmitButton loading={mut.isPending} disabled={!selected} label="Mark Complete" />
    </div>
  );
}

// ── Quick Log: Complete a Task ────────────────────────────────────────────────
function TaskCompleteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: generalTasks = [] } = useQuery<any[]>({ queryKey: ["/api/general-tasks"] });
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects/standalone"],
    queryFn: () => apiRequest("GET", "/api/projects/standalone").then(r => r.json()),
  });

  const [selected, setSelected] = useState<{ id: number; type: "general" | "project" } | null>(null);

  const generalMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/general-tasks/${id}`, { completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/general-tasks"] }); onSuccess(); },
  });
  const projectMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/project-tasks/${id}`, { completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/projects/standalone"] }); onSuccess(); },
  });

  const pending = generalTasks.filter((t: any) => !t.completed);
  const dueToday = pending.filter((t: any) => t.dueDate === today);
  const noDueDate = pending.filter((t: any) => !t.dueDate);
  const otherDue  = pending.filter((t: any) => t.dueDate && t.dueDate !== today);

  const pendingProjectTasks = projects.flatMap((p: any) =>
    (p.tasks ?? []).filter((t: any) => !t.completed).map((t: any) => ({ ...t, projectTitle: p.title }))
  );

  const totalPending = pending.length + pendingProjectTasks.length;
  if (totalPending === 0) return (
    <p className="text-sm text-muted-foreground text-center py-6">No pending tasks — you're all caught up! 🎉</p>
  );

  function TaskRow({ t, type }: { t: any; type: "general" | "project" }) {
    const isSelected = selected?.id === t.id && selected?.type === type;
    return (
      <button type="button"
        onClick={() => setSelected({ id: t.id, type })}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${isSelected ? "border-violet-500 bg-violet-500/10" : "border-border hover:bg-secondary"}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{t.title}</p>
          <p className="text-xs text-muted-foreground">
            {t.projectTitle ? `📁 ${t.projectTitle}` : t.dueDate === today ? "📅 Due today" : t.priority ? `${t.priority} priority` : "No due date"}
          </p>
        </div>
        {isSelected && <Check size={15} className="text-violet-500 shrink-0" />}
      </button>
    );
  }

  function Section({ label, tasks, type }: { label: string; tasks: any[]; type: "general" | "project" }) {
    if (!tasks.length) return null;
    return (
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
        <div className="space-y-1.5">
          {tasks.map(t => <TaskRow key={t.id} t={t} type={type} />)}
        </div>
      </div>
    );
  }

  function handleComplete() {
    if (!selected) return;
    if (selected.type === "general") generalMut.mutate(selected.id);
    else projectMut.mutate(selected.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-y-auto space-y-4" style={{ maxHeight: "calc(100dvh - 22rem)" }}>
        <Section label="Due Today" tasks={dueToday} type="general" />
        <Section label="No Due Date" tasks={noDueDate} type="general" />
        <Section label="Other Due Dates" tasks={otherDue} type="general" />
        {projects.map((p: any) => {
          const pts = (p.tasks ?? []).filter((t: any) => !t.completed);
          if (!pts.length) return null;
          return (
            <div key={p.id}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">📁 {p.title}</p>
              <div className="space-y-1.5">
                {pts.map((t: any) => <TaskRow key={t.id} t={{ ...t, projectTitle: p.title }} type="project" />)}
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleComplete}
        disabled={!selected || generalMut.isPending || projectMut.isPending}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
      >
        {(generalMut.isPending || projectMut.isPending) ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        {(generalMut.isPending || projectMut.isPending) ? "Saving…" : "Mark Complete"}
      </button>
    </div>
  );
}

// ── Section form router ───────────────────────────────────────────────────────

function SectionForm({ section, onSuccess }: { section: SectionKey; onSuccess: () => void }) {
  const forms: Record<SectionKey, React.ReactNode> = {
    reading:        <ReadingForm        onSuccess={onSuccess} />,
    movies:         <MoviesForm         onSuccess={onSuccess} />,
    music:          <MusicForm          onSuccess={onSuccess} />,
    spots:          <SpotsForm          onSuccess={onSuccess} />,
    task:           <TaskForm           onSuccess={onSuccess} />,
    note:           <NoteForm           onSuccess={onSuccess} />,
    habit_complete: <HabitCompleteForm  onSuccess={onSuccess} />,
    task_complete:  <TaskCompleteForm   onSuccess={onSuccess} />,
  };
  return <>{forms[section]}</>;
}

// ── Recent adds row ───────────────────────────────────────────────────────────

function RecentAddsRow() {
  const { data: feed = [] } = useQuery<ActivityItem[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => apiRequest("GET", "/api/feed/mine?limit=6").then(r => r.json()),
    staleTime: 30_000,
  });

  const recent = feed.slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <div className="px-5 pb-3">
      <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wide">Recently added</p>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {recent.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/40 shrink-0"
          >
            <span className="text-sm leading-none">{entityEmoji(item.itemType)}</span>
            <span className="text-xs font-medium truncate max-w-[120px]">{item.itemTitle}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Success flash ─────────────────────────────────────────────────────────────

function SuccessFlash({ section, onDone }: { section: SectionKey; onDone: () => void }) {
  const s = ALL_SECTIONS.find(x => x.key === section)!;
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
        <Check size={28} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="text-center">
        <p className="text-base font-bold">{s.emoji} Added!</p>
        <p className="text-xs text-muted-foreground mt-0.5">Saved to your {s.label}</p>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
}

export default function QuickAddModal({ open, onClose }: QuickAddModalProps) {
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Slide-up animation state
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      // Tiny delay so the DOM renders first, then we trigger the slide
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      // Wait for slide-out animation before unmounting
      const t = setTimeout(() => {
        setRendered(false);
        setActiveSection(null);
        setShowSuccess(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Swipe-down to dismiss
  const touchStartY = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 90) onClose();
    touchStartY.current = null;
  }

  if (!rendered) return null;

  const activeInfo = activeSection ? ALL_SECTIONS.find(s => s.key === activeSection) : null;

  function handleSuccess() {
    setShowSuccess(true);
    // onDone in SuccessFlash will call this after delay
  }

  function handleSuccessDone() {
    setShowSuccess(false);
    setActiveSection(null);
    onClose();
  }

  // ── Shared inner content (header + body) ──────────────────────────────────
  const modalHeader = (
    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
      {activeSection ? (
        <button
          onClick={() => { setActiveSection(null); setShowSuccess(false); }}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </button>
      ) : (
        <span className="font-bold text-base">Add Something</span>
      )}
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
        <X size={16} />
      </button>
    </div>
  );

  const modalBody = (
    <>
      {showSuccess && activeSection ? (
        <div className="pb-10">
          <SuccessFlash section={activeSection} onDone={handleSuccessDone} />
        </div>
      ) : activeSection && activeInfo ? (
        /* Section form view */
        <div className="px-5 pt-5 pb-10 space-y-5">
          <div className="flex items-center gap-2.5">
            <span className="text-3xl leading-none">{activeInfo.emoji}</span>
            <div>
              <p className="font-bold text-base leading-tight">{activeInfo.label}</p>
              <p className="text-xs text-muted-foreground">{activeInfo.sub}</p>
            </div>
          </div>
          <SectionForm section={activeSection} onSuccess={handleSuccess} />
        </div>
      ) : (
        /* Two-section picker */
        <div className="px-4 pb-10 space-y-5 pt-2">
          {/* Repository section */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
              Add to Repository
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {REPO_SECTIONS.map(sec => (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-secondary/50 hover:bg-violet-500/10 border border-transparent hover:border-violet-400/30 transition-all active:scale-95 text-left"
                >
                  <span className="text-2xl leading-none shrink-0">{sec.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{sec.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight truncate">{sec.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Logs section */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
              Quick Logs
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_LOG_SECTIONS.map(sec => (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-secondary/50 hover:bg-violet-500/10 border border-transparent hover:border-violet-400/30 transition-all active:scale-95 text-left"
                >
                  <span className="text-2xl leading-none shrink-0">{sec.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{sec.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight truncate">{sec.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Backdrop — shown on all screen sizes */}
      <div
        className={`fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* ── Mobile: bottom sheet ──────────────────────────────────────────── */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-[80] bg-card rounded-t-3xl shadow-2xl
          transition-transform duration-300 ease-out
          ${visible ? "translate-y-0" : "translate-y-full"}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {modalHeader}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100dvh - 8rem)" }}>
          {modalBody}
        </div>
      </div>

      {/* ── Desktop: centered dialog ──────────────────────────────────────── */}
      <div
        className={`hidden lg:flex fixed inset-0 z-[80] items-center justify-center transition-all duration-200
          ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className={`bg-card rounded-2xl shadow-2xl w-[440px] max-h-[80vh] flex flex-col overflow-hidden
            transition-all duration-200 ${visible ? "scale-100" : "scale-95"}`}
          onClick={e => e.stopPropagation()}
        >
          {modalHeader}
          <div className="overflow-y-auto flex-1">
            {modalBody}
          </div>
        </div>
      </div>
    </>
  );
}
