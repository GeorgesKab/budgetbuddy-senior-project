import { useRoute, useLocation } from "wouter";
import { useTransaction } from "@/hooks/use-transactions";
import { TransactionForm } from "@/components/transaction-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function TransactionEditor() {
  const [match, params] = useRoute("/transactions/:id/edit");
  const isEditing = !!match;
  const id = isEditing ? parseInt(params!.id) : undefined;
  const [, setLocation] = useLocation();

  // If editing, fetch existing data
  const { data: transaction, isLoading } = useTransaction(id || 0);

  if (isEditing && isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If editing but no transaction found (and not loading), redirect or show error
  if (isEditing && !transaction && !isLoading) {
    return <div>Transaction not found</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/transactions">
        <Button variant="ghost" className="pl-0 hover:pl-2 transition-all gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
      </Link>
      
      <Card className="shadow-xl border-border/50">
        <CardHeader>
          <CardTitle className="text-2xl font-display">
            {isEditing ? "Edit Transaction" : "New Transaction"}
          </CardTitle>
          <CardDescription>
            {isEditing ? "Update the details of your transaction below." : "Enter the details for your new transaction."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionForm 
            defaultValues={transaction as any} 
            onSuccess={() => setLocation("/transactions")} 
          />
        </CardContent>
      </Card>
    </div>
  );
}
