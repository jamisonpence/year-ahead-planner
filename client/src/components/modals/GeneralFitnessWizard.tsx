// GeneralFitnessWizard.tsx — ports workout-wizard-v10.html to React
// Preserves the full exercise repository, equipmentMap, generator, and weight sync logic.
import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, X, ChevronLeft, ChevronRight, Dumbbell, CheckCircle2 } from "lucide-react";

// ── Exercise Repository (preserved verbatim from workout-wizard-v10.html) ────
const exerciseRepository = [{"name":"Barbell Bench Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Incline Barbell Bench Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Upper Chest"},{"name":"Close-Grip Bench Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Triceps"},{"name":"Floor Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Overhead Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Push Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Landmine Press","focus_area":"Push","equipment_required":["Barbell"],"movement_pattern":"Diagonal Push","primary_muscle_group":"Shoulders"},{"name":"Dumbbell Bench Press","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Incline Dumbbell Press","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Upper Chest"},{"name":"Neutral-Grip Dumbbell Press","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Dumbbell Shoulder Press","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Arnold Press","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Dumbbell Lateral Raise","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Shoulder Abduction","primary_muscle_group":"Lateral Delts"},{"name":"Dumbbell Front Raise","focus_area":"Push","equipment_required":["Dumbbell"],"movement_pattern":"Shoulder Flexion","primary_muscle_group":"Anterior Delts"},{"name":"Kettlebell Strict Press","focus_area":"Push","equipment_required":["Kettlebell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Kettlebell Push Press","focus_area":"Push","equipment_required":["Kettlebell"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Kettlebell Floor Press","focus_area":"Push","equipment_required":["Kettlebell"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Machine Chest Press","focus_area":"Push","equipment_required":["Machine"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Incline Chest Press Machine","focus_area":"Push","equipment_required":["Machine"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Upper Chest"},{"name":"Machine Shoulder Press","focus_area":"Push","equipment_required":["Machine"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Pec Deck Fly","focus_area":"Push","equipment_required":["Machine"],"movement_pattern":"Chest Fly","primary_muscle_group":"Chest"},{"name":"Cable-Free Chest Press Machine","focus_area":"Push","equipment_required":["Machine"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Push-Up","focus_area":"Push","equipment_required":["Bodyweight"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Chest"},{"name":"Decline Push-Up","focus_area":"Push","equipment_required":["Bodyweight"],"movement_pattern":"Horizontal Push","primary_muscle_group":"Upper Chest"},{"name":"Pike Push-Up","focus_area":"Push","equipment_required":["Bodyweight"],"movement_pattern":"Vertical Push","primary_muscle_group":"Shoulders"},{"name":"Bent-Over Barbell Row","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Back"},{"name":"Pendlay Row","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Back"},{"name":"Upright Row","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Traps"},{"name":"Deadlift","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Hip Hinge Pull","primary_muscle_group":"Posterior Chain"},{"name":"Romanian Deadlift","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Hip Hinge Pull","primary_muscle_group":"Hamstrings"},{"name":"Barbell Shrug","focus_area":"Pull","equipment_required":["Barbell"],"movement_pattern":"Scapular Elevation","primary_muscle_group":"Traps"},{"name":"Dumbbell Row","focus_area":"Pull","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Lats"},{"name":"Chest-Supported Dumbbell Row","focus_area":"Pull","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Upper Back"},{"name":"Rear Delt Fly","focus_area":"Pull","equipment_required":["Dumbbell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Rear Delts"},{"name":"Hammer Curl","focus_area":"Pull","equipment_required":["Dumbbell"],"movement_pattern":"Elbow Flexion","primary_muscle_group":"Biceps"},{"name":"Incline Dumbbell Curl","focus_area":"Pull","equipment_required":["Dumbbell"],"movement_pattern":"Elbow Flexion","primary_muscle_group":"Biceps"},{"name":"Kettlebell Gorilla Row","focus_area":"Pull","equipment_required":["Kettlebell"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Lats"},{"name":"Kettlebell High Pull","focus_area":"Pull","equipment_required":["Kettlebell"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Upper Back"},{"name":"Kettlebell Deadlift","focus_area":"Pull","equipment_required":["Kettlebell"],"movement_pattern":"Hip Hinge Pull","primary_muscle_group":"Posterior Chain"},{"name":"Lat Pulldown","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Lats"},{"name":"Seated Cable Row Machine","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Mid Back"},{"name":"Assisted Pull-Up Machine","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Lats"},{"name":"Preacher Curl Machine","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Elbow Flexion","primary_muscle_group":"Biceps"},{"name":"Reverse Pec Deck","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Rear Delts"},{"name":"Machine Shrug","focus_area":"Pull","equipment_required":["Machine"],"movement_pattern":"Scapular Elevation","primary_muscle_group":"Traps"},{"name":"Pull-Up","focus_area":"Pull","equipment_required":["Bodyweight"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Lats"},{"name":"Chin-Up","focus_area":"Pull","equipment_required":["Bodyweight"],"movement_pattern":"Vertical Pull","primary_muscle_group":"Biceps"},{"name":"Inverted Row","focus_area":"Pull","equipment_required":["Bodyweight"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Upper Back"},{"name":"Bodyweight Towel Row","focus_area":"Pull","equipment_required":["Bodyweight"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Lats"},{"name":"Superman Pull","focus_area":"Pull","equipment_required":["Bodyweight"],"movement_pattern":"Scapular Retraction","primary_muscle_group":"Upper Back"},{"name":"Back Squat","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Front Squat","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Box Squat","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Squat","primary_muscle_group":"Glutes"},{"name":"Good Morning","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Hip Hinge","primary_muscle_group":"Hamstrings"},{"name":"Barbell Lunge","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Lunge","primary_muscle_group":"Glutes"},{"name":"Barbell Hip Thrust","focus_area":"Legs","equipment_required":["Barbell"],"movement_pattern":"Hip Extension","primary_muscle_group":"Glutes"},{"name":"Dumbbell Goblet Squat","focus_area":"Legs","equipment_required":["Dumbbell"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Dumbbell Split Squat","focus_area":"Legs","equipment_required":["Dumbbell"],"movement_pattern":"Lunge","primary_muscle_group":"Quads"},{"name":"Dumbbell Romanian Deadlift","focus_area":"Legs","equipment_required":["Dumbbell"],"movement_pattern":"Hip Hinge","primary_muscle_group":"Hamstrings"},{"name":"Dumbbell Step-Up","focus_area":"Legs","equipment_required":["Dumbbell"],"movement_pattern":"Step-Up","primary_muscle_group":"Glutes"},{"name":"Dumbbell Walking Lunge","focus_area":"Legs","equipment_required":["Dumbbell"],"movement_pattern":"Lunge","primary_muscle_group":"Glutes"},{"name":"Kettlebell Goblet Squat","focus_area":"Legs","equipment_required":["Kettlebell"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Kettlebell Swing","focus_area":"Legs","equipment_required":["Kettlebell"],"movement_pattern":"Hip Hinge","primary_muscle_group":"Glutes"},{"name":"Kettlebell Reverse Lunge","focus_area":"Legs","equipment_required":["Kettlebell"],"movement_pattern":"Lunge","primary_muscle_group":"Glutes"},{"name":"Kettlebell Sumo Deadlift","focus_area":"Legs","equipment_required":["Kettlebell"],"movement_pattern":"Hip Hinge","primary_muscle_group":"Glutes"},{"name":"Leg Press","focus_area":"Legs","equipment_required":["Machine"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Hack Squat Machine","focus_area":"Legs","equipment_required":["Machine"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Leg Extension","focus_area":"Legs","equipment_required":["Machine"],"movement_pattern":"Knee Extension","primary_muscle_group":"Quads"},{"name":"Seated Leg Curl","focus_area":"Legs","equipment_required":["Machine"],"movement_pattern":"Knee Flexion","primary_muscle_group":"Hamstrings"},{"name":"Standing Calf Raise Machine","focus_area":"Legs","equipment_required":["Machine"],"movement_pattern":"Plantar Flexion","primary_muscle_group":"Calves"},{"name":"Bodyweight Squat","focus_area":"Legs","equipment_required":["Bodyweight"],"movement_pattern":"Squat","primary_muscle_group":"Quads"},{"name":"Jump Squat","focus_area":"Legs","equipment_required":["Bodyweight"],"movement_pattern":"Explosive Squat","primary_muscle_group":"Quads"},{"name":"Walking Lunge","focus_area":"Legs","equipment_required":["Bodyweight"],"movement_pattern":"Lunge","primary_muscle_group":"Glutes"},{"name":"Single-Leg Glute Bridge","focus_area":"Legs","equipment_required":["Bodyweight"],"movement_pattern":"Hip Extension","primary_muscle_group":"Glutes"},{"name":"Wall Sit","focus_area":"Legs","equipment_required":["Bodyweight"],"movement_pattern":"Isometric Squat","primary_muscle_group":"Quads"},{"name":"Plank","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Anti-Extension","primary_muscle_group":"Abdominals"},{"name":"Side Plank","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Anti-Lateral Flexion","primary_muscle_group":"Obliques"},{"name":"Dead Bug","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Anti-Extension","primary_muscle_group":"Deep Core"},{"name":"Bird Dog","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Anti-Rotation","primary_muscle_group":"Deep Core"},{"name":"Mountain Climber","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Trunk Flexion","primary_muscle_group":"Abdominals"},{"name":"Dumbbell Russian Twist","focus_area":"Core","equipment_required":["Dumbbell"],"movement_pattern":"Rotation","primary_muscle_group":"Obliques"},{"name":"Dumbbell Sit-Up","focus_area":"Core","equipment_required":["Dumbbell"],"movement_pattern":"Trunk Flexion","primary_muscle_group":"Abdominals"},{"name":"Kettlebell Windmill","focus_area":"Core","equipment_required":["Kettlebell"],"movement_pattern":"Rotation","primary_muscle_group":"Obliques"},{"name":"Kettlebell Turkish Get-Up","focus_area":"Core","equipment_required":["Kettlebell"],"movement_pattern":"Integrated Core","primary_muscle_group":"Deep Core"},{"name":"Barbell Rollout","focus_area":"Core","equipment_required":["Barbell"],"movement_pattern":"Anti-Extension","primary_muscle_group":"Abdominals"},{"name":"Landmine Rotation","focus_area":"Core","equipment_required":["Barbell"],"movement_pattern":"Rotation","primary_muscle_group":"Obliques"},{"name":"Machine Crunch","focus_area":"Core","equipment_required":["Machine"],"movement_pattern":"Trunk Flexion","primary_muscle_group":"Abdominals"},{"name":"Machine Torso Rotation","focus_area":"Core","equipment_required":["Machine"],"movement_pattern":"Rotation","primary_muscle_group":"Obliques"},{"name":"Hollow Hold","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Isometric Flexion","primary_muscle_group":"Abdominals"},{"name":"Reverse Crunch","focus_area":"Core","equipment_required":["Bodyweight"],"movement_pattern":"Trunk Flexion","primary_muscle_group":"Lower Abs"},{"name":"Burpee","focus_area":"Cardio","equipment_required":["Bodyweight"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"High Knees","focus_area":"Cardio","equipment_required":["Bodyweight"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Hip Flexors"},{"name":"Jumping Jacks","focus_area":"Cardio","equipment_required":["Bodyweight"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Mountain Climber Sprint","focus_area":"Cardio","equipment_required":["Bodyweight"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Dumbbell Thruster","focus_area":"Cardio","equipment_required":["Dumbbell"],"movement_pattern":"Squat to Press","primary_muscle_group":"Full Body"},{"name":"Dumbbell Snatch","focus_area":"Cardio","equipment_required":["Dumbbell"],"movement_pattern":"Explosive Pull","primary_muscle_group":"Full Body"},{"name":"Kettlebell Swing Conditioning","focus_area":"Cardio","equipment_required":["Kettlebell"],"movement_pattern":"Hip Hinge","primary_muscle_group":"Posterior Chain"},{"name":"Kettlebell Clean and Press","focus_area":"Cardio","equipment_required":["Kettlebell"],"movement_pattern":"Explosive Push-Pull","primary_muscle_group":"Full Body"},{"name":"Kettlebell Snatch","focus_area":"Cardio","equipment_required":["Kettlebell"],"movement_pattern":"Explosive Pull","primary_muscle_group":"Full Body"},{"name":"Barbell Complex","focus_area":"Cardio","equipment_required":["Barbell"],"movement_pattern":"Cyclical Strength Endurance","primary_muscle_group":"Full Body"},{"name":"Barbell Thruster","focus_area":"Cardio","equipment_required":["Barbell"],"movement_pattern":"Squat to Press","primary_muscle_group":"Full Body"},{"name":"Machine Rower Sprint","focus_area":"Cardio","equipment_required":["Machine"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Bike Sprint","focus_area":"Cardio","equipment_required":["Bike"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Quads"},{"name":"Machine Ski Erg","focus_area":"Cardio","equipment_required":["Machine"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Lats"},{"name":"Machine Stair Climber","focus_area":"Cardio","equipment_required":["Machine"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Glutes"},{"name":"Bike Steady State","focus_area":"Cardio","equipment_required":["Bike"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Quads"},{"name":"Bike Hill Climb","focus_area":"Cardio","equipment_required":["Bike"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Glutes"},{"name":"Bike Interval Sprints","focus_area":"Cardio","equipment_required":["Bike"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Bike Tempo Ride","focus_area":"Cardio","equipment_required":["Bike"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Quads"},{"name":"Swim Freestyle Laps","focus_area":"Cardio","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Swim Interval Sets","focus_area":"Cardio","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Swim Backstroke Laps","focus_area":"Cardio","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Lats"},{"name":"Swim Breaststroke Laps","focus_area":"Cardio","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Swim Pull Buoy Drill","focus_area":"Pull","equipment_required":["Pool"],"movement_pattern":"Horizontal Pull","primary_muscle_group":"Lats"},{"name":"Water Running","focus_area":"Cardio","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Full Body"},{"name":"Swim Kick Drill","focus_area":"Legs","equipment_required":["Pool"],"movement_pattern":"Cyclical Conditioning","primary_muscle_group":"Glutes"}];

// ── Constants (preserved from HTML) ──────────────────────────────────────────
const EQUIPMENT_OPTIONS = ['Gym membership','Barbell & Plates','Dumbbells','Kettlebells','Cable Machine','Weight Machine','Pull-up Bar','Bench / Box','Resistance Bands','Cardio Machine','Bodyweight / Rings','Bike','Pool'];
const WEEKDAY_OPTIONS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const STEP_NAMES = ['Equipment','Plan','Constraints','Review Plan'];

const equipmentMap: Record<string, string[]> = {
  'Gym membership':['Barbell','Dumbbell','Kettlebell','Machine','Bodyweight'],
  'Barbell & Plates':['Barbell'], 'Dumbbells':['Dumbbell'], 'Kettlebells':['Kettlebell'],
  'Cable Machine':['Machine'], 'Weight Machine':['Machine'], 'Pull-up Bar':['Bodyweight'],
  'Bench / Box':['Bodyweight'], 'Resistance Bands':['Bodyweight'], 'Cardio Machine':['Machine'],
  'Bodyweight / Rings':['Bodyweight'], 'Bike':['Bike'], 'Pool':['Pool'],
};

const goalIntensityMap: Record<string, string[]> = {
  balanced:['Hypertrophy','Strength','Power'], hypertrophy:['Hypertrophy'],
  strength:['Strength'], power:['Power'], fatloss:['Hypertrophy','Power'],
};
const splitTemplates: Record<string, any> = {
  balanced:{ 4:{A:['Push','Pull','Legs','Core'],B:['Push','Pull','Legs','Cardio']}, 5:{A:['Push','Pull','Legs','Core','Cardio'],B:['Push','Pull','Legs','Push','Cardio']}, 6:{A:['Push','Pull','Legs','Core','Push','Pull'],B:['Push','Pull','Legs','Cardio','Push','Legs']}, 7:{A:['Push','Pull','Legs','Core','Push','Pull','Cardio'],B:['Push','Pull','Legs','Cardio','Push','Pull','Legs']} },
  hypertrophy:{ 4:{A:['Push','Pull','Legs','Push'],B:['Pull','Legs','Push','Pull']}, 5:{A:['Push','Pull','Legs','Push','Pull'],B:['Pull','Legs','Push','Pull','Legs']}, 6:{A:['Push','Pull','Legs','Push','Pull','Legs'],B:['Pull','Legs','Push','Pull','Legs','Push']}, 7:{A:['Push','Pull','Legs','Push','Pull','Legs','Core'],B:['Pull','Legs','Push','Pull','Legs','Push','Cardio']} },
  strength:{ 4:{A:['Push','Legs','Pull','Core'],B:['Legs','Push','Pull','Core']}, 5:{A:['Push','Legs','Pull','Push','Legs'],B:['Legs','Push','Pull','Legs','Push']}, 6:{A:['Push','Legs','Pull','Push','Legs','Pull'],B:['Legs','Push','Pull','Legs','Push','Core']}, 7:{A:['Push','Legs','Pull','Push','Legs','Pull','Core'],B:['Legs','Push','Pull','Legs','Push','Pull','Cardio']} },
  power:{ 4:{A:['Push','Pull','Legs','Cardio'],B:['Push','Pull','Legs','Core']}, 5:{A:['Push','Pull','Legs','Cardio','Core'],B:['Push','Pull','Legs','Cardio','Push']}, 6:{A:['Push','Pull','Legs','Cardio','Push','Pull'],B:['Push','Pull','Legs','Cardio','Legs','Core']}, 7:{A:['Push','Pull','Legs','Cardio','Push','Pull','Core'],B:['Push','Pull','Legs','Cardio','Push','Legs','Cardio']} },
  fatloss:{ 4:{A:['Push','Cardio','Legs','Core'],B:['Pull','Cardio','Legs','Cardio']}, 5:{A:['Push','Cardio','Legs','Pull','Cardio'],B:['Pull','Cardio','Legs','Core','Cardio']}, 6:{A:['Push','Cardio','Legs','Pull','Cardio','Core'],B:['Pull','Cardio','Legs','Push','Cardio','Core']}, 7:{A:['Push','Cardio','Legs','Pull','Cardio','Core','Cardio'],B:['Pull','Cardio','Legs','Push','Cardio','Core','Cardio']} },
};
const primaryMuscleByFocus: Record<string, string[]> = {
  Push:['Chest','Upper Chest','Triceps','Shoulders','Lateral Delts','Anterior Delts'],
  Pull:['Back','Lats','Upper Back','Biceps','Traps','Rear Delts','Posterior Chain'],
  Legs:['Quads','Glutes','Hamstrings','Calves'],
  Core:['Abdominals','Obliques','Deep Core','Lower Abs'],
  Cardio:['Full Body','Posterior Chain','Lats','Quads','Glutes','Hip Flexors'],
};

// ── Generator logic (preserved from HTML) ────────────────────────────────────
let genSeed = 1;
function seededJitter(name: string) { let h = genSeed; for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) >>> 0; } return (h % 1000) / 1000 * 6; }
function round5(v: number) { return Math.max(5, Math.round(v / 5) * 5); }
function cardioBiasFor(goal: string) { return goal === 'fatloss' ? 'high' : (goal === 'power' || goal === 'balanced') ? 'moderate' : 'low'; }

function availableRepoEquipment(equipment: Set<string>) {
  const set = new Set<string>();
  equipment.forEach(label => { (equipmentMap[label] || []).forEach(v => set.add(v)); });
  if (set.size === 0) set.add('Bodyweight');
  return set;
}
function matchesEquipment(ex: any, equipment: Set<string>) {
  if (equipment.has('Gym membership')) return true;
  const avail = availableRepoEquipment(equipment);
  return ex.equipment_required.some((eq: string) => avail.has(eq));
}
function estimateWeight(ex: any, marker: string, bench: number) {
  const muscle = ex.primary_muscle_group;
  let base = bench;
  if (['Back','Lats','Upper Back','Traps','Posterior Chain'].includes(muscle)) base *= 0.9;
  if (['Quads','Glutes','Hamstrings'].includes(muscle)) base *= 1.35;
  if (['Shoulders','Anterior Delts','Lateral Delts'].includes(muscle)) base *= 0.58;
  if (['Biceps','Triceps','Rear Delts','Calves','Abdominals','Obliques','Deep Core','Lower Abs'].includes(muscle)) base *= 0.28;
  const pct = marker === 'Strength' ? 0.85 : marker === 'Power' ? 0.55 : 0.72;
  return ex.focus_area === 'Cardio' || (ex.equipment_required.includes('Bodyweight') && ex.movement_pattern.includes('Cyclical'))
    ? 'Effort / pace based' : `${round5(base * pct)} lb`;
}
function prescription(ex: any, role: string, marker: string, bench: number) {
  if (ex.focus_area === 'Cardio') return [{ set: 1, reps: marker === 'Power' ? '8-15 min intervals' : '20-40 min steady', weight: 'Pace / effort based' }];
  if (ex.focus_area === 'Core' && ex.equipment_required.includes('Bodyweight')) {
    return marker === 'Strength'
      ? [{ set: 1, reps: '30 sec', weight: 'Bodyweight' }, { set: 2, reps: '30 sec', weight: 'Bodyweight' }, { set: 3, reps: '45 sec', weight: 'Bodyweight' }]
      : [{ set: 1, reps: '12', weight: 'Bodyweight' }, { set: 2, reps: '12', weight: 'Bodyweight' }, { set: 3, reps: '15', weight: 'Bodyweight' }];
  }
  const schemes: any = { primary: { Hypertrophy: [12,10,8,8], Strength: [5,5,4,3], Power: [3,3,2,2] }, accessory: { Hypertrophy: [15,12,10], Strength: [8,6,6], Power: [5,5,4] } };
  const reps = (schemes[role] && schemes[role][marker]) || schemes.accessory.Hypertrophy;
  return reps.map((r: number, i: number) => ({ set: i + 1, reps: String(r), weight: estimateWeight(ex, marker, bench) }));
}
function scoreExercise(ex: any, focus: string, role: string, focusArea: string, avoidArr: string[], prefArr: string[], equipment: Set<string>) {
  let score = 0;
  if (matchesEquipment(ex, equipment)) score += 10;
  if (ex.focus_area === focus) score += 16;
  if (role === 'primary' && ['Horizontal Push','Vertical Push','Horizontal Pull','Vertical Pull','Squat','Hip Hinge','Lunge','Hip Extension','Integrated Core','Cyclical Strength Endurance','Explosive Pull','Squat to Press'].includes(ex.movement_pattern)) score += 8;
  if (role === 'accessory' && ['Chest Fly','Elbow Flexion','Knee Extension','Knee Flexion','Rotation','Anti-Extension','Anti-Rotation','Plantar Flexion','Shoulder Abduction','Shoulder Flexion'].includes(ex.movement_pattern)) score += 7;
  if (focusArea !== 'balanced' && ex.focus_area === focusArea) score += 12;
  if (primaryMuscleByFocus[focus] && primaryMuscleByFocus[focus].includes(ex.primary_muscle_group)) score += 8;
  prefArr.forEach(t => { if (t && ex.name.toLowerCase().includes(t)) score += 14; });
  avoidArr.forEach(t => { if (t && ex.name.toLowerCase().includes(t)) score -= 100; });
  score += seededJitter(ex.name);
  return score;
}
function choosePrimary(focus: string, usedPrimary: Set<string>, usedAll: Set<string>, usedCardioCounts: Record<string, number>, cardioReuseCap: number, focusArea: string, avoidArr: string[], prefArr: string[], equipment: Set<string>) {
  const strict = exerciseRepository.filter(ex => ex.focus_area === focus && matchesEquipment(ex, equipment) && !usedPrimary.has(ex.name)).sort((a, b) => scoreExercise(b, focus, 'primary', focusArea, avoidArr, prefArr, equipment) - scoreExercise(a, focus, 'primary', focusArea, avoidArr, prefArr, equipment));
  if (strict[0]) return strict[0];
  const relaxed = exerciseRepository.filter(ex => ex.focus_area === focus && matchesEquipment(ex, equipment) && !usedAll.has(ex.name)).sort((a, b) => scoreExercise(b, focus, 'primary', focusArea, avoidArr, prefArr, equipment) - scoreExercise(a, focus, 'primary', focusArea, avoidArr, prefArr, equipment));
  if (relaxed[0]) return relaxed[0];
  const cardioPool = exerciseRepository.filter(ex => ex.focus_area === 'Cardio' && matchesEquipment(ex, equipment)).sort((a, b) => scoreExercise(b, 'Cardio', 'primary', focusArea, avoidArr, prefArr, equipment) - scoreExercise(a, 'Cardio', 'primary', focusArea, avoidArr, prefArr, equipment));
  for (const ex of cardioPool) { const count = usedCardioCounts[ex.name] || 0; if (count < cardioReuseCap) return ex; }
  return null;
}
function chooseAccessories(focus: string, usedAll: Set<string>, count: number, focusArea: string, avoidArr: string[], prefArr: string[], equipment: Set<string>) {
  const sorted = exerciseRepository.filter(ex => ex.focus_area === focus && matchesEquipment(ex, equipment) && !usedAll.has(ex.name)).sort((a, b) => scoreExercise(b, focus, 'accessory', focusArea, avoidArr, prefArr, equipment) - scoreExercise(a, focus, 'accessory', focusArea, avoidArr, prefArr, equipment));
  const result: any[] = []; const patterns = new Set<string>();
  for (const ex of sorted) { if (result.length >= count) break; if (patterns.has(ex.movement_pattern)) continue; result.push(ex); patterns.add(ex.movement_pattern); }
  if (result.length < count) { for (const ex of sorted) { if (result.length >= count) break; if (result.find(r => r.name === ex.name)) continue; result.push(ex); } }
  return result;
}

function build14DayPlan(goal: string, focusRaw: string, experience: string, bench: number, duration: number, days: Set<string>, avoid: string, notes: string, equipment: Set<string>): any {
  const activeDays = WEEKDAY_OPTIONS.filter(d => days.has(d));
  const daysPerWeek = activeDays.length || 4;
  let focusArea = focusRaw;
  if (focusRaw === 'Core Strength') focusArea = 'Core';
  else if (focusRaw === 'Upper Body') focusArea = 'Push';
  else if (focusRaw === 'Lower Body') focusArea = 'Legs';
  else if (focusRaw === 'Cardiovascular Endurance') focusArea = 'Cardio';
  else if (focusRaw === 'Flexibility & Mobility') focusArea = 'Core';
  const avoidArr = avoid.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const templateFamily = splitTemplates[goal] || splitTemplates.balanced;
  const templates = templateFamily[Math.min(daysPerWeek, 7)] || templateFamily[4];
  const usedAll = new Set<string>(); const usedPrimary = new Set<string>();
  const usedCardioCounts: Record<string, number> = {};
  const cardioReuseCap = (goal === 'fatloss' || goal === 'power' || focusArea === 'Cardio') ? 3 : 1;
  const cardioBias = focusArea === 'Cardio' ? 'high' : cardioBiasFor(goal);
  const weeks: any = { A: [], B: [] };

  ['A', 'B'].forEach((weekLabel, weekIndex) => {
    let sessionTypes: string[] = templates[weekLabel].slice();
    if (cardioBias === 'high') { const slots = Math.max(2, Math.ceil(sessionTypes.length / 3)); for (let c = 0; c < slots; c++) { if (c < sessionTypes.length) sessionTypes[sessionTypes.length - 1 - c] = 'Cardio'; } }
    else if (cardioBias === 'moderate') { const li = sessionTypes.lastIndexOf('Cardio'); if (li === -1 && sessionTypes.length) sessionTypes[sessionTypes.length - 1] = 'Cardio'; }
    if (focusArea !== 'balanced') { const fi = sessionTypes.indexOf(focusArea); if (fi > 0) { const sel = sessionTypes.splice(fi, 1)[0]; sessionTypes.unshift(sel); } else if (fi === -1) sessionTypes[0] = focusArea; }
    sessionTypes = activeDays.map((_, idx) => sessionTypes[idx % sessionTypes.length]);
    for (let i = 0; i < activeDays.length; i++) {
      const focus = sessionTypes[i]; const dayName = activeDays[i];
      const markerCycle = goalIntensityMap[goal] || goalIntensityMap.balanced;
      let primaryMarker = markerCycle[(i + weekIndex) % markerCycle.length];
      if (goal === 'balanced') primaryMarker = weekLabel === 'A' ? (i % 2 === 0 ? 'Hypertrophy' : 'Strength') : (focus === 'Cardio' || focus === 'Core' ? 'Power' : (i % 2 === 0 ? 'Power' : 'Hypertrophy'));
      const primary = choosePrimary(focus, usedPrimary, usedAll, usedCardioCounts, cardioReuseCap, focusArea, avoidArr, [], equipment);
      if (!primary) continue;
      usedPrimary.add(primary.name); usedAll.add(primary.name);
      if (primary.focus_area === 'Cardio') usedCardioCounts[primary.name] = (usedCardioCounts[primary.name] || 0) + 1;
      const accessoryCount = duration >= 75 ? 4 : 3;
      const accessories = chooseAccessories(focus, usedAll, accessoryCount, focusArea, avoidArr, [], equipment).map(ex => { usedAll.add(ex.name); return ex; });
      const session = {
        day: dayName, session_type: focus, marker: primaryMarker,
        primary_lift: { ...primary, sets: prescription(primary, 'primary', primaryMarker, bench) },
        accessories: accessories.map((ex, idx) => ({ ...ex, marker: focus === 'Cardio' ? 'Power' : 'Hypertrophy', sets: prescription(ex, 'accessory', focus === 'Cardio' ? 'Power' : 'Hypertrophy', bench) })),
      };
      if ((focus === 'Core' || focus === 'Cardio') && cardioBias !== 'low') {
        const bonus = chooseAccessories('Cardio', usedAll, 1, focusArea, avoidArr, [], equipment)[0];
        if (bonus) { usedAll.add(bonus.name); session.accessories.push({ ...bonus, marker: 'Power', sets: prescription(bonus, 'accessory', 'Power', bench) }); }
      }
      weeks[weekLabel].push(session);
    }
  });
  return { goal, focus: focusRaw, experience, bench, session_duration: duration, days: Array.from(days), avoid, notes, structure: '14-day A/B microcycle', weeks };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GeneralFitnessWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 1: Equipment
  const [equipment, setEquipment] = useState<Set<string>>(new Set(['Barbell & Plates','Dumbbells','Weight Machine','Cable Machine','Pull-up Bar','Bench / Box','Cardio Machine','Bodyweight / Rings']));
  // Step 2: Plan
  const [goal, setGoal] = useState('balanced');
  const [focus, setFocus] = useState('balanced');
  const [experience, setExperience] = useState('intermediate');
  const [bench, setBench] = useState('185');
  const [duration, setDuration] = useState('60');
  const [days, setDays] = useState<Set<string>>(new Set(['Monday','Tuesday','Thursday','Saturday']));
  // Step 3: Constraints
  const [avoid, setAvoid] = useState('');
  const [notes, setNotes] = useState('');
  // Step 4: Generated plan + editable weights
  const [plan, setPlan] = useState<any>(null);
  const [planWeights, setPlanWeights] = useState<Record<string, string>>({});
  const [planName, setPlanName] = useState('');

  const toggleEquipment = (v: string) => {
    setEquipment(prev => {
      const next = new Set(prev);
      if (v === 'Gym membership') { if (next.has('Gym membership')) next.delete('Gym membership'); else EQUIPMENT_OPTIONS.forEach(e => next.add(e)); }
      else { if (next.has(v)) next.delete(v); else next.add(v); next.delete('Gym membership'); }
      return next;
    });
  };
  const toggleDay = (v: string) => {
    setDays(prev => {
      const next = new Set(prev);
      if (next.has(v)) { if (next.size > 1) next.delete(v); } else next.add(v);
      return new Set(WEEKDAY_OPTIONS.filter(d => next.has(d)));
    });
  };

  const generate = useCallback(() => {
    genSeed = (genSeed * 1103515245 + 12345) >>> 0;
    const p = build14DayPlan(goal, focus, experience, Math.max(45, parseInt(bench) || 185), parseInt(duration), days, avoid, notes, equipment);
    setPlan(p); setPlanWeights({});
    if (!planName) setPlanName(`General Fitness — ${goal.charAt(0).toUpperCase() + goal.slice(1)}`);
  }, [goal, focus, experience, bench, duration, days, avoid, notes, planName, equipment]);

  function handleNextStep() {
    if (step === STEP_NAMES.length - 2) { generate(); setStep(step + 1); }
    else if (step < STEP_NAMES.length - 1) setStep(step + 1);
  }

  function getWeight(key: string, fallback: string) { return planWeights[key] ?? fallback; }
  function setWeight(key: string, val: string) { setPlanWeights(prev => ({ ...prev, [key]: val })); }

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/workout-plans", d).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan saved!" }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function handleSave() {
    if (!plan) return;
    // Merge edited weights back into plan before saving
    const finalPlan = JSON.parse(JSON.stringify(plan));
    Object.entries(planWeights).forEach(([key, val]) => {
      const [week, di, role, ai, si] = key.split('_');
      const day = finalPlan.weeks[week]?.[parseInt(di)];
      if (!day) return;
      if (role === 'primary') { const s = day.primary_lift.sets.find((x: any) => x.set === parseInt(si)); if (s) s.weight = val; }
      else { const acc = day.accessories[parseInt(ai)]; if (acc) { const s = acc.sets.find((x: any) => x.set === parseInt(si)); if (s) s.weight = val; } }
    });
    createMut.mutate({
      name: planName.trim() || `General Fitness — ${goal}`,
      goalType: 'general',
      durationWeeks: 2,
      startDate: new Date().toISOString().slice(0, 10),
      scheduleJson: JSON.stringify({ plan: finalPlan }),
      goalMetricJson: JSON.stringify({ goal, focus, experience, bench, duration: parseInt(duration), days: Array.from(days) }),
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-background border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Dumbbell size={16} /> General Fitness Wizard</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEP_NAMES.length} — {STEP_NAMES[step]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-secondary shrink-0">
          <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / STEP_NAMES.length) * 100}%` }} />
        </div>

        {/* Step pills */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {STEP_NAMES.map((n, i) => (
              <span key={i} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${i === step ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                {i + 1}. {n}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step 0: Equipment */}
          {step === 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Select what equipment you have available.</p>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map(v => (
                  <button key={v} type="button" onClick={() => toggleEquipment(v)}
                    className={`px-3 py-2 rounded-full border text-sm font-medium transition-colors ${equipment.has(v) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Plan */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Goal</label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="hypertrophy">Hypertrophy</SelectItem>
                      <SelectItem value="strength">Strength</SelectItem>
                      <SelectItem value="power">Power</SelectItem>
                      <SelectItem value="fatloss">Fat Loss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Focus Area</label>
                  <Select value={focus} onValueChange={setFocus}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="Core Strength">Core Strength</SelectItem>
                      <SelectItem value="Upper Body">Upper Body</SelectItem>
                      <SelectItem value="Lower Body">Lower Body</SelectItem>
                      <SelectItem value="Cardiovascular Endurance">Cardio Endurance</SelectItem>
                      <SelectItem value="Flexibility & Mobility">Flexibility & Mobility</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Experience</label>
                  <Select value={experience} onValueChange={setExperience}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Est. Bench Press (lb)</label>
                  <Input type="number" min={45} step={5} value={bench} onChange={e => setBench(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Session Duration</label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                      <SelectItem value="75">75 min</SelectItem>
                      <SelectItem value="90">90 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Training Days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map(v => (
                    <button key={v} type="button" onClick={() => toggleDay(v)}
                      className={`px-3 py-2 rounded-full border text-sm font-medium transition-colors ${days.has(v) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}>
                      {v.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Constraints */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Exercises to Avoid</label>
                <Textarea value={avoid} onChange={e => setAvoid(e.target.value)} placeholder="e.g. no barbell overhead press, no jumping" rows={3} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. shoulder-friendly pressing, hybrid endurance focus" rows={3} />
              </div>
            </div>
          )}

          {/* Step 3: Review Plan */}
          {step === 3 && plan && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-semibold text-muted-foreground">Plan Name</label>
                  <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="General Fitness Plan" className="h-8 text-sm" />
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { generate(); }}>
                  <RefreshCw size={13} /> Regenerate
                </Button>
              </div>
              <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground space-y-0.5">
                <p><span className="font-semibold text-foreground">Goal:</span> {plan.goal} · Focus: {plan.focus}</p>
                <p><span className="font-semibold text-foreground">Days:</span> {Array.from(days).join(', ')}</p>
                <p><span className="font-semibold text-foreground">Structure:</span> 14-day A/B microcycle · {plan.weeks.A.length} sessions/week</p>
              </div>
              {(['A', 'B'] as const).map(weekLabel => (
                <div key={weekLabel} className="rounded-xl border overflow-hidden">
                  <div className="px-3 py-2 bg-secondary/40 flex items-center justify-between">
                    <span className="text-sm font-semibold">Week {weekLabel}</span>
                    <span className="text-[11px] text-muted-foreground">{weekLabel === 'A' ? 'Base loading' : 'Variation / overload'}</span>
                  </div>
                  {(plan.weeks[weekLabel] || []).map((day: any, di: number) => (
                    <div key={di} className="border-t px-3 py-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{day.day} · {day.session_type} · {day.marker}</p>
                      {/* Primary lift */}
                      <div className="mb-2">
                        <p className="text-sm font-semibold">{day.primary_lift.name}</p>
                        <p className="text-[11px] text-muted-foreground mb-1.5">{day.primary_lift.movement_pattern} · {day.primary_lift.primary_muscle_group}</p>
                        <div className="space-y-1">
                          {day.primary_lift.sets.map((s: any) => (
                            <div key={s.set} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-10">Set {s.set}</span>
                              <span className="w-16">{s.reps}</span>
                              <Input className="h-6 text-xs flex-1 max-w-[100px]" value={getWeight(`${weekLabel}_${di}_primary_0_${s.set}`, s.weight)}
                                onChange={e => setWeight(`${weekLabel}_${di}_primary_0_${s.set}`, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Accessories */}
                      {day.accessories.map((acc: any, ai: number) => (
                        <div key={ai} className="mt-2 pt-2 border-t border-border/50">
                          <p className="text-xs font-medium">{acc.name} <span className="text-muted-foreground font-normal">· {acc.movement_pattern} · {acc.marker}</span></p>
                          <div className="space-y-1 mt-1">
                            {acc.sets.map((s: any) => (
                              <div key={s.set} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground w-10">Set {s.set}</span>
                                <span className="w-16">{s.reps}</span>
                                <Input className="h-6 text-xs flex-1 max-w-[100px]" value={getWeight(`${weekLabel}_${di}_accessory_${ai}_${s.set}`, s.weight)}
                                  onChange={e => setWeight(`${weekLabel}_${di}_accessory_${ai}_${s.set}`, e.target.value)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t shrink-0 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => step > 0 ? setStep(s => s - 1) : onClose()} className="gap-1.5">
            <ChevronLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEP_NAMES.length - 1 ? (
            <Button size="sm" onClick={handleNextStep} className="gap-1.5 min-w-[120px]">
              {step === STEP_NAMES.length - 2 ? '✨ Generate Plan' : 'Next'} <ChevronRight size={14} />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending} className="gap-1.5 min-w-[120px] bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 size={14} /> Save Plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
