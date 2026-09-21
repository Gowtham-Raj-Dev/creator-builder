/**
 * Formula engine — a safe expression evaluator (no eval / Function).
 *
 * Supports:
 *  - arithmetic  + - * / %        comparison  == != > < >= <=      logical && || !
 *  - ternary     cond ? a : b     parentheses, string/number/boolean/null literals
 *  - identifiers resolved from context (field linkName, id or label — case-insensitive)
 *  - member access  vendor.city_name   items.amount (array → mapped values)
 *  - function calls if(), sum(), round(), concat(), dateDiff(), today() … (see FUNCTIONS)
 *
 * Lookup fields hold a record id; `vendor.rate` is resolved through the
 * `__rec` companion objects produced by buildFormulaContext().
 */

import { FieldDefinition, FormDefinition, RecordDefinition, SubformColumn } from "@/types/schema";

type TokenType = "num" | "str" | "bool" | "null" | "ident" | "op" | "lparen" | "rparen" | "comma" | "dot" | "lbracket" | "rbracket" | "question" | "colon";
interface Token { type: TokenType; value: any; }

const TWO_CHAR_OPS = ["==", "!=", ">=", "<=", "&&", "||"];
const THREE_CHAR_OPS = ["===", "!=="];
const ONE_CHAR_OPS = ["+", "-", "*", "/", "%", ">", "<", "!"];

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;
  while (i < len) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(expr[i + 1] || ""))) {
      let s = "";
      while (i < len && /[0-9.]/.test(expr[i])) s += expr[i++];
      tokens.push({ type: "num", value: parseFloat(s) });
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch; i++;
      let s = "";
      while (i < len && expr[i] !== q) {
        if (expr[i] === "\\" && i + 1 < len) { i++; const e = expr[i]; s += e === "n" ? "\n" : e === "t" ? "\t" : e; }
        else s += expr[i];
        i++;
      }
      i++;
      tokens.push({ type: "str", value: s });
      continue;
    }
    if (ch === "(") { tokens.push({ type: "lparen", value: ch }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ch }); i++; continue; }
    if (ch === "[") { tokens.push({ type: "lbracket", value: ch }); i++; continue; }
    if (ch === "]") { tokens.push({ type: "rbracket", value: ch }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: ch }); i++; continue; }
    if (ch === ".") { tokens.push({ type: "dot", value: ch }); i++; continue; }
    if (ch === "?") { tokens.push({ type: "question", value: ch }); i++; continue; }
    if (ch === ":") { tokens.push({ type: "colon", value: ch }); i++; continue; }

    const three = expr.substr(i, 3);
    if (THREE_CHAR_OPS.includes(three)) { tokens.push({ type: "op", value: three.slice(0, 2) }); i += 3; continue; }
    const two = expr.substr(i, 2);
    if (TWO_CHAR_OPS.includes(two)) { tokens.push({ type: "op", value: two }); i += 2; continue; }
    if (ONE_CHAR_OPS.includes(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "=") { tokens.push({ type: "op", value: "==" }); i++; continue; } // tolerate single '='

    if (/[a-zA-Z_$]/.test(ch)) {
      let s = "";
      while (i < len && /[a-zA-Z0-9_$]/.test(expr[i])) s += expr[i++];
      const low = s.toLowerCase();
      if (low === "true") tokens.push({ type: "bool", value: true });
      else if (low === "false") tokens.push({ type: "bool", value: false });
      else if (low === "null" || low === "undefined") tokens.push({ type: "null", value: null });
      else if (low === "and") tokens.push({ type: "op", value: "&&" });
      else if (low === "or") tokens.push({ type: "op", value: "||" });
      else if (low === "not") tokens.push({ type: "op", value: "!" });
      else tokens.push({ type: "ident", value: s });
      continue;
    }
    i++; // unknown char → skip
  }
  return tokens;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function isBlank(v: any): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

