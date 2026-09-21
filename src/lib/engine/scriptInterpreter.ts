/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A sandboxed JavaScript-subset interpreter (tokenizer → parser → tree-walking evaluator).
 * No eval / Function. No access to window, document, globalThis, prototypes or constructors.
 *
 * Supported: var/let/const, functions (declaration, expression, arrow), if/else if/else,
 * for / for-of / for-in / while / do-while, break/continue/return, try/catch/finally, throw,
 * ternary, template strings, arrays/objects (+ spread), destructuring (simple), ++/--,
 * compound assignment, optional chaining, nullish coalescing, method calls on
 * strings/arrays/numbers, and any host functions passed in `globals`.
 *
 * Execution is bounded by a step budget to stop infinite loops.
 */

// ── Lexer ────────────────────────────────────────────────────────────────────

type TokType = "num" | "str" | "tpl" | "ident" | "kw" | "punc" | "eof";
interface Tok { t: TokType; v: any; line: number; }

const KEYWORDS = new Set(["var", "let", "const", "function", "return", "if", "else", "for", "while", "do", "break", "continue", "true", "false", "null", "undefined", "new", "typeof", "in", "of", "try", "catch", "finally", "throw", "instanceof", "delete", "void"]);
const PUNCS = ["...", "===", "!==", "**=", "<<=", ">>=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "{", "}", "(", ")", "[", "]", ";", ",", ".", "+", "-", "*", "/", "%", "<", ">", "=", "!", "?", ":", "&", "|", "^", "~"];

export class ScriptSyntaxError extends Error {
  constructor(msg: string, public line: number) { super(`${msg} (line ${line})`); }
}
export class ScriptRuntimeError extends Error {}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let s = "";
      while (i < n && /[0-9a-fA-FxX._eE]/.test(src[i])) s += src[i++];
      out.push({ t: "num", v: Number(s.replace(/_/g, "")), line });
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      let s = "";
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { i++; const e = src[i]; s += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e; }
        else s += src[i];
        i++;
      }
      i++;
      out.push({ t: "str", v: s, line });
      continue;
    }
    if (c === "`") {
      i++;
      const parts: Array<{ str?: string; expr?: string }> = [];
      let s = "";
      while (i < n && src[i] !== "`") {
        if (src[i] === "$" && src[i + 1] === "{") {
          parts.push({ str: s }); s = "";
          i += 2;
          let depth = 1, e = "";
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            if (src[i] === "}") { depth--; if (depth === 0) break; }
            e += src[i++];
          }
          i++;
          parts.push({ expr: e });
        } else {
          if (src[i] === "\\") { i++; s += src[i]; }
          else { if (src[i] === "\n") line++; s += src[i]; }
          i++;
        }
      }
      i++;
      parts.push({ str: s });
      out.push({ t: "tpl", v: parts, line });
      continue;
    }
    if (/[a-zA-Z_$]/.test(c)) {
      let s = "";
      while (i < n && /[a-zA-Z0-9_$]/.test(src[i])) s += src[i++];
      out.push({ t: KEYWORDS.has(s) ? "kw" : "ident", v: s, line });
      continue;
    }
    const p = PUNCS.find((p) => src.startsWith(p, i));
    if (p) { out.push({ t: "punc", v: p, line }); i += p.length; continue; }
    throw new ScriptSyntaxError(`Unexpected character '${c}'`, line);
  }
  out.push({ t: "eof", v: null, line });
  return out;
}

// ── AST ──────────────────────────────────────────────────────────────────────

