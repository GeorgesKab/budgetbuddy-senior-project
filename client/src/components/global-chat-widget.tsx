import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, Info } from "lucide-react";
import {
  sendChatMessage,
  confirmChatTransaction,
  type ChatProposal,
} from "@/services/chat";
import type { Transaction } from "@shared/schema";
import { api } from "@shared/routes";
import { ChatCategorySelect } from "@/components/chat-category-select";
import {
  OFFICIAL_AI_CATEGORIES,
  OFFICIAL_AI_CATEGORY_ORDER,
  normalizeOfficialCategoryName,
} from "@shared/official-ai-categories";

type ChatBubble = {
  role: "user" | "assistant";
  text: string;
};

type ConfidenceBand = "high" | "medium" | "low" | "unknown";

type RankedPrediction = {
  category: string;
  score: number;
};

function getAiMetaRecord(draft: ChatProposal | null): Record<string, unknown> {
  if (!draft?.aiMeta || typeof draft.aiMeta !== "object") {
    return {};
  }

  return draft.aiMeta as Record<string, unknown>;
}

function getConfidenceBand(draft: ChatProposal | null): ConfidenceBand {
  const band = getAiMetaRecord(draft).confidenceBand;

  if (band === "high" || band === "medium" || band === "low") {
    return band;
  }

  return "unknown";
}

