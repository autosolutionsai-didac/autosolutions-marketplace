src/prices.js still has the July 2026 prices. Add Anthropic's current list prices for claude-haiku-5-5, claude-sonnet-5-5 and claude-opus-5-5, and keep the existing entries exactly as they are.

Use the same fields as the existing entries: input, output, cacheRead and cacheWrite, all in USD per million tokens, where cacheWrite is the 5-minute cache write price. For Haiku 5.5, use the prices for prompts up to 100,000 tokens.

Look the prices up on Anthropic's official pages rather than relying on memory, because some of them changed recently. Put the source URL in a comment in src/prices.js and update its "Last updated" line. Add a test that costs one request on each of the three new models.

The existing test suite (npm test) must keep passing.