type Node = any;

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}
  private peek(o = 0) { return this.toks[this.i + o]; }
  private next() { return this.toks[this.i++]; }
  private is(v: string, t?: TokType) { const k = this.peek(); return k.v === v && (!t || k.t === t) && (k.t === "punc" || k.t === "kw"); }
  private eat(v: string) { if (!this.is(v)) throw new ScriptSyntaxError(`Expected '${v}' but found '${this.peek().v ?? "end"}'`, this.peek().line); return this.next(); }
  private opt(v: string) { if (this.is(v)) { this.next(); return true; } return false; }
  private skipSemi() { while (this.opt(";")) {/* */} }

  parseProgram(): Node[] {
    const body: Node[] = [];
    while (this.peek().t !== "eof") { body.push(this.parseStatement()); this.skipSemi(); }
    return body;
  }

  private parseBlock(): Node[] {
    this.eat("{");
    const body: Node[] = [];
    while (!this.is("}")) { if (this.peek().t === "eof") throw new ScriptSyntaxError("Unexpected end of script, missing '}'", this.peek().line); body.push(this.parseStatement()); this.skipSemi(); }
    this.eat("}");
    return body;
  }

  private parseStatement(): Node {
    const k = this.peek();
    if (k.t === "punc" && k.v === "{") return { type: "Block", body: this.parseBlock() };
    if (k.t === "kw") {
      switch (k.v) {
        case "var": case "let": case "const": return this.parseVar();
        case "function": return this.parseFunction(true);
        case "return": { this.next(); const arg = this.is(";") || this.is("}") || this.peek().t === "eof" || this.peek().line !== k.line ? null : this.parseExpression(); return { type: "Return", arg }; }
        case "if": return this.parseIf();
        case "for": return this.parseFor();
        case "while": { this.next(); this.eat("("); const test = this.parseExpression(); this.eat(")"); return { type: "While", test, body: this.parseStatement() }; }
        case "do": { this.next(); const body = this.parseStatement(); this.eat("while"); this.eat("("); const test = this.parseExpression(); this.eat(")"); return { type: "DoWhile", test, body }; }
        case "break": this.next(); return { type: "Break" };
        case "continue": this.next(); return { type: "Continue" };
        case "throw": { this.next(); return { type: "Throw", arg: this.parseExpression() }; }
        case "try": return this.parseTry();
      }
    }
    const expr = this.parseExpression();
    return { type: "ExprStmt", expr };
  }

  private parseVar(): Node {
    const kind = this.next().v;
    const decls: Node[] = [];
    do {
      const target = this.parseBindingTarget();
      let init = null;
      if (this.opt("=")) init = this.parseAssignment();
      decls.push({ target, init });
    } while (this.opt(","));
    return { type: "Var", kind, decls };
  }

  private parseBindingTarget(): Node {
    if (this.is("[")) { this.next(); const els: Node[] = []; while (!this.is("]")) { els.push(this.is(",") ? null : this.parseBindingTarget()); if (!this.is("]")) this.eat(","); } this.eat("]"); return { type: "ArrayPattern", els }; }
    if (this.is("{")) { this.next(); const props: Node[] = []; while (!this.is("}")) { const key = this.next().v; let target: Node = { type: "Identifier", name: key }; if (this.opt(":")) target = this.parseBindingTarget(); let def = null; if (this.opt("=")) def = this.parseAssignment(); props.push({ key, target, def }); if (!this.is("}")) this.eat(","); } this.eat("}"); return { type: "ObjectPattern", props }; }
    const t = this.next();
    if (t.t !== "ident") throw new ScriptSyntaxError(`Expected variable name, found '${t.v}'`, t.line);
    return { type: "Identifier", name: t.v };
  }

  private parseFunction(isDecl: boolean): Node {
    this.eat("function");
    let name: string | null = null;
    if (this.peek().t === "ident") name = this.next().v;
    const params = this.parseParams();
    const body = this.parseBlock();
    return { type: isDecl ? "FunctionDecl" : "FunctionExpr", name, params, body };
  }

  private parseParams(): Node[] {
    this.eat("(");
    const params: Node[] = [];
    while (!this.is(")")) {
      if (this.opt("...")) { params.push({ type: "Rest", target: this.parseBindingTarget() }); }
      else { const target = this.parseBindingTarget(); let def = null; if (this.opt("=")) def = this.parseAssignment(); params.push({ type: "Param", target, def }); }
      if (!this.is(")")) this.eat(",");
    }
    this.eat(")");
    return params;
  }

  private parseIf(): Node {
    this.eat("if"); this.eat("("); const test = this.parseExpression(); this.eat(")");
    const cons = this.parseStatement();
    this.skipSemi();
    let alt = null;
    if (this.opt("else")) alt = this.parseStatement();
    return { type: "If", test, cons, alt };
  }

  private parseFor(): Node {
    this.eat("for"); this.eat("(");
    let init: Node = null;
    if (!this.is(";")) {
      if (this.is("var") || this.is("let") || this.is("const")) {
        const kind = this.next().v;
        const target = this.parseBindingTarget();
        if (this.is("of") || this.is("in")) {
          const isOf = this.next().v === "of";
          const right = this.parseExpression();
          this.eat(")");
          return { type: isOf ? "ForOf" : "ForIn", kind, target, right, body: this.parseStatement() };
        }
        let initExpr = null;
        if (this.opt("=")) initExpr = this.parseAssignment();
        const decls = [{ target, init: initExpr }];
        while (this.opt(",")) { const t2 = this.parseBindingTarget(); let i2 = null; if (this.opt("=")) i2 = this.parseAssignment(); decls.push({ target: t2, init: i2 }); }
        init = { type: "Var", kind, decls };
      } else init = { type: "ExprStmt", expr: this.parseExpression() };
    }
    this.eat(";");
    const test = this.is(";") ? null : this.parseExpression();
    this.eat(";");
    const update = this.is(")") ? null : this.parseExpression();
    this.eat(")");
    return { type: "For", init, test, update, body: this.parseStatement() };
  }

  private parseTry(): Node {
    this.eat("try");
    const block = this.parseBlock();
    let param: string | null = null, handler: Node[] | null = null, finalizer: Node[] | null = null;
    if (this.opt("catch")) { if (this.opt("(")) { param = this.next().v; this.eat(")"); } handler = this.parseBlock(); }
    if (this.opt("finally")) finalizer = this.parseBlock();
    return { type: "Try", block, param, handler, finalizer };
  }

  parseExpression(): Node {
    let e = this.parseAssignment();
    while (this.is(",")) { this.next(); e = { type: "Seq", left: e, right: this.parseAssignment() }; }
    return e;
  }

  private parseAssignment(): Node {
    // arrow function detection
    if (this.peek().t === "ident" && this.peek(1).v === "=>" && this.peek(1).t === "punc") {
      const name = this.next().v; this.next();
      return { type: "Arrow", params: [{ type: "Param", target: { type: "Identifier", name }, def: null }], body: this.parseArrowBody() };
    }
    if (this.is("(") && this.looksLikeArrow()) {
      const params = this.parseParams(); this.eat("=>");
      return { type: "Arrow", params, body: this.parseArrowBody() };
    }
    const left = this.parseConditional();
    const k = this.peek();
    if (k.t === "punc" && ["=", "+=", "-=", "*=", "/=", "%=", "**="].includes(k.v)) {
      this.next();
      const right = this.parseAssignment();
      if (!["Identifier", "Member"].includes(left.type)) throw new ScriptSyntaxError("Invalid assignment target", k.line);
      return { type: "Assign", op: k.v, left, right };
    }
    return left;
  }

  private looksLikeArrow(): boolean {
    // scan to matching ')' and check for '=>'
    let depth = 0, j = this.i;
    while (j < this.toks.length) {
      const t = this.toks[j];
      if (t.t === "punc" && (t.v === "(" || t.v === "[" || t.v === "{")) depth++;
      if (t.t === "punc" && (t.v === ")" || t.v === "]" || t.v === "}")) { depth--; if (depth === 0) return this.toks[j + 1]?.v === "=>" && this.toks[j + 1]?.t === "punc"; }
      if (t.t === "eof") return false;
      j++;
    }
    return false;
  }

  private parseArrowBody(): Node {
    if (this.is("{")) return { type: "Block", body: this.parseBlock() };
    return { type: "ExprBody", expr: this.parseAssignment() };
  }

  private parseConditional(): Node {
    const test = this.parseBinary(0);
    if (this.is("?")) { this.next(); const a = this.parseAssignment(); this.eat(":"); const b = this.parseAssignment(); return { type: "Cond", test, a, b }; }
    return test;
  }

  private static PREC: Record<string, number> = { "??": 1, "||": 2, "&&": 3, "|": 4, "^": 5, "&": 6, "==": 7, "!=": 7, "===": 7, "!==": 7, "<": 8, ">": 8, "<=": 8, ">=": 8, "instanceof": 8, "in": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10, "**": 11 };

  private parseBinary(minPrec: number): Node {
    let left = this.parseUnary();
    while (true) {
      const k = this.peek();
      const op = (k.t === "punc" || k.t === "kw") ? k.v : null;
      const prec = op ? Parser.PREC[op] : undefined;
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parseBinary(op === "**" ? prec : prec + 1);
      left = ["&&", "||", "??"].includes(op) ? { type: "Logical", op, left, right } : { type: "Binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    const k = this.peek();
    if (k.t === "punc" && ["!", "-", "+", "~"].includes(k.v)) { this.next(); return { type: "Unary", op: k.v, arg: this.parseUnary() }; }
    if (k.t === "kw" && (k.v === "typeof" || k.v === "void" || k.v === "delete")) { this.next(); return { type: "Unary", op: k.v, arg: this.parseUnary() }; }
    if (k.t === "punc" && (k.v === "++" || k.v === "--")) { this.next(); return { type: "Update", op: k.v, prefix: true, arg: this.parseUnary() }; }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    const e = this.parseCallMember();
    const k = this.peek();
    if (k.t === "punc" && (k.v === "++" || k.v === "--") && k.line === this.toks[this.i - 1].line) { this.next(); return { type: "Update", op: k.v, prefix: false, arg: e }; }
    return e;
  }

  private parseCallMember(): Node {
    let e: Node;
    if (this.is("new")) {
      this.next();
      const callee = this.parsePrimary();
      const args = this.is("(") ? this.parseArgs() : [];
      e = { type: "New", callee, args };
    } else e = this.parsePrimary();
    while (true) {
      if (this.is(".")) { this.next(); const t = this.next(); e = { type: "Member", obj: e, prop: { type: "Literal", value: t.v }, computed: false }; continue; }
      if (this.is("?.")) { this.next(); if (this.is("(")) { e = { type: "Call", callee: e, args: this.parseArgs(), optional: true }; } else if (this.is("[")) { this.next(); const p = this.parseExpression(); this.eat("]"); e = { type: "Member", obj: e, prop: p, computed: true, optional: true }; } else { const t = this.next(); e = { type: "Member", obj: e, prop: { type: "Literal", value: t.v }, computed: false, optional: true }; } continue; }
      if (this.is("[")) { this.next(); const p = this.parseExpression(); this.eat("]"); e = { type: "Member", obj: e, prop: p, computed: true }; continue; }
      if (this.is("(")) { e = { type: "Call", callee: e, args: this.parseArgs() }; continue; }
      break;
    }
    return e;
  }

  private parseArgs(): Node[] {
    this.eat("(");
    const args: Node[] = [];
    while (!this.is(")")) {
      if (this.opt("...")) args.push({ type: "Spread", arg: this.parseAssignment() });
      else args.push(this.parseAssignment());
      if (!this.is(")")) this.eat(",");
    }
    this.eat(")");
    return args;
  }

  private parsePrimary(): Node {
    const k = this.next();
    if (k.t === "num" || k.t === "str") return { type: "Literal", value: k.v };
    if (k.t === "tpl") return { type: "Template", parts: k.v.map((p: any) => (p.expr !== undefined ? { expr: new Parser(lex(p.expr)).parseExpression() } : { str: p.str })) };
    if (k.t === "kw") {
      if (k.v === "true") return { type: "Literal", value: true };
      if (k.v === "false") return { type: "Literal", value: false };
      if (k.v === "null") return { type: "Literal", value: null };
      if (k.v === "undefined") return { type: "Literal", value: undefined };
      if (k.v === "function") { this.i--; return this.parseFunction(false); }
      throw new ScriptSyntaxError(`Unexpected keyword '${k.v}'`, k.line);
    }
    if (k.t === "ident") return { type: "Identifier", name: k.v };
    if (k.t === "punc") {
      if (k.v === "(") { const e = this.parseExpression(); this.eat(")"); return e; }
      if (k.v === "[") { const els: Node[] = []; while (!this.is("]")) { if (this.opt("...")) els.push({ type: "Spread", arg: this.parseAssignment() }); else els.push(this.parseAssignment()); if (!this.is("]")) this.eat(","); } this.eat("]"); return { type: "ArrayExpr", els }; }
      if (k.v === "{") {
        const props: Node[] = [];
        while (!this.is("}")) {
          if (this.opt("...")) { props.push({ spread: this.parseAssignment() }); }
          else {
            let key: Node; let computed = false;
            if (this.is("[")) { this.next(); key = this.parseAssignment(); this.eat("]"); computed = true; }
            else { const t = this.next(); key = { type: "Literal", value: t.v }; if (t.t === "ident" && (this.is(",") || this.is("}"))) { props.push({ key, value: { type: "Identifier", name: t.v } }); if (!this.is("}")) this.eat(","); continue; } }
            if (this.is("(")) { const params = this.parseParams(); const body = this.parseBlock(); props.push({ key, computed, value: { type: "FunctionExpr", params, body } }); }
            else { this.eat(":"); props.push({ key, computed, value: this.parseAssignment() }); }
          }
          if (!this.is("}")) this.eat(",");
        }
        this.eat("}");
        return { type: "ObjectExpr", props };
      }
    }
    throw new ScriptSyntaxError(`Unexpected token '${k.v ?? "end of script"}'`, k.line);
  }
}

// ── Interpreter ──────────────────────────────────────────────────────────────

class Scope {
  vars = new Map<string, { value: any; const: boolean }>();
  constructor(public parent: Scope | null) {}
  lookup(name: string): Scope | null { let s: Scope | null = this; // eslint-disable-line @typescript-eslint/no-this-alias
    while (s) { if (s.vars.has(name)) return s; s = s.parent; } return null; }
  get(name: string) { const s = this.lookup(name); if (!s) throw new ScriptRuntimeError(`${name} is not defined`); return s.vars.get(name)!.value; }
  set(name: string, value: any) { const s = this.lookup(name); if (!s) { this.vars.set(name, { value, const: false }); return; } const v = s.vars.get(name)!; if (v.const) throw new ScriptRuntimeError(`Cannot assign to constant '${name}'`); v.value = value; }
  declare(name: string, value: any, isConst = false) { this.vars.set(name, { value, const: isConst }); }
}

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(public value: any) {} }

