---
trigger: always_on
---

# TypeScript Type Safety Rules (Required)

## Strictly Prohibited

- The `any` type (use `unknown` + type guards instead)
- `as any` casts
- `@ts-ignore` and `@ts-expect-error` without an explanatory comment
- Excessive non-null assertions `\!` (only allowed after explicit null checks)

## Required Patterns

- Validate external API responses using `unknown` + Zod schemas
- Use generics wherever a function operates on multiple types
- Prefer type inference over redundant explicit annotations
- Resolve type errors by fixing the type definition or adding a type guard — never by widening to `any`

## Error Resolution Priority

When encountering a TypeScript error:

1. Fix the underlying type definition
2. Add a type guard function
3. Use a justified type assertion (with an inline comment explaining why)
