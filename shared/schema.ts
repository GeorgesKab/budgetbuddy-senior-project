import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount").notNull(), // stored as string decimal
  category: text("category").notNull(),
  categoryId: integer("category_id"),
  merchant: text("merchant").notNull().default(""),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull().default("expense"),
  icon: text("icon").notNull().default("banknote"),
  isDefault: boolean("is_default").notNull().default(false),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  categories: many(categories),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  categoryRef: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const insertUserSchema = createInsertSchema(users);
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, userId: true }).extend({
  category: z.string().min(1, "Category is required"),
});
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, userId: true, isDefault: true }).extend({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["income", "expense"]),
  icon: z.string().default("banknote"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
