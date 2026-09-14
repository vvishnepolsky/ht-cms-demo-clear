import type { Response } from "express";
import { GraphQLError } from "graphql";
import type { AppKey, User } from "../auth.js";
import { isStaff } from "../auth.js";

export interface GqlContext {
  user: User | null;
  app: AppKey | null;
  /** True when the caller is a caseworker/admin. */
  staff: boolean;
  /** Session token presented with the request (cookie or Bearer). */
  token: string | null;
  /** Express response — lets the resident auth mutations set/clear the session cookie. */
  res: Response;
}

export function unauthenticated(): GraphQLError {
  return new GraphQLError("Authentication required", { extensions: { code: "UNAUTHENTICATED" } });
}

export function forbidden(message = "Forbidden"): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function requireUser(ctx: GqlContext): User {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}

export function requireStaffUser(ctx: GqlContext): User {
  const user = requireUser(ctx);
  if (!isStaff(user)) throw forbidden("Staff access only");
  return user;
}
