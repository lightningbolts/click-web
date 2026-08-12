/**
 * Shared Supabase mocks for API route contract tests.
 *
 * `makeQueryBuilder` mimics PostgrestFilterBuilder closely enough for route code:
 * every filter method is chainable and records the arguments it was called with,
 * and the builder itself is thenable so a chain resolves whether or not the route
 * terminates it with `.maybeSingle()`.
 *
 * Recording the arguments is the point: it lets a test assert that a query was
 * actually scoped to the signed-in user / requested venue, which a
 * `mockReturnThis()` stub cannot do.
 */

export type QueryResult<T = unknown> = {
  data: T;
  error: { message: string } | null;
};

const BUILDER_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'or',
  'in',
  'contains',
  'filter',
  'match',
  'order',
  'limit',
  'range',
  'single',
  'maybeSingle',
] as const;

export type BuilderMethod = (typeof BUILDER_METHODS)[number];

export type MockQueryBuilder = Record<BuilderMethod, jest.Mock> & {
  /** Arguments each builder method was called with, in call order. */
  calls: Partial<Record<BuilderMethod, unknown[][]>>;
  then: PromiseLike<QueryResult>['then'];
};

export function makeQueryBuilder(
  result: QueryResult = { data: null, error: null },
): MockQueryBuilder {
  const calls: Partial<Record<BuilderMethod, unknown[][]>> = {};

  const builder = {
    calls,
    then: (onFulfilled?: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(
        onFulfilled as never,
        onRejected as never,
      ),
  } as unknown as MockQueryBuilder;

  for (const method of BUILDER_METHODS) {
    builder[method] = jest.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    });
  }

  return builder;
}

export type SupabaseMockOptions = {
  /** Result returned by every chain against a given table. */
  tables?: Record<string, QueryResult>;
  /** Per-RPC-name result; unlisted names resolve to `{ data: null, error: null }`. */
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => QueryResult | Promise<QueryResult>;
};

export type SupabaseMock = {
  supabase: { from: jest.Mock; rpc: jest.Mock };
  from: jest.Mock;
  rpc: jest.Mock;
  /** The builder the route received for `table`; throws if it never queried it. */
  builder(table: string): MockQueryBuilder;
};

export function makeSupabaseMock({
  tables = {},
  rpc,
}: SupabaseMockOptions = {}): SupabaseMock {
  const builders = new Map<string, MockQueryBuilder>();

  const from = jest.fn((table: string) => {
    if (!(table in tables)) {
      throw new Error(`Route queried an unexpected table: ${table}`);
    }
    let builder = builders.get(table);
    if (!builder) {
      builder = makeQueryBuilder(tables[table]);
      builders.set(table, builder);
    }
    return builder;
  });

  const rpcMock = jest.fn(
    async (fn: string, args?: Record<string, unknown>): Promise<QueryResult> =>
      rpc ? rpc(fn, args) : { data: null, error: null },
  );

  return {
    supabase: { from, rpc: rpcMock },
    from,
    rpc: rpcMock,
    builder(table: string) {
      const builder = builders.get(table);
      if (!builder) {
        throw new Error(`Route never queried table: ${table}`);
      }
      return builder;
    },
  };
}

/** Every argument list a given filter method was called with. */
export function filterCalls(
  builder: MockQueryBuilder,
  method: BuilderMethod = 'eq',
): unknown[][] {
  return builder.calls[method] ?? [];
}

/** Assert the query was narrowed by `column = value` (or another filter method). */
export function expectFilter(
  builder: MockQueryBuilder,
  column: string,
  value: unknown,
  method: BuilderMethod = 'eq',
): void {
  expect(filterCalls(builder, method)).toContainEqual([column, value]);
}

/** Arguments each call to `rpc(fn, …)` received. */
export function rpcArgsFor(
  rpc: jest.Mock,
  fn: string,
): (Record<string, unknown> | undefined)[] {
  return rpc.mock.calls
    .filter((call) => call[0] === fn)
    .map((call) => call[1] as Record<string, unknown> | undefined);
}

/** Assert an RPC ran exactly once and received `args`. */
export function expectRpcCalledWith(
  rpc: jest.Mock,
  fn: string,
  args: Record<string, unknown>,
): void {
  expect(rpcArgsFor(rpc, fn)).toEqual([args]);
}
