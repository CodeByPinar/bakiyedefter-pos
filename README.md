# BakiyeDefter POS

BakiyeDefter POS is an offline-first desktop POS support system for Turkish small businesses. It keeps customer accounts, ledger-based debt/payment history, dashboard metrics, backup records and system health checks in a local SQLite database through a secure Electron IPC boundary.

This repository starts with the sellable-product foundation: secure Electron shell, migration-based SQLite storage, immutable ledger writes, typed preload bridge, real IPC calls, and a React desktop UI with empty/loading/error states. No renderer screen uses mock data.

## Development

```bash
npm install
npm run dev
```

The app creates its SQLite database under the Electron user-data directory. Tests use temporary SQLite files.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## First Run

On a fresh database, the app opens an owner setup screen. The first owner account is the only allowed seed-like flow; roles, permissions and default settings are inserted by migrations.
