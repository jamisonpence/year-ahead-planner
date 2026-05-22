import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChildWithDetails, ChildMilestone, ChildMemory, ChildPrepItem, TabCollaborationWithUser, PetWithVisits, PetVetVisit } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Baby, Plus, Pencil, Trash2, Check, Users, ChevronDown,
  PawPrint, Stethoscope, Calendar, Heart,
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

// ── Sleep Methods Data ────────────────────────────────────────────────────────

interface SleepSubMethod {
  id: string;
  name: string;
  steps: string;
  note?: string;
}

interface SleepMethodFamily {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  color: string;
  subMethods: SleepSubMethod[];
}

const SLEEP_METHODS: SleepMethodFamily[] = [
  {
    id: "extinction",
    emoji: "😤",
    name: "Extinction / \"Cry-It-Out\" family",
    tagline: "Baby learns to self-settle with minimal or no parental response to crying",
    color: "#f87171",
    subMethods: [
      {
        id: "classic-cio",
        name: "Unmodified Extinction (\"Classic CIO\")",
        steps: "Bedtime routine → baby goes down drowsy but awake → you do not respond to crying until a set time (often morning), aside from safety checks.",
        note: "Fastest method but emotionally hardest for most parents.",
      },
      {
        id: "ferber",
        name: "Graduated Extinction – Ferber / Controlled Crying",
        steps: "Bedtime routine → baby down awake → if crying, you check in on a schedule with increasing intervals (e.g., 3, 5, 10, 15 minutes) with brief, no-pickup verbal reassurance.",
        note: "Same principle as CIO but with structured, timed check-ins.",
      },
      {
        id: "check-console",
        name: "Check-and-Console Variants",
        steps: "Similar to Ferber, but intervals may be fixed (e.g., check every 10 minutes) or more parent-led — 'go in when crying escalates beyond a certain point'.",
      },
    ],
  },
  {
    id: "stay-near",
    emoji: "🪑",
    name: "\"Stay-Near\" / Parental Presence",
    tagline: "You remain physically close at bedtime, then slowly fade your presence over days or weeks",
    color: "#fb923c",
    subMethods: [
      {
        id: "chair-method",
        name: "Chair Method / Camping-Out",
        steps: "Sit in a chair next to the crib or bed, mostly quiet with optional gentle verbal reassurance. Each night, move the chair a bit farther away until you're out of the room entirely.",
      },
      {
        id: "sleep-lady-shuffle",
        name: "Sleep Lady Shuffle",
        steps: "Start right next to the crib providing limited comfort, then progressively move further away night by night: side of crib → middle of room → doorway → hallway.",
        note: "From Kim West's approach — a named chair-method variant.",
      },
      {
        id: "in-room-fading",
        name: "In-Room Fading",
        steps: "Stay in the room but reduce what you do each night — less patting and rocking, more just being present — until your presence is minimal, then removed.",
        note: "Often combined with time-based goals, e.g. 'by night 5 I don't touch, only talk softly'.",
      },
    ],
  },
  {
    id: "fading",
    emoji: "🌅",
    name: "Fading / Gentle Extinction",
    tagline: "Gradually shift sleep associations and bedtime timing rather than removing support all at once",
    color: "#fbbf24",
    subMethods: [
      {
        id: "bedtime-fading",
        name: "Bedtime Fading",
        steps: "Start bedtime later — closer to when your child naturally crashes — so they fall asleep quickly. Once that's working, move bedtime gradually earlier in small steps while preserving independent sleep.",
      },
      {
        id: "response-fading",
        name: "Response Fading",
        steps: "Keep your usual soothing (rocking, feeding, patting) but do progressively less of it each night: shorter rocking, lighter patting, fewer interventions before leaving.",
      },
      {
        id: "scheduled-awakenings",
        name: "Scheduled Awakenings",
        steps: "If your child wakes regularly at certain times, briefly wake and soothe them just before those wakings, then gradually reduce the help so their pattern naturally resets.",
        note: "Most useful for children with predictable, frequent night wakings.",
      },
    ],
  },
  {
    id: "no-cry",
    emoji: "🤱",
    name: "Pick-Up / Put-Down & No-Cry",
    tagline: "Minimise crying by responding quickly and repeatedly — usually takes longer but involves less distress",
    color: "#34d399",
    subMethods: [
      {
        id: "pupd",
        name: "Pick-Up / Put-Down (Baby Whisperer)",
        steps: "Put baby down awake. If they cry, pick them up just until calm, then put them back down awake. Repeat as many times as needed throughout the night.",
        note: "High-contact, high-effort, and usually lower-intensity crying spread over more nights.",
      },
      {
        id: "no-cry-solution",
        name: "No-Cry Sleep Solution (Elizabeth Pantley)",
        steps: "A multi-step toolkit of gentle habit changes: consistent routines, adjusting feeding patterns, breaking nurse-to-sleep habits slowly, using Pantley's Pull-Off during feeds, and partial night co-sleeping where helpful.",
        note: "Focus is on reducing crying by changing habits in small increments over weeks.",
      },
      {
        id: "responsive-settling",
        name: "Responsive Settling / Gentle Settling",
        steps: "Go in quickly whenever baby cries; offer soothing (patting, shushing, feeding as your plan allows) and try to put baby back down drowsy-but-awake as often as possible.",
        note: "Many attachment-friendly coaching approaches live in this category.",
      },
    ],
  },
  {
    id: "schedule-based",
    emoji: "📅",
    name: "Routine- & Schedule-Based Systems",
    tagline: "Focus on day structure and bedtime habits rather than what you do once crying starts",
    color: "#60a5fa",
    subMethods: [
      {
        id: "strict-schedule",
        name: "Strict Schedule Methods (e.g., Babywise, Gina Ford)",
        steps: "Emphasise clock-based eat–play–sleep cycles with fairly fixed nap and bedtimes. Goal is to prevent overtiredness so falling asleep becomes easier and more predictable.",
      },
      {
        id: "flexible-routine",
        name: "Flexible Routine Methods (e.g., Taking Cara Babies)",
        steps: "Emphasise age-appropriate wake windows and sleepy cues rather than strict clock times. Strong sleep environment (dark room, white noise) plus consistent routine structure.",
        note: "Often combined with one of the specific training methods above — check-ins, chair method, fading, etc.",
      },
      {
        id: "environment-focused",
        name: "Environment-Focused Approach",
        steps: "Optimise room darkening, white noise, swaddling or sleep sacks, and temperature. Minimal formal training — instead relies on the right conditions making sleep easier.",
        note: "Not a complete method on its own, but many families find it dramatically reduces wake-ups.",
      },
    ],
  },
  {
    id: "cosleeping",
    emoji: "🛏️",
    name: "Co-sleeping / No-Training Philosophies",
    tagline: "No active sleep training — focus on routine, safety, and responsiveness while trusting natural development",
    color: "#a78bfa",
    subMethods: [
      {
        id: "responsive-cosleeping",
        name: "Responsive Co-sleeping / Bed-Sharing",
        steps: "Caregiver shares a bed or very close sleep space and responds immediately — nursing, rocking, or patting — often with the expectation that independent sleep will emerge naturally later.",
        note: "If bed-sharing, follow safe sleep guidelines to reduce risk.",
      },
      {
        id: "room-sharing",
        name: "Room-Sharing with On-Demand Soothing",
        steps: "Baby sleeps in their own crib or bassinet in the parents' room; parents respond to fussing quickly, often with feeding or patting, and accept frequent wakings as developmentally normal.",
      },
      {
        id: "wait-it-out",
        name: "\"Wait It Out\" / Developmental Approach",
        steps: "No formal training method. Focus on consistent bedtime routine, safe sleep, and emotional support — trusting that children will naturally consolidate sleep as they mature.",
      },
    ],
  },
  {
    id: "named-blends",
    emoji: "📚",
    name: "Named Blends & Branded Systems",
    tagline: "Popular books and courses that combine elements from multiple methods with their own structure",
    color: "#e879f9",
    subMethods: [
      {
        id: "ferber-method",
        name: "Ferber Method",
        steps: "Graduated extinction with increasing check-in intervals. Bedtime routine → down awake → timed check-ins with verbal reassurance only, no pick-up.",
        note: "One of the most researched methods. See 'Graduated Extinction' above for full detail.",
      },
      {
        id: "sleep-lady-blend",
        name: "Sleep Lady Shuffle",
        steps: "Structured parental-presence fading. You start next to the crib and move further away each night over roughly two weeks.",
        note: "See 'Stay-Near' family above for full detail.",
      },
      {
        id: "taking-cara-blend",
        name: "Taking Cara Babies",
        steps: "Age-based routine guidance combined with a mix of check-ins, response-fading, and wake-window scheduling. Available as newborn class and older-baby sleep training course.",
      },
      {
        id: "baby-whisperer-blend",
        name: "Baby Whisperer (Tracy Hogg)",
        steps: "Pick-Up / Put-Down combined with EASY (Eat–Activity–Sleep–You) schedule guidance. Focuses on reading baby's cues and avoiding sleep associations.",
      },
      {
        id: "no-cry-blend",
        name: "No-Cry Sleep Solution (Pantley)",
        steps: "A gentle, multi-step habit-change toolkit emphasising routine tweaks, feeding adjustments, and the 'Pantley Pull-Off' technique. Results build over several weeks.",
      },
    ],
  },
];

