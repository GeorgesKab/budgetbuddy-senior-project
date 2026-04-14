export type OfficialAiCategory = {
  name: string;
  type: "income" | "expense";
  icon: string;
  aliases?: string[];
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export const OFFICIAL_AI_CATEGORIES: OfficialAiCategory[] = [
  {
    name: "Entertainment",
    type: "expense",
    icon: "film",
  },
  {
    name: "Food & Drinks",
    type: "expense",
    icon: "utensils",
  },
  {
    name: "Fuel",
    type: "expense",
    icon: "fuel",
  },
  {
    name: "Gifts",
    type: "expense",
    icon: "gift",
  },
  {
    name: "Health",
    type: "expense",
    icon: "heart",
  },
  {
    name: "Other Expenses",
    type: "expense",
    icon: "tag",
    aliases: ["Other Expense"],
  },
  {
    name: "Other Income",
    type: "income",
    icon: "banknote",
  },
  {
    name: "Rent",
    type: "expense",
    icon: "home",
  },
  {
    name: "Salary",
    type: "income",
    icon: "hand-coins",
  },
  {
    name: "Shopping",
    type: "expense",
    icon: "shopping-bag",
  },
  {
    name: "Sports",
    type: "expense",
    icon: "dumbbell",
  },
  {
    name: "Transport",
    type: "expense",
    icon: "bus",
  },
  {
    name: "Vehicle",
    type: "expense",
    icon: "car",
  },
];

export const OFFICIAL_AI_CATEGORY_NAMES = OFFICIAL_AI_CATEGORIES.map(
  (category) => category.name
);

export const OFFICIAL_AI_CATEGORY_ORDER = new Map(
  OFFICIAL_AI_CATEGORIES.map((category, index) => [category.name, index] as const)
);

export function normalizeOfficialCategoryName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const key = normalizeKey(trimmed);

  for (let i = 0; i < OFFICIAL_AI_CATEGORIES.length; i += 1) {
    const category = OFFICIAL_AI_CATEGORIES[i];

    if (normalizeKey(category.name) === key) {
      return category.name;
    }

    const aliases = category.aliases ?? [];
    for (let j = 0; j < aliases.length; j += 1) {
      if (normalizeKey(aliases[j]) === key) {
        return category.name;
      }
    }
  }

  return trimmed;
}

export function findOfficialAiCategory(value: string) {
  const normalized = normalizeOfficialCategoryName(value);

  for (let i = 0; i < OFFICIAL_AI_CATEGORIES.length; i += 1) {
    if (OFFICIAL_AI_CATEGORIES[i].name === normalized) {
      return OFFICIAL_AI_CATEGORIES[i];
    }
  }

  return null;
}

export function isOfficialAiCategory(value: string) {
  return findOfficialAiCategory(value) !== null;
}