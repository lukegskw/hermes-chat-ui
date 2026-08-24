# Optimization decision log

## Scope

- Remove high-confidence dead code and duplicate generated CSS.
- Fix stream recovery, model-selection races, and unnecessary rendering work.
- Reduce the initial client payload and tighten build/CI safeguards.
- Preserve external API routes, public PWA assets, and design screenshots unless their owner explicitly approves removal.

## Decisions

1. Batch visual stream updates to animation frames rather than render for every SSE fragment. This preserves streaming feedback while bounding render frequency.
2. Fetch the model catalog once per endpoint and derive session-specific selection separately. This removes stale-response races and duplicate requests.
3. Keep runtime validation, but use the smaller Zod functional API only if it retains the existing validation contract.
4. Move shared animation keyframes to the global stylesheet; CSS Modules consume their global names instead of emitting copies.
5. Treat deletion of unreferenced documentation images and local Git artifacts as out of scope: they are not runtime code and may be intentionally retained.