const FORBIDDEN_PROPS = new Set(["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

export interface ScriptOptions {
  maxSteps?: number;
  globals?: Record<string, any>;
  onLog?: (...args: any[]) => void;
}

class Interpreter {
  steps = 0;
  maxSteps: number;
  logs: string[] = [];
  constructor(private opts: ScriptOptions) { this.maxSteps = opts.maxSteps ?? 200_000; }

  private tick() { if (++this.steps > this.maxSteps) throw new ScriptRuntimeError("Script exceeded the execution limit (possible infinite loop)"); }

  run(body: Node[], scope: Scope) {
    this.hoist(body, scope);
    for (const st of body) this.exec(st, scope);
  }

  private hoist(body: Node[], scope: Scope) {
    for (const st of body) if (st.type === "FunctionDecl") scope.declare(st.name, this.makeFunction(st, scope));
  }

  exec(n: Node, scope: Scope): void {
    this.tick();
    switch (n.type) {
      case "Block": { const s = new Scope(scope); this.hoist(n.body, s); for (const st of n.body) this.exec(st, s); return; }
      case "ExprStmt": this.evaluate(n.expr, scope); return;
      case "Var": for (const d of n.decls) { const v = d.init ? this.evaluate(d.init, scope) : undefined; this.bind(d.target, v, scope, n.kind === "const", true); } return;
      case "FunctionDecl": return; // hoisted
      case "Return": throw new ReturnSignal(n.arg ? this.evaluate(n.arg, scope) : undefined);
      case "If": if (this.evaluate(n.test, scope)) this.exec(n.cons, scope); else if (n.alt) this.exec(n.alt, scope); return;
      case "While": while (this.evaluate(n.test, scope)) { try { this.exec(n.body, scope); } catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; } } return;
      case "DoWhile": do { try { this.exec(n.body, scope); } catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; } } while (this.evaluate(n.test, scope)); return;
      case "For": {
        const s = new Scope(scope);
        if (n.init) this.exec(n.init, s);
        while (n.test ? this.evaluate(n.test, s) : true) {
          try { this.exec(n.body, new Scope(s)); } catch (e) { if (e instanceof BreakSignal) break; if (!(e instanceof ContinueSignal)) throw e; }
          if (n.update) this.evaluate(n.update, s);
        }
        return;
      }
      case "ForOf": case "ForIn": {
        const src = this.evaluate(n.right, scope);
        const items = n.type === "ForOf" ? Array.from(src ?? []) : Object.keys(src ?? {});
        for (const item of items) {
          const s = new Scope(scope);
          this.bind(n.target, item, s, n.kind === "const", true);
          try { this.exec(n.body, s); } catch (e) { if (e instanceof BreakSignal) break; if (!(e instanceof ContinueSignal)) throw e; }
        }
        return;
      }
      case "Break": throw new BreakSignal();
      case "Continue": throw new ContinueSignal();
      case "Throw": throw new ScriptRuntimeError(String(this.evaluate(n.arg, scope)?.message ?? this.evaluate(n.arg, scope)));
      case "Try": {
        try { this.exec({ type: "Block", body: n.block }, scope); }
        catch (e) {
          if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e;
          if (n.handler) { const s = new Scope(scope); if (n.param) s.declare(n.param, { message: (e as any)?.message ?? String(e) }); this.exec({ type: "Block", body: n.handler }, s); } else throw e;
        } finally { if (n.finalizer) this.exec({ type: "Block", body: n.finalizer }, scope); }
        return;
      }
      default: throw new ScriptRuntimeError(`Unknown statement ${n.type}`);
    }
  }

  private bind(target: Node, value: any, scope: Scope, isConst: boolean, declare: boolean) {
    if (target.type === "Identifier") { if (declare) scope.declare(target.name, value, isConst); else scope.set(target.name, value); return; }
    if (target.type === "ArrayPattern") { const arr = Array.from(value ?? []); target.els.forEach((el: Node, i: number) => el && this.bind(el, arr[i], scope, isConst, declare)); return; }
    if (target.type === "ObjectPattern") { for (const p of target.props) { let v = value?.[p.key]; if (v === undefined && p.def) v = this.evaluate(p.def, scope); this.bind(p.target, v, scope, isConst, declare); } return; }
    if (target.type === "Member") { const obj = this.evaluate(target.obj, scope); const key = this.propKey(target, scope); this.setProp(obj, key, value); return; }
    throw new ScriptRuntimeError("Invalid binding target");
  }

  private propKey(m: Node, scope: Scope): string { const k = m.computed ? this.evaluate(m.prop, scope) : m.prop.value; const s = String(k); if (FORBIDDEN_PROPS.has(s)) throw new ScriptRuntimeError(`Access to '${s}' is not allowed`); return s; }

  private getProp(obj: any, key: string): any {
    if (obj === null || obj === undefined) throw new ScriptRuntimeError(`Cannot read property '${key}' of ${obj}`);
    if (FORBIDDEN_PROPS.has(key)) throw new ScriptRuntimeError(`Access to '${key}' is not allowed`);
    const v = obj[key];
    if (typeof v === "function" && !(obj instanceof InterpFn)) return v.bind(obj);
    return v;
  }

  private setProp(obj: any, key: string, value: any) {
    if (obj === null || obj === undefined || typeof obj !== "object") throw new ScriptRuntimeError(`Cannot set property '${key}' on ${typeof obj}`);
    obj[key] = value;
  }

  makeFunction(node: Node, scope: Scope): InterpFn {
    const interp = this; // eslint-disable-line @typescript-eslint/no-this-alias
    return new InterpFn((...args: any[]) => {
      const s = new Scope(scope);
      node.params.forEach((p: Node, i: number) => {
        if (p.type === "Rest") interp.bind(p.target, args.slice(i), s, false, true);
        else { let v = args[i]; if (v === undefined && p.def) v = interp.evaluate(p.def, s); interp.bind(p.target, v, s, false, true); }
      });
      try {
        if (node.body.type === "ExprBody") return interp.evaluate(node.body.expr, s);
        interp.hoist(node.body.body ?? node.body, s);
        for (const st of node.body.body ?? node.body) interp.exec(st, s);
      } catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
      return undefined;
    }, node.name);
  }

  evaluate(n: Node, scope: Scope): any {
    this.tick();
    switch (n.type) {
      case "Literal": return n.value;
      case "Template": return n.parts.map((p: any) => (p.expr ? String(this.evaluate(p.expr, scope) ?? "") : p.str)).join("");
      case "Identifier": {
        const s = scope.lookup(n.name);
        if (s) return s.vars.get(n.name)!.value;
        if (this.opts.globals && n.name in this.opts.globals) return this.opts.globals[n.name];
        throw new ScriptRuntimeError(`${n.name} is not defined`);
      }
      case "ArrayExpr": { const out: any[] = []; for (const el of n.els) { if (el.type === "Spread") out.push(...Array.from(this.evaluate(el.arg, scope) ?? [])); else out.push(this.evaluate(el, scope)); } return out; }
      case "ObjectExpr": { const o: Record<string, any> = {}; for (const p of n.props) { if (p.spread) Object.assign(o, this.evaluate(p.spread, scope)); else { const k = p.computed ? String(this.evaluate(p.key, scope)) : String(p.key.value); if (FORBIDDEN_PROPS.has(k)) continue; o[k] = this.evaluate(p.value, scope); } } return o; }
      case "FunctionExpr": case "Arrow": return this.makeFunction(n, scope);
      case "Seq": this.evaluate(n.left, scope); return this.evaluate(n.right, scope);
      case "Cond": return this.evaluate(n.test, scope) ? this.evaluate(n.a, scope) : this.evaluate(n.b, scope);
      case "Logical": {
        const l = this.evaluate(n.left, scope);
        if (n.op === "&&") return l ? this.evaluate(n.right, scope) : l;
        if (n.op === "||") return l ? l : this.evaluate(n.right, scope);
        return l !== null && l !== undefined ? l : this.evaluate(n.right, scope);
      }
      case "Binary": {
        const l = this.evaluate(n.left, scope); const r = this.evaluate(n.right, scope);
        switch (n.op) {
          case "+": return l + r; case "-": return l - r; case "*": return l * r; case "/": return l / r; case "%": return l % r; case "**": return l ** r;
          case "==": return l == r; case "!=": return l != r; case "===": return l === r; case "!==": return l !== r;
          case "<": return l < r; case ">": return l > r; case "<=": return l <= r; case ">=": return l >= r;
          case "&": return l & r; case "|": return l | r; case "^": return l ^ r;
          case "in": return typeof r === "object" && r !== null && String(l) in r;
          case "instanceof": return r === Array ? Array.isArray(l) : r === Date ? l instanceof Date : false;
        }
        throw new ScriptRuntimeError(`Unknown operator ${n.op}`);
      }
      case "Unary": {
        if (n.op === "typeof") { try { const v = this.evaluate(n.arg, scope); return v instanceof InterpFn ? "function" : typeof v; } catch { return "undefined"; } }
        if (n.op === "delete") { if (n.arg.type === "Member") { const o = this.evaluate(n.arg.obj, scope); delete o[this.propKey(n.arg, scope)]; } return true; }
        const v = this.evaluate(n.arg, scope);
        switch (n.op) { case "!": return !v; case "-": return -v; case "+": return +v; case "~": return ~v; case "void": return undefined; }
        throw new ScriptRuntimeError(`Unknown unary ${n.op}`);
      }
      case "Update": {
        const cur = Number(this.evaluate(n.arg, scope));
        const nv = n.op === "++" ? cur + 1 : cur - 1;
        this.assignTo(n.arg, nv, scope);
        return n.prefix ? nv : cur;
      }
      case "Assign": {
        let v = this.evaluate(n.right, scope);
        if (n.op !== "=") {
          const cur = this.evaluate(n.left, scope);
          switch (n.op) { case "+=": v = cur + v; break; case "-=": v = cur - v; break; case "*=": v = cur * v; break; case "/=": v = cur / v; break; case "%=": v = cur % v; break; case "**=": v = cur ** v; break; }
        }
        this.assignTo(n.left, v, scope);
        return v;
      }
      case "Member": {
        const obj = this.evaluate(n.obj, scope);
        if (n.optional && (obj === null || obj === undefined)) return undefined;
        return this.getProp(obj, this.propKey(n, scope));
      }
      case "Call": {
        let thisArg: any = undefined; let fn: any;
        if (n.callee.type === "Member") {
          thisArg = this.evaluate(n.callee.obj, scope);
          if (n.callee.optional && (thisArg === null || thisArg === undefined)) return undefined;
          const key = this.propKey(n.callee, scope);
          if (thisArg === null || thisArg === undefined) throw new ScriptRuntimeError(`Cannot call '${key}' of ${thisArg}`);
          fn = thisArg[key];
          if (typeof fn !== "function" && !(fn instanceof InterpFn)) throw new ScriptRuntimeError(`${key} is not a function`);
        } else {
          fn = this.evaluate(n.callee, scope);
          if (n.optional && (fn === null || fn === undefined)) return undefined;
        }
        const args: any[] = [];
        for (const a of n.args) { if (a.type === "Spread") args.push(...Array.from(this.evaluate(a.arg, scope) ?? [])); else args.push(this.evaluate(a, scope)); }
        return this.callValue(fn, thisArg, args);
      }
      case "New": {
        const ctor = this.evaluate(n.callee, scope);
        const args = n.args.map((a: Node) => this.evaluate(a, scope));
        if (ctor === Date) return new Date(...(args as [any]));
        if (ctor === Array) return new Array(...args);
        if (ctor === Map) return new Map(); if (ctor === Set) return new Set(args[0]);
        if (ctor === Error) return { message: String(args[0] ?? "") };
        if (ctor instanceof InterpFn) { const o: any = {}; ctor.call(o, ...args); return o; }
        throw new ScriptRuntimeError("'new' is only supported for Date, Array, Map, Set and Error");
      }
      default: throw new ScriptRuntimeError(`Unknown expression ${n.type}`);
    }
  }

  private assignTo(target: Node, value: any, scope: Scope) {
    if (target.type === "Identifier") { const s = scope.lookup(target.name); if (!s && this.opts.globals && target.name in this.opts.globals) { this.opts.globals[target.name] = value; return; } scope.set(target.name, value); return; }
    if (target.type === "Member") { const obj = this.evaluate(target.obj, scope); this.setProp(obj, this.propKey(target, scope), value); return; }
    throw new ScriptRuntimeError("Invalid assignment target");
  }

  callValue(fn: any, thisArg: any, args: any[]): any {
    if (fn instanceof InterpFn) return fn.call(thisArg, ...args);
    if (typeof fn === "function") {
      // convert interpreted callbacks to native
      const nativeArgs = args.map((a) => (a instanceof InterpFn ? (...x: any[]) => a.call(undefined, ...x) : a));
      return fn.apply(thisArg, nativeArgs);
    }
    throw new ScriptRuntimeError("Value is not a function");
  }
}

