import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLError, GraphQLScalarType, Kind, graphql, parse, validate, type ValueNode } from "graphql";
import type { AppKey, User } from "../auth.js";
import { isStaff } from "../auth.js";
import { PKG_ROOT } from "../config.js";
import { resolvers } from "./resolvers.js";
import type { GqlContext } from "./context.js";

export type { GqlContext } from "./context.js";
export { forbidden, requireStaffUser, requireUser, unauthenticated } from "./context.js";

function astToJson(ast: ValueNode, variables?: Record<string, unknown> | null): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return ast.values.map((v) => astToJson(v, variables));
    case Kind.OBJECT: {
      const out: Record<string, unknown> = {};
      for (const f of ast.fields) out[f.name.value] = astToJson(f.value, variables);
      return out;
    }
    case Kind.VARIABLE:
      return variables?.[ast.name.value];
    case Kind.ENUM:
      return ast.value;
    default:
      return null;
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value.",
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: (ast, variables) => astToJson(ast, variables),
});

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 timestamp (passed through as a string).",
  serialize: (v) => (v instanceof Date ? v.toISOString() : v),
  parseValue: (v) => {
    if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
      throw new GraphQLError("DateTime must be an ISO-8601 string");
    }
    return v;
  },
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING || Number.isNaN(new Date(ast.value).getTime())) {
      throw new GraphQLError("DateTime must be an ISO-8601 string");
    }
    return ast.value;
  },
});

export const typeDefs = readFileSync(resolve(PKG_ROOT, "src/graphql/schema.graphql"), "utf8");

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers: { JSON: JSONScalar, DateTime: DateTimeScalar, ...resolvers },
});


/** Express handler for POST /graphql (and the /api/graphql alias). */
export async function graphqlHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { query?: unknown; variables?: unknown; operationName?: unknown };
  if (typeof body.query !== "string" || !body.query.trim()) {
    res.status(400).json({ errors: [{ message: "Missing GraphQL query" }] });
    return;
  }
  let document;
  try {
    document = parse(body.query);
  } catch (err) {
    res.status(400).json({ errors: [{ message: err instanceof Error ? err.message : "Invalid query" }] });
    return;
  }
  const validationErrors = validate(schema, document);
  if (validationErrors.length) {
    res.status(400).json({
      errors: validationErrors.map((e) => ({ message: e.message, extensions: { code: "GRAPHQL_VALIDATION_FAILED" } })),
    });
    return;
  }
  const user = (res.locals.user as User | undefined) ?? null;
  const context: GqlContext = {
    user,
    app: (res.locals.app as AppKey | null) ?? null,
    staff: user ? isStaff(user) : false,
    token: (res.locals.token as string | null) ?? null,
    res,
  };
  const result = await graphql({
    schema,
    source: body.query,
    variableValues: (body.variables as Record<string, unknown> | null | undefined) ?? undefined,
    operationName: typeof body.operationName === "string" ? body.operationName : undefined,
    contextValue: context,
  });
  if (result.errors?.length) {
    // Only genuine resolver exceptions are worth a stack trace; validation,
    // variable-coercion and domain GraphQLErrors are expected client-facing output.
    for (const e of result.errors) {
      if (e.originalError && !(e.originalError instanceof GraphQLError)) console.error("[graphql]", e.originalError);
    }
  }
  res.status(200).json(result);
}
