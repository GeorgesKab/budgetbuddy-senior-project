import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";

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
    const userId = (req.user as any).id;
    const transactions = await storage.getTransactions(userId);
    res.json(transactions);
  });

  app.get(api.transactions.get.path, isAuthenticated, async (req, res) => {
    const transaction = await storage.getTransaction(parseInt(req.params.id));
    if (!transaction || transaction.userId !== (req.user as any).id) {
      return res.status(404).send("Transaction not found");
    }
    res.json(transaction);
  });

  app.post(api.transactions.create.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    const body = api.transactions.create.input.parse(req.body);
    const transaction = await storage.createTransaction(userId, body);
    res.status(201).json(transaction);
  });

  app.put(api.transactions.update.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const transaction = await storage.getTransaction(id);

    if (!transaction || transaction.userId !== userId) {
      return res.status(404).send("Transaction not found");
    }

    const body = api.transactions.update.input.parse(req.body);
    const updated = await storage.updateTransaction(id, body);
    res.json(updated);
  });

  app.delete(api.transactions.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const transaction = await storage.getTransaction(id);

    if (!transaction || transaction.userId !== userId) {
      return res.status(404).send("Transaction not found");
    }

    await storage.deleteTransaction(id);
    res.status(204).send();
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
