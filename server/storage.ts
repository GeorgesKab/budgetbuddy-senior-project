import { users, transactions, categories, type User, type InsertUser, type Transaction, type InsertTransaction, type Category, type InsertCategory } from "@shared/schema";
import { db, pool } from "./db";
import { and, eq, isNull, or } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getTransactions(userId: number): Promise<Transaction[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  createTransaction(userId: number, transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, transaction: Partial<InsertTransaction>): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;
  
  getCategories(userId: number): Promise<Category[]>;
  createCategory(userId: number, category: InsertCategory): Promise<Category>;
  updateCategory(userId: number, id: number, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(userId: number, id: number): Promise<void>;

  deleteAllTransactions(userId: number): Promise<void>;
  deleteUser(userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getTransactions(userId: number, filters?: { search?: string; category?: string; merchant?: string; startDate?: Date; endDate?: Date }): Promise<Transaction[]> {
    let query = db.select().from(transactions).where(eq(transactions.userId, userId));
    
    // Note: Drizzle's where clause doesn't easily chain like this in older versions, 
    // but we can use and() or build a dynamic where clause.
    // Given the current setup, we'll fetch and filter in memory if needed, 
    // or use a more robust query builder if available.
    // For simplicity and to match existing patterns, let's stick to base fetch for now 
    // and let the backend handle the heavy lifting if we wanted to scale.
    // However, the user asked for filters.
    
    const all = await db.select().from(transactions).where(eq(transactions.userId, userId));
    
    return all.filter(t => {
      if (filters?.search && !t.description.toLowerCase().includes(filters.search.toLowerCase()) && !t.merchant.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters?.category && t.category !== filters.category) return false;
      if (filters?.merchant && !t.merchant.toLowerCase().includes(filters.merchant.toLowerCase())) return false;
      if (filters?.startDate && new Date(t.date) < filters.startDate) return false;
      if (filters?.endDate && new Date(t.date) > filters.endDate) return false;
      return true;
    });
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction;
  }

  async createTransaction(userId: number, insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values({ ...insertTransaction, userId })
      .returning();
    return transaction;
  }

  async updateTransaction(id: number, updateData: Partial<InsertTransaction>): Promise<Transaction> {
    const [transaction] = await db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    return transaction;
  }

  async deleteTransaction(id: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async getCategories(userId: number): Promise<Category[]> {
  return await db
    .select()
    .from(categories)
    .where(or(eq(categories.userId, userId), isNull(categories.userId)));
}

  async createCategory(userId: number, insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db
      .insert(categories)
      .values({ ...insertCategory, userId })
      .returning();
    return category;
  }

  async updateCategory(userId: number, id: number, updateData: Partial<InsertCategory>): Promise<Category> {
  const [category] = await db
    .update(categories)
    .set(updateData)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        eq(categories.isDefault, false)
      )
    )
    .returning();

  if (!category) throw new Error("Category not found or cannot be edited");
  return category;
}

  async deleteCategory(userId: number, id: number): Promise<void> {
  const res = await db
    .delete(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        eq(categories.isDefault, false)
      )
    );
}

  async deleteAllTransactions(userId: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
  }

  async deleteUser(userId: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
