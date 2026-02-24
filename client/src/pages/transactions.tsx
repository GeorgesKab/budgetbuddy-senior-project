import { useTransactions, useDeleteTransaction } from "@/hooks/use-transactions";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Edit2, Filter } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export default function TransactionsPage() {
  const { data: transactions, isLoading } = useTransactions();
  const deleteMutation = useDeleteTransaction();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resetFilters = () => {
    setSearch("");
    setFilterType("all");
    setCategory("all");
    setStartDate("");
    setEndDate("");
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
      const matchesStartDate = !startDate || date >= new Date(startDate);
      const matchesEndDate = !endDate || date <= new Date(endDate);
      
      return matchesSearch && matchesType && matchesCategory && matchesStartDate && matchesEndDate;
    });
  }, [transactions, search, filterType, category, startDate, endDate]);

  const categories = useMemo(() => {
    if (!transactions) return [];
    return Array.from(new Set(transactions.map(t => t.category)));
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Transactions</h1>
          <p className="text-muted-foreground">Manage your income and expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            Reset Filters
          </Button>
          <Link href="/transactions/new">
            <Button className="shadow-lg hover:shadow-xl transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Add New
            </Button>
          </Link>
        </div>
      </div>

      <Card className="shadow-md border-border/50">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <CardTitle className="text-lg hidden md:block">All Transactions</CardTitle>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search description, category, merchant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>

              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-col gap-1">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="Start Date"
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="End Date"
                  className="h-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No transactions found matching your filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredTransactions.map((t) => (
                  <div key={t.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-muted/30 -mx-6 px-6 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {t.type === 'income' ? <Plus className="w-5 h-5" /> : <div className="w-4 h-0.5 bg-current" />}
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{t.description}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
                          <Badge variant="secondary" className="font-normal bg-muted text-muted-foreground hover:bg-muted">{t.category}</Badge>
                          <span>•</span>
                          <span>{format(new Date(t.date), "MMMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-6 pl-14 sm:pl-0">
                      <span className={`text-lg font-bold font-mono ${t.type === 'income' ? 'text-emerald-600' : 'text-foreground'}`}>
                        {t.type === 'income' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                      </span>
                      
                      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/transactions/${t.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </Link>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive text-muted-foreground">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this transaction from your records.
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
