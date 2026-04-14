import { z } from "zod";
import { storage } from "./storage";

const chatRequestSchema = z.object({
  message: z.string().min(1),
  context: z
    .object({
      pendingDraft: z.any().optional(),
    })
    .optional(),
});

type PendingTransactionDraft = {
  amount?: string | number | null;
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  type?: "income" | "expense" | null;
  date?: string | null;
  aiMeta?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ParsedDateInfo = {
  date: Date;
  hasExplicitDate: boolean;
};

const pendingTransactionDrafts = new Map<string, PendingTransactionDraft>();

function getPendingDraftKey(userId: string | number | null | undefined) {
  return String(userId ?? "anonymous");
}

function isCancelPendingMessage(message: string) {
  return /^(cancel|stop|never ?mind|forget it|ignore that)$/i.test(
    message.trim()
  );
}

function normalizeLookupText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s&'/:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseText(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\w\s$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cloneAtMidday(date: Date) {
  const cloned = new Date(date);
  cloned.setHours(12, 0, 0, 0);
  return cloned;
}

function cloneNow(date: Date) {
  return new Date(date);
}

function shiftDays(date: Date, days: number) {
  const cloned = new Date(date);
  cloned.setDate(cloned.getDate() + days);
  return cloneAtMidday(cloned);
}

function shiftMonths(date: Date, months: number) {
  const cloned = new Date(date);
  cloned.setMonth(cloned.getMonth() + months);
  return cloneAtMidday(cloned);
}

function monthNameToIndex(value: string) {
  const key = value.toLowerCase().slice(0, 3);

  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  return months[key] ?? -1;
}

function extractDateInfo(message: string): ParsedDateInfo {
  const now = new Date();
  const lower = normalizeLookupText(message);

  if (/\bday before yesterday\b/.test(lower)) {
    return { date: shiftDays(now, -2), hasExplicitDate: true };
  }

  if (/\byesterday\b/.test(lower)) {
    return { date: shiftDays(now, -1), hasExplicitDate: true };
  }

  if (/\b(today|now)\b/.test(lower)) {
    return { date: cloneNow(now), hasExplicitDate: true };
  }

  const relativeAgoMatch = lower.match(
    /\b(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/
  );

  if (relativeAgoMatch) {
    const amount = Number(relativeAgoMatch[1]);
    const unit = relativeAgoMatch[2];

    if (Number.isFinite(amount) && amount > 0) {
      if (unit.startsWith("day")) {
        return { date: shiftDays(now, -amount), hasExplicitDate: true };
      }

      if (unit.startsWith("week")) {
        return { date: shiftDays(now, -(amount * 7)), hasExplicitDate: true };
      }

      if (unit.startsWith("month")) {
        return { date: shiftMonths(now, -amount), hasExplicitDate: true };
      }

      if (unit.startsWith("year")) {
        const cloned = new Date(now);
        cloned.setFullYear(cloned.getFullYear() - amount);
        return { date: cloneAtMidday(cloned), hasExplicitDate: true };
      }
    }
  }

  if (/\blast week\b/.test(lower)) {
    return { date: shiftDays(now, -7), hasExplicitDate: true };
  }

  if (/\bthis week\b/.test(lower)) {
    return { date: cloneNow(now), hasExplicitDate: true };
  }

  if (/\blast month\b/.test(lower)) {
    return { date: shiftMonths(now, -1), hasExplicitDate: true };
  }

  if (/\bthis month\b/.test(lower)) {
    return { date: cloneNow(now), hasExplicitDate: true };
  }

  const isoMatch = message.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const parsed = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );

    if (!Number.isNaN(parsed.getTime())) {
      return { date: cloneAtMidday(parsed), hasExplicitDate: true };
    }
  }

  const slashMatch = message.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    const month = first > 12 ? second - 1 : first - 1;
    const day = first > 12 ? first : second;

    const parsed = new Date(year, month, day);

    if (!Number.isNaN(parsed.getTime())) {
      return { date: cloneAtMidday(parsed), hasExplicitDate: true };
    }
  }

  const monthNameMatch = message.match(
    /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );

  if (monthNameMatch) {
    const monthIndex = monthNameToIndex(monthNameMatch[1]);
    const day = Number(monthNameMatch[2]);
    const year = monthNameMatch[3] ? Number(monthNameMatch[3]) : now.getFullYear();
    const parsed = new Date(year, monthIndex, day);

    if (!Number.isNaN(parsed.getTime())) {
      return { date: cloneAtMidday(parsed), hasExplicitDate: true };
    }
  }

  return { date: cloneNow(now), hasExplicitDate: false };
}

