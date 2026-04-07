<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TypeScript rules

- **Always explicitly type every callback parameter** in `.map()`, `.filter()`, `.find()`, `.flatMap()`, `.sort()`, etc. — even when TypeScript seems to infer it locally. The deployment build is stricter than `tsc --noEmit` (which uses stale incremental cache) and will fail with "implicitly has an 'any' type".
- Use `(typeof array)[number]` to derive the element type inline without importing anything: `arr.map((item: (typeof arr)[number]) => ...)`.
- For index parameters, also annotate: `arr.map((item: (typeof arr)[number], i: number) => ...)`.
- For nested callbacks, derive nested types the same way: `(typeof arr)[number]["field"][number]`.
- Constant objects used as string-keyed lookups must be typed `Record<string, string>` (or appropriate value type), otherwise indexing with a `string` variable fails the build.
- **Do not rely on `tsc --noEmit` to validate build correctness** — run `npx next build` locally to catch all errors before deploying.
