/**
 * A small in-memory stand-in for the service-role Supabase client, for routes that read and
 * write the same table several times in one request (Click Places check-in, Pulse, stats).
 *
 * Supports the PostgREST subset those routes use: select (column projection, `count`/`head`),
 * insert/update/upsert/delete (with `.select()` returning rows), eq/neq/or(eq)/in/is/gt/gte/lt/lte/
 * contains/not(col,'is',null), order, limit, single, maybeSingle; plus `rpc` handlers and
 * per-table unique constraints that raise 23505 like Postgres.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Filter = (row: Row) => boolean;

export type UniqueConstraint = { columns: string[]; where?: (row: Row) => boolean };

export type FakeDbOptions = {
  tables?: Record<string, Row[]>;
  unique?: Record<string, UniqueConstraint[]>;
  defaults?: Record<string, (row: Row) => Row>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  /** Make every query against a table fail. */
  failTables?: Record<string, string>;
};

let idCounter = 0;
export function fakeUuid(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function project(row: Row, columns: string | undefined): Row {
  if (!columns || columns.trim() === '*') return { ...row };
  const out: Row = {};
  for (const raw of columns.split(',')) {
    const col = raw.trim();
    if (!col || col.includes('(')) continue;
    const [name, alias] = col.split(':').reverse();
    out[alias ?? name] = row[name];
  }
  return out;
}

export class FakeDb {
  tables: Record<string, Row[]>;
  unique: Record<string, UniqueConstraint[]>;
  defaults: Record<string, (row: Row) => Row>;
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown>;
  failTables: Record<string, string>;
  /** Every operation, for assertions: [table, op, payload?]. */
  log: Array<{ table: string; op: string; payload?: unknown }> = [];

  constructor(options: FakeDbOptions = {}) {
    this.tables = {};
    for (const [name, rows] of Object.entries(options.tables ?? {})) this.tables[name] = rows.map((r) => ({ ...r }));
    this.unique = options.unique ?? {};
    this.defaults = options.defaults ?? {};
    this.rpcHandlers = options.rpc ?? {};
    this.failTables = options.failTables ?? {};
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  violates(table: string, candidate: Row, ignore?: Row): boolean {
    for (const c of this.unique[table] ?? []) {
      if (c.where && !c.where(candidate)) continue;
      const clash = this.rows(table).some(
        (r) => r !== ignore && (!c.where || c.where(r)) && c.columns.every((col) => r[col] === candidate[col]),
      );
      if (clash) return true;
    }
    return false;
  }

  from = (table: string) => new FakeQuery(this, table);

  rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<Result> => {
    this.log.push({ table: `rpc:${fn}`, op: 'rpc', payload: args });
    const handler = this.rpcHandlers[fn];
    if (!handler) return { data: null, error: null };
    try {
      return { data: await handler(args), error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        this.log.push({ table: `storage:${bucket}`, op: 'upload', payload: path });
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        this.log.push({ table: `storage:${bucket}`, op: 'remove', payload: paths });
        return { data: [], error: null };
      },
    }),
  };

  /** The client object routes receive. */
  get client(): { from: FakeDb['from']; rpc: FakeDb['rpc']; storage: FakeDb['storage'] } {
    return { from: this.from, rpc: this.rpc, storage: this.storage };
  }
}

class FakeQuery implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private columns: string | undefined;
  private returning = false;
  private countMode = false;
  private headOnly = false;
  private orders: Array<{ col: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private db: FakeDb, private table: string) {}

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    if (options?.count) this.countMode = true;
    if (options?.head) this.headOnly = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  /** `or('a.eq.x,b.eq.y')`: eq clauses only. */
  or(expression: string) {
    const clauses = expression.split(',').map((c) => {
      const [col, op, ...rest] = c.split('.');
      if (op !== 'eq') throw new Error(`FakeDb or(): unsupported operator ${op}`);
      return { col, value: rest.join('.') };
    });
    this.filters.push((r) => clauses.some(({ col, value }) => String(r[col]) === value));
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push((r) => (value === null ? r[col] == null : r[col] === value));
    return this;
  }
  not(col: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) this.filters.push((r) => r[col] != null);
    else if (operator === 'eq') this.filters.push((r) => r[col] !== value);
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) > 0);
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) >= 0);
    return this;
  }
  lt(col: string, value: unknown) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) < 0);
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) <= 0);
    return this;
  }
  contains(col: string, values: unknown[]) {
    this.filters.push((r) => Array.isArray(r[col]) && values.every((v) => (r[col] as unknown[]).includes(v)));
    return this;
  }
  order(col: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ col, ascending: options.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => f(row));
  }

  private finish(rows: Row[]): Result {
    let out = rows;
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (o.ascending ? cmp(a[o.col], b[o.col]) : cmp(b[o.col], a[o.col])));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    const projected = out.map((r) => project(r, this.columns));
    const count = this.countMode ? rows.length : null;
    if (this.headOnly) return { data: null, error: null, count };
    if (this.singleMode) {
      if (projected.length > 1 || (this.singleMode === 'single' && projected.length === 0)) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count };
      }
      return { data: projected[0] ?? null, error: null, count };
    }
    return { data: projected, error: null, count };
  }

  private execute(): Result {
    const failure = this.db.failTables[this.table];
    if (failure) return { data: null, error: { message: failure } };
    const table = this.db.rows(this.table);
    this.db.log.push({ table: this.table, op: this.op, payload: this.payload ?? undefined });

    if (this.op === 'select') return this.finish(table.filter((r) => this.matches(r)));

    if (this.op === 'delete') {
      const doomed = table.filter((r) => this.matches(r));
      this.db.tables[this.table] = table.filter((r) => !doomed.includes(r));
      return this.returning ? this.finish(doomed) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const targets = table.filter((r) => this.matches(r));
      for (const r of targets) {
        const next = { ...r, ...(this.payload as Row) };
        if (this.db.violates(this.table, next, r)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
      }
      for (const r of targets) Object.assign(r, this.payload as Row);
      return this.returning ? this.finish(targets) : { data: null, error: null };
    }

    const payloads = (Array.isArray(this.payload) ? this.payload : [this.payload as Row]).map((p) => {
      const withDefaults = this.db.defaults[this.table] ? this.db.defaults[this.table]({ ...p }) : { ...p };
      if (withDefaults.id === undefined) withDefaults.id = fakeUuid();
      return withDefaults;
    });

    const written: Row[] = [];
    for (const p of payloads) {
      if (this.op === 'upsert' && this.upsertOptions.onConflict) {
        const keys = this.upsertOptions.onConflict.split(',').map((k) => k.trim());
        const existing = table.find((r) => keys.every((k) => r[k] === p[k]));
        if (existing) {
          if (!this.upsertOptions.ignoreDuplicates) {
            const { id: _ignored, ...rest } = p;
            void _ignored;
            Object.assign(existing, rest);
            written.push(existing);
          }
          continue;
        }
      }
      if (this.db.violates(this.table, p)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
      }
      table.push(p);
      written.push(p);
    }
    return this.returning ? this.finish(written) : { data: null, error: null };
  }
}

/** Every string value anywhere in a JSON-like value (for privacy deep scans). */
export function deepStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => deepStrings(v, out));
  return out;
}

/** Every object key anywhere in a JSON-like value. */
export function deepKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      deepKeys(v, out);
    }
  }
  return out;
}
