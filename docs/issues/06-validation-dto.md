# 06 — Validation pipe + checkout DTO

**Phase:** 1 · **Depends on:** #01 · **Implements:** ADR (request lifecycle / pipes)

## Goal
Global, strict input validation with `ValidationPipe` + `class-validator`, and a typed checkout DTO
with precise UUID assertions.

## Concepts you'll learn
- **Pipes** for validation/transformation; global vs per-route.
- `class-validator` / `class-transformer` decorators.
- **`whitelist` + `forbidNonWhitelisted`** to strip/reject unknown fields (payload sanitisation).
- `transform: true` to get real DTO instances.

## Steps
1. `pnpm add class-validator class-transformer`.
2. Register a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
   in `main.ts`.
3. `CheckoutDto`:
   ```ts
   export class CheckoutDto {
     @IsUUID('4') saleId: string;
     // quantity intentionally omitted — 1-per-customer (ADR-004). Add @IsInt @Min @Max if relaxed.
   }
   ```
4. Validate the `X-Idempotency-Key` header shape too (UUID or a bounded string) — header validation
   can live in the interceptor (#11) or a small custom pipe; document the choice.

## Acceptance criteria
- [ ] Non-UUID `saleId` → `400` with a clear validation message.
- [ ] Unknown/extra body fields are rejected (`forbidNonWhitelisted`).
- [ ] Controller receives a typed `CheckoutDto` instance, not a raw object.
- [ ] Pipe runs after guards, before the controller (verify via lifecycle).

## Docs to read
- NestJS Pipes: https://docs.nestjs.com/pipes
- NestJS Validation technique: https://docs.nestjs.com/techniques/validation
- class-validator: https://github.com/typestack/class-validator#validation-decorators
