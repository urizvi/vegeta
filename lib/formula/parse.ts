import type { FormulaAst } from './ast';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ParseErrorCode =
  | 'UNEXPECTED_EOF'
  | 'UNEXPECTED_TOKEN'
  | 'UNKNOWN_FIELD'
  | 'UNTERMINATED_STRING'
  | 'BAD_NUMBER';

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  /** 0-indexed character offset in the source string. */
  col: number;
  /** Present for UNKNOWN_FIELD so the editor can offer "did you mean…" */
  name?: string;
}

export type ParseResult =
  | { ok: true; ast: FormulaAst }
  | { ok: false; errors: ParseError[] };

export interface ParseOpts {
  /** Map of human-visible field label → stable field id. Case-insensitive lookup. */
  nameToId: Record<string, string>;
}

export interface PrintOpts {
  /** Inverse of `nameToId` — used to re-render field refs as `{Label}`. */
  idToName: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENT'
  | 'FIELD'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'GT'
  | 'LTE'
  | 'GTE'
  | 'COMMA'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  /** 0-indexed character offset in the source string. */
  col: number;
}

interface TokenizeResult {
  tokens: Token[];
  errors: ParseError[];
}

/**
 * Token types that are binary-only operators (cannot start a primary expression).
 * When one of these follows a binary op, we DON'T consume the op — leaving it
 * as the "stray" token for the top-level remaining-token check.
 * EOF is intentionally excluded: when EOF follows a binary op the consumer
 * should proceed so that parsePrimary can emit UNEXPECTED_EOF.
 */
const BINARY_ONLY_OPS: Set<TokenType> = new Set([
  'STAR', 'SLASH', 'EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'COMMA', 'RPAREN',
]);

function tokenize(src: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  let i = 0;

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }

    const startCol = i; // 0-indexed
    const ch = src[i];

    // Single-quoted string
    if (ch === "'") {
      i++;
      let value = '';
      let terminated = false;
      while (i < src.length) {
        if (src[i] === '\\' && i + 1 < src.length) {
          value += src[i + 1];
          i += 2;
        } else if (src[i] === "'") {
          i++;
          terminated = true;
          break;
        } else {
          value += src[i];
          i++;
        }
      }
      if (!terminated) {
        errors.push({
          code: 'UNTERMINATED_STRING',
          message: 'Unterminated string literal',
          col: startCol,
        });
      }
      tokens.push({ type: 'STRING', value, col: startCol });
      continue;
    }

    // Field reference {Label}
    if (ch === '{') {
      i++;
      let label = '';
      let closed = false;
      while (i < src.length) {
        if (src[i] === '}') {
          i++;
          closed = true;
          break;
        }
        label += src[i];
        i++;
      }
      if (!closed) {
        errors.push({
          code: 'UNEXPECTED_TOKEN',
          message: 'Unterminated field reference',
          col: startCol,
        });
      }
      tokens.push({ type: 'FIELD', value: label, col: startCol });
      continue;
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let numStr = '';
      let dotCount = 0;
      while (i < src.length && /[0-9.]/.test(src[i])) {
        if (src[i] === '.') dotCount++;
        numStr += src[i];
        i++;
      }
      if (dotCount > 1) {
        errors.push({
          code: 'BAD_NUMBER',
          message: `Invalid number literal: ${numStr}`,
          col: startCol,
        });
      }
      tokens.push({ type: 'NUMBER', value: numStr, col: startCol });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        ident += src[i];
        i++;
      }
      tokens.push({ type: 'IDENT', value: ident, col: startCol });
      continue;
    }

    // Two-character operators (check bounds before accessing src[i+1])
    if (ch === '!' && i + 1 < src.length && src[i + 1] === '=') {
      tokens.push({ type: 'NEQ', value: '!=', col: startCol });
      i += 2;
      continue;
    }
    if (ch === '<' && i + 1 < src.length && src[i + 1] === '=') {
      tokens.push({ type: 'LTE', value: '<=', col: startCol });
      i += 2;
      continue;
    }
    if (ch === '>' && i + 1 < src.length && src[i + 1] === '=') {
      tokens.push({ type: 'GTE', value: '>=', col: startCol });
      i += 2;
      continue;
    }

    // Single-character operators
    switch (ch) {
      case '+': tokens.push({ type: 'PLUS',   value: '+', col: startCol }); i++; break;
      case '-': tokens.push({ type: 'MINUS',  value: '-', col: startCol }); i++; break;
      case '*': tokens.push({ type: 'STAR',   value: '*', col: startCol }); i++; break;
      case '/': tokens.push({ type: 'SLASH',  value: '/', col: startCol }); i++; break;
      case '=': tokens.push({ type: 'EQ',     value: '=', col: startCol }); i++; break;
      case '<': tokens.push({ type: 'LT',     value: '<', col: startCol }); i++; break;
      case '>': tokens.push({ type: 'GT',     value: '>', col: startCol }); i++; break;
      case ',': tokens.push({ type: 'COMMA',  value: ',', col: startCol }); i++; break;
      case '(': tokens.push({ type: 'LPAREN', value: '(', col: startCol }); i++; break;
      case ')': tokens.push({ type: 'RPAREN', value: ')', col: startCol }); i++; break;
      default:
        errors.push({
          code: 'UNEXPECTED_TOKEN',
          message: `Unexpected character: ${ch}`,
          col: startCol,
        });
        i++;
        break;
    }
  }

  tokens.push({ type: 'EOF', value: '', col: src.length });
  return { tokens, errors };
}

