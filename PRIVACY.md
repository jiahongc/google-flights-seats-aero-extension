# Privacy Policy — Seats.aero for Google Flights

**Effective date:** June 18, 2026
**Last updated:** June 18, 2026

This Chrome extension ("the Extension") is provided as free, open-source
software. This policy explains exactly what the Extension does and does not do
with your information.

## Summary

**The Extension does not collect, store, transmit, or sell any personal data.**
There are no analytics, no tracking, no advertising, and no developer-operated
servers. All processing happens locally in your browser.

## What the Extension stores

The Extension saves a small set of **display preferences** using Chrome's
`storage.sync` API:

- Whether the Google Flights search button is shown
- Minimum cents-per-point (CPP) filter value
- "Hide whole row below minimum" toggle
- Good-CPP highlight threshold
- Flexible-dates value
- Preferred display currency

These settings contain no personal information. They are stored by your own
browser and, if you are signed in to Chrome, synced across your devices by
Google as part of your Chrome profile. The developer has no access to them.

## Network requests the Extension makes

The Extension contacts only the following endpoints, and only to display
information back to you:

| Endpoint | Purpose | Data sent |
|---|---|---|
| `www.google.com/travel/flights` | Fetch cash prices for the route, date, and cabin shown on a seats.aero result | The flight search parameters already contained in the page URL (origin, destination, date, cabin). No identifiers are added. |
| `seats.aero` | The Extension reads the award-availability table already on the page you opened | None — it only reads the page you are viewing |
| `api.frankfurter.dev` | Retrieve public currency exchange rates (European Central Bank data) to convert award taxes/fees | None — the request contains no user data |

The Extension never sends your search history, browsing activity, identifiers,
or settings to any server.

## Permissions

| Permission | Why it is needed |
|---|---|
| `activeTab` | Read the current tab's URL when you press the keyboard shortcut, so the search only runs on a Google Flights page |
| `storage` | Save the display preferences listed above |
| Host access to `google.com/travel/flights` | Add the search button and read your search parameters; fetch cash prices |
| Host access to `seats.aero` | Add Google Flights price/CPP information to award results |
| Host access to `api.frankfurter.dev` | Fetch public exchange rates |

## Data sharing and sale

The Extension does **not** share or sell data to anyone. No data is collected
that could be shared or sold.

## Children's privacy

The Extension is a general-audience travel utility and does not knowingly
collect any information from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published in this
repository with a new "Last updated" date.

## Contact

Questions about this policy or the Extension can be filed as an issue at the
project's GitHub repository:
<https://github.com/jiahongc/google-flights-seats-aero-extension/issues>

<!-- Optional: add a direct contact email here if you want one shown publicly,
     e.g. "Or email: your-contact@example.com". The Chrome Web Store dashboard
     separately requires a contact email that is verified but not shown here. -->