// ── Sleep Tab ─────────────────────────────────────────────────────────────────

function SleepTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setSelectedSubId(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-4">
        Select a sleep approach to learn how it works. Every family is different — these are reference descriptions, not prescriptions.
      </p>
      {SLEEP_METHODS.map((family) => {
        const isOpen = expandedId === family.id;
        return (
          <div key={family.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Family header — clickable */}
            <button
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => toggle(family.id)}
            >
              <span className="text-xl shrink-0">{family.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{family.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{family.tagline}</p>
              </div>
              <ChevronDown
                size={16}
                className={`text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Sub-methods (expanded) */}
            {isOpen && (
              <div className="px-3.5 pb-3.5 space-y-2 border-t border-border/50 pt-3">
                {family.subMethods.map((sub) => {
                  const isSel = selectedSubId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className={`rounded-lg border p-3 cursor-pointer transition-all ${
                        isSel
                          ? "border-current bg-background"
                          : "border-border/60 hover:border-border hover:bg-muted/30"
                      }`}
                      style={isSel ? { borderColor: family.color, background: family.color + "10" } : {}}
                      onClick={() => setSelectedSubId(isSel ? null : sub.id)}
                    >
                      {/* Sub-method name row */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{sub.name}</p>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: isSel ? family.color : "transparent", border: `1.5px solid ${family.color}80` }}
                        />
                      </div>
                      {/* Expanded detail */}
                      {isSel && (
                        <div className="mt-2.5 space-y-2">
                          <p className="text-sm leading-relaxed text-foreground/90">{sub.steps}</p>
                          {sub.note && (
                            <p className="text-xs text-muted-foreground italic border-l-2 pl-2" style={{ borderColor: family.color }}>
                              {sub.note}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground text-center pt-1 pb-2">
        Always consult your pediatrician if you have concerns about your child's sleep.
      </p>
    </div>
  );
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
        <TabsList className="mb-4 w-full overflow-x-auto flex-nowrap justify-start scrollbar-none">
          <TabsTrigger value="development" className="shrink-0">Development</TabsTrigger>
          <TabsTrigger value="sleep" className="shrink-0">Sleep</TabsTrigger>
          <TabsTrigger value="milestones" className="shrink-0">Milestones <span className="ml-1 text-xs opacity-60">{child.milestones.length}</span></TabsTrigger>
          <TabsTrigger value="memories" className="shrink-0">Memories <span className="ml-1 text-xs opacity-60">{child.memories.length}</span></TabsTrigger>
          <TabsTrigger value="prep" className="shrink-0">Prep <span className="ml-1 text-xs opacity-60">{child.prepItems.length}</span></TabsTrigger>
        </TabsList>

        {/* ── Development ── */}
        <TabsContent value="development">
          <DevelopmentTab child={child} />
        </TabsContent>

        {/* ── Sleep ── */}
        <TabsContent value="sleep">
          <SleepTab />
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

// ── Pets ──────────────────────────────────────────────────────────────────────

const PET_SPECIES = [
  { value: "dog",     label: "Dog",     emoji: "🐶" },
  { value: "cat",     label: "Cat",     emoji: "🐱" },
  { value: "rabbit",  label: "Rabbit",  emoji: "🐰" },
  { value: "bird",    label: "Bird",    emoji: "🐦" },
  { value: "fish",    label: "Fish",    emoji: "🐟" },
  { value: "reptile", label: "Reptile", emoji: "🦎" },
  { value: "other",   label: "Other",   emoji: "🐾" },
];

function petEmoji(species: string) {
  return PET_SPECIES.find((s) => s.value === species)?.emoji ?? "🐾";
}

function calcPetAge(birthday: string | null | undefined): string {
  if (!birthday) return "";
  const [y, m, d] = birthday.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return "";
  if (years === 0) return months <= 1 ? `${months} mo` : `${months} months`;
  return months === 0 ? `${years}y` : `${years}y ${months}m`;
}

function PetsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [petDialog, setPetDialog] = useState(false);
  const [editingPet, setEditingPet] = useState<PetWithVisits | null>(null);
  const [petForm, setPetForm] = useState({ name: "", species: "dog", breed: "", birthday: "", notes: "", accentColor: ACCENT_COLORS[0] });
  const [vetDialog, setVetDialog] = useState(false);
  const [editingVisit, setEditingVisit] = useState<PetVetVisit | null>(null);
  const [vetForm, setVetForm] = useState({ date: new Date().toISOString().slice(0, 10), reason: "", notes: "", vetName: "" });

  const { data: allPets = [] } = useQuery<PetWithVisits[]>({
    queryKey: ["/api/pets"],
    queryFn: async () => (await apiRequest("GET", "/api/pets")).json(),
  });

  const invPets = () => qc.invalidateQueries({ queryKey: ["/api/pets"] });

  const selectedPet = allPets.find((p) => p.id === selectedPetId) ?? allPets[0] ?? null;

  const createPetMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/pets", d),
    onSuccess: async (r) => { const created = await r.json(); invPets(); setSelectedPetId(created.id); setPetDialog(false); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updatePetMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/pets/${id}`, d),
    onSuccess: () => { invPets(); setPetDialog(false); setEditingPet(null); },
  });
  const deletePetMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/pets/${id}`),
    onSuccess: () => { invPets(); setSelectedPetId(null); },
  });

  const createVisitMut = useMutation({
    mutationFn: ({ petId, d }: { petId: number; d: any }) => apiRequest("POST", `/api/pets/${petId}/vet-visits`, d),
    onSuccess: () => { invPets(); setVetDialog(false); setEditingVisit(null); },
  });
  const updateVisitMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/pet-vet-visits/${id}`, d),
    onSuccess: () => { invPets(); setVetDialog(false); setEditingVisit(null); },
  });
  const deleteVisitMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/pet-vet-visits/${id}`),
    onSuccess: () => invPets(),
  });

  function openAddPet() {
    setEditingPet(null);
    setPetForm({ name: "", species: "dog", breed: "", birthday: "", notes: "", accentColor: ACCENT_COLORS[0] });
    setPetDialog(true);
  }
  function openEditPet(p: PetWithVisits) {
    setEditingPet(p);
    setPetForm({ name: p.name, species: p.species, breed: p.breed ?? "", birthday: p.birthday ?? "", notes: p.notes ?? "", accentColor: p.accentColor ?? ACCENT_COLORS[0] });
    setPetDialog(true);
  }
  function savePet() {
    if (!petForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = { ...petForm, name: petForm.name.trim(), breed: petForm.breed.trim() || null, notes: petForm.notes.trim() || null, birthday: petForm.birthday || null };
    if (editingPet) updatePetMut.mutate({ id: editingPet.id, d: payload });
    else createPetMut.mutate(payload);
  }

  function openAddVisit() {
    setEditingVisit(null);
    setVetForm({ date: new Date().toISOString().slice(0, 10), reason: "", notes: "", vetName: "" });
    setVetDialog(true);
  }
  function openEditVisit(v: PetVetVisit) {
    setEditingVisit(v);
    setVetForm({ date: v.date, reason: v.reason, notes: v.notes ?? "", vetName: v.vetName ?? "" });
    setVetDialog(true);
  }
  function saveVisit() {
    if (!vetForm.reason.trim() || !selectedPet) return;
    const payload = { ...vetForm, reason: vetForm.reason.trim(), notes: vetForm.notes.trim() || null, vetName: vetForm.vetName.trim() || null };
    if (editingVisit) updateVisitMut.mutate({ id: editingVisit.id, d: payload });
    else createVisitMut.mutate({ petId: selectedPet.id, d: payload });
  }

  if (allPets.length === 0) return (
    <div>
      <div className="text-center py-16 text-muted-foreground">
        <PawPrint size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-sm mb-4">Add a pet to track their info and vet visits.</p>
        <Button variant="outline" onClick={openAddPet} className="gap-1.5"><Plus size={14} /> Add Pet</Button>
      </div>
      <PetFormDialog open={petDialog} onClose={() => setPetDialog(false)} form={petForm} setForm={setPetForm} onSave={savePet} editing={editingPet} />
    </div>
  );

  return (
    <div>
      {/* Pet selector pills */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          {allPets.map((p) => (
            <button key={p.id} onClick={() => setSelectedPetId(p.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                selectedPet?.id === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary"
              }`}
            >
              <span>{petEmoji(p.species)}</span>
              <span>{p.name}</span>
              {p.birthday && <span className="text-xs opacity-70">· {calcPetAge(p.birthday)}</span>}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={openAddPet} className="gap-1.5 shrink-0"><Plus size={13} /> Add Pet</Button>
      </div>

      {selectedPet && (
        <div>
          {/* Pet header card */}
          <div className="rounded-xl border bg-card overflow-hidden mb-5">
            <div className="h-1.5" style={{ background: selectedPet.accentColor ?? "#6366f1" }} />
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{petEmoji(selectedPet.species)}</span>
                <div>
                  <h2 className="text-lg font-bold">{selectedPet.name}</h2>
                  <p className="text-sm text-muted-foreground capitalize">
                    {selectedPet.species}{selectedPet.breed ? ` · ${selectedPet.breed}` : ""}
                    {selectedPet.birthday ? ` · Born ${selectedPet.birthday}${calcPetAge(selectedPet.birthday) ? ` (${calcPetAge(selectedPet.birthday)})` : ""}` : ""}
                  </p>
                  {selectedPet.notes && <p className="text-xs text-muted-foreground mt-1">{selectedPet.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditPet(selectedPet)} className="p-2 rounded hover:bg-secondary transition-colors">
                  <Pencil size={14} className="text-muted-foreground" />
                </button>
                <button onClick={() => { if (confirm(`Delete ${selectedPet.name} and all their data?`)) deletePetMut.mutate(selectedPet.id); }}
                  className="p-2 rounded hover:bg-secondary transition-colors">
                  <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          </div>

          {/* Vet Visits */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Stethoscope size={15} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">Vet Visits</h3>
                <span className="text-xs text-muted-foreground">({selectedPet.vetVisits.length})</span>
              </div>
              <Button size="sm" variant="outline" onClick={openAddVisit} className="gap-1 h-7 text-xs px-2.5">
                <Plus size={12} /> Log Visit
              </Button>
            </div>
            {selectedPet.vetVisits.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No vet visits logged yet.</p>
            ) : (
              <div className="space-y-2">
                {selectedPet.vetVisits.map((v) => (
                  <div key={v.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/40 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{v.reason}</span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar size={10} /> {v.date}
                        </span>
                        {v.vetName && <span className="text-[10px] text-muted-foreground">· {v.vetName}</span>}
                      </div>
                      {v.notes && <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => openEditVisit(v)} className="p-1 rounded hover:bg-muted transition-colors">
                        <Pencil size={12} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => { if (confirm("Delete this vet visit?")) deleteVisitMut.mutate(v.id); }}
                        className="p-1 rounded hover:bg-muted transition-colors">
                        <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pet Form Dialog */}
      <PetFormDialog open={petDialog} onClose={() => { setPetDialog(false); setEditingPet(null); }} form={petForm} setForm={setPetForm} onSave={savePet} editing={editingPet} />

      {/* Vet Visit Dialog */}
      <Dialog open={vetDialog} onOpenChange={(o) => { if (!o) { setVetDialog(false); setEditingVisit(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingVisit ? "Edit Vet Visit" : "Log Vet Visit"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Reason *</label>
              <Input value={vetForm.reason} onChange={(e) => setVetForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Annual checkup, Vaccination" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={vetForm.date} onChange={(e) => setVetForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Vet / Clinic</label>
                <Input value={vetForm.vetName} onChange={(e) => setVetForm((f) => ({ ...f, vetName: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={vetForm.notes} onChange={(e) => setVetForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Medications, follow-up, observations…" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveVisit} disabled={!vetForm.reason.trim()}>Save</Button>
              <Button variant="outline" onClick={() => { setVetDialog(false); setEditingVisit(null); }}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PetFormDialog({ open, onClose, form, setForm, onSave, editing }: {
  open: boolean; onClose: () => void;
  form: { name: string; species: string; breed: string; birthday: string; notes: string; accentColor: string };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  editing: PetWithVisits | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Pet" : "Add Pet"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="Pet's name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Species</label>
              <Select value={form.species} onValueChange={(v) => setForm((f: any) => ({ ...f, species: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PET_SPECIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.emoji} {s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Breed</label>
              <Input value={form.breed} onChange={(e) => setForm((f: any) => ({ ...f, breed: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Birthday</label>
              <Input type="date" value={form.birthday} onChange={(e) => setForm((f: any) => ({ ...f, birthday: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Allergies, medications, favorite things…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f: any) => ({ ...f, accentColor: c }))}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${form.accentColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onSave} disabled={!form.name.trim()}>
              {editing ? "Save" : "Add Pet"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KidsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [section, setSection] = useState<"children" | "pets">("children");
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
    <div className="p-3 sm:p-6 max-w-4xl mx-auto overflow-x-hidden w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart size={22} /> Family
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allChildren.length} {allChildren.length === 1 ? "child" : "children"}
          </p>
        </div>
        {section === "children" && (
          <Button onClick={openAddChild} size="sm" className="gap-1.5">
            <Plus size={15} /> Add Child
          </Button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-5 p-1 bg-secondary/50 rounded-lg w-fit">
        <button
          onClick={() => setSection("children")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${section === "children" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Baby size={14} /> Children
        </button>
        <button
          onClick={() => setSection("pets")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${section === "pets" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <PawPrint size={14} /> Pets
        </button>
      </div>

      {section === "pets" ? (
        <PetsSection />
      ) : (
        <>
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