function stripTemporalPhrases(text: string) {
  return text
    .replace(/\bday before yesterday\b/gi, " ")
    .replace(/\byesterday\b/gi, " ")
    .replace(/\btoday\b/gi, " ")
    .replace(/\bnow\b/gi, " ")
    .replace(/\b\d+\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/gi, " ")
    .replace(/\blast week\b/gi, " ")
    .replace(/\bthis week\b/gi, " ")
    .replace(/\blast month\b/gi, " ")
    .replace(/\bthis month\b/gi, " ")
    .replace(
      /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/gi,
      " "
    )
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/g, " ")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferType(message: string): "income" | "expense" | null {
  const m = normalizeLookupText(message);

  const incomePatterns = [
    /\bsent me\b/,
    /\bpaid me\b/,
    /\bgave me\b/,
    /\bgot paid\b/,
    /\breceived\b/,
    /\bearn(?:ed)?\b/,
    /\bsalary\b/,
    /\bbonus\b/,
    /\bincome\b/,
    /\brefund\b/,
    /\ballowance\b/,
    /\bdeposit(?:ed)?\b/,
    /\btransfer(?:red)?(?: to me)?\b/,
    /\bwire(?:d)?(?: me)?\b/,
    /\bgot\b.*\bfrom\b/,
  ];

  const expensePatterns = [
    /\bspent\b/,
    /\bpaid\b/,
    /\bbought\b/,
    /\bpurchase(?:d)?\b/,
    /\bcost\b/,
    /\border(?:ed)?\b/,
    /\bsubscribed\b/,
    /\bsubscription\b/,
    /\bbill(?:ed)?\b/,
  ];

  if (incomePatterns.some((pattern) => pattern.test(m))) return "income";
  if (expensePatterns.some((pattern) => pattern.test(m))) return "expense";
  if (looksLikeTransactionEntity(m)) return "expense";

  return null;
}

function extractAmount(message: string): string | null {
  const normalized = message
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*\$/,
    /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)/,
    /^.*?\b(\d+(?:\.\d{1,2})?)\b.*$/,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = normalized.match(patterns[i]);
    if (!match) continue;

    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      return `${value}`;
    }
  }

  return null;
}

function extractFollowUpAmount(message: string): number | null {
  const normalized = message
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*\$/,
    /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)/,
    /^(\d+(?:\.\d{1,2})?)$/,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = normalized.match(patterns[i]);
    if (!match) continue;

    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function looksLikeFinanceQuestion(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("how much") ||
    m.includes("biggest category") ||
    m.includes("balance") ||
    m.includes("spent this month") ||
    m.includes("earn this month") ||
    m.includes("spent the past month") ||
    m.includes("spent last month") ||
    m.includes("earned this month") ||
    m.includes("income this month")
  );
}

const knownMerchantAliases: Record<string, string> = {
  mcdo: "McDo",
  mcdonalds: "McDo",
  "mcdonald's": "McDo",
  mcdonald: "McDo",
  bk: "Burger King",
  "burger king": "Burger King",
  uber: "Uber",
  zara: "Zara",
  medco: "Medco",
  netflix: "Netflix",
  spotify: "Spotify",
  starbucks: "Starbucks",
  carrefour: "Carrefour",
  spinneys: "Spinneys",
  talabat: "Talabat",
  toters: "Toters",
  gym: "Gym",
  hospital: "Hospital",
};

const transactionEntityHints = new Set([
  "uber",
  "taxi",
  "transport",
  "bus",
  "fuel",
  "gas",
  "petrol",
  "coffee",
  "lunch",
  "dinner",
  "breakfast",
  "brunch",
  "groceries",
  "grocery",
  "rent",
  "salary",
  "bonus",
  "refund",
  "allowance",
  "pharmacy",
  "medicine",
  "subscription",
  "internet",
  "electricity",
  "water",
  "gift",
  "gifts",
  "shopping",
  "clothes",
  "burger",
  "pizza",
  "food",
  "snack",
  "gym",
  "hospital",
  "parents",
]);

function findKnownMerchantInText(text: string): string | null {
  const normalized = ` ${normalizeLookupText(text)} `;
  const entries = Object.entries(knownMerchantAliases).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (let i = 0; i < entries.length; i += 1) {
    const [alias, canonical] = entries[i];
    if (normalized.includes(` ${alias} `)) {
      return canonical;
    }
  }

  return null;
}

function looksLikeTransactionEntity(text: string): boolean {
  const normalized = normalizeLookupText(text);

  if (!normalized) return false;
  if (findKnownMerchantInText(normalized)) return true;

  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.some((token) => transactionEntityHints.has(token));
}

