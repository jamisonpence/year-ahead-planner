import { pgTable, text, integer, real, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── USERS ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
  anthropicApiKeyEnc: text("anthropic_api_key_enc"), // AES-256-GCM encrypted, never returned to client
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── EVENTS (existing, extended) ───────────────────────────────────────────────
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
  category: text("category").notNull().default("other"),
  recurring: text("recurring").notNull().default("none"),
  description: text("description"),
  color: text("color"),
});

// ── TASKS (existing, unchanged) ────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── BOOKS ─────────────────────────────────────────────────────────────────────
// status: "backlog" | "current" | "paused" | "finished"
export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  author: text("author"),
  series: text("series"),
  seriesNumber: integer("series_number"),
  genre: text("genre"),        // comma-separated tags
  status: text("status").notNull().default("backlog"),
  totalPages: integer("total_pages"),
  pagesRead: integer("pages_read").notNull().default(0),
  startDate: text("start_date"),
  targetFinishDate: text("target_finish_date"),
  finishDate: text("finish_date"),
  notes: text("notes"),
  highlights: text("highlights"),
  linkedGoalId: integer("linked_goal_id"),
  coverColor: text("cover_color"),  // for visual card accent
  coverUrl: text("cover_url"),      // thumbnail from Google Books
});

// ── READING SESSIONS ──────────────────────────────────────────────────────────
export const readingSessions = pgTable("reading_sessions", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull(),
  date: text("date").notNull(),
  pagesRead: integer("pages_read").notNull().default(0),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  // for calendar scheduling (planned vs completed)
  planned: boolean("planned").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  recurring: text("recurring").notNull().default("none"),
});

// ── WORKOUT TEMPLATES ─────────────────────────────────────────────────────────
// workoutType: "full_body" | "upper" | "lower" | "push" | "pull" | "legs" | "strength" | "custom"
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  workoutType: text("workout_type").notNull().default("custom"),
  scheduledDay: text("scheduled_day"),  // "monday" | "tuesday" etc, or null
  recurring: text("recurring").notNull().default("none"),
  notes: text("notes"),
  linkedGoalId: integer("linked_goal_id"),
  // exercises stored as JSON array: [{name, sets, reps, weight, restSeconds, notes}]
  exercisesJson: text("exercises_json").notNull().default("[]"),
});

// ── WORKOUT LOGS (actual completed sessions) ───────────────────────────────────
export const workoutLogs = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  templateId: integer("template_id"),  // null = ad-hoc
  date: text("date").notNull(),
  name: text("name").notNull(),
  workoutType: text("workout_type").notNull().default("custom"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  // logged exercises: [{name, sets:[{reps,weight,rpe}], isPR, notes}]
  exercisesJson: text("exercises_json").notNull().default("[]"),
  linkedGoalId: integer("linked_goal_id"),
});

// ── GOALS (extended from events, now standalone) ───────────────────────────────
// Goals are stored separately from events for richer linking
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  category: text("category").notNull().default("general"),
  // progressType: "percent" | "count" | "sessions" | "pages" | "books" | "weight" | "boolean"
  progressType: text("progress_type").notNull().default("percent"),
  progressCurrent: real("progress_current").notNull().default(0),
  progressTarget: real("progress_target").notNull().default(100),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  startDate: text("start_date"),
  targetDate: text("target_date"),
  recurring: text("recurring").notNull().default("none"),
  description: text("description"),
  linkedBookId: integer("linked_book_id"),
  linkedTemplateId: integer("linked_template_id"),
});

// ── PROJECTS (optionally linked to a Goal) ──────────────────────────────────
// status: "not_started" | "in_progress" | "done" | "blocked"
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  goalId: integer("goal_id"),  // nullable — null means standalone project
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  dueDate: text("due_date"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PROJECT TASKS (children of Projects) ──────────────────────────────────────
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),  // always linked to a project
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── RECIPES ─────────────────────────────────────────────────────
export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  category: text("category"),
  // "main" | "vegetable" | "side" | "sauce" — null = unclassified
  componentType: text("component_type"),
  prepTime: integer("prep_time"),
  cookTime: integer("cook_time"),
  // JSON: [{name: string, qty: string}][]
  ingredientsJson: text("ingredients_json").notNull().default("[]"),
  instructions: text("instructions"),
  imageUrl: text("image_url"),
});