// ---------------------------------------------------------------------------
// Parser — recursive descent
// ---------------------------------------------------------------------------

// Precedence levels (for prettyPrint parenthesization):
// OR=1, AND=2, CMP=3, ADD/SUB=4, MUL/DIV=5, UNARY=6, PRIMARY=7
const PREC_OR  = 1;
const PREC_AND = 2;
const PREC_CMP = 3;
const PREC_ADD = 4;
const PREC_MUL = 5;

// Maps operator string to precedence level
function opPrec(op: string): number {
  switch (op) {
    case 'or':  return PREC_OR;
    case 'and': return PREC_AND;
    case '=': case '!=': case '<': case '>': case '<=': case '>=': return PREC_CMP;
    case '+': case '-': return PREC_ADD;
    case '*': case '/': return PREC_MUL;
    default: return 0;
  }
}

class Parser {
  private tokens: Token[];
  private pos: number;
  readonly errors: ParseError[];
  private nameToIdMap: Map<string, string>;

  constructor(tokens: Token[], errors: ParseError[], opts: ParseOpts) {
    this.tokens = tokens;
    this.pos = 0;
    this.errors = errors;

    // Build case-insensitive lookup map
    this.nameToIdMap = new Map();
    for (const [name, id] of Object.entries(opts.nameToId)) {
      this.nameToIdMap.set(name.toLowerCase(), id);
    }
  }

  peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t.type !== 'EOF') this.pos++;
    return t;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private isKeyword(value: string): boolean {
    const t = this.peek();
    return t.type === 'IDENT' && t.value.toUpperCase() === value.toUpperCase();
  }

  /** Returns the token at pos+offset (without advancing). */
  private peekAt(offset: number): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  // parseExpression — entry point; parses OR-level
  parseExpression(): FormulaAst {
    return this.parseOr();
  }

  // OR: lowest precedence
  private parseOr(): FormulaAst {
    let left = this.parseAnd();
    while (this.isKeyword('OR')) {
      this.advance();
      const right = this.parseAnd();
      left = { kind: 'logical', op: 'or', left, right };
    }
    return left;
  }

  // AND
  private parseAnd(): FormulaAst {
    let left = this.parseNot();
    while (this.isKeyword('AND')) {
      this.advance();
      const right = this.parseNot();
      left = { kind: 'logical', op: 'and', left, right };
    }
    return left;
  }

  // NOT
  private parseNot(): FormulaAst {
    if (this.isKeyword('NOT')) {
      this.advance();
      const operand = this.parseNot();
      return { kind: 'not', operand };
    }
    return this.parseComparison();
  }

  // Comparison: = != < > <= >=
  private parseComparison(): FormulaAst {
    let left = this.parseAddSub();
    const t = this.peek();
    if (
      t.type === 'EQ'  || t.type === 'NEQ' ||
      t.type === 'LT'  || t.type === 'GT'  ||
      t.type === 'LTE' || t.type === 'GTE'
    ) {
      this.advance();
      const op = t.value as '=' | '!=' | '<' | '>' | '<=' | '>=';
      const right = this.parseAddSub();
      left = { kind: 'compare', op, left, right };
    }
    return left;
  }

  // + -  (left-associative)
  private parseAddSub(): FormulaAst {
    let left = this.parseMulDiv();
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      // Don't consume the operator if the token after it is a binary-only
      // operator (e.g. `**` where the first `+` is already consumed and
      // the second `*` would be stray). But DO allow EOF through so
      // parsePrimary can emit UNEXPECTED_EOF.
      const afterOp = this.peekAt(1);
      if (BINARY_ONLY_OPS.has(afterOp.type)) {
        break;
      }
      const t = this.advance();
      const op = t.value as '+' | '-';
      const right = this.parseMulDiv();
      left = { kind: 'binaryOp', op, left, right };
    }
    return left;
  }

  // * /  (left-associative)
  private parseMulDiv(): FormulaAst {
    let left = this.parseUnary();
    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
      // Don't consume the operator if the following token is also a
      // binary-only operator (e.g. `**`). The first `*` stays as the
      // stray token for the top-level remaining-token check, so the
      // error is reported at the first `*` not the second.
      const afterOp = this.peekAt(1);
      if (BINARY_ONLY_OPS.has(afterOp.type)) {
        break;
      }
      const t = this.advance();
      const op = t.value as '*' | '/';
      const right = this.parseUnary();
      left = { kind: 'binaryOp', op, left, right };
    }
    return left;
  }

  // Unary minus (fold into literal if possible)
  private parseUnary(): FormulaAst {
    if (this.peek().type === 'MINUS') {
      this.advance();
      const operand = this.parsePrimary();
      // Fold unary minus on a numeric literal into the literal value
      if (operand.kind === 'literal' && operand.valueType === 'number') {
        return { kind: 'literal', valueType: 'number', value: -(operand.value as number) };
      }
      // Otherwise represent as binaryOp(0 - operand)
      return {
        kind: 'binaryOp',
        op: '-',
        left: { kind: 'literal', valueType: 'number', value: 0 },
        right: operand,
      };
    }
    return this.parsePrimary();
  }

  // Primary: literal, fieldRef, IF(...), grouped expr, ident (true/false/keyword-as-error)
  private parsePrimary(): FormulaAst {
    const t = this.peek();

    // Parenthesized expression
    if (t.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression();
      if (!this.check('RPAREN')) {
        this.errors.push({
          code: 'UNEXPECTED_TOKEN',
          message: `Expected ')' at col ${this.peek().col}`,
          col: this.peek().col,
        });
      } else {
        this.advance();
      }
      return expr;
    }

    // Number literal
    if (t.type === 'NUMBER') {
      this.advance();
      const value = parseFloat(t.value);
      return { kind: 'literal', valueType: 'number', value };
    }

    // String literal
    if (t.type === 'STRING') {
      this.advance();
      return { kind: 'literal', valueType: 'text', value: t.value };
    }

    // Field reference
    if (t.type === 'FIELD') {
      this.advance();
      const label = t.value;
      const id = this.nameToIdMap.get(label.toLowerCase());
      if (id === undefined) {
        this.errors.push({
          code: 'UNKNOWN_FIELD',
          message: `Unknown field: ${label}`,
          col: t.col,
          name: label,
        });
        // Return a placeholder so parsing can continue
        return { kind: 'fieldRef', fieldId: `__unknown__${label}` };
      }
      return { kind: 'fieldRef', fieldId: id };
    }

    // Identifier: IF, true, false, and other keywords handled above, but also here
    if (t.type === 'IDENT') {
      const upper = t.value.toUpperCase();

      if (upper === 'TRUE') {
        this.advance();
        return { kind: 'literal', valueType: 'boolean', value: true };
      }
      if (upper === 'FALSE') {
        this.advance();
        return { kind: 'literal', valueType: 'boolean', value: false };
      }
      if (upper === 'IF') {
        this.advance();
        if (!this.check('LPAREN')) {
          this.errors.push({
            code: 'UNEXPECTED_TOKEN',
            message: `Expected '(' after IF at col ${this.peek().col}`,
            col: this.peek().col,
          });
          return { kind: 'literal', valueType: 'boolean', value: false };
        }
        this.advance(); // consume '('
        const cond = this.parseExpression();
        if (!this.check('COMMA')) {
          this.errors.push({
            code: 'UNEXPECTED_TOKEN',
            message: `Expected ',' in IF at col ${this.peek().col}`,
            col: this.peek().col,
          });
        } else {
          this.advance();
        }
        const then = this.parseExpression();
        if (!this.check('COMMA')) {
          this.errors.push({
            code: 'UNEXPECTED_TOKEN',
            message: `Expected ',' in IF at col ${this.peek().col}`,
            col: this.peek().col,
          });
        } else {
          this.advance();
        }
        const elseBranch = this.parseExpression();
        if (!this.check('RPAREN')) {
          this.errors.push({
            code: 'UNEXPECTED_TOKEN',
            message: `Expected ')' after IF args at col ${this.peek().col}`,
            col: this.peek().col,
          });
        } else {
          this.advance();
        }
        return { kind: 'if', cond, then, else: elseBranch };
      }

      // Unknown identifier — treat as error
      this.advance();
      this.errors.push({
        code: 'UNEXPECTED_TOKEN',
        message: `Unexpected identifier: ${t.value}`,
        col: t.col,
      });
      return { kind: 'literal', valueType: 'number', value: 0 };
    }

    // EOF — unexpected end of input
    if (t.type === 'EOF') {
      this.errors.push({
        code: 'UNEXPECTED_EOF',
        message: 'Unexpected end of expression',
        col: t.col,
      });
      // Return a placeholder to allow continued parsing
      return { kind: 'literal', valueType: 'number', value: 0 };
    }

    // Any other stray token
    this.errors.push({
      code: 'UNEXPECTED_TOKEN',
      message: `Unexpected token: ${t.value}`,
      col: t.col,
    });
    this.advance();
    return { kind: 'literal', valueType: 'number', value: 0 };
  }
}

