import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Edit2, Check, X, Banknote, Gift, PiggyBank, Utensils, ShoppingCart, Coffee, Car, Home, Zap, Repeat, ShoppingBag, Film, Circle, MoreHorizontal, Briefcase, Heart, Plane, BookOpen, Dumbbell, Music, Wifi, CreditCard, Smartphone } from "lucide-react";
import { useState } from "react";
import type { Category, InsertCategory } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCategorySchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ICON_OPTIONS = [
  { value: "banknote", label: "Money", Icon: Banknote },
  { value: "gift", label: "Gift", Icon: Gift },
  { value: "piggy-bank", label: "Savings", Icon: PiggyBank },
  { value: "utensils", label: "Food", Icon: Utensils },
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
];

function getIconComponent(iconName: string) {
  const found = ICON_OPTIONS.find(o => o.value === iconName);
  return found ? found.Icon : Circle;
}

export default function CategoriesPage() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"income" | "expense">("expense");
  const [showAllCustom, setShowAllCustom] = useState(false);

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: [api.categories.list.path],
  });

  const { data: defaultCategories, isLoading: isDefaultsLoading } = useQuery<Category[]>({
    queryKey: [api.categories.defaults.path],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCategory) => {
      await apiRequest(api.categories.create.method, api.categories.create.path, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Category created" });
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertCategory> }) => {
      await apiRequest(api.categories.update.method, buildUrl(api.categories.update.path, { id }), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Category updated" });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(api.categories.delete.method, buildUrl(api.categories.delete.path, { id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Category deleted" });
    },
  });

  const form = useForm<InsertCategory>({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: {
      name: "",
      type: "expense",
      icon: "banknote",
    },
  });

  if (isLoading || isDefaultsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const VISIBLE_CUSTOM = 5;
  const visibleCustom = showAllCustom ? categories : categories?.slice(0, VISIBLE_CUSTOM);
  const hasMore = (categories?.length ?? 0) > VISIBLE_CUSTOM;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        <p className="text-muted-foreground">Manage your custom expense and income categories.</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-default-categories-title">Default Categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {defaultCategories?.map((cat) => {
            const IconComp = getIconComponent(cat.icon);
            return (
              <div
                key={cat.id}
                className="flex items-center gap-2 bg-card rounded-xl px-4 py-3 shadow-md"
                data-testid={`card-default-category-${cat.id}`}
              >
                <IconComp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm leading-tight">{cat.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cat.type}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <hr className="border-border" />

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Groceries" {...field} data-testid="input-category-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category-icon">
                            <SelectValue placeholder="Select icon">
                              {field.value && (() => {
                                const opt = ICON_OPTIONS.find(o => o.value === field.value);
                                if (!opt) return field.value;
                                const IconC = opt.Icon;
                                return (
                                  <span className="flex items-center gap-2">
                                    <IconC className="h-4 w-4" />
                                    {opt.label}
                                  </span>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ICON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                <opt.Icon className="h-4 w-4" />
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-category">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Category
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {visibleCustom?.map((category) => {
                const IconComp = getIconComponent(category.icon);
                return (
                  <div key={category.id} className="flex items-center justify-between py-3 px-6 hover:bg-muted/40 transition-colors" data-testid={`row-category-${category.id}`}>
                    {editingId === category.id ? (
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            className="h-8"
                            data-testid={`input-edit-category-name-${category.id}`}
                          />
                          <Select value={editType} onValueChange={(v: any) => setEditType(v)}>
                            <SelectTrigger className="h-8 w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="income">Income</SelectItem>
                              <SelectItem value="expense">Expense</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => {
                            updateMutation.mutate({ id: category.id, data: { name: editName, type: editType } });
                          }}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <IconComp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium" data-testid={`text-category-name-${category.id}`}>{category.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{category.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                            setEditType(category.type as "income" | "expense");
                          }} data-testid={`button-edit-category-${category.id}`}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this category?")) {
                                deleteMutation.mutate(category.id);
                              }
                            }}
                            data-testid={`button-delete-category-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {categories?.length === 0 && (
                <p className="text-center text-muted-foreground py-8 px-6">No custom categories yet.</p>
              )}
            </div>
            {hasMore && !showAllCustom && (
              <button
                onClick={() => setShowAllCustom(true)}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-3 transition-colors"
                data-testid="button-show-more-categories"
              >
                + {(categories?.length ?? 0) - VISIBLE_CUSTOM} more
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
