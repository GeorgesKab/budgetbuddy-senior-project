const CATEGORY_COLOR_MAP: Record<string, string> = {
  "entertainment": "#8B5CF6",
  "food & drinks": "#F97316",
  "fuel": "#14B8A6",
  "gifts": "#EC4899",
  "health": "#EF4444",
  "other expenses": "#9CA3AF",
  "other income": "#22C55E",
  "rent": "#3B82F6",
  "salary": "#16A34A",
  "shopping": "#EAB308",
  "sports": "#06B6D4",
  "transport": "#6366F1",
  "vehicle": "#0F766E",
};

const EXTRA_COLORS = [
"#A855F7",
"#F43F5E",
"#10B981",
"#F59E0B",
"#0EA5E9",
"#84CC16", 
"#C084FC",
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