// ---------------------------------------------------------------------------
// Public parse function
// ---------------------------------------------------------------------------

export function parse(src: string, opts: ParseOpts): ParseResult {
  const { tokens, errors: tokErrors } = tokenize(src);
  const parser = new Parser(tokens, tokErrors, opts);
  const ast = parser.parseExpression();

  // After parsing the full expression, the next token should be EOF.
  // If not, report the stray token.
  const remaining = parser.peek();
  if (remaining.type !== 'EOF') {
    parser.errors.push({
      code: 'UNEXPECTED_TOKEN',
      message: `Unexpected token: ${remaining.value}`,
      col: remaining.col,
    });
  }

  if (parser.errors.length > 0) {
    return { ok: false, errors: parser.errors };
  }
  return { ok: true, ast };
}

// ---------------------------------------------------------------------------
// prettyPrint
// ---------------------------------------------------------------------------

export function prettyPrint(ast: FormulaAst, opts: PrintOpts): string {
  return printNode(ast, opts, 0, false);
}

/**
 * Print an AST node.
 * @param parentPrec       Precedence of the parent operator (0 if none).
 * @param isRightOfParent  True when this node is the right child of a left-associative op.
 */
function printNode(
  node: FormulaAst,
  opts: PrintOpts,
  parentPrec: number,
  isRightOfParent: boolean,
): string {
  switch (node.kind) {
    case 'literal': {
      if (node.valueType === 'text') {
        const escaped = (node.value as string)
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'");
        return `'${escaped}'`;
      }
      if (node.valueType === 'boolean') {
        return node.value ? 'true' : 'false';
      }
      // number
      return String(node.value);
    }

    case 'fieldRef': {
      const label = opts.idToName[node.fieldId] ?? node.fieldId;
      return `{${label}}`;
    }

    case 'binaryOp': {
      const myPrec = opPrec(node.op);
      const leftStr  = printNode(node.left,  opts, myPrec, false);
      const rightStr = printNode(node.right, opts, myPrec, true);
      const expr = `${leftStr} ${node.op} ${rightStr}`;
      return needsParens(myPrec, parentPrec, isRightOfParent) ? `(${expr})` : expr;
    }

    case 'compare': {
      const myPrec = opPrec(node.op);
      const leftStr  = printNode(node.left,  opts, myPrec, false);
      const rightStr = printNode(node.right, opts, myPrec, true);
      const expr = `${leftStr} ${node.op} ${rightStr}`;
      return needsParens(myPrec, parentPrec, isRightOfParent) ? `(${expr})` : expr;
    }

    case 'logical': {
      const myPrec = opPrec(node.op);
      const opStr   = node.op === 'and' ? 'AND' : 'OR';
      const leftStr  = printNode(node.left,  opts, myPrec, false);
      const rightStr = printNode(node.right, opts, myPrec, true);
      const expr = `${leftStr} ${opStr} ${rightStr}`;
      return needsParens(myPrec, parentPrec, isRightOfParent) ? `(${expr})` : expr;
    }

    case 'not': {
      const operandStr = printNode(node.operand, opts, 6, false);
      return `NOT (${operandStr})`;
    }

    case 'if': {
      const condStr = printNode(node.cond, opts, 0, false);
      const thenStr = printNode(node.then, opts, 0, false);
      const elseStr = printNode(node.else, opts, 0, false);
      return `IF(${condStr}, ${thenStr}, ${elseStr})`;
    }
  }
}

/**
 * Returns true if a child expression with `childPrec` needs parentheses
 * when placed inside a parent with `parentPrec`.
 * All binary ops are left-associative, so equal precedence on the right also needs parens.
 */
function needsParens(childPrec: number, parentPrec: number, isRight: boolean): boolean {
  if (parentPrec === 0) return false;
  if (childPrec < parentPrec) return true;
  if (childPrec === parentPrec && isRight) return true;
  return false;
}
