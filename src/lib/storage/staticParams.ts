/**
 * Static route parameters for Next.js static HTML export (GitHub Pages)
 */

export function getStaticAppParams() {
  return [{ app: "gowthamtest" }];
}

export function getStaticFormParams() {
  return [
    { app: "gowthamtest", form: "city" },
    { app: "gowthamtest", form: "customer" },
    { app: "gowthamtest", form: "product" },
    { app: "gowthamtest", form: "invoice" },
    { app: "gowthamtest", form: "purchase" },
    { app: "gowthamtest", form: "usage" },
  ];
}

export function getStaticReportParams() {
  return [
    { app: "gowthamtest", report: "customer_report" },
    { app: "gowthamtest", report: "city_report" },
    { app: "gowthamtest", report: "product_report" },
    { app: "gowthamtest", report: "invoice_report" },
    { app: "gowthamtest", report: "purchase_report" },
    { app: "gowthamtest", report: "usage_report" },
    { app: "gowthamtest", report: "stock_reconciliation" },
  ];
}

export function getStaticPageParams() {
  return [{ app: "gowthamtest", page: "dashboard" }];
}

export function getStaticRecordParams() {
  return [
    { app: "gowthamtest", form: "city", recordId: "rec_city_1" },
    { app: "gowthamtest", form: "customer", recordId: "rec_cust_1" },
    { app: "gowthamtest", form: "product", recordId: "rec_prod_1" },
    { app: "gowthamtest", form: "invoice", recordId: "rec_inv_1" },
    { app: "gowthamtest", form: "purchase", recordId: "rec_pur_1" },
    { app: "gowthamtest", form: "usage", recordId: "rec_use_1" },
  ];
}
