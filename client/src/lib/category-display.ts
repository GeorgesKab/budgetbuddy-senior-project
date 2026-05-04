export function getCategoryDisplayName(category: string | null | undefined) {
  if (!category) return "";
  return category.trim().toLowerCase() === "rent" ? "Housing" : category;
}