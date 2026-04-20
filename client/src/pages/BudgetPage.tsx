import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import type { BudgetCategory, Transaction, Subscription, Receipt } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Plus, Trash2, Pencil, RefreshCcw, TrendingUp, TrendingDown,
  AlertCircle, Calendar, Tag, Wallet, CreditCard, Receipt as ReceiptIcon,
  Upload, FileImage, FileText, X, ExternalLink, Search, Filter,
} from "lucide-react";

const TODAY = new Date().toISOString().split("T")[0];
const THIS_MONTH = TODAY.slice(0, 7);

const BILLING_LABELS: Record<string, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};
const CYCLE_MONTHS: Record<string, number> = { weekly: 0.25, monthly: 1, quarterly: 3, yearly: 12 };

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}
function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}
function monthlyAmount(amount: number, cycle: string) {
  return amount / (CYCLE_MONTHS[cycle] ?? 1);
}

// ── Sub-modals ─────────────────────────────────────────────────────────────────

function CategoryModal({ open, onClose, editing, categories }: {
  open: boolean; onClose: () => void;
  editing: BudgetCategory | null; categories: BudgetCategory[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [icon, setIcon] = useState("💰");
  const [color, setColor] = useState("hsl(210 80% 48%)");

  const COLORS = ["hsl(210 80% 48%)", "hsl(25 85% 52%)", "hsl(340 75% 50%)", "hsl(160 60% 40%)", "hsl(270 60% 50%)", "hsl(45 90% 48%)"];

  const mut = useMutation({
    mutationFn: (d: any) => editing
      ? apiRequest("PATCH", `/api/budget-categories/${editing.id}`, d)
      : apiRequest("POST", "/api/budget-categories", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/budget-categories"] }); onClose(); },
    onError: () => toast({ title: "Error saving category", variant: "destructive" }),
  });

  useState(() => {
    if (editing) { setName(editing.name); setBudget(String(editing.budgetAmount)); setIcon(editing.icon ?? "💰"); setColor(editing.color ?? COLORS[0]); }
    else { setName(""); setBudget(""); setIcon("💰"); setColor(COLORS[0]); }
  });

  // reset on open
  useMemo(() => {
    if (open) {
      if (editing) { setName(editing.name); setBudget(String(editing.budgetAmount)); setIcon(editing.icon ?? "💰"); setColor(editing.color ?? COLORS[0]); }
      else { setName(""); setBudget(""); setIcon("💰"); setColor(COLORS[0]); }
    }
  }, [open, editing?.id]);

  function save() {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    mut.mutate({ name: name.trim(), budgetAmount: parseFloat(budget) || 0, icon, color, sortOrder: editing?.sortOrder ?? categories.length });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex gap-2">
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-16 text-center text-lg" maxLength={2} />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="flex-1" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Monthly budget</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" type="number" className="pl-6" />
            </div>
          </div>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ background: c }}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`} />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={mut.isPending} className="flex-1">Save</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main BudgetPage ─────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");

  // Data
  const { data: categories = [] } = useQuery<BudgetCategory[]>({ queryKey: ["/api/budget-categories"] });
  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/subscriptions"] });
  const { data: receiptList = [] } = useQuery<Receipt[]>({
    queryKey: ["/api/receipts"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/receipts"); return r.json(); },
  });

  // Receipt state
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptCatFilter, setReceiptCatFilter] = useState("__none__");
  const [receiptEditModal, setReceiptEditModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [receiptForm, setReceiptForm] = useState({ merchant: "", amount: "", receiptDate: TODAY, categoryId: "__none__", notes: "" });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadReceiptMut = useMutation({
    mutationFn: async (formData: FormData) => {
      const r = await fetch(`${API_BASE}/api/receipts`, { method: "POST", body: formData });
      if (!r.ok) throw new Error("Upload failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/receipts"] }),
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });
  const updateReceiptMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/receipts/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/receipts"] }); setReceiptEditModal(false); },
  });
  const deleteReceiptMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/receipts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/receipts"] }),
  });

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setUploading(true);
    for (const file of arr) {
      const fd = new FormData();
      fd.append("file", file);
      await uploadReceiptMut.mutateAsync(fd).catch(() => {});
    }
    setUploading(false);
  }

  function openEditReceipt(r: Receipt) {
    setEditingReceipt(r);
    setReceiptForm({
      merchant: r.merchant ?? "",
      amount: r.amount ? String(r.amount) : "",
      receiptDate: r.receiptDate ?? TODAY,
      categoryId: r.categoryId ? String(r.categoryId) : "__none__",
      notes: r.notes ?? "",
    });
    setReceiptEditModal(true);
  }
  function saveReceiptEdit() {
    if (!editingReceipt) return;
    updateReceiptMut.mutate({ id: editingReceipt.id, d: {
      merchant: receiptForm.merchant.trim() || null,
      amount: receiptForm.amount ? parseFloat(receiptForm.amount) : null,
      receiptDate: receiptForm.receiptDate || null,
      categoryId: receiptForm.categoryId !== "__none__" ? parseInt(receiptForm.categoryId) : null,
      notes: receiptForm.notes.trim() || null,
    }});
  }

  const filteredReceipts = useMemo(() => receiptList.filter((r) => {
    const matchSearch = !receiptSearch ||
      (r.merchant ?? "").toLowerCase().includes(receiptSearch.toLowerCase()) ||
      (r.originalName ?? "").toLowerCase().includes(receiptSearch.toLowerCase()) ||
      (r.notes ?? "").toLowerCase().includes(receiptSearch.toLowerCase());
    const matchCat = receiptCatFilter === "__none__" || String(r.categoryId) === receiptCatFilter;
    return matchSearch && matchCat;
  }), [receiptList, receiptSearch, receiptCatFilter]);

  // Group by category for organized view
  const receiptsByCategory = useMemo(() => {
    const map: Record<string, Receipt[]> = {};
    filteredReceipts.forEach((r) => {
      const key = r.categoryId ? String(r.categoryId) : "uncategorized";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [filteredReceipts]);

  function receiptUrl(filename: string) { return `/uploads/receipts/${filename}`; }
  function isPdf(mimeType: string) { return mimeType === "application/pdf"; }
  function fmtBytes(n: number) { return n < 1024 * 1024 ? `${(n/1024).toFixed(0)}KB` : `${(n/1024/1024).toFixed(1)}MB`; }

  // Category modal
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<BudgetCategory | null>(null);

  // Transaction modal
  const [txModal, setTxModal] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [txForm, setTxForm] = useState({ title: "", amount: "", type: "expense", categoryId: "__none__", date: TODAY, notes: "", recurring: "none" });

  // Subscription modal
  const [subModal, setSubModal] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [subForm, setSubForm] = useState({ name: "", amount: "", billingCycle: "monthly", nextRenewal: TODAY, categoryId: "__none__", notes: "", isActive: true, icon: "💳", color: "" });

  // Mutations
  const deleteCat = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/budget-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/budget-categories"] }),
  });
  const createTx = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/transactions", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/transactions"] }); setTxModal(false); },
    onError: () => toast({ title: "Error saving transaction", variant: "destructive" }),
  });
  const updateTx = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/transactions/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/transactions"] }); setTxModal(false); },
  });
  const deleteTx = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/transactions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/transactions"] }),
  });
  const createSub = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/subscriptions", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/subscriptions"] }); setSubModal(false); },
    onError: () => toast({ title: "Error saving subscription", variant: "destructive" }),
  });
  const updateSub = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/subscriptions/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/subscriptions"] }); setSubModal(false); },
  });
  const deleteSub = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/subscriptions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/subscriptions"] }),
  });

  // Auto-advance past-due subscriptions (runs once per subscription load)
  const autoAdvancedRef = useRef<Set<number>>(new Set());
  const autoAdvanceSub = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/subscriptions/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/subscriptions"] }),
  });
  useEffect(() => {
    if (!subscriptions.length) return;
    const CYCLE_DAYS: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    subscriptions.forEach((s) => {
      if (!s.isActive) return;
      if (autoAdvancedRef.current.has(s.id)) return;
      const days = daysUntil(s.nextRenewal);
      if (days >= 0) return;
      // Advance by cycle until renewal is in the future
      const cycleDays = CYCLE_DAYS[s.billingCycle] ?? 30;
      let newDate = new Date(s.nextRenewal + "T00:00:00");
      while (newDate <= today) newDate.setDate(newDate.getDate() + cycleDays);
      autoAdvancedRef.current.add(s.id);
      autoAdvanceSub.mutate({ id: s.id, d: { nextRenewal: newDate.toISOString().split("T")[0] } });
    });
  }, [subscriptions]);

  // Computed
  const thisMonthTx = useMemo(() => transactions.filter((t) => t.date.startsWith(THIS_MONTH)), [transactions]);
  const totalIncome = useMemo(() => thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0), [thisMonthTx]);
  const totalExpenses = useMemo(() => thisMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0), [thisMonthTx]);
  const activeSubs = useMemo(() => subscriptions.filter((s) => s.isActive), [subscriptions]);
  const monthlySubTotal = useMemo(() => activeSubs.reduce((s, sub) => s + monthlyAmount(sub.amount, sub.billingCycle), 0), [activeSubs]);
  const renewingSoon = useMemo(() => activeSubs.filter((s) => daysUntil(s.nextRenewal) <= 7 && daysUntil(s.nextRenewal) >= 0), [activeSubs]);

  // Category spend this month
  const catSpend = useMemo(() => {
    const map: Record<number, number> = {};
    thisMonthTx.filter((t) => t.type === "expense" && t.categoryId).forEach((t) => {
      map[t.categoryId!] = (map[t.categoryId!] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [thisMonthTx]);

  function openAddTx() {
    setEditTx(null);
    setTxForm({ title: "", amount: "", type: "expense", categoryId: "__none__", date: TODAY, notes: "", recurring: "none" });
    setTxModal(true);
  }
  function openEditTx(t: Transaction) {
    setEditTx(t);
    setTxForm({ title: t.title, amount: String(Math.abs(t.amount)), type: t.type, categoryId: t.categoryId ? String(t.categoryId) : "__none__", date: t.date, notes: t.notes ?? "", recurring: t.recurring });
    setTxModal(true);
  }
  function saveTx() {
    if (!txForm.title.trim() || !txForm.amount) { toast({ title: "Title and amount required", variant: "destructive" }); return; }
    const payload = {
      title: txForm.title.trim(),
      amount: txForm.type === "expense" ? -Math.abs(parseFloat(txForm.amount)) : Math.abs(parseFloat(txForm.amount)),
      type: txForm.type,
      categoryId: txForm.categoryId !== "__none__" ? parseInt(txForm.categoryId) : null,
      date: txForm.date,
      notes: txForm.notes.trim() || null,
      recurring: txForm.recurring,
    };
    if (editTx) updateTx.mutate({ id: editTx.id, d: payload });
    else createTx.mutate(payload);
  }

  function openAddSub() {
    setEditSub(null);
    setSubForm({ name: "", amount: "", billingCycle: "monthly", nextRenewal: TODAY, categoryId: "__none__", notes: "", isActive: true, icon: "💳", color: "" });
    setSubModal(true);
  }
  function openEditSub(s: Subscription) {
    setEditSub(s);
    setSubForm({ name: s.name, amount: String(s.amount), billingCycle: s.billingCycle, nextRenewal: s.nextRenewal, categoryId: s.categoryId ? String(s.categoryId) : "__none__", notes: s.notes ?? "", isActive: s.isActive, icon: s.icon ?? "💳", color: s.color ?? "" });
    setSubModal(true);
  }
  function saveSub() {
    if (!subForm.name.trim() || !subForm.amount) { toast({ title: "Name and amount required", variant: "destructive" }); return; }
    const payload = {
      name: subForm.name.trim(),
      amount: parseFloat(subForm.amount),
      billingCycle: subForm.billingCycle,
      nextRenewal: subForm.nextRenewal,
      categoryId: subForm.categoryId !== "__none__" ? parseInt(subForm.categoryId) : null,
      notes: subForm.notes.trim() || null,
      isActive: subForm.isActive,
      icon: subForm.icon,
      color: subForm.color || null,
    };
    if (editSub) updateSub.mutate({ id: editSub.id, d: payload });
    else createSub.mutate(payload);
  }

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const catIcon = (id: number | null) => categories.find((c) => c.id === id)?.icon ?? "📂";
  const catColor = (id: number | null) => categories.find((c) => c.id === id)?.color ?? "hsl(210 80% 48%)";

  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet size={22} /> Budget</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openAddSub}><CreditCard size={14} /> + Subscription</Button>
          <Button size="sm" className="gap-1.5" onClick={openAddTx}><Plus size={15} /> + Transaction</Button>
        </div>
      </div>

      {/* Renewal alert */}
      {renewingSoon.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Renewals coming up</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {renewingSoon.map((s) => `${s.name} (${daysUntil(s.nextRenewal) === 0 ? "today" : `in ${daysUntil(s.nextRenewal)}d`})`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-emerald-500 mb-1"><TrendingUp size={15} /><span className="text-xs font-medium">Income</span></div>
          <p className="text-xl font-bold">{fmt(totalIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">This month</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-rose-500 mb-1"><TrendingDown size={15} /><span className="text-xs font-medium">Expenses</span></div>
          <p className="text-xl font-bold">{fmt(totalExpenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">This month</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-primary mb-1"><DollarSign size={15} /><span className="text-xs font-medium">Net</span></div>
          <p className={`text-xl font-bold ${totalIncome - totalExpenses >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {fmt(totalIncome - totalExpenses)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">This month</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-violet-500 mb-1"><RefreshCcw size={15} /><span className="text-xs font-medium">Subscriptions</span></div>
          <p className="text-xl font-bold">{fmt(monthlySubTotal)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">/mo ({activeSubs.length} active)</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-1.5">
            Subscriptions {renewingSoon.length > 0 && <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">{renewingSoon.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5">
            <ReceiptIcon size={14} /> Receipts
            {receiptList.length > 0 && <span className="ml-1 text-xs opacity-60">{receiptList.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          {categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Add budget categories to track spending by envelope.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEditCat(null); setCatModal(true); }}>
                <Plus size={14} className="mr-1" /> Add Category
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const spent = catSpend[cat.id] ?? 0;
                const pct = cat.budgetAmount > 0 ? Math.min(100, (spent / cat.budgetAmount) * 100) : 0;
                const over = spent > cat.budgetAmount && cat.budgetAmount > 0;
                return (
                  <div key={cat.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon ?? "📂"}</span>
                        <span className="font-medium text-sm">{cat.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditCat(cat); setCatModal(true); }} className="p-1 rounded hover:bg-secondary"><Pencil size={12} className="text-muted-foreground" /></button>
                        <button onClick={() => deleteCat.mutate(cat.id)} className="p-1 rounded hover:bg-secondary"><Trash2 size={12} className="text-muted-foreground hover:text-destructive" /></button>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className={over ? "text-rose-500 font-medium" : "text-muted-foreground"}>
                        {fmt(spent)} spent
                      </span>
                      {cat.budgetAmount > 0 && <span className="text-muted-foreground">of {fmt(cat.budgetAmount)}</span>}
                    </div>
                    {cat.budgetAmount > 0 && (
                      <Progress value={pct} className={`h-1.5 ${over ? "[&>div]:bg-rose-500" : ""}`} />
                    )}
                    {cat.budgetAmount > 0 && (
                      <p className={`text-xs mt-1.5 ${over ? "text-rose-500" : "text-muted-foreground"}`}>
                        {over ? `${fmt(spent - cat.budgetAmount)} over budget` : `${fmt(cat.budgetAmount - spent)} remaining`}
                      </p>
                    )}
                  </div>
                );
              })}
              <button onClick={() => { setEditCat(null); setCatModal(true); }}
                className="rounded-xl border border-dashed bg-card p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-secondary transition-colors">
                <Plus size={16} /> Add Category
              </button>
            </div>
          )}
        </TabsContent>

        {/* TRANSACTIONS */}
        <TabsContent value="transactions">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">All Transactions</h2>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openAddTx}><Plus size={14} /> Add</Button>
          </div>
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No transactions yet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAddTx}><Plus size={14} className="mr-1" /> Add Transaction</Button>
            </div>
          ) : (
            <div className="space-y-1">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-secondary/50 transition-colors group">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{ background: t.categoryId ? catColor(t.categoryId) + "30" : "hsl(var(--secondary))" }}>
                    {t.categoryId ? catIcon(t.categoryId) : (t.type === "income" ? "💵" : "💸")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{new Date(t.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {t.categoryId && <Badge variant="secondary" className="text-[10px] py-0 px-1">{catName(t.categoryId)}</Badge>}
                      {t.recurring !== "none" && <Badge variant="outline" className="text-[10px] py-0 px-1"><RefreshCcw size={9} className="mr-0.5" />{t.recurring}</Badge>}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
                    {t.type === "income" ? "+" : "-"}{fmt(Math.abs(t.amount))}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditTx(t)} className="p-1 rounded hover:bg-background"><Pencil size={12} className="text-muted-foreground" /></button>
                    <button onClick={() => deleteTx.mutate(t.id)} className="p-1 rounded hover:bg-background"><Trash2 size={12} className="text-muted-foreground hover:text-destructive" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SUBSCRIPTIONS */}
        <TabsContent value="subscriptions">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Subscriptions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly total: {fmt(monthlySubTotal)}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openAddSub}><Plus size={14} /> Add</Button>
          </div>
          {subscriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCcw size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No subscriptions tracked yet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAddSub}><Plus size={14} className="mr-1" /> Add Subscription</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subscriptions.map((s) => {
                const days = daysUntil(s.nextRenewal);
                const soon = days <= 7 && days >= 0;
                const overdue = days < 0;
                return (
                  <div key={s.id} className={`rounded-xl border bg-card p-4 ${!s.isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ background: s.color ? s.color + "30" : "hsl(var(--secondary))" }}>
                          {s.icon ?? "💳"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{BILLING_LABELS[s.billingCycle]} · {fmt(monthlyAmount(s.amount, s.billingCycle))}/mo</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditSub(s)} className="p-1 rounded hover:bg-secondary"><Pencil size={12} className="text-muted-foreground" /></button>
                        <button onClick={() => deleteSub.mutate(s.id)} className="p-1 rounded hover:bg-secondary"><Trash2 size={12} className="text-muted-foreground hover:text-destructive" /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${soon ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : overdue ? "bg-rose-500/15 text-rose-500" : "bg-secondary text-muted-foreground"}`}>
                        <Calendar size={11} />
                        {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Renews today" : `Renews in ${days}d`}
                      </div>
                      <span className="text-sm font-semibold">{fmt(s.amount)}</span>
                    </div>
                    {!s.isActive && <Badge variant="outline" className="mt-2 text-xs">Inactive</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CATEGORIES */}
        <TabsContent value="categories">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Budget Categories</h2>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditCat(null); setCatModal(true); }}><Plus size={14} /> Add</Button>
          </div>
          {categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No categories yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                  <span className="text-xl">{cat.icon ?? "📂"}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{cat.name}</p>
                    {cat.budgetAmount > 0 && <p className="text-xs text-muted-foreground">Budget: {fmt(cat.budgetAmount)}/mo</p>}
                  </div>
                  <div style={{ background: cat.color ?? "hsl(210 80% 48%)" }} className="w-3 h-3 rounded-full" />
                  <div className="flex gap-1">
                    <button onClick={() => { setEditCat(cat); setCatModal(true); }} className="p-1.5 rounded hover:bg-secondary"><Pencil size={13} className="text-muted-foreground" /></button>
                    <button onClick={() => deleteCat.mutate(cat.id)} className="p-1.5 rounded hover:bg-secondary"><Trash2 size={13} className="text-muted-foreground hover:text-destructive" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RECEIPTS */}
        <TabsContent value="receipts">
          {/* Upload zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="mb-4 flex items-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
              size="lg"
            >
              {uploading
                ? <><RefreshCcw size={16} className="animate-spin" /> Uploading…</>
                : <><Upload size={16} /> Upload Receipts</>}
            </Button>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP, or PDF · up to 20MB · select multiple at once</p>
          </div>

          {/* Filters */}
          {receiptList.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative flex-1 min-w-40">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={receiptSearch} onChange={(e) => setReceiptSearch(e.target.value)}
                  placeholder="Search merchant, notes…" className="pl-8 h-8 text-sm" />
              </div>
              <Select value={receiptCatFilter} onValueChange={setReceiptCatFilter}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Grid grouped by category */}
          {filteredReceipts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ReceiptIcon size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">{receiptList.length === 0 ? "No receipts yet. Upload one above." : "No receipts match your filters."}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(receiptsByCategory).map(([key, recs]) => {
                const cat = key === "uncategorized" ? null : categories.find((c) => String(c.id) === key);
                const label = cat ? `${cat.icon ?? "📂"} ${cat.name}` : "Uncategorized";
                return (
                  <div key={key}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      {label}
                      <span className="normal-case font-normal opacity-60">{recs.length} receipt{recs.length !== 1 ? "s" : ""}</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {recs.map((r) => (
                        <div key={r.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                          {/* Thumbnail */}
                          <div
                            className="relative h-32 bg-secondary flex items-center justify-center cursor-pointer"
                            onClick={() => !isPdf(r.mimeType) && setLightboxUrl(receiptUrl(r.filename))}
                          >
                            {isPdf(r.mimeType) ? (
                              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                <FileText size={32} />
                                <span className="text-xs">PDF</span>
                              </div>
                            ) : (
                              <img
                                src={receiptUrl(r.filename)}
                                alt={r.originalName}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            {/* Action overlay */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              {isPdf(r.mimeType) ? (
                                <a href={receiptUrl(r.filename)} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                                  <ExternalLink size={14} />
                                </a>
                              ) : (
                                <button onClick={() => setLightboxUrl(receiptUrl(r.filename))}
                                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                                  <FileImage size={14} />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); openEditReceipt(r); }}
                                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                                <Pencil size={14} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deleteReceiptMut.mutate(r.id); }}
                                className="p-2 rounded-full bg-white/20 hover:bg-red-500/60 text-white">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {/* Meta */}
                          <div className="p-2">
                            <p className="text-xs font-medium truncate">{r.merchant || r.originalName}</p>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {r.receiptDate ? new Date(r.receiptDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : new Date(r.uploadDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                              {r.amount && <span className="text-xs font-semibold">{fmt(r.amount)}</span>}
                            </div>
                            {r.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
            <X size={24} />
          </button>
          <img src={lightboxUrl} alt="Receipt" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Receipt edit modal */}
      <Dialog open={receiptEditModal} onOpenChange={(o) => { if (!o) setReceiptEditModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Receipt Details</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Merchant / Store</label>
              <Input value={receiptForm.merchant} onChange={(e) => setReceiptForm((f) => ({ ...f, merchant: e.target.value }))} placeholder="e.g. Walmart, Amazon" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input value={receiptForm.amount} onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" type="number" className="pl-6" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Receipt date</label>
                <Input type="date" value={receiptForm.receiptDate} onChange={(e) => setReceiptForm((f) => ({ ...f, receiptDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Category</label>
              <Select value={receiptForm.categoryId} onValueChange={(v) => setReceiptForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Notes</label>
              <Textarea value={receiptForm.notes} onChange={(e) => setReceiptForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any notes…" rows={2} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={saveReceiptEdit} disabled={updateReceiptMut.isPending} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => setReceiptEditModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category modal */}
      <CategoryModal open={catModal} onClose={() => { setCatModal(false); setEditCat(null); }} editing={editCat} categories={categories} />

      {/* Transaction modal */}
      <Dialog open={txModal} onOpenChange={(o) => { if (!o) setTxModal(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTx ? "Edit Transaction" : "Add Transaction"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <button onClick={() => setTxForm((f) => ({ ...f, type: "expense" }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${txForm.type === "expense" ? "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400" : "border-border hover:bg-secondary"}`}>
                Expense
              </button>
              <button onClick={() => setTxForm((f) => ({ ...f, type: "income" }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${txForm.type === "income" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-border hover:bg-secondary"}`}>
                Income
              </button>
            </div>
            <Input value={txForm.title} onChange={(e) => setTxForm((f) => ({ ...f, title: e.target.value }))} placeholder="Description" />
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" type="number" className="pl-6" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Date</label>
                <Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Category</label>
                <Select value={txForm.categoryId} onValueChange={(v) => setTxForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Recurring</label>
              <Select value={txForm.recurring} onValueChange={(v) => setTxForm((f) => ({ ...f, recurring: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea value={txForm.notes} onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} />
            <div className="flex gap-2 pt-1">
              <Button onClick={saveTx} disabled={createTx.isPending || updateTx.isPending} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => setTxModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription modal */}
      <Dialog open={subModal} onOpenChange={(o) => { if (!o) setSubModal(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <Input value={subForm.icon} onChange={(e) => setSubForm((f) => ({ ...f, icon: e.target.value }))} className="w-16 text-center text-lg" maxLength={2} />
              <Input value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} placeholder="Subscription name" className="flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input value={subForm.amount} onChange={(e) => setSubForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" type="number" className="pl-6" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Billing cycle</label>
                <Select value={subForm.billingCycle} onValueChange={(v) => setSubForm((f) => ({ ...f, billingCycle: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Next renewal</label>
                <Input type="date" value={subForm.nextRenewal} onChange={(e) => setSubForm((f) => ({ ...f, nextRenewal: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Category</label>
                <Select value={subForm.categoryId} onValueChange={(v) => setSubForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setSubForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-1.5 text-sm transition-colors ${subForm.isActive ? "text-emerald-500" : "text-muted-foreground"}`}>
                <div className={`w-8 h-4 rounded-full transition-colors relative ${subForm.isActive ? "bg-emerald-500" : "bg-muted"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${subForm.isActive ? "left-[18px]" : "left-0.5"}`} />
                </div>
                {subForm.isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <Textarea value={subForm.notes} onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} />
            <div className="flex gap-2 pt-1">
              <Button onClick={saveSub} disabled={createSub.isPending || updateSub.isPending} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => setSubModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
