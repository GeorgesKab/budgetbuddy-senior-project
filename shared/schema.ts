import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  numeric,
  boolean,
  jsonb,
  varchar,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const rankedPredictionSchema = z.object({
  category: z.string(),
  score: z.number(),
});

export type RankedPrediction = z.infer<typeof rankedPredictionSchema>;

export const transactionAiMetaSchema = z
  .object({
    modelName: z.string(),
    inputVariant: z.string(),
    cleanedNote: z.string(),
    typeToken: z.string(),
    modelText: z.string(),
    predictedCategory: z.string(),
    topPredictions: z.array(rankedPredictionSchema),
    suggestionAccepted: z.boolean(),
    userCorrected: z.boolean(),
    correctedCategory: z.string().nullable().optional(),
    finalSavedCategory: z.string().nullable().optional(),
    feedbackLoggedAt: z.string().nullable().optional(),
    confidenceBand: z
      .enum(["high", "medium", "low", "unknown"])
      .nullable()
      .optional(),
    topPredictionScore: z.number().nullable().optional(),
    predictionSource: z.string().nullable().optional(),
    originalUserMessage: z.string().nullable().optional(),
  })
  .passthrough();

export type TransactionAiMeta = z.infer<typeof transactionAiMetaSchema>;


export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount").notNull(),
  category: text("category").notNull(),
  categoryId: integer("category_id"),
  merchant: text("merchant").notNull().default(""),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  aiMeta: jsonb("ai_meta").$type<TransactionAiMeta | null>(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] })
    .notNull()
    .default("expense"),
  icon: text("icon").notNull().default("banknote"),
  isDefault: boolean("is_default").notNull().default(false),
});

export const predictionFeedback = pgTable("prediction_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  transactionId: integer("transaction_id"),
  source: text("source").notNull().default("chat_confirmation"),
  originalMessage: text("original_message").notNull(),
  amount: numeric("amount"),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  merchant: text("merchant").notNull().default(""),
  description: text("description").notNull().default(""),
  modelName: text("model_name"),
  inputVariant: text("input_variant"),
  cleanedNote: text("cleaned_note"),
  typeToken: text("type_token"),
  modelText: text("model_text"),
  predictedCategory: text("predicted_category").notNull(),
  finalCategory: text("final_category").notNull(),
  wasCorrected: boolean("was_corrected").notNull(),
  topPredictions: jsonb("top_predictions").$type<RankedPrediction[] | null>(),
  usedForTraining: boolean("used_for_training").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  categories: many(categories),
  predictionFeedback: many(predictionFeedback),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  categoryRef: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  predictionFeedback: many(predictionFeedback),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const predictionFeedbackRelations = relations(
  predictionFeedback,
  ({ one }) => ({
    user: one(users, {
      fields: [predictionFeedback.userId],
      references: [users.id],
    }),
    transaction: one(transactions, {
      fields: [predictionFeedback.transactionId],
      references: [transactions.id],
    }),
  })
);

export const insertUserSchema = createInsertSchema(users);

export const insertTransactionSchema = createInsertSchema(transactions)
  .omit({ id: true, userId: true })
  .extend({
    category: z.string().min(1, "Category is required"),
    aiMeta: transactionAiMetaSchema.nullable().optional(),
  });

export const insertCategorySchema = createInsertSchema(categories)
  .omit({ id: true, userId: true, isDefault: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    type: z.enum(["income", "expense"]),
    icon: z.string().default("banknote"),
  });

export const insertPredictionFeedbackSchema = createInsertSchema(
  predictionFeedback
).omit({
  id: true,
  createdAt: true,
  usedForTraining: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type PredictionFeedback = typeof predictionFeedback.$inferSelect;
export type InsertPredictionFeedback = z.infer<
  typeof insertPredictionFeedbackSchema
>;