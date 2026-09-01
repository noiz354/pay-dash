# Payouts — manual test procedure (2026-09-01)

Run `SKIP_ENV_VALIDATION=1 NODE_OPTIONS=--max-old-space-size=1536 npx next dev --turbopack` from
`apps/web` and start at `http://localhost:3000/en/payouts`.

The store is in-memory: restart the dev server to reset the seeded batches.
Settlement rule: **account numbers ending in `0000` always fail** — use one to exercise the
failure and retry paths.

## A. Index (`/en/payouts`)

1. The route renders instead of 404-ing; the sidebar now has a "Payouts" entry above "Bulk Payouts".
2. Four summary cards render real money (`Rp …`), never a string starting with a comma.
3. "Pending disbursements" reports 5 recipients across 3 batches; the figure equals the sum of the
   pending rows in the tables.
4. Each card navigates: pending → `?status=SCHEDULED`, completed → `?status=PAID&range=30d`,
   needs attention → `?status=FAILED`, next run → `/payouts/settings`.
5. Batch history lists 5 seeded batches, newest first, with a paid/total progress bar.
6. Status filter → the URL gains `?status=…`; reload keeps the filter.
7. Range and sort filters behave the same; "Clear filters" resets to `/en/payouts`.
8. Search "affiliate" → 1 result; search a batch ID → 1 result; search nonsense → filtered empty
   state offering "Clear filters".
9. Pagination appears once more than 10 batches exist (create some), and page 99 clamps.
10. Clicking a row opens the batch; cmd/ctrl-click opens it in a new tab.
11. Row menu: View batch, Release funds… (scheduled only), Retry failed (partial only),
    Cancel batch… (scheduled only), Copy batch ID, Download recipients CSV, Payout settings.
12. "Export Log" downloads a CSV honouring the current filters.
13. "New Batch" opens the create dialog; `/en/payouts?new=1` opens it directly.

## B. Batch detail (`/en/payouts/BATCH-2026-08-012`)

14. Breadcrumb "Payouts" returns to the index.
15. Header shows the derived status **Partially paid** and the four totals; paid + outstanding +
    failed equals the batch total.
16. Recipients table lists 4 rows with per-row status; the failed row shows "Account name mismatch"
    and the returned row "Beneficiary account closed".
17. Filter recipients by name, account or reference; clearing restores all rows.
18. "Retry" on the failed row shows a per-row spinner, then a success toast; the batch status
    recalculates to Paid once nothing is failing.
19. "Retry N failed" in the header retries every failed row at once.
20. Activity timeline gains an entry for each retry, with a timestamp.
21. "Recipients CSV" downloads one row per recipient including failure reasons.
22. `/en/payouts/BATCH-NOPE` renders the not-found state with working links.

## C. Releasing money (`/en/payouts/BATCH-2026-08-014`)

23. The header shows Release funds and Cancel batch (scheduled batch only).
24. Release → dialog shows the total and recipient count; submitting without ticking the
    confirmation shows the confirmation error.
25. Tick and release → spinner, then a toast; the batch becomes Paid and the buttons disappear.
26. Releasing again is impossible (the action is gone); via the row menu it is also gone.
27. `?send=1` on the URL opens the dialog directly; closing it strips the parameter.
28. On a fresh restart, cancel the same batch instead → all rows Returned, timeline records
    "Batch cancelled", no money released.

## D. Bulk upload (`/en/payouts/bulk`)

29. Numbers in the summary cards match the index (same derivation).
30. The dropzone is focusable and activates with Enter/Space; a file dialog opens.
31. Drag a CSV over it → the border highlights; drop → the file name appears and a toast reports
    the parse result.
32. Paste rows into the textarea → the preview appears live.
33. Preview shows "N valid / M invalid" and the total; the Valid/Rejected toggle switches tables.
34. Rejected rows list line number and reason for: missing columns, empty name, empty bank, bad
    account number, non-numeric amount, zero amount, duplicate account.
35. "Rejected rows" downloads only the failed lines.
36. "Download template" saves `payout-recipients-template.csv`; re-uploading it parses 3/3 valid.
37. The submit button is disabled while there are no valid rows, and shows the count and total
    once there are.
38. Submit without a name → inline "Give the batch a recognisable name".
39. Submit with a name → spinner, success toast, redirect to the new batch (status Draft).
40. Add a release date → the new batch is Scheduled instead.
41. A file over 2 MB is rejected with a toast.
42. "Recent batches" lists the newest 5 and links to the full history.

## E. Payout settings (`/en/payouts/settings`)

43. Breadcrumb returns to `/en/payouts`.
44. Save and Discard are disabled until something changes; the status line reads "All changes saved".
45. Turning off Automated Payouts disables the cadence, day and threshold controls.
46. Choosing Weekly reveals the weekday select; Monthly reveals the day-of-month field (1–28).
47. Setting cadence to Manual while automated is on → server-side error on the cadence field.
48. The threshold accepts `50000`, `50,000` and `Rp 50.000`; blur reformats it; clearing it shows
    "Enter an amount, e.g. 50,000".
49. Discard restores every control to the last saved values.
50. Save → spinner → toast; reload keeps the values and the status line shows the save time.
51. Notification checkboxes (initiated / completed / failed) persist with the form.
52. "Change" opens the destination dialog: the current account is selected, the unverified BNI
    account is disabled and badged "Verifying".
53. "Use this account" is disabled until a different account is chosen; choosing Mandiri and
    saving updates the card.
54. "Add bank account" validates bank, holder and an 8–20 digit number; adding a duplicate
    number errors; the new account appears unverified.
55. The side panel's next-run / threshold / in-flight figures match the index cards.

## F. Loading, errors and cross-links

56. Throttle the network — index, detail, bulk and settings each show a skeleton, not a blank page.
57. Every mutating control disables itself while its request is in flight.
58. Detail page links to `/en/balance` and `/en/payouts/settings`; settings links to
    `/en/settings/notifications`; index breadcrumb links to `/en/balance`.
