import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
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
  merchant: text("merchant").notNull().default(""),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, userId: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
