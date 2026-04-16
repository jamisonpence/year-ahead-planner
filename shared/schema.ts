import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── USERS ─────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── EVENTS (existing, extended) ───────────────────────────────────────────────
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── BOOKS ─────────────────────────────────────────────────────────────────────
// status: "backlog" | "current" | "paused" | "finished"
export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
});

// ── READING SESSIONS ──────────────────────────────────────────────────────────
export const readingSessions = sqliteTable("reading_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull(),
  date: text("date").notNull(),
  pagesRead: integer("pages_read").notNull().default(0),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  // for calendar scheduling (planned vs completed)
  planned: integer("planned", { mode: "boolean" }).notNull().default(false),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  recurring: text("recurring").notNull().default("none"),
});

// ── WORKOUT TEMPLATES ─────────────────────────────────────────────────────────
// workoutType: "full_body" | "upper" | "lower" | "push" | "pull" | "legs" | "strength" | "custom"
export const workoutTemplates = sqliteTable("workout_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const workoutLogs = sqliteTable("workout_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  templateId: integer("template_id"),  // null = ad-hoc
  date: text("date").notNull(),
  name: text("name").notNull(),
  workoutType: text("workout_type").notNull().default("custom"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  // logged exercises: [{name, sets:[{reps,weight,rpe}], isPR, notes}]
  exercisesJson: text("exercises_json").notNull().default("[]"),
  linkedGoalId: integer("linked_goal_id"),
});

// ── GOALS (extended from events, now standalone) ───────────────────────────────
// Goals are stored separately from events for richer linking
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  goalId: integer("goal_id"),  // nullable — null means standalone project
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  dueDate: text("due_date"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PROJECT TASKS (children of Projects) ──────────────────────────────────────
export const projectTasks = sqliteTable("project_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),  // always linked to a project
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── RECIPES ─────────────────────────────────────────────────────
export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  category: text("category"),
  prepTime: integer("prep_time"),
  cookTime: integer("cook_time"),
  // JSON: [{name: string, qty: string}][]
  ingredientsJson: text("ingredients_json").notNull().default("[]"),
  instructions: text("instructions"),
});

export const weekPlan = sqliteTable("week_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  // 0=Sun, 1=Mon ... 6=Sat
  dayIndex: integer("day_index").notNull(),
  recipeId: integer("recipe_id").notNull(),
  weekStart: text("week_start").notNull(), // ISO "YYYY-MM-DD" of the Monday
});

export const groceryChecks = sqliteTable("grocery_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  weekStart: text("week_start").notNull(),
  itemKey: text("item_key").notNull(), // "ingredient_name" lowercase
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipes.$inferSelect;

export const insertWeekPlanSchema = createInsertSchema(weekPlan).omit({ id: true });
export type InsertWeekPlan = z.infer<typeof insertWeekPlanSchema>;
export type WeekPlan = typeof weekPlan.$inferSelect;

export const insertGroceryCheckSchema = createInsertSchema(groceryChecks).omit({ id: true });
export type InsertGroceryCheck = z.infer<typeof insertGroceryCheckSchema>;
export type GroceryCheck = typeof groceryChecks.$inferSelect;

export type RecipeIngredient = { name: string; qty: string };

// ── RELATIONSHIP GROUPS ─────────────────────────────────────────────────────
export const relationshipGroups = sqliteTable("relationship_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),          // "Daycare", "Hometown", "Austin"
  color: text("color"),                   // optional accent color
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PEOPLE ───────────────────────────────────────────────────────────────────
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const generalTasks = sqliteTable("general_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── GOAL TASKS (legacy — keep for migration, now unused in UI) ─────────────────
export const goalTasks = sqliteTable("goal_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── MOVIES ───────────────────────────────────────────────────────────────────
// status: "backlog" | "watching" | "watched"
export const movies = sqliteTable("movies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  title: text("title").notNull(),
  year: integer("year"),
  director: text("director"),
  // comma-separated genres e.g. "Action,Thriller"
  genres: text("genres"),
  status: text("status").notNull().default("backlog"), // backlog | watched
  rating: integer("rating"),   // 1-5 stars, null = unrated
  notes: text("notes"),
  // JSON array of custom list names: ["Date Night", "Watch with Kids"]
  listsJson: text("lists_json").notNull().default("[]"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  posterColor: text("poster_color"),   // accent color for card
  streamingOn: text("streaming_on"),  // "Netflix", "HBO", etc.
});

export const insertMovieSchema = createInsertSchema(movies).omit({ id: true });
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type Movie = typeof movies.$inferSelect;

// ── BUDGET ────────────────────────────────────────────────────────────────────
// Budget categories for organizing expenses
export const budgetCategories = sqliteTable("budget_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),   // emoji or lucide icon name
  budgetAmount: real("budget_amount").notNull().default(0),  // monthly budget
  sortOrder: integer("sort_order").notNull().default(0),
});

// Individual income/expense transactions
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | yearly | weekly | quarterly
  nextRenewal: text("next_renewal").notNull(),   // ISO date
  categoryId: integer("category_id"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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
export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

// ── NAV PREFERENCES ───────────────────────────────────────────────────────────
// Stores user's tab order and visibility as a single JSON row
export const navPrefs = sqliteTable("nav_prefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  // JSON: [{path, hidden}] — ordered list
  prefsJson: text("prefs_json").notNull().default("[]"),
});

export type NavPref = { path: string; hidden: boolean };

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
  sets: TemplateSet[];   // array of individual sets
  restSeconds: number;
  notes: string;
};
export type LoggedSet = { reps: number; weight: number; rpe?: number };
export type LoggedExercise = {
  name: string; sets: LoggedSet[]; isPR: boolean; notes: string;
};
