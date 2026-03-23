import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import type { Transaction } from "@shared/schema";
import { format, subDays } from "date-fns";

interface BalanceTrendChartProps {
  transactions: Transaction[];
}

export function BalanceTrendChart({ transactions }: BalanceTrendChartProps) {
  const [daysRange, setDaysRange] = useState("30");

  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const days = parseInt(daysRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sorted = [...transactions]
      .filter(t => new Date(t.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const previousTransactions = transactions.filter(t => new Date(t.date) < cutoffDate);
    runningBalance = previousTransactions.reduce((acc, t) => {
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
  }, [transactions, daysRange]);

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Balance Trend</CardTitle>
        <Select value={daysRange} onValueChange={setDaysRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
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
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
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
