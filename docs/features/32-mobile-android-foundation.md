# XPOS Mobile (Android) foundation

Status: **connected build**. It connects to a real ERPNext 16 server, signs the cashier in, downloads the real catalog (and later only the changes), and posts real sales through the existing XPOS invoice API. See [mobile/README.md](../../mobile/README.md) for setup, `yarn dev`, builds and limits, and [33-mobile-selling.md](33-mobile-selling.md) for the cashier guide. Offline selling, returns, shift closing and printing are not implemented. The sections below describe the foundation; where they say sales are samples, checkout has since been replaced by `quote_sale` + `create_invoice`.

Requires ERPNext/Frappe **16** with XPOS installed. The app lives in `mobile/` (separate from `frontend/`; the browser POS is unchanged) and runs only inside the Android app.

## What a cashier sees

1. **Connect to your server**: type the site address (`https://` recommended; `http://` also works but is not encrypted, and the app warns every time). The app never guesses the server from anything else.
2. **Sign in** with the normal ERPNext user and password. Accounts that need a verification code (MFA) or single sign-on are not supported yet and get a clear message to use the web POS.
3. **Set a 6-digit PIN.** It unlocks this device offline, for this cashier only. It is not the ERPNext password.
4. **The catalog downloads** (the items the cashier's POS Profile may sell, with prices and barcodes). It is saved on the device, so the app keeps working offline with the last download. It refreshes on unlock when it is older than an hour, and from **Device > Refresh catalog now**. A failed or interrupted download never replaces the working catalog.
5. **Sell** in one of three layouts that share the same cart: **Catalog** (browse), **Scan Counter** (scan-first) and **Fashion Assist** (choose options such as colour and size from the server's variant attributes). Switching layout keeps the cart.
   - One search bar at the top stays in place while the list scrolls. Type to search, or scan: a handheld scanner types the barcode and Enter, and an exact barcode match adds the item. Camera scanning is not implemented yet.
   - Search matches the **start** of an item name or code (prefix search), not words in the middle.
   - **Save as SAMPLE sale** stores a record on the device only. It is not an invoice, not synced, not a verified payment and not fiscalized.
6. **Device** shows catalog status, storage, offline-authorization status, the outbox and which scanners/printers are supported (none are tested yet).

Offline rules built in: the app locks when restarted or after 30 s in the background; wrong PINs are throttled; after 24 h without contacting the server (or if the clock looks set back) new sales are blocked but nothing is deleted.

Not in the downloaded catalog yet: stock quantities, customers, images, and barcodes sold in a unit the app cannot price (they are skipped and counted on the Device screen).

## Developer setup

```bash
cd mobile
yarn install
yarn vue-tsc --noEmit     # type check
yarn test                 # unit tests (catalog download, schema sync, login flow, sample sales) on a node:sqlite double
yarn build                # writes android/app/src/main/assets/xpos-schema.json (generated, gitignored) and the web build
```

Android build (needs JDK 21 and the Android SDK Platform 36; see `mobile/README.md` for the verified toolchain):

```bash
cd mobile && yarn cap:sync          # build + copy into the Android project
cd android && ./gradlew testDebugUnitTest assembleDebug        # JVM tests + APK
./gradlew connectedDebugAndroidTest                            # SQLite tests on an emulator/device
```

## Architecture

| Concern | Shared | Android |
|---|---|---|
| UI, Pearl tokens/components | `frontend/src` (`style.css`, `components/ui`) imported by alias | none |
| Catalog + sample-sale storage | `CatalogRepository`, `TransactionStore` ports (`src/ports`) | plain SQLite via `XposDb` (`CatalogRepository.kt`, `TransactionRepository.kt`) |
| Catalog download | `src/app/catalogSync.ts` using the existing `xpos.api.catalog_sync` API | same code, through the native plugin |
| Schema and upgrades | model classes (`src/db/models`, one per table) and `SchemaSync` | the same models, exported to JSON by `yarn build`; `SchemaSync.kt` applies them when the database opens |
| Server transport and login (https or http) | `FrappeHttpTransport`, `FrappeOnlineLogin` | Capacitor native HTTP + cookie jar |
| Offline unlock, lease, PIN | none | `AuthManager`, `LeaseGuard`, `PinThrottle`, `KeystoreVault` (Keystore AES-GCM) |
| Background sync | `SyncEngine` port | `OutboxProcessor` (atomic claim), `SyncWorker` stub that always fails honestly |
| Scanner / printer | capability reports only | stubs; nothing claimed as supported or tested |

Server changes: `xpos.api.mobile.bootstrap` (read-only, guest-denied, uses the existing profile check, ERPNext 16 gate, 24 h lease cap) and an additive `attributes` field on catalog items for variants.

**Schema changes.** Each table is a model class. To add a field, add one line to the model and ship: on startup the app compares the models with the real database and applies the difference, keeping existing rows. New tables, nullable columns, columns with a default, and indexes are automatic. Renaming, dropping, changing a type, or adding a NOT NULL column without a default are never guessed: the app refuses that change with a clear message and leaves the database untouched, and you add an explicit run-once step in `src/db/steps.ts`. Anything in the database the models no longer know is kept, so installing an older build never fails. Android uses plain SQLite instead of Room because Room refuses to open a database that differs from its entities unless a version is bumped.

## Status

| Area | State |
|---|---|
| Catalog download, schema sync, login flow, sample sales, search and paging (tested on a node:sqlite double with a fake server), bootstrap endpoint and variant attributes (mock tests) | Implemented and verified |
| All Kotlin: SQLite store, schema sync, Keystore vault, lease/PIN, outbox claim, plugin; JVM and instrumented tests | Implemented, **not compiled or run** (no JDK/Android SDK here) |
| The Vue screens | Typechecked and built, **not run** (they need the Android app) |
| Reboot recovery, Keystore behaviour, native HTTP cookies, 100,000-item speed on a device, scanner/printer hardware | Not verified (needs a device) |
| Delta updates, stock and customers in the catalog, checkout, payments, receiving, fiscal, camera scan, printing, MFA/SSO | Deferred |

## Before a public Play release

- Finalize the application id (`com.kodlyft.xpos.mobile.dev` is provisional and cannot change after the first upload).
- Re-check Play's target-API rule (Capacitor 8.5.3 targets 36), build an App Bundle, set up app signing.
- Confirm 64-bit and 16 KB page-size compatibility on the release build (this build bundles no native libraries of its own; verify with the bundle analyzer).
- Review dependency versions (WorkManager 2.12.0, Kotlin 2.3.10, AGP 8.13.0, Gradle 8.14.3) and test schema updates against real installs.
- Inter is bundled (the Google Fonts import is stripped from the mobile build); the Urdu Nastaliq font is not.
- Measure the catalog (lookup, search, import) with a real 100,000-item catalog on the exact devices you will support.