function isMeaninglessInput(message: string): boolean {
  const normalized = normalizeLooseText(message);

  if (!normalized) return true;
  if (looksLikeTransactionEntity(normalized)) return false;

  const meaninglessExact = new Set([
    "hi",
    "hello",
    "hey",
    "yo",
    "ok",
    "okay",
    "test",
    "asd",
    "asdf",
    "asdfgh",
    "qwerty",
    "random",
    "random stuff",
    "something",
    "anything",
    "blah",
    "lol",
    "???",
  ]);

  if (meaninglessExact.has(normalized)) return true;

  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length === 1) {
    const only = tokens[0];
    if (/^\d+(\.\d{1,2})?$/.test(only)) return true;
    if (looksLikeTransactionEntity(only)) return false;
    if (only.length <= 2) return true;
  }

  const hasAmount = /(\d+(\.\d{1,2})?)/.test(normalized);
  const inferredType = inferType(normalized);
  const hasMerchantLikePhrase = /\b(in|at|from|via|with)\b/.test(normalized);
  const hasItemLikePhrase = /\b(on|for|as)\b/.test(normalized);

  if (
    !hasAmount &&
    !inferredType &&
    !hasMerchantLikePhrase &&
    !hasItemLikePhrase &&
    !looksLikeTransactionEntity(normalized)
  ) {
    if (tokens.length <= 4) return true;
  }

  return false;
}