function getTopPredictions(draft: ChatProposal | null): RankedPrediction[] {
  const raw = getAiMetaRecord(draft).topPredictions;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (item): item is { category: string; score: number } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { category?: unknown }).category === "string" &&
        typeof (item as { score?: unknown }).score === "number"
    )
    .map((item) => ({
      category: normalizeOfficialCategoryName(item.category),
      score: item.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function getConfidenceUi(band: ConfidenceBand) {
  if (band === "high") {
    return {
      title: "High confidence",
      text: "This prediction looks strong.",
      chipClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
      boxClass: "border-emerald-200 bg-emerald-50/70",
      Icon: CheckCircle2,
      confirmLabel: "Save transaction",
    };
  }

  if (band === "medium") {
    return {
      title: "Medium confidence",
      text: "Quick review recommended before saving.",
      chipClass: "bg-amber-100 text-amber-800 border-amber-200",
      boxClass: "border-amber-200 bg-amber-50/70",
      Icon: Info,
      confirmLabel: "Review and save",
    };
  }

  if (band === "low") {
    return {
      title: "Low confidence",
      text: "Please check the category carefully.",
      chipClass: "bg-red-100 text-red-800 border-red-200",
      boxClass: "border-red-200 bg-red-50/70",
      Icon: AlertTriangle,
      confirmLabel: "Save after review",
    };
  }

  return {
    title: "Prediction ready",
    text: "You can still adjust anything before saving.",
    chipClass: "bg-slate-100 text-slate-700 border-slate-200",
    boxClass: "border-slate-200 bg-slate-50/70",
    Icon: Info,
    confirmLabel: "Save transaction",
  };
}

function formatRankScore(score: number) {
  return score.toFixed(2);
}

export function GlobalChatWidget() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      role: "assistant",
      text: "Hi, I can help you add transactions by chat. Example: I paid 10$ in McDo now.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ChatProposal | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<ChatProposal | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>(
      OFFICIAL_AI_CATEGORIES.map((category) => category.name)
    );

    const currentDraftCategory = draft?.category?.trim();
    if (currentDraftCategory) {
      values.add(normalizeOfficialCategoryName(currentDraftCategory));
    }

    return Array.from(values).sort((a, b) => {
      const aIndex = OFFICIAL_AI_CATEGORY_ORDER.get(a) ?? 999;
      const bIndex = OFFICIAL_AI_CATEGORY_ORDER.get(b) ?? 999;

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      return a.localeCompare(b);
    });
  }, [draft?.category]);

  const confidenceBand = useMemo(() => getConfidenceBand(draft), [draft]);
  const topPredictions = useMemo(() => getTopPredictions(draft), [draft]);
  const confidenceUi = useMemo(
    () => getConfidenceUi(confidenceBand),
    [confidenceBand]
  );

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, draft, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) return;
      if (widgetRef.current?.contains(target)) return;
      if (target.closest('[data-chat-widget-portal="true"]')) return;

      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);

    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [open]);

  const appendMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    appendMessage("user", trimmed);
    setInput("");
    setLoading(true);

    try {
      const activePendingDraft = pendingDraft ?? draft;
      const result = await sendChatMessage(
        trimmed,
        activePendingDraft ? { pendingDraft: activePendingDraft } : undefined
      );

      appendMessage("assistant", result.reply);

      if (result.mode === "transaction_draft_needs_info" && result.proposal) {
        setPendingDraft(result.proposal);
        setDraft(null);
      } else if (result.mode === "transaction_draft_ready" && result.proposal) {
        setDraft(result.proposal);
        setPendingDraft(null);
      } else if (result.mode === "transaction_draft_cancelled") {
        setDraft(null);
        setPendingDraft(null);
      } else {
        setDraft(null);
        setPendingDraft(null);
      }
    } catch (error: any) {
      appendMessage("assistant", error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft) return;

    try {
      setSaveLoading(true);

      const predictedCategory =
        typeof draft.aiMeta?.predictedCategory === "string"
          ? draft.aiMeta.predictedCategory
          : null;

      const finalCategory =
        typeof draft.category === "string"
          ? normalizeOfficialCategoryName(draft.category.trim())
          : "";

      const nextAiMeta: Record<string, unknown> = {
        ...(draft.aiMeta ?? {}),
      };

      nextAiMeta.suggestionAccepted = Boolean(
        predictedCategory &&
          finalCategory &&
          normalizeOfficialCategoryName(predictedCategory) === finalCategory
      );
      nextAiMeta.userCorrected = Boolean(
        predictedCategory &&
          finalCategory &&
          normalizeOfficialCategoryName(predictedCategory) !== finalCategory
      );
      nextAiMeta.correctedCategory =
        predictedCategory &&
        finalCategory &&
        normalizeOfficialCategoryName(predictedCategory) !== finalCategory
          ? finalCategory
          : null;
      nextAiMeta.finalSavedCategory = finalCategory || null;
      nextAiMeta.feedbackLoggedAt = new Date().toISOString();

      const draftToSave: ChatProposal = {
        ...draft,
        category: finalCategory,
        aiMeta: nextAiMeta as ChatProposal["aiMeta"],
      };

      const saved = await confirmChatTransaction(draftToSave);

      window.dispatchEvent(
        new CustomEvent("budgetbuddy:transaction-created", {
          detail: saved,
        })
      );

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: [api.transactions.list.path] },
        (old) => {
          const current = Array.isArray(old) ? old : [];
          const alreadyExists = current.some((t) => t.id === saved.id);
          if (alreadyExists) return current;

          return [saved, ...current].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        }
      );

      await queryClient.invalidateQueries({
        queryKey: [api.transactions.list.path],
      });

      await queryClient.refetchQueries({
        queryKey: [api.transactions.list.path],
        type: "active",
      });

      appendMessage(
        "assistant",
        `Saved: $${saved.amount} • ${saved.category} • ${
          saved.merchant || saved.description
        }`
      );

      setDraft(null);
      setPendingDraft(null);
    } catch (error: any) {
      appendMessage("assistant", error.message || "Failed to save transaction.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancel = async () => {
    const activeDraft = draft ?? pendingDraft;

    if (!activeDraft || loading) {
      setDraft(null);
      setPendingDraft(null);
      return;
    }

    appendMessage("user", "cancel");
    setLoading(true);

    try {
      const result = await sendChatMessage("cancel", {
        pendingDraft: activeDraft,
      });

      appendMessage(
        "assistant",
        result.reply || "Okay — I cleared that pending draft."
      );
      setDraft(null);
      setPendingDraft(null);
    } catch (error: any) {
      appendMessage("assistant", error.message || "Failed to cancel draft.");
    } finally {
      setLoading(false);
    }
  };

  const handleDraftChange = (field: keyof ChatProposal, value: string) => {
    if (!draft) return;

    setDraft({
      ...draft,
      [field]:
        field === "category" ? normalizeOfficialCategoryName(value) : value,
    });
  };

  return (
    <div ref={widgetRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
        aria-label="Open BudgetBuddy Assistant"
        title="Open BudgetBuddy Assistant"
      >
        <Bot className="h-8 w-8" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border bg-background shadow-2xl">
          <div className="border-b px-4 py-3 font-semibold">
            BudgetBuddy Assistant
          </div>

          <div
            ref={scrollContainerRef}
            className="h-[460px] space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.text}
              </div>
            ))}

            {draft && (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="border-b px-4 py-3">
                  <div className="text-sm font-semibold">Review transaction</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Edit anything you want before saving.
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Amount
                      </label>
                      <input
                        className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                        value={draft.amount ?? ""}
                        onChange={(e) =>
                          handleDraftChange("amount", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Type
                      </label>
                      <select
                        className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                        value={draft.type ?? "expense"}
                        onChange={(e) =>
                          handleDraftChange(
                            "type",
                            e.target.value as "income" | "expense"
                          )
                        }
                      >
                        <option value="expense">expense</option>
                        <option value="income">income</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Merchant
                    </label>
                    <input
                      className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                      value={draft.merchant ?? ""}
                      onChange={(e) =>
                        handleDraftChange("merchant", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Description
                    </label>
                    <input
                      className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                      value={draft.description ?? ""}
                      onChange={(e) =>
                        handleDraftChange("description", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Category
                    </label>
                    <div data-chat-widget-portal="true">
                      <ChatCategorySelect
                        value={draft.category ?? ""}
                        categories={categoryOptions}
                        onChange={(value) =>
                          handleDraftChange("category", value)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className={`border-t px-4 py-4 ${confidenceUi.boxClass}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidenceUi.chipClass}`}
                    >
                      <confidenceUi.Icon className="h-3.5 w-3.5" />
                      {confidenceUi.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {confidenceUi.text}
                    </div>
                  </div>

                  {topPredictions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        Better options
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {topPredictions.map((prediction) => {
                          const normalizedPrediction =
                            normalizeOfficialCategoryName(prediction.category);
                          const isSelected =
                            normalizeOfficialCategoryName(
                              draft.category ?? ""
                            ) === normalizedPrediction;

                          return (
                            <button
                              key={normalizedPrediction}
                              type="button"
                              onClick={() =>
                                handleDraftChange(
                                  "category",
                                  normalizedPrediction
                                )
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:bg-muted"
                              }`}
                            >
                              {normalizedPrediction}
                              <span className="ml-1 opacity-70">
                                {formatRankScore(prediction.score)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        These scores rank the options. They are not probabilities.
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleConfirm}
                      disabled={saveLoading}
                      className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                    >
                      {saveLoading ? "Saving..." : confidenceUi.confirmLabel}
                    </button>

                    <button
                      onClick={handleCancel}
                      disabled={loading}
                      className="rounded-xl border bg-background px-4 py-2.5 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 border-t p-3">
            <input
              ref={inputRef}
              className="flex-1 rounded-xl border px-3 py-2 text-sm"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}