// ── Meal Bundles ─────────────────────────────────────────────────────────────
// A saved full-meal combination: e.g. "Steak Night" = Ribeye + Roasted Broccoli + Mashed Potatoes + Chimichurri
export const mealBundles = pgTable("meal_bundles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  description: text("description"),
  // JSON: number[] — array of recipe IDs in this bundle
  recipeIdsJson: text("recipe_ids_json").notNull().default("[]"),
});

export const weekPlan = pgTable("week_plan", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  // 0=Sun, 1=Mon ... 6=Sat
  dayIndex: integer("day_index").notNull(),
  recipeId: integer("recipe_id"),   // set for single-recipe assignments
  bundleId: integer("bundle_id"),   // set for bundle assignments
  weekStart: text("week_start").notNull(), // ISO "YYYY-MM-DD" of the Sunday
});

export const groceryChecks = pgTable("grocery_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  weekStart: text("week_start").notNull(),
  itemKey: text("item_key").notNull(), // "ingredient_name" lowercase
  checked: boolean("checked").notNull().default(false),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipes.$inferSelect;

export const insertMealBundleSchema = createInsertSchema(mealBundles).omit({ id: true });
export type InsertMealBundle = z.infer<typeof insertMealBundleSchema>;
export type MealBundle = typeof mealBundles.$inferSelect;

export const insertWeekPlanSchema = createInsertSchema(weekPlan).omit({ id: true });
export type InsertWeekPlan = z.infer<typeof insertWeekPlanSchema>;
export type WeekPlan = typeof weekPlan.$inferSelect;

export const insertGroceryCheckSchema = createInsertSchema(groceryChecks).omit({ id: true });
export type InsertGroceryCheck = z.infer<typeof insertGroceryCheckSchema>;
export type GroceryCheck = typeof groceryChecks.$inferSelect;

export type RecipeIngredient = { name: string; qty: string };
export type ComponentType = "main" | "vegetable" | "side" | "sauce" | "dessert" | "baking";

// ── RELATIONSHIP GROUPS ─────────────────────────────────────────────────────
export const relationshipGroups = pgTable("relationship_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),          // "Daycare", "Hometown", "Austin"
  color: text("color"),                   // optional accent color
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PEOPLE ───────────────────────────────────────────────────────────────────
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  groupId: integer("group_id"),           // nullable — can be ungrouped
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  birthday: text("birthday"),             // ISO date "YYYY-MM-DD"
  notes: text("notes"),
  spouseId: integer("spouse_id"),         // self-ref to another person
  // JSON array of person IDs who are children of this person: [1, 2, 3]
  childrenJson: text("children_json").notNull().default("[]"),
  // linked birthday event id (for syncing)
  birthdayEventId: integer("birthday_event_id"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── GENERAL TASKS (standalone — not linked to any project or goal) ────────────
export const generalTasks = pgTable("general_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── GOAL TASKS (legacy — keep for migration, now unused in UI) ─────────────────
export const goalTasks = pgTable("goal_tasks", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── MOVIES & SHOWS ────────────────────────────────────────────────────────────
// mediaType: "movie" | "show"
// status: "backlog" | "watching" | "watched" | "finished"
export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  mediaType: text("media_type").notNull().default("movie"), // "movie" | "show"
  title: text("title").notNull(),
  year: integer("year"),
  director: text("director"),       // director for movies, creator for shows
  // comma-separated genres e.g. "Action,Thriller"
  genres: text("genres"),
  status: text("status").notNull().default("backlog"), // backlog | watching | watched | finished
  rating: integer("rating"),   // 1-5 stars, null = unrated
  notes: text("notes"),
  // JSON array of custom list names: ["Date Night", "Watch with Kids"]
  listsJson: text("lists_json").notNull().default("[]"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  posterColor: text("poster_color"),   // accent color for card
  streamingOn: text("streaming_on"),  // "Netflix", "HBO", etc.
  // Show-specific
  totalSeasons: integer("total_seasons"),
  currentSeason: integer("current_season"),
  // Video-specific
  videoUrl: text("video_url"),
  // Poster from TMDB
  posterUrl: text("poster_url"),
});

export const insertMovieSchema = createInsertSchema(movies).omit({ id: true });
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type Movie = typeof movies.$inferSelect;

// ── MUSIC ─────────────────────────────────────────────────────────────────────
// Artists to explore or that you love
export const musicArtists = pgTable("music_artists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  genres: text("genres"),           // comma-separated e.g. "Rock,Indie"
  isFavorite: boolean("is_favorite").notNull().default(false),
  notes: text("notes"),
  accentColor: text("accent_color"), // card accent
});

// Songs nested under artists
// status: "want_to_listen" | "listening" | "listened"
export const musicSongs = pgTable("music_songs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  artistId: integer("artist_id").notNull(),
  title: text("title").notNull(),
  album: text("album"),
  genre: text("genre"),             // comma-separated
  year: integer("year"),
  status: text("status").notNull().default("want_to_listen"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  rating: integer("rating"),        // 1–5
  notes: text("notes"),
});

export const insertMusicArtistSchema = createInsertSchema(musicArtists).omit({ id: true });
export type InsertMusicArtist = z.infer<typeof insertMusicArtistSchema>;
export type MusicArtist = typeof musicArtists.$inferSelect;

export const insertMusicSongSchema = createInsertSchema(musicSongs).omit({ id: true });
export type InsertMusicSong = z.infer<typeof insertMusicSongSchema>;
export type MusicSong = typeof musicSongs.$inferSelect;

export type MusicArtistWithSongs = MusicArtist & { songs: MusicSong[] };

// ── BUDGET ────────────────────────────────────────────────────────────────────
// Budget categories for organizing expenses
export const budgetCategories = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),   // emoji or lucide icon name
  budgetAmount: real("budget_amount").notNull().default(0),  // monthly budget
  sortOrder: integer("sort_order").notNull().default(0),
});

