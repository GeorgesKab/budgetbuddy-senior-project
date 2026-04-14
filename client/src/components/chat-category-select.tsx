import {
  Banknote,
  Car,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  HeartPulse,
  House,
  ShoppingBag,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeOfficialCategoryName } from "@shared/official-ai-categories";

type ChatCategorySelectProps = {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
};

function getCategoryIcon(category: string) {
  const normalized = normalizeOfficialCategoryName(category).toLowerCase();

  if (normalized.includes("food") || normalized.includes("drink")) {
    return UtensilsCrossed;
  }

  if (normalized.includes("fuel") || normalized.includes("gas")) {
    return Fuel;
  }

  if (normalized.includes("transport") || normalized.includes("vehicle")) {
    return Car;
  }

  if (
    normalized.includes("salary") ||
    normalized.includes("income") ||
    normalized.includes("refund") ||
    normalized.includes("bonus")  ||
    normalized.includes("pay")    ||
    normalized.includes("got")
  ) {
    return Banknote;
  }

  if (normalized.includes("shopping")) {
    return ShoppingBag;
  }

  if (normalized.includes("gift")) {
    return Gift;
  }

  if (normalized.includes("rent")) {
    return House;
  }

  if (normalized.includes("health") || normalized.includes("medical")) {
    return HeartPulse;
  }

  if (normalized.includes("sport")) {
    return Dumbbell;
  }

  if (normalized.includes("entertainment")) {
    return Film;
  }

  return Tag;
}

export function ChatCategorySelect({
  value,
  categories,
  onChange,
}: ChatCategorySelectProps) {
  const normalizedValue = normalizeOfficialCategoryName(value);

  const safeCategories = Array.from(
    new Set(
      categories
        .filter(Boolean)
        .map((category) => normalizeOfficialCategoryName(category))
    )
  ).sort((a, b) => a.localeCompare(b));

  if (normalizedValue && !safeCategories.includes(normalizedValue)) {
    safeCategories.push(normalizedValue);
    safeCategories.sort((a, b) => a.localeCompare(b));
  }

  return (
    <Select value={normalizedValue} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>

      <SelectContent data-chat-widget-portal="true">
        {safeCategories.map((category) => {
          const Icon = getCategoryIcon(category);

          return (
            <SelectItem key={category} value={category}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{category}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}