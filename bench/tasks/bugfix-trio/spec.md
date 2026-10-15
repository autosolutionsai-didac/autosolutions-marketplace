Fix these three bug reports. Each fix needs a regression test that fails before the fix and passes after it.

1. Discounted invoice totals are sometimes one cent low. A $10.01 subtotal with a 15% discount should total $8.51, but the invoice shows $8.50. The rule: the discounted total, subtotal x (100 - percent) / 100, is rounded half up to the nearest cent. So 10 cents with 15% off is 8.5 cents, which becomes 9.
2. The invoice CSV export (GET /invoices/:key?format=csv) breaks when a value contains a comma, a double quote or a line break, for example for the API key "team, alpha". Quote fields as RFC 4180 describes: wrap a field in double quotes when it contains a comma, a double quote, a CR or an LF, and double every double quote inside it. Leave all other fields unquoted and keep the \n line endings.
3. GET /invoices/:key returns a 500 error for a key that has no usage. It should return 404 with the JSON body {"error":"not_found"}, for both the JSON and the CSV format.

The existing test suite (npm test) must keep passing.
