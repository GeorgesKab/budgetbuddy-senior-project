const CATEGORY_COLOR_MAP: Record<string, string> = {
  "salary": "#22c55e",
  "gifts": "#4ade80",
  "savings": "#16a34a",
  "food": "#fb923c",
  "groceries": "#a3e635",
  "dining out": "#fdba74",
  "transport": "#60a5fa",
  "rent": "#818cf8",
  "utilities": "#facc15",
  "subscriptions": "#c084fc",
  "shopping": "#f472b6",
  "entertainment": "#a78bfa",
  "other": "#9ca3af",
  "other expenses": "#d1d5db",
};

const EXTRA_COLORS = [
  "#2dd4bf",
  "#22d3ee",
  "#38bdf8",
  "#fbbf24",
  "#f87171",
  "#34d399",
  "#c084fc",
];

function hashName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getCategoryColor(name: string): string {
  const key = name.toLowerCase().trim();
  if (CATEGORY_COLOR_MAP[key]) {
    return CATEGORY_COLOR_MAP[key];
  }
  const hash = hashName(key);
  return EXTRA_COLORS[hash % EXTRA_COLORS.length];
}
