# Settings — manual test procedure (2026-09-01)

Run `SKIP_ENV_VALIDATION=1 NODE_OPTIONS=--max-old-space-size=1536 npx next dev --turbopack` from
`apps/web` and start at `http://localhost:3000/en/settings`.

The store is in-memory: restarting the dev server resets everything to the seeded prototype values.

## A. Hub (`/en/settings`)

1. The route renders instead of 404-ing.
2. Four cards appear: Merchant Profile, Notification Preferences, API Keys, Developer.
3. Each card shows a status badge — "2 live keys active", "All topics active", "2 IP rules".
4. Clicking a card navigates to that section.
5. "Related settings" links resolve: `/en/payouts/settings`, `/en/webhooks`, `/en/billing`.
6. The sidebar now has a "Settings" entry above "Merchant", and it is highlighted here.
7. The `<SettingsNav/>` tab strip shows Overview as the current tab.

## B. Merchant profile (`/en/settings/merchant`)

8. Breadcrumb "Settings" navigates to the hub (it was `href="#"`).
9. Save Changes is disabled on load; the footer reads "All changes saved".
10. Edit "Doing Business As" → footer reads "Unsaved changes"; Save and Cancel become enabled.
11. Cancel restores every field to the last saved values and disables both buttons again.
12. Type an invalid brand colour (`abc`) → inline error, swatch clears; the colour picker still works.
13. Pick a colour with the native picker → the hex field and swatch update together.
14. Statement descriptor uppercases as you type and shows `n/22`.
15. Clear the support email → Save → server-side field error under the input, no toast success.
16. Fix it → Save → spinner "Saving…", then a success toast, footer returns to "All changes saved".
17. Reload → the saved values persist and "Last saved …" appears.
18. Edit a field and try to close the tab → the browser warns about unsaved changes.
19. Blank the logo URL → the avatar falls back to an icon instead of a broken image.

## C. Notifications (`/en/settings/notifications`)

20. Breadcrumb navigates to the hub.
21. Toggle "SMS Alerts" → it flips immediately and a toast confirms; reload keeps the value.
22. Change "Payouts" email frequency to Off → toast; the hub now reports "1 topic muted".
23. "Disputes & Chargebacks" is badged Critical; its frequency select and dashboard switch are
    disabled and the select shows "Instant (Forced)".
24. Its SMS switch is still editable.
25. The header shows "Saving…" during a write and a saved timestamp afterwards.

## D. API keys (`/en/settings/api-keys`)

26. Live and Test tables render from data, with scope chips, created date and "last used"/"Never used".
27. The row copy button copies the masked key and toasts.
28. "Generate New Key" → dialog. Submitting empty → name and confirmation errors.
29. Fill name, pick Test, tick two scopes, tick the acknowledgement → Create → the secret panel appears blurred.
30. Reveal → secret readable; Copy → clipboard toast.
31. "I have stored it safely" closes the dialog; the new row appears at the top of the Test table.
32. Re-opening the dialog does **not** show the previous secret again.
33. Row menu → "Copy key ID" toasts with the id.
34. Row menu → "Revoke key…" → the Revoke button is disabled until the checkbox is ticked.
35. Confirm → toast, the row stays but is dimmed and badged "Revoked"; its menu entries are disabled.
36. Row menu → "Roll key…" on an active key → confirm → new secret panel; the old row becomes Revoked
    and the new row shows "Rolled from key_…".
37. Revoke every live key → the hub's API Keys card flips to "0 live keys active".
38. Revoke every test key… then create one from the empty state's "Create key" button.

## E. Developer (`/en/settings/developer`)

39. Breadcrumb navigates to the hub.
40. Toggle "Sandbox mode" → optimistic flip + toast; reload persists.
41. Toggle "Webhook retries" independently — the other switch does not move.
42. The API Keys card lists only active keys and links to `/en/settings/api-keys`.
43. "Open webhook console" navigates to `/en/webhooks`.
44. IP allowlist: Add is disabled while the field is empty.
45. Type `999.1.1.1` → inline validation error, Add stays disabled.
46. Type `192.0.2.55`, label "Laptop" → Add enables → click → spinner → toast → row appears with date.
47. Re-add the same IP → duplicate error toast.
48. Remove a row → per-row spinner, then toast; the hub's IP count drops.
49. Remove every row → the empty state explains that all addresses are allowed.
50. The "API Documentation" card navigates to `/en/support` (it was `href="#"`).

## F. Loading & error states

51. Throttle the network — each settings route shows its skeleton (`loading.tsx`), not a blank page.
52. Every mutating control disables itself while its request is in flight.
