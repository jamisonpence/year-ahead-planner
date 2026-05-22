import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChildWithDetails, ChildMilestone, ChildMemory, ChildPrepItem, TabCollaborationWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Baby, Plus, Pencil, Trash2, Check, Users,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
];

const MILESTONE_CATEGORIES = [
  { value: "first",    label: "First Moments", emoji: "🎉" },
  { value: "motor",    label: "Motor",          emoji: "🏃" },
  { value: "speech",   label: "Speech",         emoji: "💬" },
  { value: "social",   label: "Social",         emoji: "👫" },
  { value: "academic", label: "Academic",       emoji: "📚" },
  { value: "health",   label: "Health",         emoji: "❤️" },
  { value: "other",    label: "Other",          emoji: "⭐" },
];

const MEMORY_MOODS = [
  { value: "happy",       label: "Happy",       emoji: "😄" },
  { value: "funny",       label: "Funny",       emoji: "😂" },
  { value: "proud",       label: "Proud",       emoji: "🥹" },
  { value: "sweet",       label: "Sweet",       emoji: "🥰" },
  { value: "bittersweet", label: "Bittersweet", emoji: "😌" },
];

const PREP_CATEGORIES = [
  { value: "health",   label: "Health"   },
  { value: "school",   label: "School"   },
  { value: "activity", label: "Activity" },
  { value: "party",    label: "Party"    },
  { value: "safety",   label: "Safety"   },
  { value: "gear",     label: "Gear"     },
  { value: "other",    label: "Other"    },
];

// ── Developmental Stages ──────────────────────────────────────────────────────

interface DevMilestoneGroup {
  category: string;
  emoji: string;
  items: string[];
}

interface FoodDailyRow {
  label: string;
  amount: string;
}

interface FoodGuide {
  bullets: string[];
  dailyPattern?: FoodDailyRow[];
}

interface DevStage {
  label: string;
  minMonths: number;
  maxMonths: number;
  icon: string;
  color: string;
  careTips: string[];
  foodGuide: FoodGuide;
  milestones: DevMilestoneGroup[];
}

