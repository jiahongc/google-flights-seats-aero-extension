# Seats.aero for Google Flights

A Chrome extension that adds award flight search buttons to Google Flights. One click opens [seats.aero](https://seats.aero) with your flight search filters pre-filled.

![Extension screenshot](https://github.com/user-attachments/assets/placeholder.png)

## Features

- **Global search button** — appears in the Google Flights filter bar, searches your entire route on seats.aero
- **Per-flight "Points" buttons** — appear on each flight result row, search that specific airport pair + airline
- **Smart filter mapping** — automatically transfers origin, destination, date, cabin class, passenger count, nonstop filter, and airline to seats.aero
- **Nonstop detection** — nonstop flights automatically check "Only direct flights" on seats.aero
- **Individual Flights view** — per-flight searches open in "Individual Flights" mode for detailed departure-time results
- **Extension popup** — toggle global button, per-flight buttons, and flexible dates (±3 days) on/off

## Filter Mapping

| Google Flights | seats.aero | Notes |
|---|---|---|
| Origin | `origins` | Metro codes (NYC) or specific airports (EWR) |
| Destination | `destinations` | Same as above |
| Date | `date` | YYYY-MM-DD format |
| Cabin class | `applicable_cabin` | economy / premium / business / first |
| Passengers | `min_seats` | Total passenger count |
| Nonstop filter | `direct_only` | Per-flight: auto-detected. Global: from filter bar |
| Airline | `op_carriers` | Per-flight: from the flight row. Global: from filter bar |

Filters without a seats.aero equivalent (bags, price, times, emissions, duration, connecting airports) are skipped.

## Install

1. Clone or download this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select this folder

## Usage

1. Search for flights on [Google Flights](https://www.google.com/travel/flights)
2. On the results page:
   - Click **"Search on seats.aero"** in the filter bar to search the whole route
   - Click **"Points"** on any flight row to search that specific flight
3. seats.aero opens in a new tab with filters pre-filled
4. Click the extension icon to toggle features on/off

## Requirements

- Google Chrome (Manifest V3)
- [seats.aero](https://seats.aero) account (Pro recommended for full filter access)

## Project Structure

```
├── manifest.json      # Extension manifest (Manifest V3)
├── content.js         # Content script: page detection, DOM extraction, button injection
├── background.js      # Service worker: tab creation (bypasses popup blocker)
├── airlines.js        # Airline name → IATA code lookup (~100 airlines)
├── styles.css         # Button styling (global + per-flight)
├── popup.html         # Extension popup UI
├── popup.js           # Popup settings handler
└── icons/             # Extension icons (16, 48, 128px)
```

## License

MIT
