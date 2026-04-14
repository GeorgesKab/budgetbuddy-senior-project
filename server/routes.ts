import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { api } from "@shared/routes";
import { predictionFeedback } from "@shared/schema";
import { z } from "zod";
import { handleChatMessage, chatRequestSchema } from "./chat";

const transactionBodySchema = api.transactions.create.input.extend({
  date: z.coerce.date(),
});

const transactionUpdateSchema = api.transactions.update.input.extend({
  date: z.coerce.date().optional(),
});

const confirmChatTransactionSchema = z.object({
  proposal: transactionBodySchema,
});

function buildPredictionFeedbackInput(
  userId: number,
  transactionId: number,
  proposal: any
): typeof predictionFeedback.$inferInsert | null {
  const aiMeta =
    proposal?.aiMeta && typeof proposal.aiMeta === "object"
      ? proposal.aiMeta
      : null;

  if (!aiMeta) return null;

  const predictedCategory =
    typeof aiMeta.predictedCategory === "string"
      ? aiMeta.predictedCategory.trim()
      : "";

  const finalCategory =
    typeof proposal?.category === "string" ? proposal.category.trim() : "";

  if (!predictedCategory || !finalCategory) {
    return null;
  }

  const originalMessage =
    typeof aiMeta.originalUserMessage === "string" &&
    aiMeta.originalUserMessage.trim()
      ? aiMeta.originalUserMessage.trim()
      : [proposal?.merchant, proposal?.description]
          .filter((value: unknown) => typeof value === "string" && value.trim())
          .join(" ")
          .trim() || "chat transaction";

  const topPredictions: { category: string; score: number }[] | null =
    Array.isArray(aiMeta.topPredictions)
      ? aiMeta.topPredictions
          .filter(
            (item: any) =>
              item &&
              typeof item.category === "string" &&
              typeof item.score === "number"
          )
          .map((item: any) => ({
            category: item.category,
            score: item.score,
          }))
      : null;

  return {
    userId,
    transactionId,
    source: "chat_confirmation",
    originalMessage,
    amount:
      proposal?.amount !== undefined && proposal?.amount !== null
        ? String(proposal.amount)
        : null,
    type: proposal?.type === "income" ? "income" : "expense",
    merchant:
      typeof proposal?.merchant === "string" ? proposal.merchant.trim() : "",
    description:
      typeof proposal?.description === "string"
        ? proposal.description.trim()
        : "",
    modelName: typeof aiMeta.modelName === "string" ? aiMeta.modelName : null,
    inputVariant:
      typeof aiMeta.inputVariant === "string" ? aiMeta.inputVariant : null,
    cleanedNote:
      typeof aiMeta.cleanedNote === "string" ? aiMeta.cleanedNote : null,
    typeToken: typeof aiMeta.typeToken === "string" ? aiMeta.typeToken : null,
    modelText: typeof aiMeta.modelText === "string" ? aiMeta.modelText : null,
    predictedCategory,
    finalCategory,
    wasCorrected: predictedCategory !== finalCategory,
    topPredictions,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

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
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
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
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
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

  app.post("/api/ml/predict-category", isAuthenticated, async (req, res) => {
    try {
      const { note, type, topK = 3 } = req.body;

      if (!note || !type) {
        return res.status(400).json({
          message: "note and type are required",
        });
      }

      const mlServiceUrl =
        process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

      const response = await fetch(`${mlServiceUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note,
          type,
          top_k: topK,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          message: "ML prediction failed",
          details: errorText,
        });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({
        message: "Server failed to reach ML service",
        details: error.message,
      });
    }
  });

  app.post("/api/chat/message", isAuthenticated, async (req, res) => {
    try {
      const body = chatRequestSchema.parse(req.body);
      const mlServiceUrl =
        process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
      const userId = (req.user as any).id;

      const result = await handleChatMessage(
        body.message,
        mlServiceUrl,
        userId,
        body.context?.pendingDraft
      );

      return res.json(result);
    } catch (error) {
      console.error("Error in chat message route:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      return res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  app.post("/api/chat/confirm-transaction", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { proposal } = confirmChatTransactionSchema.parse(req.body);

      const finalProposal = {
        ...proposal,
        aiMeta: proposal.aiMeta
          ? {
              ...proposal.aiMeta,
              suggestionAccepted:
                proposal.category === proposal.aiMeta.predictedCategory,
              userCorrected:
                proposal.category !== proposal.aiMeta.predictedCategory,
              correctedCategory:
                proposal.category !== proposal.aiMeta.predictedCategory
                  ? proposal.category
                  : null,
              finalSavedCategory: proposal.category,
              feedbackLoggedAt: new Date().toISOString(),
            }
          : null,
      };

      const transaction = await storage.createTransaction(userId, finalProposal);

      const feedbackInput = buildPredictionFeedbackInput(
        userId,
        transaction.id,
        finalProposal
      );

      if (feedbackInput) {
        await storage.createPredictionFeedback(feedbackInput);
      }

      return res.status(201).json(transaction);
    } catch (error) {
      console.error("Error confirming chat transaction:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      return res
        .status(500)
        .json({ message: "Failed to confirm chat transaction" });
    }
  });

  app.get(api.categories.defaults.path, async (req, res) => {
    try {
      const defaults = await storage.getDefaultCategories();
      res.json(defaults);
    } catch (error) {
      console.error("Error fetching default categories:", error);
      res.status(500).json({ message: "Failed to fetch default categories" });
    }
  });

  app.get(api.categories.list.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.get(api.categories.all.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const categories = await storage.getAllCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post(api.categories.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const body = api.categories.create.input.parse(req.body);
      const category = await storage.createCategory(userId, body);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch(api.categories.update.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const body = api.categories.update.input.parse(req.body);
      const updated = await storage.updateCategory(id, userId, body);

      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating category:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete(api.categories.delete.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const deleted = await storage.deleteCategory(id, userId);

      if (!deleted) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  app.post("/api/transactions/import", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const rowSchema = z.object({
        date: z.coerce.date(),
        type: z.enum(["income", "expense"]),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number"),
        category: z.string().min(1, "Category is required"),
        description: z.string().default(""),
        merchant: z.string().default(""),
      });
      const bodySchema = z.array(rowSchema);
      const rows = bodySchema.parse(req.body);
      const result = await storage.bulkCreateTransactions(userId, rows);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error importing transactions:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to import transactions" });
    }
  });

  app.post("/api/user/reset", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await storage.deleteAllTransactions(userId);
      res.status(200).json({ message: "Account reset successfully" });
    } catch (error) {
      console.error("Error resetting account:", error);
      res.status(500).json({ message: "Failed to reset account" });
    }
  });

  app.delete("/api/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await storage.deleteUser(userId);
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to delete account" });
        }
        res.status(204).send();
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

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
      password: hashedPassword,
    });

    await storage.createTransaction(demoUser.id, {
      amount: "5000.00",
      category: "Salary",
      date: new Date(),
      description: "Monthly Salary",
      type: "income",
    });

    await storage.createTransaction(demoUser.id, {
      amount: "150.00",
      category: "Food",
      date: new Date(Date.now() - 86400000),
      description: "Groceries",
      type: "expense",
    });

    await storage.createTransaction(demoUser.id, {
      amount: "50.00",
      category: "Transport",
      date: new Date(Date.now() - 172800000),
      description: "Uber",
      type: "expense",
    });

    console.log("Seeding complete!");
  }

  return httpServer;
}