/**
 * Section Ownership Model
 *
 * Each entry defines the primary management surface and source of truth
 * for a given object type. Ownership means the section is authoritative —
 * other sections may initiate creation, but must use the owner-system
 * creation flow with context prefilled and save to the owner system.
 *
 * Contextual creation rule:
 *   When any section creates a Goal, Task, Habit, Event, Place, Trip, or
 *   Journal entry, open the owner-system creation flow with the current
 *   context prefilled, save in the owner system, and surface the created
 *   record back on the calling section as a linked item.
 */

export const SECTION_OWNERSHIP = {
  "/goals":         { owns: "outcomes",              label: "Goals",                 group: "Plan"              },
  "/goals#tasks":   { owns: "execution",             label: "Projects & Tasks",      group: "Plan"              },
  "/habits":        { owns: "recurring_behaviors",   label: "Habits",                group: "Plan"              },
  "/calendar":      { owns: "dated_scheduling",      label: "Calendar",              group: null                },
  "/journal":       { owns: "reflection",            label: "Journal",               group: "Plan"              },
  "/relationships": { owns: "social_relationships",  label: "Friends",               group: "People"            },
  "/kids":          { owns: "family_relationships",  label: "Family",                group: "People"            },
  "/messenger":     { owns: "communication",         label: "Messenger",             group: null                },
  "/workouts":      { owns: "training",              label: "Workouts",              group: "Wellness"          },
  "/health":        { owns: "health_tracking",       label: "Health",                group: "Wellness"          },
  "/recipes":       { owns: "recipe_library",        label: "Recipes",               group: "Culture"           },
  "/hobbies":       { owns: "hobby_planning",        label: "Hobbies",               group: "Culture"           },
  "/spots":         { owns: "saved_locations",       label: "Places",                group: "Places"            },
  "/travel":        { owns: "travel_planning",       label: "Trips",                 group: "Places"            },
  "/events":        { owns: "event_discovery",       label: "Events",                group: "Places"            },
  "/budget":        { owns: "money",                 label: "Budget",                group: "Home"              },
  "/housekeeping":  { owns: "home_operations",       label: "Housekeeping",          group: "Home"              },
  "/faith":         { owns: "spiritual_practice",    label: "Faith & Spirituality",  group: "Beliefs & Society" },
  "/politics":      { owns: "civic_engagement",      label: "Politics & Civic Life", group: "Beliefs & Society" },
  "/settings":      { owns: "global_controls",       label: "Settings",              group: "System"            },
} as const;

export type SectionPath    = keyof typeof SECTION_OWNERSHIP;
export type OwnedDomain    = typeof SECTION_OWNERSHIP[SectionPath]["owns"];

/** Return the canonical owner path for an owned domain, or null if unknown. */
export function getOwnerPath(domain: OwnedDomain): SectionPath | null {
  const entry = (Object.entries(SECTION_OWNERSHIP) as [SectionPath, typeof SECTION_OWNERSHIP[SectionPath]][])
    .find(([, v]) => v.owns === domain);
  return entry ? entry[0] : null;
}

/** Return the human-readable label for a section path. */
export function getSectionLabel(path: SectionPath): string {
  return SECTION_OWNERSHIP[path]?.label ?? path;
}
