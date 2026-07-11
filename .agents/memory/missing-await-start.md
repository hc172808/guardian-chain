---
name: Missing await on async start()-style calls
description: A recurring bug shape — calling an async function without await and trusting its return shape
---

When a function's signature changes from sync to `Promise<{ok, message}>` (or
similar), every existing call site must add `await`, or the caller silently
gets the Promise object itself instead of the resolved value. Property access
like `result.ok` then reads `undefined` (falsy) unconditionally, so the
failure branch always runs and prints unhelpful messages like
"undefined" — even when the underlying operation actually succeeded.

**How to apply:** whenever you see a call site read `.ok`/`.message`/similar
result fields, and the callee is `async` or a documented Promise-returner,
verify `await` is present. This is an easy, high-value grep after changing
any function to return a Promise: search all call sites of that function.
