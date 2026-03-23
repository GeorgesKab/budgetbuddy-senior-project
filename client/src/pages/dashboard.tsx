import { useTransactions } from "@/hooks/use-transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Plus, Settings2, X, GripVertical, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { useMemo, useState, useRef } from "react";
import { BalanceTrendChart } from "@/components/balance-trend-chart";
import { TopExpensesChart } from "@/components/top-expenses-chart";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { Transaction } from "@shared/schema";
import { getCategoryColor } from "@/lib/category-colors";

type WidgetId = "balanceTrend" | "recentTransactions" | "expenseBreakdown" | "topExpenses";

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: "balanceTrend",       label: "Balance Trend",        visible: true },
  { id: "recentTransactions", label: "Recent Transactions",  visible: true },
  { id: "expenseBreakdown",   label: "Expense Breakdown",    visible: true },
  { id: "topExpenses",        label: "Top Expenses",         visible: true },
];

function ExpenseBreakdownWidget({ transactions }: { transactions: Transaction[] }) {
  const [range, setRange] = useState("30");
  const data = useMemo(() => {
    const days = parseInt(range);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const expenses = transactions.filter(t => t.type === "expense" && new Date(t.date) >= cutoff);
    const grouped = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [transactions, range]);

  return (
    <Card className="shadow-md border-border/50 h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Expense Breakdown</CardTitle>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="h-[300px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {data.map((entry) => <Cell key={entry.name} fill={getCategoryColor(entry.name)} />)}
              </Pie>
              <RechartsTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">No expense data</div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTransactionsWidget({ transactions }: { transactions: Transaction[] }) {
  return (
    <Card className="shadow-md border-border/50 h-full">
      <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {transactions.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50">
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{t.description}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(t.date), "MMM d, yyyy")} • {t.category}</span>
              </div>
              <span className={`font-semibold ${t.type === "income" ? "text-emerald-600" : "text-destructive"}`}>
                {t.type === "income" ? "+" : "-"}${Number(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
          {transactions.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No transactions yet.</p>
          )}
        </div>
        {transactions.length > 5 && (
          <div className="mt-4 text-center">
            <Link href="/transactions" className="text-sm text-primary hover:underline font-medium">View all transactions</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SIDE_BY_SIDE: WidgetId[] = ["recentTransactions", "expenseBreakdown"];

export default function Dashboard() {
  const { data: transactions, isLoading } = useTransactions();
  const [layout, setLayout] = useLocalStorage<WidgetConfig[]>("dashboard-layout-v2", DEFAULT_LAYOUT);
  const [showCustomize, setShowCustomize] = useState(false);
  const dragId = useRef<WidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null);

  const stats = useMemo(() => {
    if (!transactions) return { income: 0, expense: 0, total: 0 };
    return transactions.reduce(
      (acc, t) => {
        const amount = Number(t.amount);
        if (t.type === "income") { acc.income += amount; acc.total += amount; }
        else { acc.expense += amount; acc.total -= amount; }
        return acc;
      },
      { income: 0, expense: 0, total: 0 }
    );
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const visibleLayout = layout.filter(w => w.visible);

  const toggleVisible = (id: WidgetId) => {
    setLayout(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const onDragStart = (id: WidgetId) => { dragId.current = id; };
  const onDragOver = (e: React.DragEvent, id: WidgetId) => {
    e.preventDefault();
    if (dragId.current !== id) setDragOverId(id);
  };
  const onDrop = (targetId: WidgetId) => {
    const from = dragId.current;
    if (!from || from === targetId) { setDragOverId(null); return; }
    const next = [...layout];
    const fromIdx = next.findIndex(w => w.id === from);
    const toIdx   = next.findIndex(w => w.id === targetId);
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    setLayout(next);
    dragId.current = null;
    setDragOverId(null);
  };
  const onDragEnd = () => { dragId.current = null; setDragOverId(null); };

  const renderWidgetContent = (id: WidgetId) => {
    if (!transactions) return null;
    switch (id) {
      case "balanceTrend":       return <BalanceTrendChart transactions={transactions} />;
      case "recentTransactions": return <RecentTransactionsWidget transactions={transactions} />;
      case "expenseBreakdown":   return <ExpenseBreakdownWidget transactions={transactions} />;
      case "topExpenses":        return <TopExpensesChart transactions={transactions} />;
    }
  };

  const renderDraggableWidget = (widget: WidgetConfig) => {
    const isDragOver = dragOverId === widget.id;
    return (
      <div
        key={widget.id}
        draggable={showCustomize}
        onDragStart={() => onDragStart(widget.id)}
        onDragOver={e => onDragOver(e, widget.id)}
        onDrop={() => onDrop(widget.id)}
        onDragEnd={onDragEnd}
        data-testid={`widget-${widget.id}`}
        className={[
          "relative transition-all duration-150",
          showCustomize ? "cursor-grab active:cursor-grabbing" : "",
          isDragOver ? "ring-2 ring-primary ring-offset-2 rounded-xl scale-[0.98] opacity-80" : "",
          dragId.current === widget.id ? "opacity-40" : "",
        ].join(" ")}
      >
        {showCustomize && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-border/50 select-none pointer-events-none">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">drag</span>
          </div>
        )}
        {renderWidgetContent(widget.id)}
      </div>
    );
  };

  const renderGrid = () => {
    const result: React.ReactNode[] = [];
    const visible = visibleLayout;
    let i = 0;
    while (i < visible.length) {
      const w = visible[i];
      const next = visible[i + 1];
      if (SIDE_BY_SIDE.includes(w.id) && next && SIDE_BY_SIDE.includes(next.id)) {
        result.push(
          <div key={`row-${w.id}-${next.id}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderDraggableWidget(w)}
            {renderDraggableWidget(next)}
          </div>
        );
        i += 2;
      } else {
        result.push(renderDraggableWidget(w));
        i += 1;
      }
    }
    return result;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your financial health</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showCustomize ? "default" : "outline"}
            onClick={() => setShowCustomize(!showCustomize)}
            size="sm"
            data-testid="button-customize-dashboard"
          >
            {showCustomize ? <X className="w-4 h-4 mr-2" /> : <Settings2 className="w-4 h-4 mr-2" />}
            {showCustomize ? "Done" : "Customize"}
          </Button>
          <Link href="/transactions/new">
            <Button className="shadow-lg hover:shadow-xl transition-all" data-testid="button-add-transaction">
              <Plus className="w-4 h-4 mr-2" />
              Add Transaction
            </Button>
          </Link>
        </div>
      </div>

      {/* Customize panel */}
      {showCustomize && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-semibold mb-1">Customize your dashboard</p>
            <p className="text-xs text-muted-foreground mb-4">Drag widgets to reorder them. Toggle visibility with the eye icon.</p>
            <div className="flex flex-col gap-2">
              {layout.map((w, idx) => (
                <div
                  key={w.id}
                  draggable
                  onDragStart={() => onDragStart(w.id)}
                  onDragOver={e => onDragOver(e, w.id)}
                  onDrop={() => onDrop(w.id)}
                  onDragEnd={onDragEnd}
                  className={[
                    "flex items-center gap-3 p-3 rounded-lg border bg-background cursor-grab active:cursor-grabbing select-none transition-all",
                    dragOverId === w.id ? "border-primary ring-1 ring-primary scale-[0.99]" : "border-border/60",
                    dragId.current === w.id ? "opacity-40" : "opacity-100",
                  ].join(" ")}
                  data-testid={`customize-row-${w.id}`}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">{w.label}</span>
                  <span className="text-xs text-muted-foreground mr-2">#{idx + 1}</span>
                  <button
                    onClick={() => toggleVisible(w.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                    data-testid={`toggle-${w.id}`}
                    title={w.visible ? "Hide widget" : "Show widget"}
                  >
                    {w.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards — always fixed at top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.total >= 0 ? "text-primary" : "text-destructive"}`}>
              ${stats.total.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current net worth</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">${stats.income.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time earnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${stats.expense.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time spending</p>
          </CardContent>
        </Card>
      </div>

      {/* Draggable widgets */}
      <div className="space-y-6">
        {renderGrid()}
        {visibleLayout.length === 0 && (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
            <p className="font-medium">All widgets are hidden.</p>
            <p className="text-sm mt-1">Click <strong>Customize</strong> to show them again.</p>
          </div>
        )}
      </div>
    </div>
  );
}
