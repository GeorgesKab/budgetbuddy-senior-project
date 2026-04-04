import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import type { Transaction } from "@shared/schema";
import { format } from "date-fns";

interface BalanceTrendChartProps {
  transactions: Transaction[];
  allTransactions: Transaction[];
  startDate: Date;
}

export function BalanceTrendChart({ transactions, allTransactions, startDate }: BalanceTrendChartProps) {
  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const sorted = [...transactions]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = (allTransactions || [])
      .filter(t => new Date(t.date) < startDate)
      .reduce((acc, t) => {
        const amount = Number(t.amount);
        return t.type === "income" ? acc + amount : acc - amount;
      }, 0);

    const dailyData: Record<string, number> = {};

    sorted.forEach(t => {
      const amount = Number(t.amount);
      const dateKey = format(new Date(t.date), "MMM d");
      const delta = t.type === "income" ? amount : -amount;
      runningBalance += delta;
      dailyData[dateKey] = runningBalance;
    });

    return Object.entries(dailyData).map(([date, balance]) => ({
      date,
      balance: parseFloat(balance.toFixed(2)),
    }));
  }, [transactions, allTransactions, startDate]);

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Balance Trend</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis 
                dataKey="date" 
                stroke="var(--muted-foreground)"
                style={{ fontSize: "12px" }}
              />
              <YAxis 
                stroke="var(--muted-foreground)"
                style={{ fontSize: "12px" }}
                tickFormatter={(value) => `$${value}`}
              />
              <RechartsTooltip 
                formatter={(value: number) => `$${value.toFixed(2)}`}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="#10b981"
                dot={false}
                strokeWidth={2.5}
                name="Balance"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p>No transaction data to display</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
