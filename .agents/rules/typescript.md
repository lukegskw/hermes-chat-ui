---
trigger: always_on
---

# TypeScript Type Safety Rules (Required)

## Strictly Prohibited

- The `any` type (use `unknown` + type guards instead)
- `as` casts of any kind
- Non-null assertions `\!`
- Use of `interface` for defining app specific types
- Ignore or bypass TypeScript and lint rules with comments such as `eslint-disable-next-line` or `@ts-ignore`

## Required Patterns

- Use `type` for defining app specific types
- Validate external API responses using `unknown` + Zod schemas
- Use generics wherever a function operates on multiple types
- Prefer type inference over redundant explicit annotations
- Resolve type errors by fixing the type definition or adding a type guard — never by widening to `any`

## Error Resolution Priority

When encountering a TypeScript error:

1. Fix the underlying type definition
2. Add a type guard function
3. Use a justified type assertion (with an inline comment explaining why)

## Code verification

- Always run TypeScript (`npx tsc --noEmit`) and lint checks (`npm run lint`) after you finish a feature. DO NOT EVER SAY THE USER YOU FINISHED A TASK BEFORE DOING THAT.
- Fix all TypeScript and lint issues that arise