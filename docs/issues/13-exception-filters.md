# 13 — Exception filters (Http + Prisma)

**Phase:** 1b · **Depends on:** #02 · **Implements:** ADR-013

## Goal
A global `HttpExceptionFilter` for a consistent error envelope, plus a `PrismaExceptionFilter` that
maps known Prisma errors to clean HTTP signatures while logging full internal context.

## Concepts you'll learn
- **Exception filters** and `@Catch`; global vs scoped; filter precedence.
- Mapping infrastructure errors to a **stable public contract** (never leak raw DB internals).
- Preserving **internal log context** while returning a sanitised response.

## Steps
1. `HttpExceptionFilter` (`@Catch()` or `@Catch(HttpException)`): emit a consistent body
   `{ statusCode, error, message, requestId, timestamp, path }`. Log full error server-side.
2. `PrismaExceptionFilter` (`@Catch(Prisma.PrismaClientKnownRequestError)`): map e.g.
   - `P2002` (unique) → **409 Conflict**
   - `P2025` (not found) → **404 Not Found**
   - default → **500** with a generic message (details only in logs).
3. Register globally (`app.useGlobalFilters(...)`), Prisma filter before the generic Http filter.
4. Ensure the `requestId` from pino logging is echoed for correlation.

## Acceptance criteria
- [ ] All errors return the same JSON envelope shape.
- [ ] A unique-constraint violation surfaces as 409, not a 500 with a raw Prisma dump.
- [ ] Raw SQL/Prisma details never appear in the HTTP response, but **do** appear in logs.
- [ ] `requestId` correlates a response to its log line.

## Docs to read
- NestJS Exception filters: https://docs.nestjs.com/exception-filters
- Prisma error reference: https://www.prisma.io/docs/orm/reference/error-reference
- RFC 9457 Problem Details (optional, for envelope design): https://www.rfc-editor.org/rfc/rfc9457