function toNum(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-eE]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toDate(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return new Date(v);
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function fmtIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function flatten(args: any[]): any[] {
  const out: any[] = [];
  for (const a of args) {
    if (Array.isArray(a)) out.push(...flatten(a));
    else out.push(a);
  }
  return out;
}

function nums(args: any[]): number[] {
  return flatten(args).filter((v) => !isBlank(v)).map(toNum);
}

export const FUNCTIONS: Record<string, (args: any[], ctx: Record<string, any>) => any> = {
  // logic
  if: (a) => (a[0] ? a[1] : a[2]),
  ifs: (a) => { for (let i = 0; i + 1 < a.length; i += 2) if (a[i]) return a[i + 1]; return a.length % 2 ? a[a.length - 1] : undefined; },
  and: (a) => a.every(Boolean),
  or: (a) => a.some(Boolean),
  not: (a) => !a[0],
  isempty: (a) => isBlank(a[0]),
  isnotempty: (a) => !isBlank(a[0]),
  coalesce: (a) => a.find((v) => !isBlank(v)),
  ifempty: (a) => (isBlank(a[0]) ? a[1] : a[0]),
  // math
  abs: (a) => Math.abs(toNum(a[0])),
  round: (a) => { const p = Math.pow(10, toNum(a[1] ?? 0)); return Math.round(toNum(a[0]) * p) / p; },
  floor: (a) => Math.floor(toNum(a[0])),
  ceil: (a) => Math.ceil(toNum(a[0])),
  min: (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
  max: (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
  sum: (a) => nums(a).reduce((s, v) => s + v, 0),
  avg: (a) => { const n = nums(a); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0; },
  average: (a) => FUNCTIONS.avg(a, {}),
  count: (a) => flatten(a).filter((v) => !isBlank(v)).length,
  pow: (a) => Math.pow(toNum(a[0]), toNum(a[1])),
  sqrt: (a) => Math.sqrt(toNum(a[0])),
  mod: (a) => toNum(a[0]) % (toNum(a[1]) || 1),
  percent: (a) => (toNum(a[1]) ? (toNum(a[0]) / toNum(a[1])) * 100 : 0),
  number: (a) => toNum(a[0]),
  // text
  concat: (a) => flatten(a).map((v) => (isBlank(v) ? "" : String(v))).join(""),
  upper: (a) => String(a[0] ?? "").toUpperCase(),
  lower: (a) => String(a[0] ?? "").toLowerCase(),
  proper: (a) => String(a[0] ?? "").replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase()),
  trim: (a) => String(a[0] ?? "").trim(),
  len: (a) => (Array.isArray(a[0]) ? a[0].length : String(a[0] ?? "").length),
  length: (a) => FUNCTIONS.len(a, {}),
  left: (a) => String(a[0] ?? "").slice(0, toNum(a[1])),
  right: (a) => { const s = String(a[0] ?? ""); return s.slice(Math.max(0, s.length - toNum(a[1]))); },
  mid: (a) => String(a[0] ?? "").substr(toNum(a[1]), toNum(a[2])),
  substr: (a) => FUNCTIONS.mid(a, {}),
  replace: (a) => String(a[0] ?? "").split(String(a[1] ?? "")).join(String(a[2] ?? "")),
  contains: (a) => String(a[0] ?? "").toLowerCase().includes(String(a[1] ?? "").toLowerCase()),
  startswith: (a) => String(a[0] ?? "").toLowerCase().startsWith(String(a[1] ?? "").toLowerCase()),
  endswith: (a) => String(a[0] ?? "").toLowerCase().endsWith(String(a[1] ?? "").toLowerCase()),
  split: (a) => String(a[0] ?? "").split(String(a[1] ?? ",")),
  join: (a) => (Array.isArray(a[0]) ? a[0] : [a[0]]).join(String(a[1] ?? ", ")),
  text: (a) => (typeof a[0] === "number" ? a[0].toFixed(toNum(a[1] ?? 2)) : String(a[0] ?? "")),
  padleft: (a) => String(a[0] ?? "").padStart(toNum(a[1]), String(a[2] ?? "0")),
  // dates
  today: () => fmtIsoDate(new Date()),
  now: () => new Date().toISOString(),
  date: (a) => { const d = toDate(a[0]); return d ? fmtIsoDate(d) : ""; },
  year: (a) => toDate(a[0])?.getFullYear() ?? 0,
  month: (a) => (toDate(a[0]) ? toDate(a[0])!.getMonth() + 1 : 0),
  day: (a) => toDate(a[0])?.getDate() ?? 0,
  weekday: (a) => toDate(a[0])?.getDay() ?? 0,
  hour: (a) => toDate(a[0])?.getHours() ?? 0,
  datediff: (a) => {
    const d1 = toDate(a[0]); const d2 = toDate(a[1]);
    if (!d1 || !d2) return 0;
    const unit = String(a[2] ?? "days").toLowerCase();
    const ms = d2.getTime() - d1.getTime();
    if (unit.startsWith("hour")) return Math.round(ms / 36e5);
    if (unit.startsWith("min")) return Math.round(ms / 6e4);
    if (unit.startsWith("week")) return Math.round(ms / (7 * 864e5));
    if (unit.startsWith("month")) return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (unit.startsWith("year")) return d2.getFullYear() - d1.getFullYear();
    return Math.round(ms / 864e5);
  },
  dateadd: (a) => {
    const d = toDate(a[0]); if (!d) return "";
    const n = toNum(a[1]); const unit = String(a[2] ?? "days").toLowerCase();
    const out = new Date(d);
    if (unit.startsWith("month")) out.setMonth(out.getMonth() + n);
    else if (unit.startsWith("year")) out.setFullYear(out.getFullYear() + n);
    else if (unit.startsWith("week")) out.setDate(out.getDate() + n * 7);
    else if (unit.startsWith("hour")) out.setHours(out.getHours() + n);
    else out.setDate(out.getDate() + n);
    return String(a[0]).length > 10 ? out.toISOString() : fmtIsoDate(out);
  },
  formatdate: (a) => {
    const d = toDate(a[0]); if (!d) return "";
    const f = String(a[1] ?? "DD MMM YYYY");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return f
      .replace("YYYY", String(d.getFullYear()))
      .replace("YY", String(d.getFullYear()).slice(-2))
      .replace("MMM", months[d.getMonth()])
      .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
      .replace("DD", String(d.getDate()).padStart(2, "0"))
      .replace("HH", String(d.getHours()).padStart(2, "0"))
      .replace("mm", String(d.getMinutes()).padStart(2, "0"));
  },
  // context
  currentuser: (_a, ctx) => ctx.__user?.email || "",
  currentusername: (_a, ctx) => ctx.__user?.name || "",
  // collections
  first: (a) => (Array.isArray(a[0]) ? a[0][0] : a[0]),
  last: (a) => (Array.isArray(a[0]) ? a[0][a[0].length - 1] : a[0]),
  distinct: (a) => Array.from(new Set(flatten(a))),
  sumif: (a) => {
    // sumif(items.amount, items.type, "A")
    const vals = Array.isArray(a[0]) ? a[0] : [a[0]];
    const keys = Array.isArray(a[1]) ? a[1] : [a[1]];
    return vals.reduce((s: number, v: any, i: number) => (String(keys[i] ?? "") == String(a[2] ?? "") ? s + toNum(v) : s), 0);
  },
  countif: (a) => {
    const keys = Array.isArray(a[0]) ? a[0] : [a[0]];
    return keys.filter((k: any) => String(k ?? "") == String(a[1] ?? "")).length;
  },
};

export const FUNCTION_DOCS: Array<{ name: string; sig: string; desc: string; group: string }> = [
  { name: "if", sig: "if(condition, then, else)", desc: "Conditional value", group: "Logic" },
  { name: "ifs", sig: "ifs(c1, v1, c2, v2, default)", desc: "Multi-branch condition", group: "Logic" },
  { name: "isEmpty", sig: "isEmpty(value)", desc: "True when blank", group: "Logic" },
  { name: "coalesce", sig: "coalesce(a, b, …)", desc: "First non-empty", group: "Logic" },
  { name: "sum", sig: "sum(items.amount)", desc: "Total of numbers / subform column", group: "Math" },
  { name: "avg", sig: "avg(items.rate)", desc: "Average", group: "Math" },
  { name: "count", sig: "count(items.item)", desc: "Count of non-empty", group: "Math" },
  { name: "min / max", sig: "min(a, b)", desc: "Smallest / largest", group: "Math" },
  { name: "round", sig: "round(value, decimals)", desc: "Round to decimals", group: "Math" },
  { name: "abs", sig: "abs(value)", desc: "Absolute value", group: "Math" },
  { name: "percent", sig: "percent(part, whole)", desc: "part / whole × 100", group: "Math" },
  { name: "sumif", sig: "sumif(items.amount, items.type, \"A\")", desc: "Conditional sum", group: "Math" },
  { name: "concat", sig: "concat(first_name, \" \", last_name)", desc: "Join text", group: "Text" },
  { name: "upper / lower / proper", sig: "upper(name)", desc: "Change case", group: "Text" },
  { name: "len", sig: "len(text)", desc: "Text length", group: "Text" },
  { name: "left / right / mid", sig: "left(text, 3)", desc: "Substrings", group: "Text" },
  { name: "replace", sig: "replace(text, find, with)", desc: "Replace text", group: "Text" },
  { name: "contains", sig: "contains(text, \"abc\")", desc: "Text includes", group: "Text" },
  { name: "text", sig: "text(number, 2)", desc: "Format number to text", group: "Text" },
  { name: "today / now", sig: "today()", desc: "Current date / timestamp", group: "Date" },
  { name: "dateDiff", sig: "dateDiff(start, end, \"days\")", desc: "Difference (days/months/years/hours)", group: "Date" },
  { name: "dateAdd", sig: "dateAdd(date, 30, \"days\")", desc: "Add to a date", group: "Date" },
  { name: "year / month / day", sig: "year(order_date)", desc: "Date parts", group: "Date" },
  { name: "formatDate", sig: "formatDate(date, \"DD MMM YYYY\")", desc: "Format a date", group: "Date" },
  { name: "currentUser", sig: "currentUser()", desc: "Logged-in email", group: "Context" },
  { name: "lookup.field", sig: "vendor.city", desc: "Read a field from the looked-up record", group: "Lookup" },
];

// ── parser ───────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private ctx: Record<string, any>) {}

  private peek(offset = 0): Token | undefined { return this.tokens[this.pos + offset]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private isOp(v: string) { const t = this.peek(); return t?.type === "op" && t.value === v; }

  parse(): any {
    if (this.tokens.length === 0) return undefined;
    const v = this.parseTernary();
    return v;
  }

  private parseTernary(): any {
    const cond = this.parseOr();
    if (this.peek()?.type === "question") {
      this.next();
      const a = this.parseTernary();
      if (this.peek()?.type === "colon") this.next();
      const b = this.parseTernary();
      return cond ? a : b;
    }
    return cond;
  }

  private parseOr(): any {
    let left = this.parseAnd();
    while (this.isOp("||")) { this.next(); const right = this.parseAnd(); left = Boolean(left) || Boolean(right); }
    return left;
  }

  private parseAnd(): any {
    let left = this.parseEquality();
    while (this.isOp("&&")) { this.next(); const right = this.parseEquality(); left = Boolean(left) && Boolean(right); }
    return left;
  }

  private parseEquality(): any {
    let left = this.parseRelational();
    while (this.isOp("==") || this.isOp("!=")) {
      const op = this.next().value;
      const right = this.parseRelational();
      const eq = looseEquals(left, right);
      left = op === "==" ? eq : !eq;
    }
    return left;
  }

  private parseRelational(): any {
    let left = this.parseAdditive();
    while (this.isOp("<") || this.isOp(">") || this.isOp("<=") || this.isOp(">=")) {
      const op = this.next().value;
      const right = this.parseAdditive();
      const [l, r] = comparable(left, right);
      if (op === "<") left = l < r;
      else if (op === ">") left = l > r;
      else if (op === "<=") left = l <= r;
      else left = l >= r;
    }
    return left;
  }

  private parseAdditive(): any {
    let left = this.parseMultiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") left = String(left ?? "") + String(right ?? "");
        else left = toNum(left) + toNum(right);
      } else left = toNum(left) - toNum(right);
    }
    return left;
  }

  private parseMultiplicative(): any {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().value;
      const right = this.parseUnary();
      if (op === "*") left = toNum(left) * toNum(right);
      else if (op === "/") { const d = toNum(right); left = d === 0 ? 0 : toNum(left) / d; }
      else left = toNum(left) % (toNum(right) || 1);
    }
    return left;
  }

  private parseUnary(): any {
    if (this.isOp("!")) { this.next(); return !this.parseUnary(); }
    if (this.isOp("-")) { this.next(); return -toNum(this.parseUnary()); }
    if (this.isOp("+")) { this.next(); return toNum(this.parseUnary()); }
    return this.parsePostfix();
  }

  private parsePostfix(): any {
    let baseIdent: string | null = null;
    let value: any;

    const t = this.peek();
    if (!t) return undefined;

    if (t.type === "ident" && this.peek(1)?.type === "lparen") {
      // function call
      this.next(); this.next();
      const args = this.parseArgs();
      value = callFunction(t.value, args, this.ctx);
    } else if (t.type === "ident") {
      this.next();
      baseIdent = t.value;
      value = resolveIdentifier(t.value, this.ctx);
    } else {
      value = this.parsePrimary();
    }

    // postfix: .member  [index]
    while (true) {
      if (this.peek()?.type === "dot" && this.peek(1)?.type === "ident") {
        this.next();
        const member = this.next().value as string;
        value = memberAccess(value, member, baseIdent, this.ctx);
        baseIdent = null;
        continue;
      }
      if (this.peek()?.type === "lbracket") {
        this.next();
        const idx = this.parseTernary();
        if (this.peek()?.type === "rbracket") this.next();
        value = memberAccess(value, idx, baseIdent, this.ctx);
        baseIdent = null;
        continue;
      }
      break;
    }
    return value;
  }

  private parseArgs(): any[] {
    const args: any[] = [];
    if (this.peek()?.type === "rparen") { this.next(); return args; }
    while (this.pos < this.tokens.length) {
      args.push(this.parseTernary());
      if (this.peek()?.type === "comma") { this.next(); continue; }
      if (this.peek()?.type === "rparen") { this.next(); break; }
      break;
    }
    return args;
  }

  private parsePrimary(): any {
    const t = this.next();
    if (!t) return undefined;
    if (t.type === "num" || t.type === "str" || t.type === "bool" || t.type === "null") return t.value;
    if (t.type === "lparen") {
      const v = this.parseTernary();
      if (this.peek()?.type === "rparen") this.next();
      return v;
    }
    if (t.type === "lbracket") {
      const arr: any[] = [];
      while (this.peek() && this.peek()!.type !== "rbracket") {
        arr.push(this.parseTernary());
        if (this.peek()?.type === "comma") this.next();
      }
      this.next();
      return arr;
    }
    return undefined;
  }
}