function cleanSegment(text: string): string {
  return stripTemporalPhrases(text)
    .replace(/\$\s*\d+(\.\d{1,2})?/g, " ")
    .replace(/\d+(\.\d{1,2})?\s*\$?/g, " ")
    .replace(/\b(please|pls|hello|hi|hey)\b/gi, " ")
    .replace(/[^\w\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLooseEntityText(message: string): string {
  return stripTemporalPhrases(message)
    .toLowerCase()
    .replace(/\$\s*\d+(?:[.,]\d{1,2})?/g, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*\$?/g, " ")
    .replace(/[^\w\s&'-]/g, " ")
    .replace(
      /\b(sent me|paid me|gave me|got paid|received|earned|salary|bonus|income|refund|allowance|deposited|deposit|transferred|transfer|wired|wire|spent|paid|bought|purchase|purchased|ordered|order|cost|subscribed|subscription|billed|bill|got)\b/g,
      " "
    )
    .replace(/\b(in|at|from|on|for|to|into|via|with|using|as)\b/g, " ")
    .replace(/\bi['’]?m\b/g, " ")
    .replace(/\bi['’]?ve\b/g, " ")
    .replace(/\b(i|me)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMerchantFromEntityText(text: string, merchant: string): string {
  const merchantWords = normalizeLookupText(merchant).split(" ").filter(Boolean);
  let output = ` ${text} `;

  for (let i = 0; i < merchantWords.length; i += 1) {
    output = output.replace(
      new RegExp(`\\b${escapeRegExp(merchantWords[i])}\\b`, "gi"),
      " "
    );
  }

  return output
    .replace(/\b(my|from|for|as|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMerchantName(raw: string): string {
  const detected = findKnownMerchantInText(raw);
  if (detected) return detected;

  const cleaned = cleanSegment(raw).replace(/\b(as|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
  return toTitleCase(cleaned);
}

function normalizeDescriptionName(raw: string) {
  const cleaned = cleanSegment(raw)
    .replace(/\b(my|from)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const normalized = normalizeLookupText(cleaned);

  if (/\bgift\b/.test(normalized)) return "Gift";
  if (/\bsalary\b|\bpayroll\b/.test(normalized)) return "Salary";
  if (/\brefund\b/.test(normalized)) return "Refund";
  if (/\bbonus\b/.test(normalized)) return "Bonus";
  if (/\ballowance\b/.test(normalized)) return "Allowance";
  if (/\bsupport\b/.test(normalized)) return "Support";

  return toTitleCase(cleaned);
}

function inferIncomeReason(message: string, merchant: string) {
  const normalized = normalizeLookupText(message);

  if (/\bgift\b/.test(normalized)) return "Gift";
  if (/\bsalary\b|\bpayroll\b/.test(normalized)) return "Salary";
  if (/\brefund\b/.test(normalized)) return "Refund";
  if (/\bbonus\b/.test(normalized)) return "Bonus";
  if (/\ballowance\b/.test(normalized)) return "Allowance";
  if (/\bsupport\b/.test(normalized)) return "Support";

  if (
    merchant &&
    /\b(parent|parents|mom|mother|dad|father|family|friend|uncle|aunt|grandma|grandpa)\b/i.test(
      merchant
    )
  ) {
    return "Gift";
  }

  return "";
}

function extractMerchantAndDescription(
  message: string,
  txType: "income" | "expense"
): { merchant: string; description: string } {
  const original = message.trim();
  const source = stripTemporalPhrases(original);
  const lower = source.toLowerCase();

  let merchant = "";
  let description = "";

  const expenseMerchantMatch = source.match(
    /\b(?:in|at|via|with)\s+(.+?)(?=\s+\b(?:on|for|as)\b|$)/i
  );

  const incomeMerchantMatch = source.match(
    /\bfrom\s+(.+?)(?=\s+\b(?:as|for|on)\b|$)/i
  );

  const expenseDescriptionMatch = source.match(
    /\b(?:on|for)\s+(.+?)(?=\s+\b(?:in|at|via|with|from|as)\b|$)/i
  );

  const incomeDescriptionMatch = source.match(
    /\b(?:as|for)\s+(?:a|an)?\s*(gift|salary|refund|bonus|allowance|support)\b/i
  );

  if (txType === "income" && incomeMerchantMatch?.[1]) {
    merchant = normalizeMerchantName(incomeMerchantMatch[1]);
  }

  if (txType === "expense" && expenseMerchantMatch?.[1]) {
    merchant = normalizeMerchantName(expenseMerchantMatch[1]);
  }

  if (expenseDescriptionMatch?.[1]) {
    description = normalizeDescriptionName(expenseDescriptionMatch[1]);
  }

  if (incomeDescriptionMatch?.[1]) {
    description = normalizeDescriptionName(incomeDescriptionMatch[1]);
  }

  if (!merchant && txType === "income") {
    const senderPatterns = [
      /^(.+?)\s+(?:sent me|gave me|paid me|transferred(?: to me)?|wired me|deposited)\b/i,
      /\b(?:received|got paid|refund|salary|bonus|allowance)\s+from\s+(.+?)(?=\s+\b(?:as|for|on)\b|$)/i,
      /\bgot\b.*?\bfrom\s+(.+?)(?=\s+\b(?:as|for|on)\b|$)/i,
    ];

    for (let i = 0; i < senderPatterns.length; i += 1) {
      const match = source.match(senderPatterns[i]);
      if (match?.[1]) {
        merchant = normalizeMerchantName(match[1]);
        break;
      }
    }
  }

  if (!merchant) {
    const detectedMerchant = findKnownMerchantInText(source);
    if (detectedMerchant) {
      merchant = detectedMerchant;
    }
  }

  const looseEntityText = extractLooseEntityText(source);

  if (!merchant && looseEntityText) {
    const detectedMerchant = findKnownMerchantInText(looseEntityText);
    if (detectedMerchant) {
      merchant = detectedMerchant;
    }
  }

  let descriptionCandidate = looseEntityText;

  if (merchant && descriptionCandidate) {
    descriptionCandidate = stripMerchantFromEntityText(descriptionCandidate, merchant);
  }

  if (!description && txType === "income") {
    description = inferIncomeReason(source, merchant);
  }

  if (!description && descriptionCandidate) {
    description = normalizeDescriptionName(descriptionCandidate);
  }

  if (!merchant && description) {
    const detectedMerchant = findKnownMerchantInText(description);

    if (
      detectedMerchant &&
      normalizeLookupText(description) === normalizeLookupText(detectedMerchant)
    ) {
      merchant = detectedMerchant;
      description = "";
    }
  }

  if (!merchant) {
    if (lower.includes("burger king") || /\bbk\b/i.test(source)) {
      merchant = "Burger King";
    } else if (
      lower.includes("mcdo") ||
      lower.includes("mcdonalds") ||
      lower.includes("mcdonald")
    ) {
      merchant = "McDo";
    } else if (lower.includes("uber")) {
      merchant = "Uber";
    } else if (lower.includes("zara")) {
      merchant = "Zara";
    } else if (lower.includes("medco")) {
      merchant = "Medco";
    } else if (lower.includes("gym")) {
      merchant = "Gym";
    } else if (lower.includes("hospital")) {
      merchant = "Hospital";
    }
  }

  if (!description) {
    if (merchant) {
      description =
        txType === "income"
          ? inferIncomeReason(source, merchant) || `Income from ${merchant}`
          : `Purchase at ${merchant}`;
    } else {
      description = txType === "income" ? "Other income" : "Other expense";
    }
  }

  return { merchant, description };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDateRange(message: string): {
  startDate: Date;
  endDate: Date;
  label: string;
} {
  const m = message.toLowerCase();
  const now = new Date();

  if (m.includes("today")) {
    return {
      startDate: startOfDay(now),
      endDate: now,
      label: "today",
    };
  }

  if (m.includes("yesterday")) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      startDate: startOfDay(y),
      endDate: endOfDay(y),
      label: "yesterday",
    };
  }

  if (m.includes("this week")) {
    return {
      startDate: startOfWeek(now),
      endDate: now,
      label: "this week",
    };
  }

  if (
    m.includes("past month") ||
    m.includes("last 30 days") ||
    m.includes("last month")
  ) {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return {
      startDate: start,
      endDate: now,
      label: "the last 30 days",
    };
  }

  if (m.includes("this month")) {
    return {
      startDate: startOfMonth(now),
      endDate: now,
      label: "this month",
    };
  }

  return {
    startDate: new Date(0),
    endDate: now,
    label: "overall",
  };
}

function normalizeCategoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCategoryFilter(message: string, categories: string[]): string | null {
  const m = normalizeCategoryText(message);

  const aliases: Record<string, string> = {
    food: "Food & Drinks",
    drinks: "Food & Drinks",
    drink: "Food & Drinks",
    shopping: "Shopping",
    shop: "Shopping",
    fuel: "Fuel",
    gas: "Fuel",
    vehicle: "Vehicle",
    gifts: "Gifts",
    gift: "Gifts",
    entertainment: "Entertainment",
    transport: "Transport",
    health: "Health",
    rent: "Rent",
    salary: "Salary",
    sports: "Sports",
  };

  const entries = Object.entries(aliases);

  for (let i = 0; i < entries.length; i += 1) {
    const [alias, category] = entries[i];
    if (m.includes(alias)) {
      const exactExisting = categories.find(
        (c) => c.toLowerCase() === category.toLowerCase()
      );
      return exactExisting || category;
    }
  }

  for (let i = 0; i < categories.length; i += 1) {
    const normalizedCategory = normalizeCategoryText(categories[i]);
    if (normalizedCategory && m.includes(normalizedCategory)) {
      return categories[i];
    }
  }

  return null;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTypeLabel(type: "income" | "expense"): string {
  return type === "income" ? "income" : "expense";
}

function isDefaultDescription(
  type: "income" | "expense",
  merchant: string,
  description: string
) {
  if (!merchant || !description) return false;

  return (
    description === `Purchase at ${merchant}` ||
    description === `Income from ${merchant}` ||
    description === "Other expense" ||
    description === "Other income"
  );
}

function buildTransactionDetails(
  type: "income" | "expense",
  merchant: string,
  description: string
) {
  const parts: string[] = [];
  const cleanMerchant = merchant.trim();
  const cleanDescription = description.trim();
  const hasCustomDescription = !isDefaultDescription(
    type,
    cleanMerchant,
    cleanDescription
  );

  if (cleanMerchant) {
    parts.push(type === "income" ? `from ${cleanMerchant}` : `at ${cleanMerchant}`);
  }

  if (cleanDescription && hasCustomDescription) {
    if (cleanMerchant) {
      parts.push(type === "income" ? `(${cleanDescription})` : `for ${cleanDescription}`);
    } else {
      parts.push(cleanDescription);
    }
  }

  return parts.join(" ");
}

function buildDraftReadyReply(
  type: "income" | "expense",
  amount: string | number,
  category: string,
  merchant: string,
  description: string
): string {
  const details = buildTransactionDetails(type, merchant, description);

  return `Got it — this looks like a ${formatTypeLabel(type)} of $${amount}${
    details ? ` ${details}` : ""
  }. I predicted ${category}. Please confirm or edit anything below.`;
}

function buildReplyFromDraft(draft: PendingTransactionDraft): string {
  const type: "income" | "expense" =
    draft.type === "income" ? "income" : "expense";

  const category =
    typeof draft.category === "string" && draft.category.trim()
      ? draft.category
      : type === "income"
        ? "Other Income"
        : "Other Expenses";

  const merchant =
    typeof draft.merchant === "string" ? draft.merchant : "";

  const description =
    typeof draft.description === "string" ? draft.description : "";

  return buildDraftReadyReply(
    type,
    draft.amount ?? "",
    category,
    merchant,
    description
  );
}

function buildMissingAmountReply(draft?: PendingTransactionDraft): string {
  const type: "income" | "expense" =
    draft?.type === "income" ? "income" : "expense";

  const merchant =
    typeof draft?.merchant === "string" ? draft.merchant.trim() : "";

  const description =
    typeof draft?.description === "string" ? draft.description.trim() : "";

  const details = buildTransactionDetails(type, merchant, description);

  if (details) {
    return `Got it — I noted ${details}. How much was it?`;
  }

  return "Sure — what was the amount?";
}

function buildCancelledReply(): string {
  return "Okay — I cleared that pending draft.";
}

function buildUnrecognizedReply(): string {
  return "I couldn’t turn that into a transaction or a finance question. Try something like 'I spent 10$ in Burger King on Whopper' or 'How much did I spend this month?'";
}

function buildFinanceHelpReply(): string {
  return "I can help with spending, income, balance, and biggest category questions. Try: 'How much did I spend on food the past month?'";
}

function buildFeedbackReadyAiMeta(args: {
  message: string;
  amount: string | number | null;
  type: "income" | "expense";
  merchant: string;
  description: string;
  predictedCategory: string;
  ml: any;
}) {
  const topPredictions = Array.isArray(args.ml?.top_predictions)
    ? args.ml.top_predictions
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
    : [];

  const topPredictionScore =
    typeof topPredictions[0]?.score === "number"
      ? topPredictions[0].score
      : null;

  const confidenceBand =
    topPredictionScore === null
      ? "unknown"
      : topPredictionScore >= 0.65
        ? "high"
        : topPredictionScore >= 0.4
          ? "medium"
          : "low";

  const cleanedNote =
    typeof args.ml?.cleaned_note === "string"
      ? args.ml.cleaned_note
      : [args.merchant, args.description].filter(Boolean).join(" ").trim();

  const typeToken =
    typeof args.ml?.type_token === "string"
      ? args.ml.type_token
      : args.type === "income"
        ? "[TYPE_INCOME]"
        : "[TYPE_EXPENSE]";

  const modelText =
    typeof args.ml?.model_text === "string"
      ? args.ml.model_text
      : `${typeToken} ${cleanedNote}`.trim();

  return {
    modelName:
      typeof args.ml?.model_name === "string" ? args.ml.model_name : "fallback",
    inputVariant:
      typeof args.ml?.input_variant === "string"
        ? args.ml.input_variant
        : "type_token + note_clean",
    cleanedNote,
    typeToken,
    modelText,
    predictedCategory: args.predictedCategory,
    topPredictions,
    topPredictionScore,
    confidenceBand,
    predictionSource: args.ml ? "ml_model" : "fallback",
    originalUserMessage: args.message,
    extractedDraft: {
      amount: args.amount,
      type: args.type,
      merchant: args.merchant,
      description: args.description,
    },
    suggestionAccepted: false,
    userCorrected: false,
    correctedCategory: null,
    finalSavedCategory: null,
    feedbackEligible: true,
    feedbackLoggedAt: null,
    predictedAt: new Date().toISOString(),
  };
}

type FeedbackMemoryRow = Awaited<
  ReturnType<typeof storage.getCorrectedPredictionFeedback>
>[number];

const feedbackSimilarityStopWords = new Set([
  "the",
  "a",
  "an",
  "for",
  "at",
  "in",
  "on",
  "from",
  "to",
  "and",
  "or",
  "of",
  "my",
  "me",
  "i",
  "it",
  "was",
  "is",
  "now",
  "today",
  "yesterday",
  "purchase",
  "income",
  "expense",
  "paid",
  "bought",
  "spent",
  "received",
  "got",
]);

function normalizeFeedbackSimilarityText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeFeedbackSimilarityText(text: string): string[] {
  return normalizeFeedbackSimilarityText(text)
    .split(" ")
    .filter(
      (token) =>
        token.length > 2 &&
        !feedbackSimilarityStopWords.has(token) &&
        !/^\d+(?:\.\d+)?$/.test(token)
    );
}

function buildFeedbackMemoryText(args: {
  message?: string | null;
  merchant?: string | null;
  description?: string | null;
}) {
  return [args.message, args.merchant, args.description]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    )
    .join(" ")
    .trim();
}

function getTokenOverlapScore(inputTokens: string[], candidateTokens: string[]) {
  const inputSet = new Set(inputTokens);
  const candidateSet = new Set(candidateTokens);

  if (!inputSet.size || !candidateSet.size) {
    return { score: 0, shared: 0 };
  }

  let shared = 0;

  Array.from(inputSet).forEach((token) => {
    if (candidateSet.has(token)) {
      shared += 1;
    }
  });

  return {
    score: shared / Math.max(inputSet.size, candidateSet.size),
    shared,
  };
}

function findFeedbackMemoryMatch(
  message: string,
  merchant: string,
  description: string,
  rows: FeedbackMemoryRow[]
) {
  const currentText = buildFeedbackMemoryText({
    message,
    merchant,
    description,
  });

  const normalizedCurrentText = normalizeFeedbackSimilarityText(currentText);
  const normalizedCurrentMerchant = normalizeFeedbackSimilarityText(merchant);
  const currentTokens = tokenizeFeedbackSimilarityText(currentText);

  let bestMatch:
    | {
        row: FeedbackMemoryRow;
        score: number;
        sharedTokens: number;
      }
    | null = null;

  for (let i = 0; i < rows.slice(0, 100).length; i += 1) {
    const row = rows.slice(0, 100)[i];

    const candidateText = buildFeedbackMemoryText({
      message: row.originalMessage,
      merchant: row.merchant,
      description: row.description,
    });

    const normalizedCandidateText =
      normalizeFeedbackSimilarityText(candidateText);
    const normalizedCandidateMerchant = normalizeFeedbackSimilarityText(
      row.merchant ?? ""
    );
    const candidateTokens = tokenizeFeedbackSimilarityText(candidateText);

    const overlap = getTokenOverlapScore(currentTokens, candidateTokens);

    let score = overlap.score;

    if (
      normalizedCurrentText &&
      normalizedCandidateText &&
      normalizedCurrentText === normalizedCandidateText
    ) {
      score += 1;
    }

    if (
      normalizedCurrentMerchant &&
      normalizedCandidateMerchant &&
      normalizedCurrentMerchant === normalizedCandidateMerchant
    ) {
      score += 0.35;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        row,
        score,
        sharedTokens: overlap.shared,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  if (bestMatch.score >= 1) {
    return {
      finalCategory: bestMatch.row.finalCategory,
      similarityScore: Number(bestMatch.score.toFixed(3)),
      matchedOriginalMessage: bestMatch.row.originalMessage,
      matchedMerchant: bestMatch.row.merchant ?? "",
    };
  }

  if (bestMatch.score >= 0.6 && bestMatch.sharedTokens >= 2) {
    return {
      finalCategory: bestMatch.row.finalCategory,
      similarityScore: Number(bestMatch.score.toFixed(3)),
      matchedOriginalMessage: bestMatch.row.originalMessage,
      matchedMerchant: bestMatch.row.merchant ?? "",
    };
  }

  if (
    bestMatch.score >= 0.45 &&
    normalizedCurrentMerchant &&
    normalizeFeedbackSimilarityText(bestMatch.row.merchant ?? "") ===
      normalizedCurrentMerchant
  ) {
    return {
      finalCategory: bestMatch.row.finalCategory,
      similarityScore: Number(bestMatch.score.toFixed(3)),
      matchedOriginalMessage: bestMatch.row.originalMessage,
      matchedMerchant: bestMatch.row.merchant ?? "",
    };
  }

  return null;
}

async function answerFinanceQuestion(message: string, userId: number) {
  const allTransactions = await storage.getTransactions(userId);
  const { startDate, endDate, label } = getDateRange(message);

  const rangeTransactions = allTransactions.filter((t) => {
    const d = new Date(t.date);
    return d >= startDate && d <= endDate;
  });

  const categories = Array.from(new Set(allTransactions.map((t) => t.category)));
  const categoryFilter = resolveCategoryFilter(message, categories);
  const m = message.toLowerCase();

  if (m.includes("biggest category")) {
    const expenses = rangeTransactions.filter((t) => t.type === "expense");

    if (!expenses.length) {
      return {
        mode: "finance_question",
        reply: buildFinanceHelpReply(),
        needsConfirmation: false,
      };
    }

    const grouped = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {} as Record<string, number>);

    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const topCategory = sorted[0][0];
    const topAmount = sorted[0][1];

    return {
      mode: "finance_question",
      reply: `Your biggest spending category in ${label} is ${topCategory} with ${formatMoney(
        topAmount
      )}.`,
      needsConfirmation: false,
    };
  }

  if (m.includes("balance")) {
    const balance = rangeTransactions.reduce((sum, t) => {
      const amount = Number(t.amount);
      return t.type === "income" ? sum + amount : sum - amount;
    }, 0);

    return {
      mode: "finance_question",
      reply: `Your balance in ${label} is ${formatMoney(balance)}.`,
      needsConfirmation: false,
    };
  }

  const asksIncome =
    m.includes("earn") ||
    m.includes("earned") ||
    m.includes("income") ||
    m.includes("made") ||
    m.includes("received");

  const asksExpense =
    m.includes("spend") ||
    m.includes("spent") ||
    m.includes("expense") ||
    m.includes("expenses") ||
    m.includes("paid");

  if (asksIncome) {
    const incomes = rangeTransactions.filter((t) => t.type === "income");
    const total = incomes.reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      mode: "finance_question",
      reply: `You earned ${formatMoney(total)} in ${label}.`,
      needsConfirmation: false,
    };
  }

  if (asksExpense) {
    const expenses = rangeTransactions.filter((t) => t.type === "expense");
    const filtered = categoryFilter
      ? expenses.filter(
          (t) => t.category.toLowerCase() === categoryFilter.toLowerCase()
        )
      : expenses;

    const total = filtered.reduce((sum, t) => sum + Number(t.amount), 0);

    if (categoryFilter) {
      return {
        mode: "finance_question",
        reply: `You spent ${formatMoney(total)} on ${categoryFilter} in ${label}.`,
        needsConfirmation: false,
      };
    }

    return {
      mode: "finance_question",
      reply: `You spent ${formatMoney(total)} in ${label}.`,
      needsConfirmation: false,
    };
  }

  return {
    mode: "finance_question",
    reply: buildFinanceHelpReply(),
    needsConfirmation: false,
  };
}

function continuePendingDraft(
  message: string,
  pendingDraft: PendingTransactionDraft
) {
  const updated: PendingTransactionDraft = { ...pendingDraft };
  const dateInfo = extractDateInfo(message);

  if (dateInfo.hasExplicitDate) {
    updated.date = dateInfo.date.toISOString();
  }

  if (!updated.amount) {
    updated.amount = extractAmount(message);
  }

  if (!updated.merchant || !updated.description) {
    const fallbackType: "income" | "expense" =
      updated.type === "income" ? "income" : "expense";

    const extracted = extractMerchantAndDescription(message, fallbackType);

    if (!updated.merchant && extracted.merchant) {
      updated.merchant = extracted.merchant;
    }

    if (
      (!updated.description ||
        updated.description === "Other expense" ||
        updated.description === "Other income") &&
      extracted.description
    ) {
      updated.description = extracted.description;
    }
  }

  const missingFields: string[] = [];
  if (!updated.amount) {
    missingFields.push("amount");
  }

  if (missingFields.length > 0) {
    return {
      mode: "transaction_draft_needs_info",
      reply: buildMissingAmountReply(updated),
      missingFields,
      proposal: updated,
      needsConfirmation: false,
    };
  }

  return {
    mode: "transaction_draft_ready",
    reply: buildReplyFromDraft(updated),
    proposal: updated,
    needsConfirmation: true,
  };
}

export async function handleChatMessage(
  message: string,
  mlServiceUrl: string,
  userId: number,
  pendingDraft?: PendingTransactionDraft
) {
  if (looksLikeFinanceQuestion(message)) {
    return await answerFinanceQuestion(message, userId);
  }

  const pendingDraftKey = getPendingDraftKey(userId);
  const storedPendingDraft = pendingTransactionDrafts.get(pendingDraftKey);

  if (pendingDraft) {
    if (isCancelPendingMessage(message)) {
      pendingTransactionDrafts.delete(pendingDraftKey);

      return {
        mode: "transaction_draft_cancelled",
        reply: buildCancelledReply(),
        needsConfirmation: false,
      };
    }

    const result = continuePendingDraft(message, pendingDraft);

    if (result.mode === "transaction_draft_ready") {
      pendingTransactionDrafts.delete(pendingDraftKey);
    } else if (result.proposal) {
      pendingTransactionDrafts.set(pendingDraftKey, result.proposal);
    }

    return result;
  }

  if (storedPendingDraft) {
    if (isCancelPendingMessage(message)) {
      pendingTransactionDrafts.delete(pendingDraftKey);

      return {
        mode: "transaction_draft_cancelled",
        reply: buildCancelledReply(),
        needsConfirmation: false,
      };
    }

    const completedDraft = continuePendingDraft(message, storedPendingDraft);

    if (completedDraft.mode === "transaction_draft_ready") {
      pendingTransactionDrafts.delete(pendingDraftKey);
    } else if (completedDraft.proposal) {
      pendingTransactionDrafts.set(pendingDraftKey, completedDraft.proposal);
    }

    return completedDraft;
  }

  if (isMeaninglessInput(message)) {
    return {
      mode: "unrecognized_input",
      reply: buildUnrecognizedReply(),
      needsConfirmation: false,
    };
  }

  const amount = extractAmount(message);
  const inferredType = inferType(message);
  const finalType = inferredType ?? "expense";
  const { merchant, description } = extractMerchantAndDescription(
    message,
    finalType
  );
  const dateInfo = extractDateInfo(message);

  const missingFields: string[] = [];
  if (!amount) {
    missingFields.push("amount");
  }

  let predictedCategory =
    finalType === "income" ? "Other Income" : "Other Expenses";
  let mlPayload: any = null;
  let predictionSource = "fallback";

  const modelNote = [merchant, description].filter(Boolean).join(" ").trim();

  try {
    const response = await fetch(`${mlServiceUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        note: modelNote || merchant || description,
        type: finalType === "income" ? "Income" : "Expense",
        top_k: 3,
      }),
    });

    if (response.ok) {
      mlPayload = await response.json();
      predictedCategory = mlPayload.predicted_category || predictedCategory;
      predictionSource = "ml_model";
    }
  } catch {
  }

  const correctedFeedbackRows =
    await storage.getCorrectedPredictionFeedback(userId);

  const feedbackMatch = findFeedbackMemoryMatch(
    message,
    merchant,
    description,
    correctedFeedbackRows
  );

  if (feedbackMatch) {
    predictedCategory = feedbackMatch.finalCategory;
    predictionSource = "feedback_memory";
  }

  const baseAiMeta = buildFeedbackReadyAiMeta({
    message,
    amount,
    type: finalType,
    merchant,
    description,
    predictedCategory,
    ml: mlPayload,
  });

  const aiMeta = {
    ...baseAiMeta,
    predictionSource,
    feedbackMemoryMatch: feedbackMatch
      ? {
          finalCategory: feedbackMatch.finalCategory,
          similarityScore: feedbackMatch.similarityScore,
          matchedOriginalMessage: feedbackMatch.matchedOriginalMessage,
          matchedMerchant: feedbackMatch.matchedMerchant,
        }
      : null,
  };

  const proposal: PendingTransactionDraft = {
    amount,
    type: finalType,
    merchant,
    description,
    date: dateInfo.date.toISOString(),
    category: predictedCategory,
    aiMeta,
  };

  if (missingFields.length > 0) {
    pendingTransactionDrafts.set(pendingDraftKey, proposal);

    return {
      mode: "transaction_draft_needs_info",
      reply: buildMissingAmountReply(proposal),
      missingFields,
      proposal,
      needsConfirmation: false,
    };
  }

  pendingTransactionDrafts.delete(pendingDraftKey);

  return {
    mode: "transaction_draft_ready",
    reply: buildReplyFromDraft(proposal),
    proposal,
    needsConfirmation: true,
  };
}

export { chatRequestSchema };