/** Interpreted function wrapper (callable from host code too). */
export class InterpFn {
  constructor(private impl: (...args: any[]) => any, public name?: string | null) {}
  call(_thisArg: any, ...args: any[]) { return this.impl(...args); }
}

// ── Safe globals ─────────────────────────────────────────────────────────────

function safeObjectApi() {
  return {
    keys: (o: any) => Object.keys(o ?? {}),
    values: (o: any) => Object.values(o ?? {}),
    entries: (o: any) => Object.entries(o ?? {}),
    assign: (t: any, ...s: any[]) => Object.assign(t ?? {}, ...s),
    fromEntries: (e: any) => Object.fromEntries(e ?? []),
  };
}

export function createSafeGlobals(extra: Record<string, any> = {}, onLog?: (...a: any[]) => void): Record<string, any> {
  const g: Record<string, any> = {
    Math, JSON: { stringify: JSON.stringify, parse: JSON.parse },
    Date, Array: Object.assign((...a: any[]) => new Array(...a), { isArray: Array.isArray, from: Array.from, of: Array.of }),
    Object: safeObjectApi(), String: (v: any) => String(v ?? ""), Number: (v: any) => Number(v), Boolean: (v: any) => Boolean(v),
    Map, Set, Error,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    console: { log: (...a: any[]) => onLog?.(...a), warn: (...a: any[]) => onLog?.(...a), error: (...a: any[]) => onLog?.(...a), info: (...a: any[]) => onLog?.(...a) },
    undefined: undefined, NaN, Infinity,
  };
  return { ...g, ...extra };
}

