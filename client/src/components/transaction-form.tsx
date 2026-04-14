import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTransactionSchema, type Category } from "@shared/schema";
import { api } from "@shared/routes";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/use-transactions";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { predictCategory, type AutoCategorizeResponse } from "@/services/autoCategorize";

// Extend the schema for the form to handle string -> number conversion and Date handling
const formSchema = insertTransactionSchema.extend({
  amount: z.coerce.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  date: z.coerce.date(), // HTML date input returns string YYYY-MM-DD
  merchant: z.string().default(""),
  category: z.string().min(1, "Please select a category"),
});

type FormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  defaultValues?: (Partial<FormValues> & { id?: number }) | null;
  onSuccess?: () => void;
}

export function TransactionForm({ defaultValues, onSuccess }: TransactionFormProps) {
  const { toast } = useToast();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();

  const { data: customCategories } = useQuery<Category[]>({
    queryKey: [api.categories.all.path],
  });

  const isEditing = !!defaultValues?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: defaultValues?.amount?.toString() || "",
      category: defaultValues?.category || "",
      description: defaultValues?.description || "",
      merchant: defaultValues?.merchant || "",
      type: (defaultValues?.type as "income" | "expense") || "expense",
      date: defaultValues?.date ? new Date(defaultValues.date) : new Date(),
    },
  });

  const [aiSuggestion, setAiSuggestion] = useState<AutoCategorizeResponse | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState("");

  const handleSuggestCategory = async () => {
    const merchant = form.watch("merchant") || "";
    const description = form.watch("description") || "";
    const txType = form.watch("type") || "expense";

    const noteForModel = `${merchant} ${description}`.trim();

    if (!noteForModel) {
      setPredictError("Please enter merchant or description first.");
      return;
    }

    try {
      setPredictLoading(true);
      setPredictError("");

      const result = await predictCategory(
        noteForModel,
        txType === "income" ? "Income" : "Expense",
        3
      );

      setAiSuggestion(result);

      form.setValue("category", result.predicted_category, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } catch (error: any) {
      setPredictError(error.message || "Prediction failed.");
    } finally {
      setPredictLoading(false);
    }
  };

  async function onSubmit(values: FormValues) {
    try {
      if (isEditing && defaultValues?.id) {
        await updateMutation.mutateAsync({
          id: defaultValues.id,
          ...values,
          amount: values.amount.toString(), // Schema expects numeric string
        });

        toast({
          title: "Updated!",
          description: "Transaction updated successfully.",
        });
      } else {
        await createMutation.mutateAsync({
          ...values,
          amount: values.amount.toString(),
        });

        toast({
          title: "Success!",
          description: "Transaction added successfully.",
        });
      }

      form.reset({
        amount: "",
        category: "",
        description: "",
        merchant: "",
        type: "expense",
        date: new Date(),
      });
      setAiSuggestion(null);
      setPredictError("");
      onSuccess?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Something went wrong",
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      className="pl-7 input-field"
                      placeholder="0.00"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Category <span className="text-red-500">*</span>
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="input-field">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {customCategories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="input-field block w-full"
                  value={
                    field.value instanceof Date
                      ? field.value.toISOString().split("T")[0]
                      : field.value
                        ? new Date(field.value).toISOString().split("T")[0]
                        : ""
                  }
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="merchant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Merchant</FormLabel>
              <FormControl>
                <Input {...field} className="input-field" placeholder="e.g. Amazon, Starbucks" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} className="input-field" placeholder="What was this for?" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSuggestCategory}
            disabled={predictLoading}
            className="w-full"
          >
            {predictLoading ? "Predicting..." : "Suggest category"}
          </Button>

          {predictError && (
            <p className="text-sm text-red-500">{predictError}</p>
          )}

          {aiSuggestion && (
            <div className="rounded-lg border p-4 space-y-2">
              <p>
                <strong>Suggested category:</strong> {aiSuggestion.predicted_category}
              </p>

              <p className="text-sm text-muted-foreground break-all">
                <strong>Model text used:</strong> {aiSuggestion.model_text}
              </p>

              <div>
                <p className="font-medium">Top alternatives:</p>
                <ul className="list-disc ml-5 text-sm text-muted-foreground">
                  {aiSuggestion.top_predictions.map((pred) => (
                    <li key={pred.category}>
                      {pred.category} ({pred.score.toFixed(3)})
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                These are ranking scores, not probabilities.
              </p>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full"
        >
          {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {isEditing ? "Update Transaction" : "Add Transaction"}
        </Button>
      </form>
    </Form>
  );
}