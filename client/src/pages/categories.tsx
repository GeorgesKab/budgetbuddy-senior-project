import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Edit2, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Category, InsertCategory } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCategorySchema } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ICON_OPTIONS, getIconComponent } from "@/lib/category-icons";
import {
  OFFICIAL_AI_CATEGORIES,
  OFFICIAL_AI_CATEGORY_ORDER,
  isOfficialAiCategory,
  normalizeOfficialCategoryName,
} from "@shared/official-ai-categories";

function sortByOfficialOrder(items: Category[]) {
  return items
    .slice()
    .sort((a, b) => {
      const aName = normalizeOfficialCategoryName(a.name);
      const bName = normalizeOfficialCategoryName(b.name);

      const aIndex = OFFICIAL_AI_CATEGORY_ORDER.get(aName) ?? 999;
      const bIndex = OFFICIAL_AI_CATEGORY_ORDER.get(bName) ?? 999;

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      return aName.localeCompare(bName);
    });
}

function isReservedOfficialCategoryName(name: string) {
  return isOfficialAiCategory(name);
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

  const sortedDefaultCategories = useMemo(() => {
    return sortByOfficialOrder(defaultCategories ?? []);
  }, [defaultCategories]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertCategory) => {
      if (isReservedOfficialCategoryName(data.name)) {
        throw new Error(
          "This name is reserved for the official AI categories. Please choose a different custom category name."
        );
      }

      await apiRequest(api.categories.create.method, api.categories.create.path, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Category created" });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Could not create category",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertCategory> }) => {
      if (data.name && isReservedOfficialCategoryName(data.name)) {
        throw new Error(
          "This name is reserved for the official AI categories. Please choose a different custom category name."
        );
      }

      await apiRequest(
        api.categories.update.method,
        buildUrl(api.categories.update.path, { id }),
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Category updated" });
      setEditingId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Could not update category",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(
        api.categories.delete.method,
        buildUrl(api.categories.delete.path, { id })
      );
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
      <div className="flex min-h-[400px] items-center justify-center">
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
        <p className="text-muted-foreground">
          Official AI categories stay fixed. Custom categories are for your own organization and do not change the AI label set.
        </p>
      </div>

      <div>
        <h2
          className="mb-3 text-lg font-semibold"
          data-testid="text-default-categories-title"
        >
          Default Categories
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {sortedDefaultCategories.map((cat) => {
            const IconComp = getIconComponent(cat.icon);
            const displayName = normalizeOfficialCategoryName(cat.name);

            return (
              <div
                key={cat.id}
                className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 shadow-md"
                data-testid={`card-default-category-${cat.id}`}
              >
                <IconComp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium leading-tight">{displayName}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {cat.type}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {sortedDefaultCategories.length !== OFFICIAL_AI_CATEGORIES.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            The default categories are being synced to the official AI category set.
          </p>
        )}
      </div>

      <hr className="border-border" />

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create New Category</CardTitle>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Family Budget"
                          {...field}
                          data-testid="input-category-name"
                        />
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
                              {field.value &&
                                (() => {
                                  const opt = ICON_OPTIONS.find(
                                    (option) => option.value === field.value
                                  );

                                  if (!opt) {
                                    return field.value;
                                  }

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

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                  data-testid="button-create-category"
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
                  <div
                    key={category.id}
                    className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-muted/40"
                    data-testid={`row-category-${category.id}`}
                  >
                    {editingId === category.id ? (
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            className="h-8"
                            data-testid={`input-edit-category-name-${category.id}`}
                          />

                          <Select
                            value={editType}
                            onValueChange={(v: "income" | "expense") =>
                              setEditType(v)
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px]">
                              <SelectValue />
                            </SelectTrigger>

                            <SelectContent>
                              <SelectItem value="income">Income</SelectItem>
                              <SelectItem value="expense">Expense</SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600"
                            onClick={() => {
                              updateMutation.mutate({
                                id: category.id,
                                data: { name: editName, type: editType },
                              });
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <IconComp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div>
                            <p
                              className="font-medium"
                              data-testid={`text-category-name-${category.id}`}
                            >
                              {category.name}
                            </p>
                            <p className="text-xs capitalize text-muted-foreground">
                              {category.type}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingId(category.id);
                              setEditName(category.name);
                              setEditType(category.type as "income" | "expense");
                            }}
                            data-testid={`button-edit-category-${category.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to delete this category?"
                                )
                              ) {
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
                <p className="px-6 py-8 text-center text-muted-foreground">
                  No custom categories yet.
                </p>
              )}
            </div>

            {hasMore && !showAllCustom && (
              <button
                onClick={() => setShowAllCustom(true)}
                className="w-full py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
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