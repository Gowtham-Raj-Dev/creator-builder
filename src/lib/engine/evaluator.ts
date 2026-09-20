import { FormDefinition } from "@/types/schema";

/**
 * Safe Expression Evaluator
 * Supports:
 * - Arithmetic: +, -, *, /, %
 * - Comparison: >, <, >=, <=, ==, !=
 * - Logical: &&, ||, !
 * - Parentheses: ( )
 * - Field references: e.g. Quantity, Rate, customer_name, field_123
 * - Literals: numbers, booleans (true, false), strings in single/double quotes
 * DOES NOT use eval() or Function() constructor.
 */

type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "IDENTIFIER"
  | "OPERATOR"
  | "LPAREN"
  | "RPAREN";

interface Token {
  type: TokenType;
  value: any;
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Number literals (including decimals)
    if (/[0-9]/.test(char)) {
      let numStr = "";
      while (i < len && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: parseFloat(numStr) });
      continue;
    }

    // String literals ('...' or "...")
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      let str = "";
      while (i < len && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < len) {
          i++;
          str += expr[i];
        } else {
          str += expr[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Parentheses
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    // Multi-char operators
    const twoChars = expr.substr(i, 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(twoChars)) {
      tokens.push({ type: "OPERATOR", value: twoChars });
      i += 2;
      continue;
    }

    // Single-char operators
    if (["+", "-", "*", "/", "%", ">", "<", "!"].includes(char)) {
      tokens.push({ type: "OPERATOR", value: char });
      i++;
      continue;
    }

    // Identifiers (field link names or keywords)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }

      if (ident === "true") {
        tokens.push({ type: "BOOLEAN", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "BOOLEAN", value: false });
      } else if (ident === "null") {
        tokens.push({ type: "STRING", value: null });
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident });
      }
      continue;
    }

    // Unknown char, advance
    i++;
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private context: Record<string, any>;

  constructor(tokens: Token[], context: Record<string, any>) {
    this.tokens = tokens;
    this.context = context;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.tokens[this.pos++];
    if (!token && expectedType) {
      throw new Error(`Unexpected end of expression, expected ${expectedType}`);
    }
    return token;
  }

  public parse(): any {
    if (this.tokens.length === 0) return undefined;
    return this.parseLogicalOr();
  }

  // Logical OR (||)
  private parseLogicalOr(): any {
    let left = this.parseLogicalAnd();
    while (this.peek()?.value === "||") {
      this.consume();
      const right = this.parseLogicalAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  // Logical AND (&&)
  private parseLogicalAnd(): any {
    let left = this.parseEquality();
    while (this.peek()?.value === "&&") {
      this.consume();
      const right = this.parseEquality();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  // Equality (==, !=)
  private parseEquality(): any {
    let left = this.parseRelational();
    while (this.peek()?.value === "==" || this.peek()?.value === "!=") {
      const op = this.consume().value;
      const right = this.parseRelational();
      if (op === "==") left = left == right;
      if (op === "!=") left = left != right;
    }
    return left;
  }

  // Relational (<, >, <=, >=)
  private parseRelational(): any {
    let left = this.parseAdditive();
    while (
      this.peek()?.value === "<" ||
      this.peek()?.value === ">" ||
      this.peek()?.value === "<=" ||
      this.peek()?.value === ">="
    ) {
      const op = this.consume().value;
      const right = this.parseAdditive();
      if (op === "<") left = Number(left) < Number(right);
      if (op === ">") left = Number(left) > Number(right);
      if (op === "<=") left = Number(left) <= Number(right);
      if (op === ">=") left = Number(left) >= Number(right);
    }
    return left;
  }

  // Additive (+, -)
  private parseAdditive(): any {
    let left = this.parseMultiplicative();
    while (this.peek()?.value === "+" || this.peek()?.value === "-") {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          left = String(left ?? "") + String(right ?? "");
        } else {
          left = (Number(left) || 0) + (Number(right) || 0);
        }
      }
      if (op === "-") {
        left = (Number(left) || 0) - (Number(right) || 0);
      }
    }
    return left;
  }

  // Multiplicative (*, /, %)
  private parseMultiplicative(): any {
    let left = this.parseUnary();
    while (
      this.peek()?.value === "*" ||
      this.peek()?.value === "/" ||
      this.peek()?.value === "%"
    ) {
      const op = this.consume().value;
      const right = this.parseUnary();
      if (op === "*") {
        left = (Number(left) || 0) * (Number(right) || 0);
      }
      if (op === "/") {
        const divisor = Number(right);
        left = divisor === 0 ? 0 : (Number(left) || 0) / divisor;
      }
      if (op === "%") {
        left = (Number(left) || 0) % (Number(right) || 1);
      }
    }
    return left;
  }

  // Unary (!, -)
  private parseUnary(): any {
    if (this.peek()?.value === "!") {
      this.consume();
      return !this.parseUnary();
    }
    if (this.peek()?.value === "-") {
      this.consume();
      return -(Number(this.parseUnary()) || 0);
    }
    return this.parsePrimary();
  }

  // Primary (Number, String, Boolean, Identifier lookup, Parenthesized)
  private parsePrimary(): any {
    const token = this.peek();
    if (!token) return 0;

    if (token.type === "NUMBER" || token.type === "STRING" || token.type === "BOOLEAN") {
      this.consume();
      return token.value;
    }

    if (token.type === "IDENTIFIER") {
      this.consume();
      const key = token.value;
      // Search in context by key, lowercase key, or linkName
      if (key in this.context) {
        return this.context[key];
      }
      // Also try case-insensitive or underscore variations
      const foundKey = Object.keys(this.context).find(
        (k) =>
          k.toLowerCase() === key.toLowerCase() ||
          k.toLowerCase().replace(/\s+/g, "_") === key.toLowerCase()
      );
      if (foundKey) {
        return this.context[foundKey];
      }
      // Return key as string so unquoted literals (e.g. status == active) work seamlessly
      return key;
    }

    if (token.type === "LPAREN") {
      this.consume("LPAREN");
      const result = this.parseLogicalOr();
      if (this.peek()?.type === "RPAREN") {
        this.consume("RPAREN");
      }
      return result;
    }

    this.consume();
    return 0;
  }
}

export function evaluateSafeExpression(
  expression: string,
  context: Record<string, any>
): any {
  if (!expression || typeof expression !== "string") return undefined;
  try {
    const tokens = tokenize(expression.trim());
    if (tokens.length === 0) return undefined;
    const parser = new Parser(tokens, context);
    return parser.parse();
  } catch (err) {
    console.warn(`Error evaluating expression "${expression}":`, err);
    return undefined;
  }
}

export interface ScriptExecutionResult {
  updatedValues: Record<string, any>;
  changedFields?: Record<string, boolean>;
  popupAlert?: { message: string; title?: string; type?: "warning" | "error" | "info" };
  shouldBlockSubmit: boolean;
  messages: Array<{ type: "info" | "warning" | "error"; text: string }>;
  hiddenFields: Record<string, boolean>;
  readonlyFields: Record<string, boolean>;
}

export interface ScriptContextMetadata {
  currentForm?: FormDefinition;
  allForms?: FormDefinition[];
}

export function executeSafeScript(
  script: string,
  context: Record<string, any>,
  meta?: ScriptContextMetadata
): ScriptExecutionResult {
  const result: ScriptExecutionResult = {
    updatedValues: { ...context },
    changedFields: {},
    shouldBlockSubmit: false,
    messages: [],
    hiddenFields: {},
    readonlyFields: {},
  };

  if (!script || typeof script !== "string") return result;

  // Clean script: remove comments and split into lines
  const rawLines = script
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("//");
      return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
    })
    .map((l) => l.trim())
    .filter(Boolean);

  // Split lines by semicolons while keeping if/block statements intact
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    if (rawLine.startsWith("if") || rawLine.includes("{") || rawLine.includes("}")) {
      lines.push(rawLine);
    } else {
      const splitStmts = rawLine.split(";").map((s) => s.trim()).filter(Boolean);
      lines.push(...splitStmts);
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for if statement: if (condition) { or if (condition) statement
    const ifMatch = line.match(/^if\s*\((.*)\)\s*(\{)?/);
    if (ifMatch) {
      const condition = ifMatch[1];
      const hasBrace = Boolean(ifMatch[2]) || (i + 1 < lines.length && lines[i + 1] === "{");
      const condPassed = Boolean(evaluateSafeExpression(condition, result.updatedValues));

      const innerStatements: string[] = [];
      if (hasBrace) {
        if (!ifMatch[2] && i + 1 < lines.length && lines[i + 1] === "{") {
          i++; // skip open brace line
        }
        i++;
        while (i < lines.length && !lines[i].includes("}")) {
          innerStatements.push(lines[i]);
          i++;
        }
        i++; // skip closing brace line
      } else {
        // Single statement after condition on same line
        const restOfLine = line.substring(line.indexOf(")") + 1).trim();
        if (restOfLine) {
          innerStatements.push(restOfLine);
        }
        i++;
      }

      if (condPassed) {
        for (const stmt of innerStatements) {
          executeSingleStatement(stmt, result, meta);
        }
      }
      continue;
    }

    // Regular statement
    executeSingleStatement(line, result, meta);
    i++;
  }

  return result;
}

function executeSingleStatement(
  stmt: string,
  result: ScriptExecutionResult,
  meta?: ScriptContextMetadata
) {
  const clean = stmt.replace(/;+$/, "").trim();
  if (!clean) return;

  // Builtin: showPopup("...") or alert("...")
  const popupMatch = clean.match(/^(showPopup|alert)\s*\(\s*["']([^"']+)["']\s*\)/);
  if (popupMatch) {
    const msg = popupMatch[2];
    result.popupAlert = {
      title: "Workflow Validation Alert",
      message: msg,
      type: "warning",
    };
    result.shouldBlockSubmit = true;
    result.messages.push({ type: "warning", text: msg });
    return;
  }

  // Builtin: blockSubmit() or cancelSubmit()
  if (/^(blockSubmit|cancelSubmit)\s*\(\s*\)/.test(clean)) {
    result.shouldBlockSubmit = true;
    return;
  }

  // Builtin: showMessage("...")
  const msgMatch = clean.match(/^showMessage\s*\(\s*["']([^"']+)["']\s*\)/);
  if (msgMatch) {
    result.messages.push({ type: "info", text: msgMatch[1] });
    return;
  }

  // Builtin: hideField("...")
  const hideMatch = clean.match(/^hideField\s*\(\s*["']([^"']+)["']\s*\)/);
  if (hideMatch) {
    result.hiddenFields[hideMatch[1]] = true;
    return;
  }

  // Builtin: showField("...")
  const showMatch = clean.match(/^showField\s*\(\s*["']([^"']+)["']\s*\)/);
  if (showMatch) {
    result.hiddenFields[showMatch[1]] = false;
    return;
  }

  // Builtin: setReadonly("...")
  const lockMatch = clean.match(/^setReadonly\s*\(\s*["']([^"']+)["']\s*\)/);
  if (lockMatch) {
    result.readonlyFields[lockMatch[1]] = true;
    return;
  }

  // Assignment: target = expression
  const assignMatch = clean.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const rawTarget = assignMatch[1].trim();
    let expr = assignMatch[2].trim().replace(/;+$/, "").trim();

    const currentForm = meta?.currentForm;
    const allForms = meta?.allForms || [];

    // Find target field in current form
    const targetField = currentForm?.fields.find(
      (f) =>
        f.id === rawTarget ||
        f.linkName.toLowerCase() === rawTarget.toLowerCase() ||
        f.label.toLowerCase() === rawTarget.toLowerCase() ||
        f.label.toLowerCase().replace(/\s+/g, "_") === rawTarget.toLowerCase()
    );

    const targetKey = targetField ? targetField.id : rawTarget;

    // Check if target is not in current form
    if (currentForm && !targetField) {
      const inOtherForm = allForms.find((f) =>
        f.fields.some(
          (fld) =>
            fld.linkName.toLowerCase() === rawTarget.toLowerCase() ||
            fld.label.toLowerCase() === rawTarget.toLowerCase()
        )
      );

      if (inOtherForm) {
        result.messages.push({
          type: "error",
          text: `Target field "${rawTarget}" does not exist in "${currentForm.name}". It belongs to form "${inOtherForm.name}". Available fields: ${currentForm.fields.map((f) => f.linkName).join(", ")}.`,
        });
      }
    }

    const setFieldValue = (val: any) => {
      result.updatedValues[targetKey] = val;
      if (!result.changedFields) result.changedFields = {};
      result.changedFields[targetKey] = true;
      if (targetField) {
        result.updatedValues[targetField.id] = val;
        result.updatedValues[targetField.linkName] = val;
        result.changedFields[targetField.id] = true;
        result.changedFields[targetField.linkName] = true;
      }
    };

    // Evaluate RHS (expr):
    // 1. Quoted string: "test" or 'test'
    const quotedMatch = expr.match(/^["'](.*)["']$/);
    if (quotedMatch) {
      const strVal = quotedMatch[1];
      setFieldValue(strVal);
      result.messages.push({
        type: "info",
        text: `Assigned text "${strVal}" to ${targetField?.label || targetKey}.`,
      });
      return;
    }

    // 2. Pure number: 123 or 45.67
    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      const numVal = parseFloat(expr);
      setFieldValue(numVal);
      result.messages.push({
        type: "info",
        text: `Assigned number ${numVal} to ${targetField?.label || targetKey}.`,
      });
      return;
    }

    // 3. Boolean: true or false
    if (expr === "true" || expr === "false") {
      const boolVal = expr === "true";
      setFieldValue(boolVal);
      return;
    }

    // 4. Single Identifier (e.g. quantity or test)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) {
      // Check if expr matches a field in currentForm
      const sourceField = currentForm?.fields.find(
        (f) =>
          f.id === expr ||
          f.linkName.toLowerCase() === expr.toLowerCase() ||
          f.label.toLowerCase() === expr.toLowerCase() ||
          f.label.toLowerCase().replace(/\s+/g, "_") === expr.toLowerCase()
      );

      if (sourceField) {
        const sourceVal =
          result.updatedValues[sourceField.id] ?? result.updatedValues[sourceField.linkName];

        if (sourceVal !== undefined && sourceVal !== null && sourceVal !== "") {
          setFieldValue(sourceVal);
          result.messages.push({
            type: "info",
            text: `Copied value "${sourceVal}" from field "${sourceField.label}" into "${targetField?.label || targetKey}".`,
          });
        } else {
          setFieldValue("");
          result.messages.push({
            type: "warning",
            text: `Field "${sourceField.label}" is currently empty, so "${targetField?.label || targetKey}" was set to empty.`,
          });
        }
        return;
      }

      // Check if expr belongs to another form in the app (e.g. quantity in invoice_form)
      const otherFormWithField = allForms.find(
        (f) =>
          f.id !== currentForm?.id &&
          (f.fields.some(
            (fld) =>
              fld.linkName.toLowerCase() === expr.toLowerCase() ||
              fld.label.toLowerCase() === expr.toLowerCase()
          ) ||
            f.fields.some((fld) =>
              fld.subform?.columns?.some(
                (col) => col.linkName.toLowerCase() === expr.toLowerCase()
              )
            ))
      );

      if (otherFormWithField) {
        const availableList = currentForm?.fields.map((f) => f.linkName).join(", ") || "none";
        result.messages.push({
          type: "error",
          text: `Workflow Error: Field "${expr}" was not found in "${currentForm?.name || "current form"}". It belongs to form "${otherFormWithField.name}". Cross-form data requires a Lookup relationship. Available fields in ${currentForm?.name}: ${availableList}.`,
        });
        return;
      }

      // If expr is an existing variable in context without currentForm restriction
      if (!currentForm && expr in result.updatedValues) {
        const sourceVal = result.updatedValues[expr];
        setFieldValue(sourceVal);
        return;
      }

      // If expr is NOT a field in any form, treat it as an unquoted string literal (e.g. test, Chennai, Draft)
      setFieldValue(expr);
      result.messages.push({
        type: "info",
        text: `Assigned text "${expr}" to ${targetField?.label || targetKey}.`,
      });
      return;
    }

    // 5. Compound formula / math expression
    const computed = evaluateSafeExpression(expr, result.updatedValues);
    if (computed !== undefined && !Number.isNaN(computed)) {
      setFieldValue(computed);
    } else {
      result.messages.push({
        type: "error",
        text: `Could not evaluate formula "${expr}" for field "${targetField?.label || targetKey}".`,
      });
    }
  }
}