const DEV_STAGES: DevStage[] = [
  {
    label: "Birth – 3 months", minMonths: 0, maxMonths: 3,
    icon: "🍼", color: "#f9a8d4",
    careTips: [
      "Follow safe sleep guidelines — always on their back on a firm, flat surface",
      "Feed on demand (every 2–3 hours); watch for hunger cues",
      "Skin-to-skin contact builds bonding and helps regulate temperature",
      "Start short tummy time sessions a few times a day to build neck strength",
    ],
    foodGuide: {
      bullets: [
        "Breastmilk or infant formula only — no water, juice, or solid food",
        "Typical intake is 8–12 feeds per 24 hours, roughly every 2–3 hours",
        "Watch for hunger and fullness cues rather than feeding by the clock",
        "Vitamin D supplement is often recommended for breastfed babies — ask your pediatrician",
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Social smiling appears around 6 weeks", "Calms when picked up or spoken to"] },
      { category: "Communication", emoji: "💬", items: ["Coos and makes soft sounds", "Reacts to familiar voices"] },
      { category: "Cognitive", emoji: "🧠", items: ["Tracks a moving object with eyes", "Begins to recognise familiar faces"] },
      { category: "Motor", emoji: "🏃", items: ["Lifts head briefly during tummy time", "Moves arms and legs actively"] },
    ],
  },
  {
    label: "3 – 6 months", minMonths: 3, maxMonths: 6,
    icon: "🌱", color: "#86efac",
    careTips: [
      "Increase tummy time to strengthen core muscles and prepare for rolling",
      "Sing, read aloud, and narrate daily activities — language starts now",
      "Establish a consistent sleep routine with predictable calming cues",
      "Offer high-contrast toys and mobiles to stimulate developing vision",
    ],
    foodGuide: {
      bullets: [
        "Breastmilk or formula is still the only food — it provides all nutrition needed",
        "Many babies stretch to 3–4 hours between feeds but still feed frequently",
        "No juice or water unless specifically advised by your doctor",
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Laughs out loud", "Recognises and prefers familiar caregivers"] },
      { category: "Communication", emoji: "💬", items: ["Babbles and coos more expressively", "Turns toward sounds"] },
      { category: "Cognitive", emoji: "🧠", items: ["Reaches for interesting objects", "Explores things by putting them in their mouth"] },
      { category: "Motor", emoji: "🏃", items: ["Holds head steady when upright", "Rolls from tummy to back"] },
    ],
  },
  {
    label: "6 – 9 months", minMonths: 6, maxMonths: 9,
    icon: "🌼", color: "#fde68a",
    careTips: [
      "Give plenty of safe floor time to encourage rolling and early crawling",
      "Introduce solid foods when ready — good head control, interest in food, can sit with support",
      "Play peek-a-boo and hiding games to build object permanence",
      "Talk about everything you do together to rapidly expand vocabulary",
    ],
    foodGuide: {
      bullets: [
        "Continue breastmilk or formula as the main source of nutrition",
        "Start solids around 4–6 months with pediatrician approval — look for readiness signs",
        "Begin with iron-rich foods: iron-fortified baby cereal, pureed meats, beans, plus pureed fruits and vegetables",
        "Introduce one new food at a time to watch for reactions",
        "Progress textures gradually from smooth purées toward thicker purées and soft mashed foods",
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Stranger anxiety begins to appear", "Shows clear affection for familiar caregivers"] },
      { category: "Communication", emoji: "💬", items: ["Babbles ('ba-ba', 'da-da') — not yet meaningful", "Responds to their own name"] },
      { category: "Cognitive", emoji: "🧠", items: ["Looks for a dropped object", "Explores by banging and shaking objects"] },
      { category: "Motor", emoji: "🏃", items: ["Sits with less support", "Transfers objects hand-to-hand; may start crawling"] },
    ],
  },
  {
    label: "9 – 12 months", minMonths: 9, maxMonths: 12,
    icon: "🚶", color: "#c4b5fd",
    careTips: [
      "Encourage cruising (walking while holding furniture) and standing practice",
      "Read simple picture books daily and point to objects, naming them",
      "Baby-proof low shelves and sharp corners — mobility is about to take off",
      "Offer soft finger foods to build pincer grasp and mealtime independence",
    ],
    foodGuide: {
      bullets: [
        "Breastmilk or formula still important — most babies have 3 solid meals plus 1–2 snacks by this age",
        "Offer soft finger foods: small pieces of soft fruits and veg, well-cooked pasta, soft meats, scrambled egg (once allergy-cleared)",
        "Encourage self-feeding with hands and practice sipping from a small cup of water at meals",
        "Avoid honey before age 1 and choking hazards: whole grapes, nuts, popcorn, large chunks of raw veg or meat",
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Separation anxiety peaks", "Plays simple interactive games (pat-a-cake)"] },
      { category: "Communication", emoji: "💬", items: ["Says 1–2 words with meaning (e.g. 'mama', 'dada', 'no')", "Waves bye-bye and points to things they want"] },
      { category: "Cognitive", emoji: "🧠", items: ["Finds a hidden object after watching you hide it", "Imitates gestures and simple actions"] },
      { category: "Motor", emoji: "🏃", items: ["Pulls to standing independently", "May stand or walk with help — or independently"] },
    ],
  },
  {
    label: "12 – 24 months", minMonths: 12, maxMonths: 24,
    icon: "🧒", color: "#fdba74",
    careTips: [
      "Create a safe, open space for walking and exploring freely",
      "Offer simple choices ('red cup or blue cup?') to build autonomy and decision-making",
      "Keep a consistent daily routine — predictability significantly reduces tantrums",
      "Read together every day; point to pictures and name them as you go",
    ],
    foodGuide: {
      bullets: [
        "Transition from formula to whole cow's milk (or an appropriate fortified alternative) around 12 months, as recommended by your pediatrician",
        "Aim for about 2–3 cups of milk per day — too much crowds out iron-rich foods",
        "Shift toward family foods in toddler-size portions: fruits, vegetables, grains, protein, and dairy",
        "Offer 3 meals and 1–2 snacks daily; avoid frequent grazing and limit added sugars and highly processed foods",
      ],
      dailyPattern: [
        { label: "🍎 Fruits & Vegetables", amount: "Several small servings across the day (a few tablespoons per meal/snack)" },
        { label: "🌾 Grains", amount: "3–4 toddler-size servings; aim for at least half whole grains" },
        { label: "🍗 Protein", amount: "Small portions of meat, fish, eggs, beans, tofu, or yogurt spread over meals" },
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Tantrums emerge as independence grows", "Simple pretend play begins"] },
      { category: "Communication", emoji: "💬", items: ["Vocabulary grows to 10–50+ words by 24 months", "Begins combining 2 words ('more milk', 'daddy go')"] },
      { category: "Cognitive", emoji: "🧠", items: ["Pretend play begins (feeding a doll, 'talking' on a phone)", "Sorts shapes and colours"] },
      { category: "Motor", emoji: "🏃", items: ["Walks well and begins to run, climbs, kicks and throws a ball", "Scribbles with crayons"] },
    ],
  },
  {
    label: "2 – 3 years", minMonths: 24, maxMonths: 36,
    icon: "🌟", color: "#67e8f9",
    careTips: [
      "Encourage outdoor play every day for gross motor development",
      "Read aloud daily and ask open questions like 'what do you think happens next?'",
      "Begin toilet training when they show readiness signs (interest, staying dry longer)",
      "Use simple, consistent rules and explain the reason behind them",
    ],
    foodGuide: {
      bullets: [
        "Kids this age can follow the same overall pattern as the family, just in smaller portions",
        "Keep offering new foods repeatedly in small amounts — picky eating is very common at this stage",
        "Limit sugary drinks; water and milk are the best choices",
      ],
      dailyPattern: [
        { label: "🍎 Fruits", amount: "About 1 to 1.5 cups/day" },
        { label: "🥦 Vegetables", amount: "About 1 to 2 cups/day" },
        { label: "🌾 Grains", amount: "About 3–5 oz/day (half as whole grains)" },
        { label: "🍗 Protein", amount: "Roughly 2–5 oz/day" },
        { label: "🥛 Dairy", amount: "About 2 to 2.5 cups/day" },
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Engages in parallel play alongside other children", "Increasing independence — may say 'no' frequently"] },
      { category: "Communication", emoji: "💬", items: ["Uses 2–3 word phrases; rapidly growing vocabulary", "Follows 2-step instructions"] },
      { category: "Cognitive", emoji: "🧠", items: ["Sorts objects by colour or shape", "Understands 'mine' vs. 'yours'"] },
      { category: "Motor", emoji: "🏃", items: ["Runs confidently, climbs, walks stairs with support", "Draws simple lines and circles"] },
    ],
  },
  {
    label: "3 – 4 years", minMonths: 36, maxMonths: 48,
    icon: "🎨", color: "#a5b4fc",
    careTips: [
      "Encourage rich imaginative and pretend play — it builds creativity and empathy",
      "Assign simple age-appropriate tasks (tidying toys, setting napkins out)",
      "Keep house rules consistent and always explain the 'why' behind them",
      "Arrange regular playdates to develop cooperative social skills",
    ],
    foodGuide: {
      bullets: [
        "Continue a balanced pattern of fruits, vegetables, grains, protein, and dairy; limit sugary drinks and snacks",
        "Aim for meals with 3+ food groups and snacks with at least 2 food groups (e.g. fruit + yogurt)",
      ],
      dailyPattern: [
        { label: "🥦 Vegetables", amount: "About 1.5–2.5 cups/day" },
        { label: "🍎 Fruits", amount: "About 1–1.5 cups/day" },
        { label: "🌾 Grains", amount: "About 4–6 oz/day (focus on whole grains)" },
        { label: "🍗 Protein", amount: "About 3–5 oz/day" },
        { label: "🥛 Dairy", amount: "About 2–3 cups/day" },
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Plays cooperatively with peers (taking turns, sharing)", "Shows empathy; understands simple rules"] },
      { category: "Communication", emoji: "💬", items: ["Uses longer, more complex sentences", "Asks lots of 'why' questions"] },
      { category: "Cognitive", emoji: "🧠", items: ["Draws a person with 2–4 body parts", "Counts to 5 and understands the concept"] },
      { category: "Motor", emoji: "🏃", items: ["Pedals a tricycle; hops on one foot", "Draws simple shapes; dresses with some help"] },
    ],
  },
  {
    label: "4 – 5 years", minMonths: 48, maxMonths: 72,
    icon: "🎓", color: "#6ee7b7",
    careTips: [
      "Encourage group play and early friendships with peers",
      "Read longer, more complex stories and discuss characters and their feelings",
      "Foster self-care skills: dressing, brushing teeth, washing hands independently",
      "Play simple board games together to build turn-taking and rule-following",
    ],
    foodGuide: {
      bullets: [
        "Similar pattern to 3–4 years but portions may increase slightly with growth and activity",
        "Encourage kids to help plan and prepare simple foods — it builds enthusiasm for healthy eating",
        "Continue limiting sugary drinks and highly processed snacks",
      ],
      dailyPattern: [
        { label: "🥦 Vegetables", amount: "Around 1.5–2.5 cups/day" },
        { label: "🍎 Fruits", amount: "About 1–2 cups/day" },
        { label: "🌾 Grains", amount: "About 4–6 oz/day (half whole grains)" },
        { label: "🍗 Protein", amount: "About 3–5 oz/day" },
        { label: "🥛 Dairy", amount: "About 2.5–3 cups/day" },
      ],
    },
    milestones: [
      { category: "Social & Emotional", emoji: "💛", items: ["Follows game rules with guidance; likes to 'perform'", "May help with simple chores; distinguishes fantasy from reality"] },
      { category: "Communication", emoji: "💬", items: ["Tells stories and retells events in sequence", "Names some letters and numbers"] },
      { category: "Cognitive", emoji: "🧠", items: ["Counts to 10 and beyond", "Names basic colours and shapes accurately"] },
      { category: "Motor", emoji: "🏃", items: ["Hops, skips, catches a bounced ball", "Buttons some buttons"] },
    ],
  },
];

function calcTotalMonths(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const ref = new Date();
  if (isNaN(birth.getTime())) return null;
  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (ref.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return years * 12 + months;
}

function getDevStage(birthDate: string | null | undefined): DevStage | null {
  const totalMonths = calcTotalMonths(birthDate);
  if (totalMonths === null || totalMonths < 0) return null;
  return DEV_STAGES.find((s) => totalMonths >= s.minMonths && totalMonths < s.maxMonths) ?? null;
}

// ── Development Tab ───────────────────────────────────────────────────────────

function DevelopmentTab({ child }: { child: ChildWithDetails }) {
  if (!child.birthDate) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-4xl block mb-3">📅</span>
        <p className="text-sm">Add a birth date to see age-appropriate development tips and milestones.</p>
      </div>
    );
  }
  const stage = getDevStage(child.birthDate);
  if (!stage) {
    const totalMonths = calcTotalMonths(child.birthDate) ?? 0;
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-4xl block mb-3">🎉</span>
        <p className="text-sm font-medium">
          {totalMonths >= 72 ? "Beyond our age guide!" : "Not yet in our age guide."}
        </p>
        <p className="text-xs mt-1 max-w-xs mx-auto">
          {totalMonths >= 72
            ? "Our developmental guide covers birth through 5 years. Keep celebrating every milestone!"
            : "Birth date looks very recent — check back soon!"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stage banner */}
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: stage.color + "25", border: `1.5px solid ${stage.color}60` }}
      >
        <span className="text-3xl block mb-1">{stage.icon}</span>
        <h3 className="font-bold text-base">{stage.label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{calcAge(child.birthDate)} old</p>
      </div>

      {/* Care Tips */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          💡 Care Tips
        </h4>
        <div className="space-y-2">
          {stage.careTips.map((tip, i) => (
            <div key={i} className="flex gap-3 rounded-lg border bg-card p-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                style={{ background: stage.color + "40", color: stage.color }}
              >
                {i + 1}
              </div>
              <p className="text-sm leading-snug">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Food Guide */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          🍽️ Feeding &amp; Food Guide
        </h4>
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <ul className="space-y-1.5">
            {stage.foodGuide.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-muted-foreground/50 shrink-0 mt-0.5">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {stage.foodGuide.dailyPattern && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Typical daily amounts</p>
              <div className="space-y-1">
                {stage.foodGuide.dailyPattern.map((row, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 text-sm py-1 border-t border-border/50 first:border-t-0">
                    <span className="font-medium shrink-0">{row.label}</span>
                    <span className="text-muted-foreground text-right text-xs">{row.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Common Milestones */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          🎯 Common Milestones
        </h4>
        <div className="space-y-2.5">
          {stage.milestones.map((group) => (
            <div key={group.category} className="rounded-lg border bg-card p-3">
              <h5 className="text-xs font-semibold text-muted-foreground mb-2">
                {group.emoji} {group.category}
              </h5>
              <ul className="space-y-1.5">
                {group.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground/50 shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center pb-1">
        Milestones are typical ranges — every child develops at their own pace.
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(birthDate: string | null | undefined, atDate?: string): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const ref = atDate ? new Date(atDate) : new Date();
  if (isNaN(birth.getTime())) return "";
  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (ref.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  if (totalMonths < 24) return `${totalMonths} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

function moodEmoji(mood: string) {
  return MEMORY_MOODS.find((m) => m.value === mood)?.emoji ?? "😄";
}

function catLabel(cat: string) {
  return MILESTONE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
function catEmoji(cat: string) {
  return MILESTONE_CATEGORIES.find((c) => c.value === cat)?.emoji ?? "⭐";
}

// ── Milestone Dialog ──────────────────────────────────────────────────────────

function MilestoneDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildMilestone | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    category: editing?.category ?? "other",
    date: editing?.date ?? "",
    notes: editing?.notes ?? "",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      category: editing?.category ?? "other",
      date: editing?.date ?? "",
      notes: editing?.notes ?? "",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/milestones`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-milestones/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), notes: form.notes.trim() || null, date: form.date || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Milestone" : "Add Milestone"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="First steps!" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any details…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Memory Dialog ─────────────────────────────────────────────────────────────

function MemoryDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildMemory | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    date: editing?.date ?? "",
    tags: editing?.tags ?? "",
    mood: editing?.mood ?? "happy",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      description: editing?.description ?? "",
      date: editing?.date ?? "",
      tags: editing?.tags ?? "",
      mood: editing?.mood ?? "happy",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/memories`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-memories/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), description: form.description.trim() || null, tags: form.tags.trim() || null, date: form.date || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Memory" : "Add Memory"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="First day of school" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mood</label>
              <Select value={form.mood} onValueChange={(v) => setForm((f) => ({ ...f, mood: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMORY_MOODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.emoji} {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Tell the story…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
            <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="funny, outdoors" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Prep Item Dialog ──────────────────────────────────────────────────────────

function PrepDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildPrepItem | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    category: editing?.category ?? "other",
    dueDate: editing?.dueDate ?? "",
    notes: editing?.notes ?? "",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      category: editing?.category ?? "other",
      dueDate: editing?.dueDate ?? "",
      notes: editing?.notes ?? "",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/prep-items`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-prep-items/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), notes: form.notes.trim() || null, dueDate: form.dueDate || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Prep Item" : "Add Prep Item"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Doctor checkup" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREP_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Child Detail ──────────────────────────────────────────────────────────────

function ChildDetail({ child }: { child: ChildWithDetails }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("development");
  const [milestoneDialog, setMilestoneDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ChildMilestone | null>(null);
  const [memoryDialog, setMemoryDialog] = useState(false);
  const [editingMemory, setEditingMemory] = useState<ChildMemory | null>(null);
  const [prepDialog, setPrepDialog] = useState(false);
  const [editingPrep, setEditingPrep] = useState<ChildPrepItem | null>(null);

  const deleteMilestoneMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-milestones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const deleteMemoryMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-memories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const togglePrepMut = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/child-prep-items/${id}`, { completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const deletePrepMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-prep-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });

  // Group milestones by category
  const milestonesByCategory = useMemo(() => {
    const map: Record<string, ChildMilestone[]> = {};
    MILESTONE_CATEGORIES.forEach((c) => { map[c.value] = []; });
    child.milestones.forEach((m) => {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    });
    return map;
  }, [child.milestones]);

  // Group prep items by category
  const prepByCategory = useMemo(() => {
    const map: Record<string, ChildPrepItem[]> = {};
    PREP_CATEGORIES.forEach((c) => { map[c.value] = []; });
    child.prepItems.forEach((p) => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return map;
  }, [child.prepItems]);

  const accentColor = child.accentColor ?? "#6366f1";

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="development">Development</TabsTrigger>
          <TabsTrigger value="milestones">Milestones <span className="ml-1 text-xs opacity-60">{child.milestones.length}</span></TabsTrigger>
          <TabsTrigger value="memories">Memories <span className="ml-1 text-xs opacity-60">{child.memories.length}</span></TabsTrigger>
          <TabsTrigger value="prep">Prep <span className="ml-1 text-xs opacity-60">{child.prepItems.length}</span></TabsTrigger>
        </TabsList>

        {/* ── Development ── */}
        <TabsContent value="development">
          <DevelopmentTab child={child} />
        </TabsContent>

        {/* ── Milestones ── */}
        <TabsContent value="milestones">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingMilestone(null); setMilestoneDialog(true); }}>
              <Plus size={14} /> Add Milestone
            </Button>
          </div>
          {child.milestones.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">🎯</span>
              <p className="text-sm">No milestones yet. Add the first one!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {MILESTONE_CATEGORIES.map((cat) => {
                const items = milestonesByCategory[cat.value] ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={cat.value}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {cat.emoji} {cat.label}
                    </h3>
                    <div className="space-y-2">
                      {items.map((ms) => (
                        <div key={ms.id} className="rounded-lg border bg-card p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{ms.title}</p>
                              {ms.date && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{ms.date}</span>
                                  {child.birthDate && (
                                    <span className="text-xs text-muted-foreground/70">
                                      · age {calcAge(child.birthDate, ms.date)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {ms.notes && <p className="text-xs text-muted-foreground mt-1">{ms.notes}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => { setEditingMilestone(ms); setMilestoneDialog(true); }}
                                className="p-1.5 rounded hover:bg-secondary transition-colors">
                                <Pencil size={12} className="text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteMilestoneMut.mutate(ms.id)}
                                className="p-1.5 rounded hover:bg-secondary transition-colors">
                                <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Memories ── */}
        <TabsContent value="memories">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingMemory(null); setMemoryDialog(true); }}>
              <Plus size={14} /> Add Memory
            </Button>
          </div>
          {child.memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">📸</span>
              <p className="text-sm">No memories yet. Capture the first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {child.memories.map((mem) => (
                <div key={mem.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="h-1 w-full" style={{ background: accentColor }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{moodEmoji(mem.mood)}</span>
                          <h3 className="font-medium text-sm">{mem.title}</h3>
                        </div>
                        {mem.date && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{mem.date}</span>
                            {child.birthDate && (
                              <span className="text-xs text-muted-foreground/70">· age {calcAge(child.birthDate, mem.date)}</span>
                            )}
                          </div>
                        )}
                        {mem.description && <p className="text-sm text-muted-foreground mt-1.5">{mem.description}</p>}
                        {mem.tags && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {mem.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingMemory(mem); setMemoryDialog(true); }}
                          className="p-1.5 rounded hover:bg-secondary transition-colors">
                          <Pencil size={12} className="text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteMemoryMut.mutate(mem.id)}
                          className="p-1.5 rounded hover:bg-secondary transition-colors">
                          <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Prep ── */}
        <TabsContent value="prep">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingPrep(null); setPrepDialog(true); }}>
              <Plus size={14} /> Add Prep Item
            </Button>
          </div>
          {child.prepItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">📋</span>
              <p className="text-sm">No prep items yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {PREP_CATEGORIES.map((cat) => {
                const items = prepByCategory[cat.value] ?? [];
                if (items.length === 0) return null;
                const done = items.filter((i) => i.completed).length;
                const pct = Math.round((done / items.length) * 100);
                return (
                  <div key={cat.value}>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{cat.label}</h3>
                      <span className="text-xs text-muted-foreground">{done}/{items.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accentColor }} />
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                          <button
                            onClick={() => togglePrepMut.mutate({ id: item.id, completed: !item.completed })}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              item.completed ? "bg-primary border-primary" : "border-muted-foreground/40"
                            }`}
                          >
                            {item.completed && <Check size={11} className="text-primary-foreground" />}
                          </button>
                          <div className="flex-1">
                            <p className={`text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>
                            {item.dueDate && <p className="text-xs text-muted-foreground">Due {item.dueDate}</p>}
                            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => { setEditingPrep(item); setPrepDialog(true); }}
                              className="p-1.5 rounded hover:bg-secondary transition-colors">
                              <Pencil size={12} className="text-muted-foreground" />
                            </button>
                            <button onClick={() => deletePrepMut.mutate(item.id)}
                              className="p-1.5 rounded hover:bg-secondary transition-colors">
                              <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MilestoneDialog
        open={milestoneDialog}
        onClose={() => { setMilestoneDialog(false); setEditingMilestone(null); }}
        childId={child.id}
        editing={editingMilestone}
      />
      <MemoryDialog
        open={memoryDialog}
        onClose={() => { setMemoryDialog(false); setEditingMemory(null); }}
        childId={child.id}
        editing={editingMemory}
      />
      <PrepDialog
        open={prepDialog}
        onClose={() => { setPrepDialog(false); setEditingPrep(null); }}
        childId={child.id}
        editing={editingPrep}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KidsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [childDialog, setChildDialog] = useState(false);
  const [editingChild, setEditingChild] = useState<ChildWithDetails | null>(null);
  const [childForm, setChildForm] = useState({ name: "", birthDate: "", notes: "", accentColor: ACCENT_COLORS[0] });

  const { data: allChildren = [] } = useQuery<ChildWithDetails[]>({
    queryKey: ["/api/children"],
    queryFn: async () => (await apiRequest("GET", "/api/children")).json(),
  });

  const { data: collabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const kidsCollab = collabs.find(c => c.tabName === "kids" && c.status === "accepted");

  const selectedChild = useMemo(
    () => allChildren.find((c) => c.id === selectedChildId) ?? allChildren[0] ?? null,
    [allChildren, selectedChildId],
  );

  const createChildMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/children", d),
    onSuccess: async (r) => {
      const created = await r.json();
      qc.invalidateQueries({ queryKey: ["/api/children"] });
      setSelectedChildId(created.id);
      closeChildDialog();
    },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateChildMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/children/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); closeChildDialog(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const deleteChildMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/children/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/children"] });
      setSelectedChildId(null);
    },
  });

  function openAddChild() {
    setEditingChild(null);
    setChildForm({ name: "", birthDate: "", notes: "", accentColor: ACCENT_COLORS[0] });
    setChildDialog(true);
  }
  function openEditChild(c: ChildWithDetails) {
    setEditingChild(c);
    setChildForm({ name: c.name, birthDate: c.birthDate ?? "", notes: c.notes ?? "", accentColor: c.accentColor ?? ACCENT_COLORS[0] });
    setChildDialog(true);
  }
  function closeChildDialog() { setChildDialog(false); setEditingChild(null); }

  function saveChild() {
    if (!childForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = { ...childForm, name: childForm.name.trim(), notes: childForm.notes.trim() || null, birthDate: childForm.birthDate || null };
    if (editingChild) updateChildMut.mutate({ id: editingChild.id, d: payload });
    else createChildMut.mutate(payload);
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Baby size={22} /> Kids
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allChildren.length} {allChildren.length === 1 ? "child" : "children"}
          </p>
        </div>
        <Button onClick={openAddChild} size="sm" className="gap-1.5">
          <Plus size={15} /> Add Child
        </Button>
      </div>

      {kidsCollab && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
          <Users size={14} className="shrink-0" />
          <span>
            Collaborating with <strong>{kidsCollab.otherUser.name}</strong>
            {kidsCollab.role === "collaborator" ? " — viewing their data" : " — they can see your data"}
          </span>
        </div>
      )}

      {allChildren.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Baby size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm mb-4">Add a child to start tracking milestones, memories, and prep.</p>
          <Button variant="outline" onClick={openAddChild} className="gap-1.5">
            <Plus size={14} /> Add Child
          </Button>
        </div>
      ) : (
        <>
          {/* Child selector pills */}
          {allChildren.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {allChildren.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                    (selectedChild?.id === c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: c.accentColor ?? "#6366f1" }}
                  />
                  {c.name}
                  {c.birthDate && <span className="text-xs opacity-70">· {calcAge(c.birthDate)}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Selected child details */}
          {selectedChild && (
            <div>
              {/* Child header card */}
              <div className="rounded-xl border bg-card overflow-hidden mb-5">
                <div className="h-1.5" style={{ background: selectedChild.accentColor ?? "#6366f1" }} />
                <div className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{selectedChild.name}</h2>
                    {selectedChild.birthDate && (
                      <p className="text-sm text-muted-foreground">
                        Born {selectedChild.birthDate} · {calcAge(selectedChild.birthDate)} old
                      </p>
                    )}
                    {selectedChild.notes && <p className="text-xs text-muted-foreground mt-1">{selectedChild.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditChild(selectedChild)} className="p-2 rounded hover:bg-secondary transition-colors">
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this child and all their data?")) deleteChildMut.mutate(selectedChild.id); }}
                      className="p-2 rounded hover:bg-secondary transition-colors"
                    >
                      <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              </div>

              <ChildDetail child={selectedChild} />
            </div>
          )}
        </>
      )}

      {/* Add/Edit Child Dialog */}
      <Dialog open={childDialog} onOpenChange={(o) => { if (!o) closeChildDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingChild ? "Edit Child" : "Add Child"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={childForm.name} onChange={(e) => setChildForm((f) => ({ ...f, name: e.target.value }))} placeholder="Child's name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Birth Date</label>
              <Input type="date" value={childForm.birthDate} onChange={(e) => setChildForm((f) => ({ ...f, birthDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={childForm.notes} onChange={(e) => setChildForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Accent Color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChildForm((f) => ({ ...f, accentColor: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${childForm.accentColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeChildDialog}>Cancel</Button>
              <Button size="sm" onClick={saveChild}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
