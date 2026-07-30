# Mail-IQ Scan-Folder Agent

Watches a **hot folder** on an office PC. When a batch scan (documents separated
by **QR separator sheets**) is dropped in, the agent:

1. splits the batch into individual documents at each separator sheet,
2. uploads each document to your Mail-IQ cloud, which classifies and routes it,
3. moves the original batch to `Processed/` (or `Error/` if something went wrong).

It's pure JavaScript/WASM — **no native binaries or build tools required**.

## Requirements
- **Node.js 18 or newer** on the PC that will run the agent.

## Setup
1. Copy this `agent` folder to the PC (e.g. `C:\Mail-IQ Agent`).
2. In a terminal in that folder, run:
   ```
   npm install
   ```
3. Copy `config.example.json` to `config.json` and fill it in:
   ```json
   {
     "apiUrl": "https://mailiq-production.up.railway.app",
     "ingestKey": "miqk_...your key from the portal...",
     "hotFolder": "C:\\Mailroom Hot Folder",
     "scale": 2.5
   }
   ```
   - **ingestKey** — get it in the portal under Inbound → Scan Folder (admin only).
   - **hotFolder** — the folder your scanner saves into.
4. Test the connection:
   ```
   npm run ping
   ```
5. Start watching:
   ```
   npm start
   ```
   Leave it running. To run once over what's already in the folder and exit, use `npm run once`.

## Separator sheets
Print a stack of `mailiq-separator-sheet.pdf` and place **one between each document**
when you scan a batch. The separator page is detected and discarded — you get one
clean document per section.

## Notes
- Only the top level of the hot folder is watched; `Processed/` and `Error/` are ignored.
- If a separator is missed, the two documents arrive merged as one item (never a
  silent misroute) — re-scan that pair with a separator between them.
- Keep `config.json` private: the ingest key lets a machine post documents to your tenant.