// Individual income/expense transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  amount: real("amount").notNull(),   // positive = income, negative = expense
  type: text("type").notNull().default("expense"),  // income | expense
  categoryId: integer("category_id"),
  date: text("date").notNull(),
  notes: text("notes"),
  // for recurring transactions
  recurring: text("recurring").notNull().default("none"),  // none | monthly | weekly | yearly
});

// Subscriptions with renewal tracking
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | yearly | weekly | quarterly
  nextRenewal: text("next_renewal").notNull(),   // ISO date
  categoryId: integer("category_id"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  color: text("color"),
  icon: text("icon"),  // emoji
});

export const insertBudgetCategorySchema = createInsertSchema(budgetCategories).omit({ id: true });
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetCategory = typeof budgetCategories.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ── RECEIPTS ─────────────────────────────────────────────────────────────────
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  filename: text("filename").notNull(),       // stored filename on disk
  originalName: text("original_name").notNull(), // user's original filename
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadDate: text("upload_date").notNull(),  // ISO date
  categoryId: integer("category_id"),
  transactionId: integer("transaction_id"),   // optional link to a transaction
  notes: text("notes"),
  merchant: text("merchant"),
  amount: real("amount"),                     // manually entered amount on receipt
  receiptDate: text("receipt_date"),          // date printed on receipt
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receipts.$inferSelect;

// ── PLANTS ────────────────────────────────────────────────────────────────────
// lightNeeds: "low" | "medium" | "bright_indirect" | "direct"
export const plants = pgTable("plants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  species: text("species"),
  location: text("location"),
  lightNeeds: text("light_needs").notNull().default("medium"),
  waterFrequencyDays: integer("water_frequency_days").notNull().default(7),
  soilType: text("soil_type"),
  notes: text("notes"),
  lastWatered: text("last_watered"),          // ISO date "YYYY-MM-DD"
  remindersEnabled: boolean("reminders_enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  photoUrl: text("photo_url"),
  // AI-enriched fields (populated by Claude)
  toxicityNotes: text("toxicity_notes"),
  propagationMethods: text("propagation_methods"),
  careDifficulty: text("care_difficulty"), // "easy" | "moderate" | "difficult"
  aiEnriched: boolean("ai_enriched").notNull().default(false),
});

