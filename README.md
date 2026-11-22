# APEX NIGHTS

APEX NIGHTS is a server-backed game. It uses Node.js, SQLite, and server-side sign-in; GitHub Pages can serve static game files but cannot run its authentication API or SQLite database.

## Run on Windows

1. Install Node.js 20 or newer from [nodejs.org](https://nodejs.org/).
2. Double-click `start-game.bat`. It installs the SQLite dependency the first time and opens the game at `http://127.0.0.1:4173/`.
3. On the first visit, create the owner account. It is the only account granted the owner role automatically.
4. Use the owner dashboard to manage player accounts, registration, maintenance, announcements, and default game settings.

To run from a terminal instead, use `npm install` followed by `npm start`. The default database is created at `data/apex-nights.sqlite3`; set `DB_PATH`, `HOST`, or `PORT` to customize its location or listener. Keep `HOST=127.0.0.1` for local play. For a public deployment, use HTTPS behind a trusted reverse proxy, set `NODE_ENV=production`, and persist the SQLite database directory across restarts. Do not expose the database file publicly.

Run the server tests with `npm test`.

Passwords must be at least 12 characters. Player sign-ups can be enabled or disabled by the owner; the first account is the only account automatically granted the owner role. Player saves are stored in SQLite and mirrored in account-scoped browser storage.

The existing GitHub Pages workflow only serves static files. It cannot provide these APIs, sessions, or SQLite persistence. The authenticated game works with this Node server; a public deployment needs a Node host and durable SQLite storage before the updated game can be published there.
