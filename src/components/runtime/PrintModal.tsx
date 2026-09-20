"use client";

import React, { useState, useMemo, useRef } from "react";
import { FormDefinition, RecordDefinition, FieldDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { Button } from "@/components/ui/Button";
import {
  Printer,
  X,
  Code,
  Eye,
  FileText,
  Receipt,
  LayoutTemplate,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Truck,
  FileCode,
  Palette,
  Terminal,
} from "lucide-react";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: FormDefinition;
  record?: RecordDefinition | null;
  records?: RecordDefinition[];
  reportName?: string;
}

export type PrintTemplateType =
  | "invoice"
  | "minimal"
  | "receipt"
  | "challan"
  | "record_sheet"
  | "custom";

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  form,
  record,
  records,
  reportName,
}) => {
  const { recordsMap } = useLiveApp();

  // All state hooks MUST be unconditional at the top
  const [templateType, setTemplateType] = useState<PrintTemplateType>("invoice");
  const [activeTab, setActiveTab] = useState<"html" | "css" | "js">("html");
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  // Custom editor states
  const [customHtml, setCustomHtml] = useState<string>("");
  const [customCss, setCustomCss] = useState<string>("");
  const [customJs, setCustomJs] = useState<string>("");

  const printFrameRef = useRef<HTMLIFrameElement>(null);

  // Resolve values for a given record and field
  const getFieldValue = (rec: RecordDefinition | null | undefined, field: FieldDefinition): string => {
    if (!rec) return "";
    const raw = rec.data?.[field.id];
    if (raw === undefined || raw === null || raw === "") return "";

    if (field.type === "lookup" && field.lookup) {
      const targetRecords = recordsMap[field.lookup.targetFormId] || [];
      return resolveLookupDisplay(raw, targetRecords, field.lookup.displayFieldId);
    }
    if (field.type === "currency") {
      return formatCurrency(raw, field.currencySymbol || "₹", field.decimalPlaces ?? 2);
    }
    if (field.type === "date") {
      return formatDate(raw);
    }
    if (field.type === "checkbox") {
      return raw ? "Yes" : "No";
    }
    return String(raw);
  };

  // Find subform field and rows
  const subformField = useMemo(() => form.fields.find((f) => f.type === "subform"), [form.fields]);
  const subformRows: any[] = useMemo(() => {
    if (!record || !subformField) return [];
    const val = record.data?.[subformField.id];
    return Array.isArray(val) ? val : [];
  }, [record, subformField]);

  // Available tags list
  const availableTags = useMemo(() => {
    const tags: { tag: string; label: string; desc: string; sampleVal: string }[] = [];

    for (const f of form.fields) {
      const val = record ? getFieldValue(record, f) : "-";
      tags.push({
        tag: `{{${f.linkName}}}`,
        label: f.label,
        desc: `Field: ${f.label}`,
        sampleVal: val,
      });
      tags.push({
        tag: `{{${form.linkName}.${f.linkName}}}`,
        label: `${form.name}.${f.label}`,
        desc: `Qualified: ${f.label}`,
        sampleVal: val,
      });
    }

    if (subformField && subformField.subform) {
      tags.push({
        tag: `{{#${subformField.linkName}}} ... {{/${subformField.linkName}}}`,
        label: `Loop: ${subformField.label}`,
        desc: "Repeat rows for subform line items",
        sampleVal: `${subformRows.length} item(s)`,
      });

      for (const col of subformField.subform.columns) {
        tags.push({
          tag: `{{${col.linkName}}}`,
          label: `Subform Column: ${col.label}`,
          desc: `Inside loop: ${col.label}`,
          sampleVal: "-",
        });
      }
    }

    return tags;
  }, [form, subformField, record, recordsMap]);

  // 1. Template: Modern Tax Invoice
  const templateInvoice = useMemo(() => {
    const primaryTitle = form.name;
    const subColHeaders = subformField?.subform?.columns.map((c) => `<th>${c.label}</th>`).join("") || "";

    const html = `
<div class="invoice-card">
  <div class="header">
    <div class="brand">
      <h1>${primaryTitle}</h1>
      <p>Official Tax Invoice &amp; Statement</p>
    </div>
    <div class="invoice-meta">
      <span class="badge">ORIGINAL FOR RECIPIENT</span>
      <h2>Invoice: {{invoice_no}}</h2>
      <p>Date: {{date}}</p>
    </div>
  </div>

  <div class="details-grid">
    <div class="detail-box">
      <h4>Billed To (Customer):</h4>
      <p class="customer-name"><strong>{{customer}}</strong></p>
      <p>{{phone}}</p>
      <p>{{email}}</p>
      <p>{{address}}</p>
    </div>
    <div class="detail-box">
      <h4>Invoice &amp; Payment Details:</h4>
      <p>Invoice No: <strong>{{invoice_no}}</strong></p>
      <p>Issue Date: <strong>{{date}}</strong></p>
      <p>Status: <span class="status-tag">Completed</span></p>
      <p>Currency: <strong>INR (₹)</strong></p>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        ${subColHeaders || "<th>Item Description</th><th>Quantity</th><th>Rate (₹)</th><th>Amount (₹)</th>"}
      </tr>
    </thead>
    <tbody>
      {{#items}}
    </tbody>
  </table>

  <div class="summary-wrap">
    <div class="summary-table">
      <div class="summary-row">
        <span>Subtotal:</span>
        <span>₹ {{subtotal}}</span>
      </div>
      <div class="summary-row">
        <span>Tax / GST:</span>
        <span>{{tax}} %</span>
      </div>
      <div class="summary-row grand-total">
        <span>Grand Total:</span>
        <span id="display-total">₹ {{total_amount}}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="terms">
      <h5>Terms &amp; Conditions</h5>
      <p>1. Payment is due within 15 days of invoice issue date.<br>
         2. Goods once sold will not be taken back.<br>
         3. This is a computer-generated tax invoice and requires no physical signature.</p>
    </div>
    <div class="signature">
      <div class="sig-line"></div>
      <span>Authorized Signatory</span>
    </div>
  </div>
</div>`;

    const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; padding: 32px; font-size: 13px; line-height: 1.5; }
.invoice-card { max-width: 820px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
.brand h1 { font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
.brand p { color: #64748b; font-size: 12px; margin-top: 4px; }
.invoice-meta { text-align: right; }
.badge { display: inline-block; background: #dbeafe; color: #1e40af; font-weight: 700; font-size: 10px; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
.invoice-meta h2 { font-size: 17px; font-weight: 700; color: #0f172a; }
.invoice-meta p { color: #64748b; font-size: 12px; margin-top: 2px; }
.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
.detail-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
.detail-box h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
.detail-box p { font-size: 13px; color: #0f172a; margin-bottom: 3px; }
.customer-name { font-size: 14px; font-weight: 700; color: #1e40af; }
.status-tag { background: #dcfce7; color: #166534; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
.items-table th { background: #f1f5f9; color: #334155; font-weight: 700; font-size: 11px; text-transform: uppercase; padding: 10px 14px; text-align: left; border-bottom: 1px solid #cbd5e1; }
.items-table td { padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
.items-table tr:last-child td { border-bottom: none; }
.summary-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }
.summary-table { width: 300px; }
.summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #475569; }
.summary-row.grand-total { border-top: 2px solid #0f172a; padding-top: 10px; font-size: 16px; font-weight: 800; color: #0f172a; }
.footer { margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: flex-end; }
.terms h5 { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; }
.terms p { font-size: 11px; color: #64748b; max-width: 440px; line-height: 1.4; }
.signature { text-align: center; }
.sig-line { width: 140px; border-bottom: 1px solid #475569; margin-bottom: 6px; }
.signature span { font-size: 11px; color: #64748b; font-weight: 600; }
@media print {
  body { padding: 0; background: transparent; }
  .invoice-card { border: none; box-shadow: none; padding: 0; }
}`;

    const js = `// Custom Script: Enhance invoice presentation
console.log("Rendering invoice for record:", window.record);
const totalElem = document.getElementById("display-total");
if (totalElem && totalElem.innerText.includes("undefined")) {
  totalElem.innerText = "₹ 0.00";
}`;

    return { html, css, js };
  }, [form, subformField]);

  // 2. Template: Minimal Clean Invoice
  const templateMinimal = useMemo(() => {
    const html = `
<div class="minimal-invoice">
  <div class="top-row">
    <div>
      <h1 class="logo">${form.name}</h1>
      <p class="sub">Invoice Reference: {{invoice_no}}</p>
    </div>
    <div class="meta-right">
      <p>Date: <strong>{{date}}</strong></p>
    </div>
  </div>

  <div class="bill-to">
    <span class="label">Invoiced To</span>
    <h3>{{customer}}</h3>
    <p>{{email}} &bull; {{phone}}</p>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Rate</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#items}}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="row"><span>Subtotal:</span><span>₹ {{subtotal}}</span></div>
    <div class="row"><span>Tax:</span><span>{{tax}}%</span></div>
    <div class="row total-row"><span>Total Payable:</span><span>₹ {{total_amount}}</span></div>
  </div>
</div>`;

    const css = `
body { font-family: "Georgia", serif; color: #111; padding: 40px; font-size: 13px; line-height: 1.6; }
.minimal-invoice { max-width: 750px; margin: 0 auto; }
.top-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
.logo { font-size: 24px; font-weight: 700; }
.bill-to { margin-bottom: 28px; }
.bill-to .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
.bill-to h3 { font-size: 18px; margin-top: 4px; }
.data-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
.data-table th { border-bottom: 1px solid #111; padding: 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.data-table td { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 12px; }
.totals-section { width: 240px; margin-left: auto; border-top: 1px solid #111; padding-top: 8px; }
.totals-section .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
.totals-section .total-row { font-weight: 700; font-size: 14px; border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; }
@media print { body { padding: 0; } }`;

    const js = `// Minimal template script ready`;
    return { html, css, js };
  }, [form]);

  // 3. Template: Official Receipt Voucher
  const templateReceipt = useMemo(() => {
    const html = `
<div class="receipt-box">
  <div class="receipt-head">
    <h2>OFFICIAL PAYMENT RECEIPT</h2>
    <p>${form.name}</p>
    <p class="receipt-num">Receipt No: <strong>REC-{{invoice_no}}</strong></p>
  </div>

  <div class="receipt-body">
    <div class="line-item">
      <span>Date of Issue:</span>
      <strong>{{date}}</strong>
    </div>
    <div class="line-item">
      <span>Received From:</span>
      <strong>{{customer}}</strong>
    </div>
    <div class="line-item">
      <span>Contact Details:</span>
      <span>{{phone}} | {{email}}</span>
    </div>
    <div class="line-item amount-highlight">
      <span>Amount Received:</span>
      <span class="amount-val">₹ {{total_amount}}</span>
    </div>
    <div class="line-item">
      <span>Payment Status:</span>
      <span class="badge-success">CONFIRMED &amp; PAID</span>
    </div>
  </div>

  <div class="receipt-foot">
    <div class="auth-box">
      <div class="stamp-box">PAID &bull; VERIFIED</div>
      <p>Authorized Signature</p>
    </div>
  </div>
</div>`;

    const css = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; font-size: 13px; color: #1e293b; }
.receipt-box { max-width: 520px; margin: 0 auto; border: 2px dashed #64748b; border-radius: 12px; padding: 28px; background: #fafafa; }
.receipt-head { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 20px; }
.receipt-head h2 { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; }
.receipt-head p { font-size: 12px; color: #64748b; margin-top: 2px; }
.receipt-num { font-family: monospace; font-size: 12px; color: #2563eb !important; margin-top: 4px; }
.receipt-body .line-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #cbd5e1; font-size: 13px; }
.amount-highlight { background: #eff6ff; padding: 10px 12px !important; border-radius: 8px; font-weight: 700; border: 1px solid #bfdbfe !important; margin: 12px 0; }
.amount-val { color: #1d4ed8; font-size: 17px; }
.badge-success { background: #dcfce7; color: #15803d; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.receipt-foot { margin-top: 24px; display: flex; justify-content: flex-end; }
.auth-box { text-align: center; }
.stamp-box { border: 2px solid #059669; color: #059669; font-weight: 800; font-size: 10px; padding: 4px 12px; border-radius: 4px; text-transform: uppercase; margin-bottom: 4px; display: inline-block; }
.auth-box p { font-size: 10px; color: #64748b; }
@media print { body { padding: 0; } .receipt-box { border: 1px solid #000; } }`;

    const js = `// Receipt template initialized`;
    return { html, css, js };
  }, [form]);

  // 4. Template: Delivery Challan
  const templateChallan = useMemo(() => {
    const html = `
<div class="challan-card">
  <div class="challan-header">
    <div>
      <h2>DELIVERY CHALLAN</h2>
      <p class="company">${form.name}</p>
    </div>
    <div class="meta">
      <p>Challan No: <strong>DC-{{invoice_no}}</strong></p>
      <p>Dispatch Date: <strong>{{date}}</strong></p>
    </div>
  </div>

  <div class="consignee-box">
    <h4>Delivery Address / Consignee:</h4>
    <p><strong>{{customer}}</strong></p>
    <p>{{phone}}</p>
    <p>{{address}}</p>
  </div>

  <table class="challan-table">
    <thead>
      <tr>
        <th>Item Name</th>
        <th style="text-align:center;">Quantity</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      {{#items}}
    </tbody>
  </table>

  <div class="acknowledgement">
    <div class="ack-col">
      <div class="line"></div>
      <p>Dispatched By (Driver / Logistics)</p>
    </div>
    <div class="ack-col">
      <div class="line"></div>
      <p>Received Goods in Good Condition (Customer Signature)</p>
    </div>
  </div>
</div>`;

    const css = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; font-size: 12px; color: #0f172a; }
.challan-card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 28px; border-radius: 8px; }
.challan-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
.challan-header h2 { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
.consignee-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; }
.consignee-box h4 { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
.challan-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
.challan-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-size: 11px; }
.challan-table td { border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 12px; }
.acknowledgement { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
.ack-col .line { border-bottom: 1px solid #0f172a; margin-bottom: 6px; }
.ack-col p { font-size: 10px; color: #64748b; text-align: center; }
@media print { body { padding: 0; } }`;

    const js = `// Delivery Challan initialized`;
    return { html, css, js };
  }, [form]);

  // 5. Template: Full Record Sheet
  const templateRecordSheet = useMemo(() => {
    if (record) {
      const rows = form.fields
        .filter((f) => f.type !== "subform")
        .map(
          (f) =>
            `<tr><td class="lbl">${f.label}</td><td class="val">{{${f.linkName}}}</td></tr>`
        )
        .join("");

      const html = `
<div class="sheet-wrap">
  <div class="sheet-head">
    <h2>${form.name} Record Sheet</h2>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
  </div>
  <table class="sheet-table">
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>`;

      const css = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; font-size: 13px; color: #1e293b; }
.sheet-wrap { max-width: 780px; margin: 0 auto; }
.sheet-head { border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 20px; }
.sheet-head h2 { font-size: 20px; font-weight: 800; }
.sheet-table { width: 100%; border-collapse: collapse; }
.sheet-table td { padding: 10px 14px; border: 1px solid #e2e8f0; }
.sheet-table td.lbl { width: 32%; font-weight: 600; background: #f8fafc; color: #475569; }
@media print { body { padding: 0; } }`;

      const js = `// Record sheet ready`;
      return { html, css, js };
    }

    // Multiple records
    const headers = form.fields
      .filter((f) => f.type !== "subform")
      .map((f) => `<th>${f.label}</th>`)
      .join("");

    const html = `
<div class="sheet-wrap">
  <div class="sheet-head">
    <h2>${reportName || form.name} (${(records || []).length} Records)</h2>
  </div>
  <table class="report-table">
    <thead><tr>${headers}</tr></thead>
    <tbody>
      {{#report_rows}}
    </tbody>
  </table>
</div>`;

    const css = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; font-size: 12px; color: #1e293b; }
.sheet-wrap { max-width: 100%; }
.sheet-head { margin-bottom: 16px; }
.report-table { width: 100%; border-collapse: collapse; }
.report-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
.report-table td { border: 1px solid #e2e8f0; padding: 8px 10px; }
@media print { body { padding: 0; } }`;

    const js = `// Multiple report sheet ready`;
    return { html, css, js };
  }, [form, record, records, reportName]);

  // Current active raw template components
  const activeTemplate = useMemo(() => {
    if (templateType === "invoice") return templateInvoice;
    if (templateType === "minimal") return templateMinimal;
    if (templateType === "receipt") return templateReceipt;
    if (templateType === "challan") return templateChallan;
    if (templateType === "record_sheet") return templateRecordSheet;

    // Custom
    return {
      html: customHtml || templateInvoice.html,
      css: customCss || templateInvoice.css,
      js: customJs || templateInvoice.js,
    };
  }, [
    templateType,
    templateInvoice,
    templateMinimal,
    templateReceipt,
    templateChallan,
    templateRecordSheet,
    customHtml,
    customCss,
    customJs,
  ]);

  // Switch template and update custom editors
  const handleSelectTemplate = (type: PrintTemplateType) => {
    setTemplateType(type);
    let target = templateInvoice;
    if (type === "minimal") target = templateMinimal;
    if (type === "receipt") target = templateReceipt;
    if (type === "challan") target = templateChallan;
    if (type === "record_sheet") target = templateRecordSheet;

    setCustomHtml(target.html);
    setCustomCss(target.css);
    setCustomJs(target.js);
  };

  // Compile final HTML document with field values, CSS styles, and JS runner
  const compiledDocument = useMemo(() => {
    let htmlContent = activeTemplate.html;

    if (record) {
      // 1. Replace field placeholders
      for (const field of form.fields) {
        const val = getFieldValue(record, field);
        htmlContent = htmlContent.replaceAll(`{{${field.linkName}}}`, val || "-");
        htmlContent = htmlContent.replaceAll(`{{${form.linkName}.${field.linkName}}}`, val || "-");
      }

      // Aliases
      const recData = record.data || {};
      for (const [k, v] of Object.entries(recData)) {
        if (typeof v !== "object") {
          htmlContent = htmlContent.replaceAll(`{{${k}}}`, String(v ?? ""));
        }
      }

      // 2. Subform loop
      if (subformField && subformField.subform) {
        const cols = subformField.subform.columns;
        const loopRegex = new RegExp(`{{#${subformField.linkName}}}([\\s\\S]*?){{/${subformField.linkName}}}`, "g");

        htmlContent = htmlContent.replace(loopRegex, (_, rowTemplate) => {
          if (subformRows.length === 0) {
            return `<tr><td colspan="${cols.length}" style="text-align:center; color:#94a3b8; padding:12px;">No line items</td></tr>`;
          }
          return subformRows
            .map((row) => {
              let rHtml = rowTemplate;
              for (const c of cols) {
                const cVal = row[c.id] ?? row[c.linkName] ?? "";
                rHtml = rHtml.replaceAll(`{{${c.linkName}}}`, String(cVal));
                rHtml = rHtml.replaceAll(`{{${c.id}}}`, String(cVal));
              }
              return rHtml;
            })
            .join("");
        });

        // Generic {{#items}}
        if (htmlContent.includes("{{#items}}")) {
          let rowsHtml = "";
          if (subformRows.length === 0) {
            rowsHtml = `<tr><td colspan="${cols.length}" style="text-align:center; color:#94a3b8; padding:12px;">No line items recorded</td></tr>`;
          } else {
            rowsHtml = subformRows
              .map((row) => {
                const tds = cols
                  .map((c) => {
                    const cVal = row[c.id] ?? row[c.linkName] ?? "";
                    return `<td>${cVal}</td>`;
                  })
                  .join("");
                return `<tr>${tds}</tr>`;
              })
              .join("");
          }
          htmlContent = htmlContent.replace("{{#items}}", rowsHtml);
        }
      }
    } else if (records) {
      // Multiple records
      const cols = form.fields.filter((f) => f.type !== "subform");
      const rowsHtml = records
        .map((rec) => {
          const tds = cols.map((col) => `<td>${getFieldValue(rec, col)}</td>`).join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      htmlContent = htmlContent.replaceAll("{{#report_rows}}", rowsHtml);
    }

    // Assemble complete document
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${form.name} Print Document</title>
  <style>
    ${activeTemplate.css}
  </style>
</head>
<body>
  ${htmlContent}

  <script>
    window.record = ${JSON.stringify(record || null)};
    window.formData = ${JSON.stringify(record?.data || {})};
    window.subformRows = ${JSON.stringify(subformRows)};
    window.fields = ${JSON.stringify(
      form.fields.map((f) => ({ id: f.id, label: f.label, linkName: f.linkName, type: f.type }))
    )};

    try {
      ${activeTemplate.js}
    } catch (err) {
      console.error("Custom Print JS Execution Error:", err);
    }
  </script>
</body>
</html>`;
  }, [activeTemplate, record, records, form, subformField, subformRows, recordsMap]);

  // Print execution in hidden iframe
  const handlePrint = () => {
    if (!printFrameRef.current) return;
    const iframe = printFrameRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(compiledDocument);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };

  const copyToClipboard = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  // CRITICAL FIX: The conditional return is placed AFTER all hooks have executed unconditionally
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-6xl w-full h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 overflow-hidden">
        {/* Top Header Bar */}
        <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-3xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Print &amp; Document Designer
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  HTML + CSS + JS Supported
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {record
                  ? `Printing record from ${form.name}`
                  : `Printing report for ${form.name} (${(records || []).length} records)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isEditorMode ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                if (!customHtml) {
                  setCustomHtml(activeTemplate.html);
                  setCustomCss(activeTemplate.css);
                  setCustomJs(activeTemplate.js);
                }
                setIsEditorMode(!isEditorMode);
              }}
              icon={isEditorMode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
            >
              {isEditorMode ? "Live Preview" : "Customize Code"}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              icon={<Printer className="w-4 h-4" />}
            >
              Print Document
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Template Switcher Bar */}
        <div className="px-6 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 overflow-x-auto gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1">Preset Designs:</span>
            <button
              onClick={() => handleSelectTemplate("invoice")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "invoice"
                  ? "bg-white text-blue-700 shadow-3xs border border-blue-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Tax Invoice
            </button>
            <button
              onClick={() => handleSelectTemplate("minimal")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "minimal"
                  ? "bg-white text-blue-700 shadow-3xs border border-blue-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Minimal
            </button>
            <button
              onClick={() => handleSelectTemplate("receipt")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "receipt"
                  ? "bg-white text-blue-700 shadow-3xs border border-blue-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Receipt Voucher
            </button>
            <button
              onClick={() => handleSelectTemplate("challan")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "challan"
                  ? "bg-white text-blue-700 shadow-3xs border border-blue-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Delivery Challan
            </button>
            <button
              onClick={() => handleSelectTemplate("record_sheet")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "record_sheet"
                  ? "bg-white text-blue-700 shadow-3xs border border-blue-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Record Sheet
            </button>
            <button
              onClick={() => {
                setTemplateType("custom");
                setIsEditorMode(true);
              }}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                templateType === "custom"
                  ? "bg-purple-50 text-purple-700 shadow-3xs border border-purple-200"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Custom Designer
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSelectTemplate(templateType)}
              className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 font-medium transition-colors"
              title="Reset template to original defaults"
            >
              <RotateCcw className="w-3 h-3" /> Reset Template
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-[#f8fafc]">
          {isEditorMode ? (
            /* Code Editor Mode (HTML, CSS, JS Tabs + Live Placeholders Sidebar) */
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Field Placeholders Sidebar */}
              <div className="w-80 border-r border-slate-200 bg-white p-4 overflow-y-auto space-y-3 shrink-0">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Form Field Placeholders
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Click any tag to copy. Paste into HTML or use <code className="text-blue-600 font-mono">window.formData</code> in JS.
                </p>

                <div className="space-y-1.5 pt-1">
                  {availableTags.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => copyToClipboard(item.tag)}
                      className="p-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-blue-700">
                          {item.tag}
                        </span>
                        {copiedTag === item.tag ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[10px] text-slate-500">
                        <span>{item.desc}</span>
                        {item.sampleVal && item.sampleVal !== "-" && (
                          <span className="text-slate-700 font-medium truncate max-w-[90px]">
                            {item.sampleVal}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* JS Context Info */}
                <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                  <span className="font-bold text-slate-700">JavaScript Environment:</span>
                  <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    &bull; window.record<br />
                    &bull; window.formData<br />
                    &bull; window.subformRows<br />
                    &bull; window.fields
                  </p>
                </div>
              </div>

              {/* Code Editor Tabs & Area */}
              <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
                {/* Editor Tabs */}
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-mono shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("html")}
                      className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                        activeTab === "html"
                          ? "bg-blue-600 text-white shadow-3xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" /> HTML Layout
                    </button>
                    <button
                      onClick={() => setActiveTab("css")}
                      className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                        activeTab === "css"
                          ? "bg-blue-600 text-white shadow-3xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Palette className="w-3.5 h-3.5" /> CSS Styles
                    </button>
                    <button
                      onClick={() => setActiveTab("js")}
                      className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                        activeTab === "js"
                          ? "bg-blue-600 text-white shadow-3xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" /> Custom JS Script
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 font-sans">
                    Live Preview Active on Right Tab
                  </span>
                </div>

                {/* Editor Inputs */}
                <div className="flex-1 p-4 flex flex-col min-h-0">
                  {activeTab === "html" && (
                    <textarea
                      value={customHtml || activeTemplate.html}
                      onChange={(e) => {
                        setCustomHtml(e.target.value);
                        setTemplateType("custom");
                      }}
                      className="w-full flex-1 bg-slate-950 text-slate-100 font-mono text-xs p-3 focus:outline-none leading-relaxed resize-none border border-slate-800 rounded-lg selection:bg-blue-600/40"
                      spellCheck={false}
                      placeholder="Enter custom HTML markup..."
                    />
                  )}

                  {activeTab === "css" && (
                    <textarea
                      value={customCss || activeTemplate.css}
                      onChange={(e) => {
                        setCustomCss(e.target.value);
                        setTemplateType("custom");
                      }}
                      className="w-full flex-1 bg-slate-950 text-emerald-300 font-mono text-xs p-3 focus:outline-none leading-relaxed resize-none border border-slate-800 rounded-lg selection:bg-emerald-600/40"
                      spellCheck={false}
                      placeholder="Enter custom CSS rules..."
                    />
                  )}

                  {activeTab === "js" && (
                    <textarea
                      value={customJs || activeTemplate.js}
                      onChange={(e) => {
                        setCustomJs(e.target.value);
                        setTemplateType("custom");
                      }}
                      className="w-full flex-1 bg-slate-950 text-amber-200 font-mono text-xs p-3 focus:outline-none leading-relaxed resize-none border border-slate-800 rounded-lg selection:bg-amber-600/40"
                      spellCheck={false}
                      placeholder="// Enter custom JavaScript logic..."
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Live Interactive Preview Frame */
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0 flex justify-center">
              <div className="w-full max-w-4xl bg-white shadow-lg border border-slate-200 rounded-xl overflow-hidden min-h-[680px] flex flex-col">
                <iframe
                  title="Print Preview"
                  srcDoc={compiledDocument}
                  className="w-full h-full min-h-[700px] border-0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Hidden Iframe for actual printing */}
        <iframe
          ref={printFrameRef}
          title="Print Runner"
          className="fixed -top-[9999px] -left-[9999px] w-0 h-0 opacity-0 pointer-events-none"
        />
      </div>
    </div>
  );
};