function looseEquals(a: any, b: any): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === "number" || typeof b === "number") {
    if (!isNaN(Number(a)) && !isNaN(Number(b)) && String(a).trim() !== "" && String(b).trim() !== "") return Number(a) === Number(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    const asBool = (v: any) => (typeof v === "boolean" ? v : v === 1 || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes");
    return asBool(a) === asBool(b);
  }
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function comparable(a: any, b: any): [any, any] {
  const da = typeof a === "string" && /^\d{4}-\d{2}-\d{2}/.test(a) ? toDate(a) : null;
  const db = typeof b === "string" && /^\d{4}-\d{2}-\d{2}/.test(b) ? toDate(b) : null;
  if (da && db) return [da.getTime(), db.getTime()];
  if (typeof a === "string" && typeof b === "string" && isNaN(Number(a)) && isNaN(Number(b))) return [a.toLowerCase(), b.toLowerCase()];
  return [toNum(a), toNum(b)];
}

function callFunction(name: string, args: any[], ctx: Record<string, any>): any {
  const fn = FUNCTIONS[name.toLowerCase()];
  if (fn) return fn(args, ctx);
  const custom = ctx.__functions?.[name] || ctx.__functions?.[name.toLowerCase()];
  if (typeof custom === "function") return custom(...args);
  return undefined;
}

export function resolveIdentifier(name: string, ctx: Record<string, any>): any {
  if (name in ctx) return ctx[name];
  const low = name.toLowerCase();
  const key = Object.keys(ctx).find((k) => k.toLowerCase() === low || k.toLowerCase().replace(/\s+/g, "_") === low);
  if (key) return ctx[key];
  // Backward-compat: unknown bare identifiers act as unquoted string literals (status == active)
  return name;
}

function memberAccess(obj: any, member: any, baseIdent: string | null, ctx: Record<string, any>): any {
  if (Array.isArray(obj)) {
    if (typeof member === "number") return obj[member];
    return obj.map((row) => (row && typeof row === "object" ? pickMember(row, member) : undefined));
  }
  if (obj && typeof obj === "object") return pickMember(obj, member);
  // primitive (lookup record id) → resolved companion object
  if (baseIdent) {
    const rec = ctx[`${baseIdent}__rec`] ?? findCompanion(baseIdent, ctx);
    if (rec && typeof rec === "object") return pickMember(rec, member);
  }
  return undefined;
}

function findCompanion(name: string, ctx: Record<string, any>) {
  const low = name.toLowerCase();
  const key = Object.keys(ctx).find((k) => k.toLowerCase() === `${low}__rec`);
  return key ? ctx[key] : undefined;
}

function pickMember(obj: Record<string, any>, member: any): any {
  if (member in obj) return obj[member];
  const low = String(member).toLowerCase();
  const key = Object.keys(obj).find((k) => k.toLowerCase() === low);
  return key ? obj[key] : undefined;
}

// ── public API ───────────────────────────────────────────────────────────────

export function evaluateFormula(expression: string, context: Record<string, any>): any {
  if (!expression || typeof expression !== "string") return undefined;
  try {
    const tokens = tokenize(expression.trim());
    if (tokens.length === 0) return undefined;
    return new Parser(tokens, context).parse();
  } catch (err) {
    console.warn(`Formula error "${expression}":`, err);
    return undefined;
  }
}

/** Validate an expression syntactically (against a dummy context). */
export function validateFormulaSyntax(expression: string): { ok: boolean; error?: string } {
  try {
    const tokens = tokenize(expression);
    let depth = 0;
    for (const t of tokens) {
      if (t.type === "lparen") depth++;
      if (t.type === "rparen") depth--;
      if (depth < 0) return { ok: false, error: "Unexpected ')'" };
    }
    if (depth !== 0) return { ok: false, error: "Unbalanced parentheses" };
    for (const t of tokens) {
      if (t.type === "ident" && tokens[tokens.indexOf(t) + 1]?.type === "lparen" && !FUNCTIONS[t.value.toLowerCase()]) {
        return { ok: false, error: `Unknown function ${t.value}()` };
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid expression" };
  }
}

// ── context builder ──────────────────────────────────────────────────────────

export interface FormulaContextOptions {
  forms?: FormDefinition[];
  recordsMap?: Record<string, RecordDefinition[]>;
  user?: { email: string; name: string } | null;
  record?: RecordDefinition | null;
  depth?: number;
}

/**
 * Builds an evaluation context for a form's values:
 *  - every field reachable by id, linkName, label (and lowercase variants)
 *  - subform rows exposed as arrays keyed by column id & linkName
 *  - lookup fields: value = record id, plus `<link>__rec` companion with the target record's fields
 */
export function buildFormulaContext(
  form: FormDefinition | { fields: FieldDefinition[] },
  values: Record<string, any>,
  opts: FormulaContextOptions = {}
): Record<string, any> {
  const depth = opts.depth ?? 0;
  const ctx: Record<string, any> = { ...values };
  ctx.__user = opts.user || null;
  if (opts.record) {
    ctx.record_id = opts.record.id;
    ctx.created_at = opts.record.createdAt;
    ctx.created_by = opts.record.createdBy;
    ctx.updated_at = opts.record.updatedAt;
  }

  for (const field of form.fields) {
    if (field.type === "section") continue;
    let val = values[field.id] ?? values[field.linkName];

    if (field.type === "subform" && field.subform) {
      const rows = Array.isArray(val) ? val : [];
      val = rows.map((row) => expandRow(row, field.subform!.columns, opts, depth));
    }

    setAliases(ctx, field, val);

    if (field.type === "lookup" && field.lookup && depth < 3 && !isBlank(val)) {
      const targetForm = opts.forms?.find((f) => f.id === field.lookup!.targetFormId);
      const targetRecords = opts.recordsMap?.[field.lookup.targetFormId] || [];
      const ids = Array.isArray(val) ? val : [val];
      const recs = ids.map((id) => targetRecords.find((r) => r.id === id)).filter(Boolean) as RecordDefinition[];
      if (targetForm && recs.length) {
        const companions = recs.map((r) => buildFormulaContext(targetForm, r.data || {}, { ...opts, depth: depth + 1, record: r }));
        const companion = field.lookup.multiple ? companions : companions[0];
        ctx[`${field.id}__rec`] = companion;
        ctx[`${field.linkName}__rec`] = companion;
        ctx[`${field.label}__rec`] = companion;
      }
    }
  }
  return ctx;
}

function setAliases(ctx: Record<string, any>, field: { id: string; linkName: string; label: string }, val: any) {
  ctx[field.id] = val;
  ctx[field.linkName] = val;
  ctx[field.linkName.toLowerCase()] = val;
  ctx[field.label] = val;
  ctx[field.label.toLowerCase().replace(/\s+/g, "_")] = val;
}

export function expandRow(
  row: Record<string, any>,
  columns: SubformColumn[],
  opts: FormulaContextOptions = {},
  depth = 0
): Record<string, any> {
  const out: Record<string, any> = { ...row };
  for (const col of columns) {
    const v = row[col.id] ?? row[col.linkName];
    setAliases(out, col, v);
    if (col.type === "lookup" && col.lookup && depth < 3 && !isBlank(v)) {
      const targetForm = opts.forms?.find((f) => f.id === col.lookup!.targetFormId);
      const rec = (opts.recordsMap?.[col.lookup.targetFormId] || []).find((r) => r.id === v);
      if (targetForm && rec) {
        const companion = buildFormulaContext(targetForm, rec.data || {}, { ...opts, depth: depth + 1, record: rec });
        out[`${col.id}__rec`] = companion;
        out[`${col.linkName}__rec`] = companion;
      }
    }
  }
  return out;
}

/** Evaluate a row-level formula for a subform row. */
export function evaluateRowFormula(expression: string, row: Record<string, any>, columns: SubformColumn[], opts: FormulaContextOptions = {}): any {
  const ctx = expandRow(row, columns, opts);
  ctx.__user = opts.user || null;
  return evaluateFormula(expression, ctx);
}

/** Coerce a formula result to the configured result type. */
export function coerceFormulaResult(value: any, resultType: "number" | "text" | "date" | "boolean", decimals?: number): any {
  if (value === undefined || value === null) return resultType === "number" ? 0 : resultType === "boolean" ? false : "";
  switch (resultType) {
    case "number": {
      const n = toNum(value);
      const p = Math.pow(10, decimals ?? 2);
      return Math.round(n * p) / p;
    }
    case "boolean":
      return Boolean(value);
    case "date": {
      const d = toDate(value);
      return d ? fmtIsoDate(d) : "";
    }
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

/** Resolve dynamic default values like today(), now(), currentUser, or any formula. */
export function resolveDefaultValue(field: FieldDefinition, ctx: Record<string, any>): any {
  const dv = field.defaultValue;
  if (dv === undefined || dv === null) return undefined;
  if (typeof dv !== "string") return dv;
  const trimmed = dv.trim();
  const low = trimmed.toLowerCase();
  if (low === "today()" || low === "today") return FUNCTIONS.today([], ctx);
  if (low === "now()" || low === "now") return field.type === "date" ? FUNCTIONS.today([], ctx) : FUNCTIONS.now([], ctx);
  if (low === "currentuser" || low === "currentuser()") return ctx.__user?.email || "";
  if (low === "currentusername" || low === "currentusername()") return ctx.__user?.name || "";
  if (trimmed.startsWith("=")) return evaluateFormula(trimmed.slice(1), ctx);
  return dv;
}