// ── CHORES ────────────────────────────────────────────────────────────────────
// frequency: "daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly"|"custom"|"as_needed"
export const chores = pgTable("chores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  category: text("category").notNull().default("cleaning"), // cleaning|yard|maintenance|laundry|cooking|other
  frequency: text("frequency").notNull().default("weekly"),
  customFrequencyDays: integer("custom_frequency_days"),     // used when frequency="custom"
  lastCompleted: text("last_completed"),   // ISO date
  nextDue: text("next_due"),               // ISO date
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  priority: text("priority").notNull().default("medium"),    // low|medium|high
  assignee: text("assignee"),              // optional household member name
  tags: text("tags"),                      // comma-separated custom tags
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── HOUSE PROJECTS ────────────────────────────────────────────────────────────
// status: "not_started"|"in_progress"|"done"|"blocked"
export const houseProjects = pgTable("house_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
  completedDate: text("completed_date"),
  estimatedCost: real("estimated_cost"),
  actualCost: real("actual_cost"),
  contractor: text("contractor"),
  category: text("category").notNull().default("other"),     // repair|renovation|improvement|cleaning|other
  notes: text("notes"),
  tags: text("tags"),                      // comma-separated custom tags
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── HOUSE PROJECT TASKS ───────────────────────────────────────────────────────
export const houseProjectTasks = pgTable("house_project_tasks", {
  id: serial("id").primaryKey(),
  houseProjectId: integer("house_project_id").notNull(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── APPLIANCES ────────────────────────────────────────────────────────────────
export const appliances = pgTable("appliances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  location: text("location"),              // kitchen|bathroom|laundry|garage|bedroom|living_room|other
  purchaseDate: text("purchase_date"),     // ISO date
  purchasePrice: real("purchase_price"),
  warrantyExpiry: text("warranty_expiry"), // ISO date
  lastServiced: text("last_serviced"),     // ISO date
  serviceFrequencyMonths: integer("service_frequency_months"),
  nextServiceDue: text("next_service_due"),// ISO date
  notes: text("notes"),
  tags: text("tags"),                      // comma-separated custom tags
});

// ── SPOTS ─────────────────────────────────────────────────────────────────────
// type: "restaurant"|"bar"|"cafe"|"park"|"trail"|"shop"|"service"|"attraction"|"hotel"|"other"
// status: "want_to_visit"|"visited"|"favorite"
export const spots = pgTable("spots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("restaurant"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  status: text("status").notNull().default("want_to_visit"),
  rating: integer("rating"),               // 1–5
  notes: text("notes"),
  website: text("website"),
  priceRange: integer("price_range"),      // 1=$, 2=$$, 3=$$$, 4=$$$$
  tags: text("tags"),                      // comma-separated custom tags/filters
  visitedDate: text("visited_date"),       // ISO date
  isFavorite: boolean("is_favorite").notNull().default(false),
  openingHours: text("opening_hours"),
});

// ── NAV PREFERENCES ───────────────────────────────────────────────────────────
// Stores user's tab order and visibility as a single JSON row
export const navPrefs = pgTable("nav_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  // JSON: [{path, hidden}] — ordered list
  prefsJson: text("prefs_json").notNull().default("[]"),
});

export type NavPref = { path: string; hidden: boolean };

// ── TAB PRIVACY ───────────────────────────────────────────────────────────────
// Stores which tabs friends can see — default "private" for all
export const tabPrivacy = pgTable("tab_privacy", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  // JSON: [{path, visibility}] where visibility = "private" | "friends"
  settingsJson: text("settings_json").notNull().default("[]"),
});

export type TabPrivacySetting = { path: string; visibility: "private" | "friends" };

// ── INSERT SCHEMAS & TYPES ─────────────────────────────────────────────────────
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const insertBookSchema = createInsertSchema(books).omit({ id: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export const insertReadingSessionSchema = createInsertSchema(readingSessions).omit({ id: true });
export type InsertReadingSession = z.infer<typeof insertReadingSessionSchema>;
export type ReadingSession = typeof readingSessions.$inferSelect;

export const insertWorkoutTemplateSchema = createInsertSchema(workoutTemplates).omit({ id: true });
export type InsertWorkoutTemplate = z.infer<typeof insertWorkoutTemplateSchema>;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;

export const insertWorkoutLogSchema = createInsertSchema(workoutLogs).omit({ id: true });
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type WorkoutLog = typeof workoutLogs.$inferSelect;

// ── WORKOUT PLANS ─────────────────────────────────────────────────────────────
// A named collection of templates arranged into a weekly repeating schedule
export const workoutPlans = pgTable("workout_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  durationWeeks: integer("duration_weeks").notNull().default(4),
  // JSON: [{ dayOfWeek: "monday"|"tuesday"|..., templateId: number, templateName: string }]
  scheduleJson: text("schedule_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const insertWorkoutPlanSchema = createInsertSchema(workoutPlans).omit({ id: true });
export type InsertWorkoutPlan = z.infer<typeof insertWorkoutPlanSchema>;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type WorkoutPlanDayEntry = { dayOfWeek: string; templateId: number; templateName: string };

// ── WORKOUT SHARES ────────────────────────────────────────────────────────────
// Share a template or plan with a friend
export const workoutShares = pgTable("workout_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  shareType: text("share_type").notNull().default("template"), // "template" | "plan"
  // template: { name, workoutType, exercisesJson, notes }
  // plan: { name, description, durationWeeks, schedule: [{dayOfWeek, templateName, workoutType, exercisesJson}] }
  contentJson: text("content_json").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
});

export const insertWorkoutShareSchema = createInsertSchema(workoutShares).omit({ id: true });
export type InsertWorkoutShare = z.infer<typeof insertWorkoutShareSchema>;
export type WorkoutShare = typeof workoutShares.$inferSelect;
export type WorkoutShareWithUser = WorkoutShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
};

export const insertGoalSchema = createInsertSchema(goals).omit({ id: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export const insertGoalTaskSchema = createInsertSchema(goalTasks).omit({ id: true });
export type InsertGoalTask = z.infer<typeof insertGoalTaskSchema>;
export type GoalTask = typeof goalTasks.$inferSelect;

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true });
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

export const insertGeneralTaskSchema = createInsertSchema(generalTasks).omit({ id: true });
export type InsertGeneralTask = z.infer<typeof insertGeneralTaskSchema>;
export type GeneralTask = typeof generalTasks.$inferSelect;

export const insertRelationshipGroupSchema = createInsertSchema(relationshipGroups).omit({ id: true });
export type InsertRelationshipGroup = z.infer<typeof insertRelationshipGroupSchema>;
export type RelationshipGroup = typeof relationshipGroups.$inferSelect;

export const insertPersonSchema = createInsertSchema(people).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

// childrenJson stores an array of child person IDs: number[]
// (Legacy: may also contain [{name, birthday}] objects — handle both gracefully)
export type PersonWithSpouse = Person & { spouse?: Person | null };

export const insertPlantSchema = createInsertSchema(plants).omit({ id: true });
export type InsertPlant = z.infer<typeof insertPlantSchema>;
export type Plant = typeof plants.$inferSelect;

export const insertChoreSchema = createInsertSchema(chores).omit({ id: true });
export type InsertChore = z.infer<typeof insertChoreSchema>;
export type Chore = typeof chores.$inferSelect;

export const insertHouseProjectSchema = createInsertSchema(houseProjects).omit({ id: true });
export type InsertHouseProject = z.infer<typeof insertHouseProjectSchema>;
export type HouseProject = typeof houseProjects.$inferSelect;

export const insertHouseProjectTaskSchema = createInsertSchema(houseProjectTasks).omit({ id: true });
export type InsertHouseProjectTask = z.infer<typeof insertHouseProjectTaskSchema>;
export type HouseProjectTask = typeof houseProjectTasks.$inferSelect;
export type HouseProjectWithTasks = HouseProject & { tasks: HouseProjectTask[] };

export const insertApplianceSchema = createInsertSchema(appliances).omit({ id: true });
export type InsertAppliance = z.infer<typeof insertApplianceSchema>;
export type Appliance = typeof appliances.$inferSelect;

export const insertSpotSchema = createInsertSchema(spots).omit({ id: true });
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type Spot = typeof spots.$inferSelect;

// ── SPOT SHARES ────────────────────────────────────────────────────────────────
export const spotShares = pgTable("spot_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("restaurant"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  website: text("website"),
  priceRange: integer("price_range"),
  tags: text("tags"),
  openingHours: text("opening_hours"),
  rating: integer("rating"),
  spotNotes: text("spot_notes"),    // original spot notes
  notes: text("notes"),             // share message/note
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertSpotShareSchema = createInsertSchema(spotShares).omit({ id: true });
export type InsertSpotShare = z.infer<typeof insertSpotShareSchema>;
export type SpotShare = typeof spotShares.$inferSelect;

export type SpotShareWithUser = SpotShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── KIDS ─────────────────────────────────────────────────────────────────────
export const children = pgTable("children", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  birthDate: text("birth_date"),
  notes: text("notes"),
  accentColor: text("accent_color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childMilestones = pgTable("child_milestones", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"), // motor|speech|social|academic|health|first|other
  date: text("date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childMemories = pgTable("child_memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date"),
  tags: text("tags"), // comma-separated
  mood: text("mood").notNull().default("happy"), // happy|funny|proud|sweet|bittersweet
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childPrepItems = pgTable("child_prep_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"), // health|school|activity|party|safety|gear|other
  dueDate: text("due_date"),
  completed: boolean("completed").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertChildSchema = createInsertSchema(children).omit({ id: true });
export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof children.$inferSelect;

export const insertChildMilestoneSchema = createInsertSchema(childMilestones).omit({ id: true });
export type InsertChildMilestone = z.infer<typeof insertChildMilestoneSchema>;
export type ChildMilestone = typeof childMilestones.$inferSelect;

export const insertChildMemorySchema = createInsertSchema(childMemories).omit({ id: true });
export type InsertChildMemory = z.infer<typeof insertChildMemorySchema>;
export type ChildMemory = typeof childMemories.$inferSelect;

export const insertChildPrepItemSchema = createInsertSchema(childPrepItems).omit({ id: true });
export type InsertChildPrepItem = z.infer<typeof insertChildPrepItemSchema>;
export type ChildPrepItem = typeof childPrepItems.$inferSelect;

export type ChildWithDetails = Child & {
  milestones: ChildMilestone[];
  memories: ChildMemory[];
  prepItems: ChildPrepItem[];
};

// ── QUOTES ─────────────────────────────────────────────────────────────────────
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  text: text("text").notNull(),
  author: text("author"),
  source: text("source"),
  category: text("category").notNull().default("other"), // motivation|wisdom|humor|love|life|philosophy|other
  tags: text("tags"), // comma-separated
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ── QUOTE SHARES ───────────────────────────────────────────────────────────────
export const quoteShares = pgTable("quote_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  text: text("text").notNull(),
  author: text("author"),
  source: text("source"),
  category: text("category"),
  tags: text("tags"),
  quoteNotes: text("quote_notes"),  // original quote notes
  notes: text("notes"),             // share message
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertQuoteShareSchema = createInsertSchema(quoteShares).omit({ id: true });
export type InsertQuoteShare = z.infer<typeof insertQuoteShareSchema>;
export type QuoteShare = typeof quoteShares.$inferSelect;

export type QuoteShareWithUser = QuoteShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── ART ───────────────────────────────────────────────────────────────────────
export const artPieces = pgTable("art_pieces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  artistName: text("artist_name"),
  yearCreated: integer("year_created"),
  medium: text("medium").notNull().default("other"), // painting|sculpture|photography|digital|print|drawing|textile|other
  movement: text("movement"),
  whereViewed: text("where_viewed"),
  city: text("city"),
  status: text("status").notNull().default("want_to_see"), // want_to_see|seen|own
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  accentColor: text("accent_color"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertArtPieceSchema = createInsertSchema(artPieces).omit({ id: true });
export type InsertArtPiece = z.infer<typeof insertArtPieceSchema>;
export type ArtPiece = typeof artPieces.$inferSelect;

// ── ART SHARES ─────────────────────────────────────────────────────────────────
export const artShares = pgTable("art_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  title: text("title").notNull(),
  artistName: text("artist_name"),
  yearCreated: integer("year_created"),
  medium: text("medium"),
  movement: text("movement"),
  whereViewed: text("where_viewed"),
  city: text("city"),
  accentColor: text("accent_color"),
  imageUrl: text("image_url"),
  artNotes: text("art_notes"),   // original piece notes
  notes: text("notes"),          // share message
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertArtShareSchema = createInsertSchema(artShares).omit({ id: true });
export type InsertArtShare = z.infer<typeof insertArtShareSchema>;
export type ArtShare = typeof artShares.$inferSelect;

export type ArtShareWithUser = ArtShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── EQUIPMENT ────────────────────────────────────────────────────────────────────
// category: "barbell" | "dumbbell" | "kettlebell" | "resistance_band" | "cable" | "machine" | "pullup_bar" | "bench" | "cardio" | "bodyweight" | "other"
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

// ── JOURNAL ────────────────────────────────────────────────────────────────────

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  date: text("date").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  mood: text("mood"),
  tags: text("tags"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// ── BOOK RECOMMENDATIONS ──────────────────────────────────────────────────────
export const bookRecommendations = pgTable("book_recommendations", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  coverUrl: text("cover_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertBookRecommendationSchema = createInsertSchema(bookRecommendations).omit({ id: true });
export type InsertBookRecommendation = z.infer<typeof insertBookRecommendationSchema>;
export type BookRecommendation = typeof bookRecommendations.$inferSelect;

export type BookRecommendationWithUser = BookRecommendation & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── MOVIE SHARES ───────────────────────────────────────────────────────────────
export const movieShares = pgTable("movie_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  mediaType: text("media_type").notNull().default("movie"), // movie | show
  title: text("title").notNull(),
  year: integer("year"),
  director: text("director"),
  genres: text("genres"),
  streamingOn: text("streaming_on"),
  posterColor: text("poster_color"),
  posterUrl: text("poster_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertMovieShareSchema = createInsertSchema(movieShares).omit({ id: true });
export type InsertMovieShare = z.infer<typeof insertMovieShareSchema>;
export type MovieShare = typeof movieShares.$inferSelect;

export type MovieShareWithUser = MovieShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── RECIPE SHARES ──────────────────────────────────────────────────────────────
export const recipeShares = pgTable("recipe_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  recipeName: text("recipe_name").notNull(),
  recipeEmoji: text("recipe_emoji").notNull().default("🍽️"),
  recipeCategory: text("recipe_category"),
  recipeComponentType: text("recipe_component_type"),
  recipePrepTime: integer("recipe_prep_time"),
  recipeCookTime: integer("recipe_cook_time"),
  recipeServings: integer("recipe_servings"),
  recipeIngredients: text("recipe_ingredients").notNull().default("[]"),
  recipeInstructions: text("recipe_instructions"),
  recipeImageUrl: text("recipe_image_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertRecipeShareSchema = createInsertSchema(recipeShares).omit({ id: true });
export type InsertRecipeShare = z.infer<typeof insertRecipeShareSchema>;
export type RecipeShare = typeof recipeShares.$inferSelect;

export type RecipeShareWithUser = RecipeShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── MUSIC RECOMMENDATIONS ──────────────────────────────────────────────────────
export const musicRecommendations = pgTable("music_recommendations", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  type: text("type").notNull(), // "artist" | "song"
  artistName: text("artist_name").notNull(),
  songTitle: text("song_title"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertMusicRecommendationSchema = createInsertSchema(musicRecommendations).omit({ id: true });
export type InsertMusicRecommendation = z.infer<typeof insertMusicRecommendationSchema>;
export type MusicRecommendation = typeof musicRecommendations.$inferSelect;

export type MusicRecommendationWithUser = MusicRecommendation & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── FRIEND REQUESTS ────────────────────────────────────────────────────────────
export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | declined
  createdAt: text("created_at").notNull(),
});

export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true });
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;

// Enriched version with user info attached
export type FriendRequestWithUser = FriendRequest & {
  otherUser: { id: number; name: string; email: string; avatarUrl: string | null };
};

// Public user profile (no sensitive fields)
export type PublicUser = { id: number; name: string; email: string; avatarUrl: string | null };

// ── COMPOSITE TYPES ────────────────────────────────────────────────────────────
export type EventWithTasks = Event & { tasks: Task[] };
export type GoalWithTasks = Goal & { tasks: GoalTask[] }; // legacy
export type ProjectWithTasks = Project & { tasks: ProjectTask[] };
export type GoalWithProjects = Goal & { projects: ProjectWithTasks[] };
export type BookWithSessions = Book & { sessions: ReadingSession[] };
export type WorkoutTemplateWithLogs = WorkoutTemplate & { recentLogs: WorkoutLog[] };

// Exercise types (JSON shapes)
// Each set in a template can have its own reps + weight target
export type TemplateSet = { reps: number; weight: number };
export type TemplateExercise = {
  name: string;
  type?: string;         // "Lifting" | "Run" | "Bike" | "Swim" | "HIIT" | "Yoga" | "Stretch" | custom
  sets: TemplateSet[];   // array of individual sets (used for Lifting/HIIT/Custom)
  distance?: string;     // for cardio types: "5 mi", "10 km", "400 m"
  duration?: string;     // for cardio/endurance types: "30 min", "1:15:00"
  restSeconds: number;
  notes: string;
};
export type LoggedSet = { reps: number; weight: number; rpe?: number };
export type LoggedExercise = {
  name: string;
  type?: string;
  sets: LoggedSet[];
  distance?: string;
  duration?: string;
  isPR: boolean;
  notes: string;
};
