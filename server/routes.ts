import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";

// Schema to handle date coercion from JSON string to Date
const transactionBodySchema = api.transactions.create.input.extend({
  date: z.coerce.date(),
});

const transactionUpdateSchema = api.transactions.update.input.extend({
  date: z.coerce.date().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  setupAuth(app);

  // Protected middleware
  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).send("Unauthorized");
  };

  app.get(api.transactions.list.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { search, category, merchant, startDate, endDate } = req.query;
      
      const transactions = await storage.getTransactions(userId, {
        search: search as string,
        category: category as string,
        merchant: merchant as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get(api.transactions.get.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const transaction = await storage.getTransaction(id);
      if (!transaction || transaction.userId !== (req.user as any).id) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  app.post(api.transactions.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const body = transactionBodySchema.parse(req.body);
      const transaction = await storage.createTransaction(userId, body);
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating transaction:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message, field: error.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  app.put(api.transactions.update.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const transaction = await storage.getTransaction(id);

      if (!transaction || transaction.userId !== userId) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const body = transactionUpdateSchema.parse(req.body);
      const updated = await storage.updateTransaction(id, body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating transaction:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message, field: error.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  app.delete(api.transactions.delete.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const transaction = await storage.getTransaction(id);

      if (!transaction || transaction.userId !== userId) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      await storage.deleteTransaction(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({ message: "Failed to delete transaction" });
    }
  });

  // Seeding Logic
  const existingUsers = await storage.getUserByUsername("demo");
  if (!existingUsers) {
    console.log("Seeding database with demo user...");
    const { scrypt, randomBytes } = await import("crypto");
    const { promisify } = await import("util");
    const scryptAsync = promisify(scrypt);
    
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync("password", salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString("hex")}.${salt}`;

    const demoUser = await storage.createUser({
      username: "demo",
      password: hashedPassword
    });

    await storage.createTransaction(demoUser.id, {
      amount: "5000.00",
      category: "Salary",
      date: new Date(),
      description: "Monthly Salary",
      type: "income"
    });

    await storage.createTransaction(demoUser.id, {
      amount: "150.00",
      category: "Food",
      date: new Date(Date.now() - 86400000), // yesterday
      description: "Groceries",
      type: "expense"
    });
    
    await storage.createTransaction(demoUser.id, {
      amount: "50.00",
      category: "Transport",
      date: new Date(Date.now() - 172800000), // 2 days ago
      description: "Uber",
      type: "expense"
    });
    console.log("Seeding complete!");
  }

  return httpServer;
}
