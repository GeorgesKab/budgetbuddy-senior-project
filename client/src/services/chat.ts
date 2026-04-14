export type RankedPrediction = {
  category: string;
  score: number;
};

export type TransactionAiMeta = {
  modelName: string;
  inputVariant: string;
  cleanedNote: string;
  typeToken: string;
  modelText: string;
  predictedCategory: string;
  topPredictions: RankedPrediction[];
  suggestionAccepted: boolean;
  userCorrected: boolean;
};

export type ChatProposal = {
  amount: string;
  type: "income" | "expense";
  merchant: string;
  description: string;
  date: string;
  category: string;
  aiMeta?: TransactionAiMeta | null;
};

export type ChatMessageResponse = {
  mode: string;
  reply: string;
  proposal?: ChatProposal;
  missingFields?: string[];
  needsConfirmation: boolean;
};

export async function sendChatMessage(
  message: string,
  context?: { pendingDraft?: ChatProposal | null }
): Promise<ChatMessageResponse> {
  const res = await fetch("/api/chat/message", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      context,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat request failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function confirmChatTransaction(proposal: ChatProposal) {
  const res = await fetch("/api/chat/confirm-transaction", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proposal }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confirm request failed: ${res.status} ${text}`);
  }

  return res.json();
}