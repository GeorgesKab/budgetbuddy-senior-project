import { useTransactions, useDeleteTransaction } from "@/hooks/use-transactions";
import { api } from "@shared/routes";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Category, Transaction } from "@shared/schema";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Edit2, Filter, Download, Upload, CheckCircle2, XCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo, useRef } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const CSV_HEADERS = ["date", "type", "amount", "category", "description", "merchant"];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map(line => {
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

function transactionsToCSV(rows: Transaction[]): string {
  const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
  const header = CSV_HEADERS.join(",");
  const body = rows.map(t =>
    [
      escape(format(new Date(t.date), "yyyy-MM-dd")),
      escape(t.type),
      escape(String(Number(t.amount).toFixed(2))),
      escape(t.category),
      escape(t.description),
      escape(t.merchant ?? ""),
    ].join(",")
  );
  return [header, ...body].join("\n");
}

interface ImportRow {
  row: number;
  status: "ok" | "error";
  message?: string;
  data?: Record<string, string>;
}

export default function TransactionsPage() {
  const { data: transactions, isLoading: isTransactionsLoading } = useTransactions();
  const { data: customCategories, isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: [api.categories.list.path],
  });
  const isLoading = isTransactionsLoading || isCategoriesLoading;
  const deleteMutation = useDeleteTransaction();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importStep, setImportStep] = useState<"preview" | "done">("preview");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const payload = rows.map(r => ({
        date: r.date,
        type: r.type,
        amount: r.amount,
        category: r.category,
        description: r.description || "",
        merchant: r.merchant || "",
      }));
      const res = await apiRequest("POST", "/api/transactions/import", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      setImportStep("done");
      toast({ title: `Imported ${data.imported} transaction${data.imported === 1 ? "" : "s"} successfully` });
    },
    onError: () => {
      toast({ title: "Import failed", description: "Some rows may have invalid data.", variant: "destructive" });
    },
  });

  const resetFilters = () => {
    setSearch(""); setFilterType("all"); setCategory("all");
    setStartDate(""); setEndDate("");
  };

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) ||
                            t.category.toLowerCase().includes(search.toLowerCase()) ||
                            (t.merchant && t.merchant.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === "all" || t.type === filterType;
      const matchesCategory = category === "all" || t.category === category;
      const date = new Date(t.date);
      const matchesStart = !startDate || date >= new Date(startDate);
      const matchesEnd = !endDate || date <= new Date(endDate);
      return matchesSearch && matchesType && matchesCategory && matchesStart && matchesEnd;
    });
  }, [transactions, search, filterType, category, startDate, endDate]);

  const categories = useMemo(() => {
    const tCats = transactions ? transactions.map(t => t.category) : [];
    const cCats = customCategories ? customCategories.map(c => c.name) : [];
    return Array.from(new Set([...tCats, ...cCats]));
  }, [transactions, customCategories]);

  const handleExport = () => {
    const csv = transactionsToCSV(filteredTransactions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budgetbuddy-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? "" : "s"}` });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rawRows = parseCSV(text);
      const reviewed: ImportRow[] = rawRows.map((r, i) => {
        const errors: string[] = [];
        if (!r.date) errors.push("missing date");
        else if (isNaN(new Date(r.date).getTime())) errors.push("invalid date");
        if (!["income", "expense"].includes(r.type)) errors.push("type must be 'income' or 'expense'");
        if (!r.amount || isNaN(Number(r.amount)) || Number(r.amount) <= 0) errors.push("invalid amount");
        if (!r.category) errors.push("missing category");
        return errors.length > 0
          ? { row: i + 2, status: "error", message: errors.join("; "), data: r }
          : { row: i + 2, status: "ok", data: r };
      });
      setImportRows(reviewed);
      setImportStep("preview");
      setImportDialogOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const validRows = importRows.filter(r => r.status === "ok").map(r => r.data!);
  const errorRows = importRows.filter(r => r.status === "error");

  const handleImport = () => { importMutation.mutate(validRows); };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Transactions</h1>
          <p className="text-muted-foreground">{transactions?.length ?? 0} total transactions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-csv-file"
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-import-csv">
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredTransactions.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Link href="/transactions/new">
            <Button size="sm" data-testid="button-add-transaction">
              <Plus className="w-4 h-4 mr-2" />
              Add Transaction
            </Button>
          </Link>
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setImportRows([]); }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {importStep === "preview" ? "Review Import" : "Import Complete"}
            </DialogTitle>
            <DialogDescription>
              {importStep === "preview"
                ? `Found ${importRows.length} row${importRows.length === 1 ? "" : "s"}. ${errorRows.length > 0 ? `${errorRows.length} row${errorRows.length === 1 ? "" : "s"} will be skipped due to errors.` : "All rows are valid and ready to import."}`
                : `Successfully imported ${validRows.length} transaction${validRows.length === 1 ? "" : "s"}.`}
            </DialogDescription>
          </DialogHeader>

          {importStep === "preview" && (
            <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1 min-h-0">
              {importRows.map((r) => (
                <div
                  key={r.row}
                  className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                    r.status === "ok"
                      ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
                      : "border-destructive/30 bg-destructive/5"
                  }`}
                >
                  {r.status === "ok"
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-muted-foreground mr-2">Row {r.row}</span>
                    {r.status === "ok" ? (
                      <span className="text-foreground">
                        {r.data?.type === "income" ? "+" : "-"}${Number(r.data?.amount).toFixed(2)} · {r.data?.category} · {r.data?.description || "(no description)"}
                      </span>
                    ) : (
                      <span className="text-destructive">{r.message}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {importStep === "done" && (
            <div className="flex items-center justify-center py-10 gap-4 text-emerald-600">
              <CheckCircle2 className="w-12 h-12" />
              <div>
                <p className="font-semibold text-xl">{validRows.length} imported</p>
                {errorRows.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">{errorRows.length} row{errorRows.length === 1 ? "" : "s"} skipped due to errors</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 gap-2">
            {importStep === "preview" ? (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleImport}
                  disabled={validRows.length === 0 || importMutation.isPending}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending
                    ? "Importing…"
                    : `Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}
                </Button>
              </>
            ) : (
              <Button onClick={() => { setImportDialogOpen(false); setImportRows([]); }}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Format hint */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">CSV format: </span>
            <code className="bg-muted px-1 py-0.5 rounded text-xs">date, type, amount, category, description, merchant</code>
            {" "}— <code className="bg-muted px-1 py-0.5 rounded text-xs">type</code> must be{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">income</code> or{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">expense</code>,
            and <code className="bg-muted px-1 py-0.5 rounded text-xs">date</code> should be{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">YYYY-MM-DD</code>.
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
              <SelectTrigger data-testid="select-type"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-category"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              data-testid="input-start-date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              data-testid="input-end-date"
            />
          </div>
          {(search || filterType !== "all" || category !== "all" || startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="mt-3 text-muted-foreground hover:text-foreground"
              data-testid="button-reset-filters"
            >
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Transaction list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>All Transactions</span>
            <Badge variant="secondary">{filteredTransactions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">No transactions found</p>
              <p className="text-sm">Try adjusting your filters or add a new transaction.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredTransactions.map(t => (
                <div
                  key={t.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-3.5 hover:bg-muted/40 transition-colors"
                  data-testid={`row-transaction-${t.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.type === "income" ? "bg-emerald-500" : "bg-destructive"}`} />
                    <div>
                      <p className="font-medium text-foreground leading-tight">{t.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Badge variant="outline" className="text-xs">{t.category}</Badge>
                        {t.merchant && <Badge variant="secondary" className="text-xs">{t.merchant}</Badge>}
                        <span className="text-xs text-muted-foreground">{format(new Date(t.date), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-6 pl-5 sm:pl-0">
                    <span className={`text-lg font-bold font-mono ${t.type === "income" ? "text-emerald-600" : "text-destructive"}`}>
                      {t.type === "income" ? "+" : "-"}${Number(t.amount).toFixed(2)}
                    </span>
                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/transactions/${t.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" data-testid={`button-edit-${t.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:text-destructive text-muted-foreground"
                            data-testid={`button-delete-${t.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this transaction. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(t.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