export interface RunResult { ok: boolean; error?: string; logs: string[]; returnValue?: any; steps: number; globals: Record<string, any>; }

/** Parse only (syntax check). */
export function checkScriptSyntax(src: string): { ok: boolean; error?: string; line?: number } {
  try { new Parser(lex(src)).parseProgram(); return { ok: true }; }
  catch (e: any) { return { ok: false, error: e?.message || "Syntax error", line: e?.line }; }
}

/** Execute a script with the provided globals. Synchronous & bounded. */
export function runScript(src: string, globals: Record<string, any>, opts: { maxSteps?: number } = {}): RunResult {
  const logs: string[] = [];
  const onLog = (...a: any[]) => logs.push(a.map((x) => (typeof x === "object" ? safeStringify(x) : String(x))).join(" "));
  const allGlobals = createSafeGlobals(globals, onLog);
  const interp = new Interpreter({ maxSteps: opts.maxSteps, globals: allGlobals, onLog });
  try {
    const ast = new Parser(lex(src)).parseProgram();
    const root = new Scope(null);
    let returnValue: any;
    try { interp.run(ast, root); } catch (e) { if (e instanceof ReturnSignal) returnValue = e.value; else throw e; }
    return { ok: true, logs, returnValue, steps: interp.steps, globals: allGlobals };
  } catch (e: any) {
    if (e instanceof BreakSignal || e instanceof ContinueSignal) return { ok: true, logs, steps: interp.steps, globals: allGlobals };
    return { ok: false, error: e?.message || String(e), logs, steps: interp.steps, globals: allGlobals };
  }
}

function safeStringify(v: any) { try { return JSON.stringify(v); } catch { return String(v); } }
