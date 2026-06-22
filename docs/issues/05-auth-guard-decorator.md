# 05 — Auth guard + @CurrentUser decorator

**Phase:** 1 · **Depends on:** #01 · **Implements:** ADR-006

## Goal
A `SessionAuthGuard` that turns `X-Session-Id` into a trusted `req.user.userId`, plus a
`@CurrentUser()` param decorator. Designed as a swappable boundary so JWT can replace the internals
later with zero downstream changes.

## Concepts you'll learn
- **Guards** and the `CanActivate` interface; running before interceptors/pipes.
- **Custom param decorators** (`createParamDecorator`) to inject `req.user`.
- Treating auth as an **abstraction boundary** (ADR-006).
- `ExecutionContext` and switching to the HTTP request.

## Steps
1. `SessionAuthGuard implements CanActivate`: read `X-Session-Id`; reject (`401`) if missing or not
   a valid UUID; else attach `req.user = { userId }` and return true. Keep the "how we got userId"
   logic isolated in one private method so JWT can replace it later.
2. `@CurrentUser()` param decorator returning `req.user` (or `req.user.userId`).
3. Apply the guard to checkout/sale mutations (via `@UseGuards`); leave `/health` open.
4. Define a typed `AuthenticatedRequest` so `req.user` is type-safe.

## Acceptance criteria
- [ ] Missing/malformed `X-Session-Id` → `401`.
- [ ] Valid UUID → request proceeds; `@CurrentUser()` yields the userId in the controller.
- [ ] Guard runs before the validation pipe (verify via request-lifecycle order).
- [ ] No downstream code reads the header directly — only `req.user`.

## Docs to read
- NestJS Guards: https://docs.nestjs.com/guards
- NestJS Custom decorators: https://docs.nestjs.com/custom-decorators
- NestJS Execution context: https://docs.nestjs.com/fundamentals/execution-context
- Request lifecycle (guard ordering): https://docs.nestjs.com/faq/request-lifecycle
