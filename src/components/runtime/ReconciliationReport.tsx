"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ReportDefinition, FormDefinition, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import {
  Search,
  SlidersHorizontal,
  PackageCheck,
  TrendingUp,
  TrendingDown,
  History,
  ArrowRight,
  Layers,
  Printer,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface ReconciliationReportProps {
  report: ReportDefinition;
  primaryForm: FormDefinition;
  onAddPurchase?: () => void;
  onAddUsage?: () => void;
}

interface MatchedLedgerItem {
  id: string;
  type: "inflow" | "outflow";
  date: string;
  refNumber: string;
  partyOrDept: string;
  quantity: number;
  unitPrice?: number;
  totalCost?: number;
  notes?: string;
  rawRecord: RecordDefinition;
}

interface ProductReconciliationRow {
  product: RecordDefinition;
  productId: string;
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  totalPurchased: number;
  purchaseCount: number;
  totalUsed: number;
  usageCount: number;
  balanceStock: number;
  stockStatus: "healthy" | "low" | "depleted";
  ledger: MatchedLedgerItem[];
}

export const ReconciliationReport: React.FC<ReconciliationReportProps> = ({
  report,
  primaryForm,
  onAddPurchase,
  onAddUsage,
}) => {
  const { app, recordsMap } = useLiveApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "healthy" | "low" | "depleted">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [selectedProductRow, setSelectedProductRow] = useState<ProductReconciliationRow | null>(null);
  const [isLedgerDrawerOpen, setIsLedgerDrawerOpen] = useState(false);
  const [ledgerTab, setLedgerTab] = useState<"all" | "inflow" | "outflow">("all");

  const config = report.reconciliationConfig;

  const primaryRecords = useMemo(
    () => (app ? recordsMap[primaryForm.id] || [] : []),
    [app, recordsMap, primaryForm.id]
  );

  const inflowRecords = useMemo(
    () => (app && config?.inflowFormId ? recordsMap[config.inflowFormId] || [] : []),
    [app, recordsMap, config?.inflowFormId]
  );

  const outflowRecords = useMemo(
    () => (app && config?.outflowFormId ? recordsMap[config.outflowFormId] || [] : []),
    [app, recordsMap, config?.outflowFormId]
  );

  const inflowForm = useMemo(
    () => app?.forms.find((f) => f.id === config?.inflowFormId),
    [app?.forms, config?.inflowFormId]
  );

  const outflowForm = useMemo(
    () => app?.forms.find((f) => f.id === config?.outflowFormId),
    [app?.forms, config?.outflowFormId]
  );

  // Extract all categories for quick filters
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    primaryRecords.forEach((r) => {
      const cat = r.data?.field_prod_category || r.data?.category;
      if (cat) set.add(String(cat));
    });
    return Array.from(set);
  }, [primaryRecords]);

  // Aggregate Purchases & Usages matched by product ID
  const reconciliationData = useMemo<ProductReconciliationRow[]>(() => {
    if (!config) return [];

    return primaryRecords.map((prod) => {
      const pId = prod.id;
      const sku = String(prod.data?.field_prod_sku || prod.data?.sku || "PRD-???");
      const name = String(prod.data?.field_prod_name || prod.data?.name || "Unnamed Product");
      const category = String(prod.data?.field_prod_category || prod.data?.category || "General");
      const unitPrice = Number(prod.data?.field_prod_price || prod.data?.price) || 0;

      // Find all inward purchases matching this product
      const matchedInflow = inflowRecords.filter((rec) => {
        const matchVal = rec.data?.[config.inflowMatchFieldId];
        return matchVal === pId || matchVal === sku || matchVal === name;
      });

      // Find all outward usages matching this product
      const matchedOutflow = outflowRecords.filter((rec) => {
        const matchVal = rec.data?.[config.outflowMatchFieldId];
        return matchVal === pId || matchVal === sku || matchVal === name;
      });

      // Sum quantities
      let totalPurchased = 0;
      matchedInflow.forEach((rec) => {
        const qty = Number(rec.data?.[config.inflowQtyFieldId]) || 0;
        totalPurchased += qty;
      });

      let totalUsed = 0;
      matchedOutflow.forEach((rec) => {
        const qty = Number(rec.data?.[config.outflowQtyFieldId]) || 0;
        totalUsed += qty;
      });

      const balanceStock = totalPurchased - totalUsed;

      let stockStatus: "healthy" | "low" | "depleted" = "healthy";
      if (balanceStock <= 0) {
        stockStatus = "depleted";
      } else if (balanceStock <= 20) {
        stockStatus = "low";
      }

      // Build unified chronological ledger
      const ledger: MatchedLedgerItem[] = [];

      matchedInflow.forEach((rec) => {
        ledger.push({
          id: rec.id,
          type: "inflow",
          date: String(rec.data?.field_pur_date || rec.data?.date || rec.createdAt || ""),
          refNumber: String(rec.data?.field_pur_id || rec.id),
          partyOrDept: String(rec.data?.field_pur_supplier || rec.data?.supplier || "Vendor"),
          quantity: Number(rec.data?.[config.inflowQtyFieldId]) || 0,
          unitPrice: Number(rec.data?.field_pur_unit_price || rec.data?.unit_price) || 0,
          totalCost: Number(rec.data?.field_pur_total_cost || rec.data?.total_cost) || 0,
          notes: String(rec.data?.field_pur_notes || rec.data?.notes || ""),
          rawRecord: rec,
        });
      });

      matchedOutflow.forEach((rec) => {
        ledger.push({
          id: rec.id,
          type: "outflow",
          date: String(rec.data?.field_use_date || rec.data?.date || rec.createdAt || ""),
          refNumber: String(rec.data?.field_use_id || rec.id),
          partyOrDept: String(rec.data?.field_use_department || rec.data?.department || "Operations"),
          quantity: Number(rec.data?.[config.outflowQtyFieldId]) || 0,
          notes: String(rec.data?.field_use_reason || rec.data?.reason || rec.data?.notes || ""),
          rawRecord: rec,
        });
      });

      // Sort ledger newest first
      ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        product: prod,
        productId: pId,
        sku,
        name,
        category,
        unitPrice,
        totalPurchased,
        purchaseCount: matchedInflow.length,
        totalUsed,
        usageCount: matchedOutflow.length,
        balanceStock,
        stockStatus,
        ledger,
      };
    });
  }, [primaryRecords, inflowRecords, outflowRecords, config]);

  // Overall KPI Statistics
  const stats = useMemo(() => {
    let totalPurchasedUnits = 0;
    let totalUsedUnits = 0;
    let totalStockUnits = 0;

    reconciliationData.forEach((row) => {
      totalPurchasedUnits += row.totalPurchased;
      totalUsedUnits += row.totalUsed;
      totalStockUnits += row.balanceStock;
    });

    return {
      totalProducts: reconciliationData.length,
      totalPurchasedUnits,
      totalUsedUnits,
      totalStockUnits,
    };
  }, [reconciliationData]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return reconciliationData.filter((row) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          row.name.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Status
      if (statusFilter !== "ALL" && row.stockStatus !== statusFilter) {
        return false;
      }

      // Category
      if (categoryFilter !== "ALL" && row.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [reconciliationData, searchQuery, statusFilter, categoryFilter]);

  const handleOpenLedger = (row: ProductReconciliationRow) => {
    setSelectedProductRow(row);
    setIsLedgerDrawerOpen(true);
    setLedgerTab("all");
  };

  const getStatusBadge = (status: "healthy" | "low" | "depleted") => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> In Stock
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" /> Low Stock
          </span>
        );
      case "depleted":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" /> Out of Stock
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{report.name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated No-Code Cross-Form Ledger: Reconciles <span className="font-semibold text-slate-700">{inflowForm?.name || "Purchases"}</span> vs{" "}
                <span className="font-semibold text-slate-700">{outflowForm?.name || "Usages"}</span> matched by Product.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {inflowForm && (
            <Link href={`/${app?.linkName}/${inflowForm.linkName}/new`}>
              <Button size="sm" variant="outline" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}>
                + New Purchase Entry
              </Button>
            </Link>
          )}

          {outflowForm && (
            <Link href={`/${app?.linkName}/${outflowForm.linkName}/new`}>
              <Button size="sm" variant="outline" icon={<TrendingDown className="w-3.5 h-3.5 text-amber-600" />}>
                + New Material Usage
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Top Reconciliation KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tracked Products</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.totalProducts}</div>
          <span className="text-[11px] text-slate-400">Inventory Catalog SKUs</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 font-semibold">Total Inward Purchased</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{stats.totalPurchasedUnits} units</div>
          <span className="text-[11px] text-slate-400">From all Supplier entries</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-600 font-semibold">Total Outward Consumed</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{stats.totalUsedUnits} units</div>
          <span className="text-[11px] text-slate-400">Across all Departments</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-600 font-semibold">Net Available Balance</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-700">{stats.totalStockUnits} units</div>
          <span className="text-[11px] text-slate-400">Purchased - Used Stock</span>
        </div>
      </div>

      {/* Main Reconciliation Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Search & Quick Filters Toolbar */}
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Product or SKU..."
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400 shadow-2xs"
              />
            </div>

            {/* Quick Filter: Stock Status Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  statusFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-3xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setStatusFilter("healthy")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  statusFilter === "healthy"
                    ? "bg-white text-emerald-700 shadow-3xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                In Stock
              </button>
              <button
                onClick={() => setStatusFilter("low")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  statusFilter === "low"
                    ? "bg-white text-amber-700 shadow-3xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Low Stock
              </button>
              <button
                onClick={() => setStatusFilter("depleted")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  statusFilter === "depleted"
                    ? "bg-white text-rose-700 shadow-3xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Depleted
              </button>
            </div>

            {/* Quick Filter: Category Dropdown */}
            {availableCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    Category: {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="text-xs text-slate-400 self-end md:self-center">
            Showing <span className="font-semibold text-slate-700">{filteredRows.length}</span> of{" "}
            {reconciliationData.length} matched products
          </div>
        </div>

        {/* Matched Data Table */}
        <div className="overflow-x-auto min-w-full">
          <table className="w-full min-w-[900px] text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-[#f8fafc] text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 font-semibold text-slate-700">Product SKU & Name</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3.5 font-semibold text-emerald-700 text-right">
                  Total Purchased (Inward)
                </th>
                <th className="px-4 py-3.5 font-semibold text-amber-700 text-right">
                  Total Used (Outward)
                </th>
                <th className="px-4 py-3.5 font-semibold text-blue-700 text-right">
                  Remaining Balance
                </th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-center">Status</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-center">Audit Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <p className="font-medium text-slate-600">No matching reconciliation data found</p>
                    <p className="text-xs mt-1">Try adjusting your search or category filters</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const purchaseRatio =
                    row.totalPurchased > 0
                      ? Math.min(100, Math.round((row.totalUsed / row.totalPurchased) * 100))
                      : 0;

                  return (
                    <tr
                      key={row.productId}
                      onClick={() => handleOpenLedger(row)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {row.name}
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">{row.sku}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                          {row.category}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="font-bold text-emerald-700 text-sm">{row.totalPurchased} units</div>
                        <span className="text-[11px] text-slate-400">
                          {row.purchaseCount} purchase entr{row.purchaseCount === 1 ? "y" : "ies"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="font-bold text-amber-700 text-sm">{row.totalUsed} units</div>
                        <span className="text-[11px] text-slate-400">
                          {row.usageCount} usage voucher{row.usageCount === 1 ? "" : "s"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div
                          className={`font-bold text-base ${
                            row.balanceStock <= 0
                              ? "text-rose-600"
                              : row.balanceStock <= 20
                              ? "text-amber-600"
                              : "text-blue-700"
                          }`}
                        >
                          {row.balanceStock} units
                        </div>
                        {/* Usage Progress Bar */}
                        <div className="w-24 ml-auto mt-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              purchaseRatio > 90
                                ? "bg-rose-500"
                                : purchaseRatio > 60
                                ? "bg-amber-500"
                                : "bg-blue-500"
                            }`}
                            style={{ width: `${purchaseRatio}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">{purchaseRatio}% consumed</span>
                      </td>

                      <td className="px-4 py-3.5 text-center">{getStatusBadge(row.stockStatus)}</td>

                      <td className="px-4 py-3.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLedger(row);
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <History className="w-3.5 h-3.5 mr-1" />
                          Ledger ({row.ledger.length})
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matched Transaction History Slide-Over Drawer */}
      {isLedgerDrawerOpen && selectedProductRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div
            className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    {selectedProductRow.sku}
                  </span>
                  <h2 className="text-base font-bold text-slate-900">{selectedProductRow.name}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Complete Matched Transaction Audit History (Zero Code Reconciliation)
                </p>
              </div>

              <button
                onClick={() => setIsLedgerDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary Header Strip */}
            <div className="p-4 bg-blue-50/50 border-b border-blue-100 grid grid-cols-3 gap-3 text-center shrink-0">
              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-3xs">
                <span className="text-[11px] text-slate-500 font-medium">Purchased (Inflow)</span>
                <div className="text-base font-bold text-emerald-600 mt-0.5">
                  +{selectedProductRow.totalPurchased}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-3xs">
                <span className="text-[11px] text-slate-500 font-medium">Used (Outflow)</span>
                <div className="text-base font-bold text-amber-600 mt-0.5">
                  -{selectedProductRow.totalUsed}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-3xs">
                <span className="text-[11px] text-slate-500 font-medium">Net Stock Balance</span>
                <div className="text-base font-bold text-blue-700 mt-0.5">
                  {selectedProductRow.balanceStock}
                </div>
              </div>
            </div>

            {/* Filter Tabs (All / Purchases / Usages) */}
            <div className="px-5 pt-3 pb-2 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setLedgerTab("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ledgerTab === "all"
                      ? "bg-slate-900 text-white font-semibold shadow-3xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  All Transactions ({selectedProductRow.ledger.length})
                </button>
                <button
                  onClick={() => setLedgerTab("inflow")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ledgerTab === "inflow"
                      ? "bg-emerald-600 text-white font-semibold shadow-3xs"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Inward Purchases ({selectedProductRow.purchaseCount})
                </button>
                <button
                  onClick={() => setLedgerTab("outflow")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ledgerTab === "outflow"
                      ? "bg-amber-600 text-white font-semibold shadow-3xs"
                      : "text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  Material Usages ({selectedProductRow.usageCount})
                </button>
              </div>

              <span className="text-[11px] text-slate-400">Chronological Order</span>
            </div>

            {/* Ledger Transactions List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedProductRow.ledger
                .filter((item) => (ledgerTab === "all" ? true : item.type === ledgerTab))
                .map((item, idx) => {
                  const isInflow = item.type === "inflow";

                  return (
                    <div
                      key={item.id + idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isInflow
                          ? "bg-emerald-50/30 border-emerald-200/70 hover:border-emerald-300"
                          : "bg-amber-50/30 border-amber-200/70 hover:border-amber-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isInflow
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {isInflow ? "+" : "-"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 text-xs">
                                {isInflow ? "Inward Purchase Entry" : "Material Usage Voucher"}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                {item.refNumber}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {isInflow ? "Supplier" : "Department"}:{" "}
                              <span className="font-semibold text-slate-700">{item.partyOrDept}</span>
                            </p>
                          </div>
                        </div>

                        {/* Quantity Badge */}
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold ${
                              isInflow ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {isInflow ? `+${item.quantity}` : `-${item.quantity}`} units
                          </div>
                          <span className="text-[10px] text-slate-400">{formatDate(item.date)}</span>
                        </div>
                      </div>

                      {/* Optional Notes or Cost details */}
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{item.notes || "No remarks noted"}</span>
                        {item.totalCost && item.totalCost > 0 && (
                          <span className="font-medium text-slate-700">
                            Cost: {formatCurrency(item.totalCost, "₹", 2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">Auto-calculated without writing any code</span>
              <Button size="sm" variant="outline" onClick={() => setIsLedgerDrawerOpen(false)}>
                Close Ledger
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
