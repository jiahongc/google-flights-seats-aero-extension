# Chrome Web Store — Listing Content

Copy/paste these into the Chrome Web Store developer dashboard. Character limits
noted where the store enforces them.

---

## Product name (≤ 75 chars)

```
Seats.aero for Google Flights
```

## Summary / short description (≤ 132 chars)

```
Search seats.aero award availability from Google Flights, and see cash prices with cents-per-point value on seats.aero.
```

(118 characters.)

## Category

**Travel** — primary category.

## Language

English (United States)

---

## Detailed description (≤ 16,000 chars)

```
Award travel is a two-tab problem. You check Google Flights for the cash price, then search seats.aero separately for award space — copying routes, dates, and cabins back and forth. And even when you find award space, it's hard to know if it's actually a good deal.

Seats.aero for Google Flights closes that gap in both directions.

ON GOOGLE FLIGHTS
• A "Search on seats.aero" button appears in the results, pre-filled with your route, date, cabin, passengers, nonstop filter, and selected airlines — no re-typing.
• Round-trip searches open both legs. Multi-city routes get a per-leg selector.
• Press Alt+S to search without reaching for the mouse (shortcut is customizable).

ON SEATS.AERO
• Every award result shows the equivalent Google Flights cash price right inline.
• It calculates the cents-per-point (CPP) value for you, so you can instantly tell whether burning points beats paying cash.
• Award taxes and fees are subtracted first — with automatic currency conversion — so the CPP reflects what you'd actually pay.
• Good redemptions are highlighted. When the program is recognized, it uses a sensible per-program valuation (for example a lower bar for SkyMiles, a higher bar for AAdvantage); otherwise it uses a threshold you set.
• Filter out low-value results with a minimum-CPP setting, and optionally hide whole rows.
• Show prices and CPP in USD, EUR, GBP, CAD, AUD, or JPY.

PRIVACY
• No accounts, no analytics, no tracking, no data collection.
• Everything runs locally in your browser.
• The only network requests are to Google Flights (for cash prices), seats.aero (the page you're already on), and a public exchange-rate API for currency conversion.
• 100% open source — read every line.

A seats.aero account (Pro recommended) gives the best results. This extension is an independent project and is not affiliated with seats.aero or Google.
```

---

## Single purpose (Privacy practices tab)

```
This extension bridges Google Flights and seats.aero for award-travel research. On Google Flights it adds a one-click button that opens seats.aero pre-filled with the current search. On seats.aero it annotates award results with the matching Google Flights cash price and the cents-per-point value. That single purpose — comparing award availability against cash prices — covers all of its functionality.
```

---

## Permission justifications (Privacy practices tab)

**activeTab**
```
Used to read the URL of the active tab when the user presses the keyboard shortcut, so the seats.aero search is only triggered on a Google Flights results page. No tab data is stored or transmitted.
```

**storage**
```
Used to save the user's display preferences (button visibility, minimum-CPP filter, highlight threshold, flexible-dates value, and preferred currency). These contain no personal data and never leave the browser except via the user's own Chrome sync.
```

**Host permission — www.google.com/travel/flights**
```
Needed to add the "Search on seats.aero" button to the Google Flights results page, read the visible search parameters (origin, destination, date, cabin), and fetch the cash price for the route shown on a seats.aero result.
```

**Host permission — seats.aero**
```
Needed to add Google Flights cash-price and cents-per-point information directly onto seats.aero award-availability results.
```

**Host permission — api.frankfurter.dev**
```
Needed to fetch public currency exchange rates (European Central Bank data) so award taxes and fees in foreign currencies can be converted for the cents-per-point calculation. No user data is sent.
```

---

## Data usage disclosures (Privacy practices tab)

Answer the certification questions as follows. **No data categories should be
checked** — the extension collects none.

| Question | Answer |
|---|---|
| Does this item collect or use any of the listed user data types? | **No** (leave all categories unchecked) |
| I do not sell or transfer user data to third parties, outside of the approved use cases | **Certify ✓** |
| I do not use or transfer user data for purposes that are unrelated to my item's single purpose | **Certify ✓** |
| I do not use or transfer user data to determine creditworthiness or for lending purposes | **Certify ✓** |

**Privacy policy URL** (required field):
```
https://github.com/jiahongc/google-flights-seats-aero-extension/blob/master/PRIVACY.md
```

---

## Assets

| Asset | Requirement | Status |
|---|---|---|
| Store icon | 128×128 PNG | `icons/icon128.png` ✓ |
| Screenshots | 1280×800 or 640×400 PNG/JPEG, 1–5 | `store/assets/screenshots/*.png` ✓ (generated by `scripts/make-store-screenshots.sh`) |
| Small promo tile | 440×280 PNG (optional) | Not provided — optional; see PUBLISHING.md |
| Marquee promo | 1400×560 PNG (optional) | Not provided — optional |

---

## Notes before you submit

- **Fill in a contact email** in the dashboard (Account tab) — Google requires a
  verified contact email. It is not shown publicly.
- The screenshots are padded onto a white 1280×800 canvas. If you'd rather show
  full-bleed captures, retake them at exactly 1280×800 and drop them into
  `store/assets/screenshots/`.
- This is an unaffiliated, independent project. The listing copy already states
  that to avoid trademark-impersonation review flags.
