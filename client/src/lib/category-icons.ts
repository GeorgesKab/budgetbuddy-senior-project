import { Banknote, Gift, PiggyBank, Utensils, ShoppingCart, TagIcon, Bus, Coffee, Car, Home, Zap, Repeat, HandCoins, ShoppingBag, Film, Circle, MoreHorizontal, Briefcase, Heart, Plane, BookOpen, Dumbbell, Music, Wifi, CreditCard, Smartphone, Fuel, type LucideIcon, Sandwich, Tag } from "lucide-react";

export const ICON_OPTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "banknote", label: "Money", Icon: Banknote },
  { value: "gift", label: "Gift", Icon: Gift },
  { value: "piggy-bank", label: "Savings", Icon: PiggyBank },
  { value: "utensils", label: "Dining Out", Icon: Utensils },
  { value: "shopping-cart", label: "Cart", Icon: ShoppingCart },
  { value: "coffee", label: "Coffee", Icon: Coffee },
  { value: "car", label: "Car", Icon: Car },
  { value: "home", label: "Home", Icon: Home },
  { value: "zap", label: "Energy", Icon: Zap },
  { value: "repeat", label: "Repeat", Icon: Repeat },
  { value: "shopping-bag", label: "Shopping", Icon: ShoppingBag },
  { value: "film", label: "Film", Icon: Film },
  { value: "circle", label: "Circle", Icon: Circle },
  { value: "more-horizontal", label: "More", Icon: MoreHorizontal },
  { value: "briefcase", label: "Work", Icon: Briefcase },
  { value: "heart", label: "Health", Icon: Heart },
  { value: "plane", label: "Travel", Icon: Plane },
  { value: "book-open", label: "Education", Icon: BookOpen },
  { value: "dumbbell", label: "Fitness", Icon: Dumbbell },
  { value: "music", label: "Music", Icon: Music },
  { value: "wifi", label: "Internet", Icon: Wifi },
  { value: "credit-card", label: "Payment", Icon: CreditCard },
  { value: "smartphone", label: "Phone", Icon: Smartphone },
  { value: "sandwich", label: "Food", Icon: Sandwich },
  { value: "fuel", label: "Fuel", Icon: Fuel },
  { value: "hand-coins", label: "hand-coins", Icon: HandCoins },
  { value: "bus", label: "bus", Icon: Bus },
  { value: "tag", label: "tag", Icon: Tag }
];

export function getIconComponent(iconName: string): LucideIcon {
  const found = ICON_OPTIONS.find(o => o.value === iconName);
  return found ? found.Icon : Circle;
}
