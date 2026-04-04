import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import type { Transaction } from "@shared/schema";
import { getCategoryColor } from "@/lib/category-colors";

interface TopExpensesChartProps {
  transactions: Transaction[];
}

export function TopExpensesChart({ transactions }: TopExpensesChartProps) {
  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const expenses = transactions.filter(t => t.type === "expense");

    const grouped = expenses.reduce((acc, curr) => {
      const amount = Number(curr.amount);
      acc[curr.category] = (acc[curr.category] || 0) + amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top Expenses</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 10, left: 0, bottom: 5 }}
              barCategoryGap="20%"
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                tickFormatter={(value) => `$${value}`}
              />
              <YAxis
                dataKey="name"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }}
                width={100}
              />
              <RechartsTooltip
                formatter={(value: number, _name: string, props: any) => [`$${value.toFixed(2)}`, props.payload.name]}
                labelFormatter={() => ""}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p>No expense data to display</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
