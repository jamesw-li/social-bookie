# AGENTS.md — read this before changing the repo

This file is the **canonical bootstrap** for humans and coding agents (Cursor, Claude Code, CI, etc.). Goal: everyone starts from the same toolchain and commands so work is reproducible—**avoid ad‑hoc installs** (`npm install` when a lockfile exists, random Node binaries checked into the tree, guessing ports).

---

## 1. Source-of-truth table

| What | Where it is pinned | Expected |
|------|---------------------|----------|
| **Node.js** | `.nvmrc`, `.node-version`, `package.json` → `engines.node` | **Active LTS in the Node 22 line** (patch in `.nvmrc`; minors allowed by `engines` until we bump deliberately) |
| **npm** | `package.json` → `packageManager` | Locked via **Corepack** (see §2) |
| **Dependency tree** | `package-lock.json` | Install with **`npm ci`**, not `npm install`, for repeatable builds |

Exact patch in `.nvmrc` is the **default developer version**. `engines.node` intentionally allows newer **22.x** patches so CI and laptops can roll forward without instantly breaking; when the team adopts a new patch/minor, update `.nvmrc` / `.node-version` in one commit.

---

## 2. Toolchain setup (once per machine)

1. **Install Node** using `.nvmrc` / `.node-version`:
   - **nvm**: `nvm install` then `nvm use` (reads `.nvmrc`).
   - **fnm**: `fnm use` (reads `.node-version`).
   - **asdf**: `asdf install nodejs` then `asdf local nodejs $(cat .node-version)` if needed.

2. **Turn on Corepack** (ships with Node) so the npm **major.minor** matches `packageManager`:
   ```bash
   corepack enable
   ```
   Then verify:
   ```bash
   node -v
   npm -v
   ```

3. **Never** unzip a portable Node/npm tree into this repository (e.g. `.tools/node-*`) unless a maintainer explicitly adds documented automation—agents should assume **system or nvm Node only**.

---

## 3. Dependencies and installs

From the repo root:

| Scenario | Command |
|----------|---------|
| Normal clone / CI | `npm ci` |
| Intentionally changing dependencies | Edit `package.json`, then `npm install` *once*, commit **both** `package.json` and `package-lock.json` |

`npm ci` deletes `node_modules` and installs exactly from the lockfile—use it for agents and CI to avoid drift.

---

## 4. Commands you actually run

| Task | Command |
|------|---------|
| Metro / Expo dev server | `npm start` |
| Web dev (browser) | `npm run web` |
| Static web export | `npm run build:web` → output under `dist/` |
| Typecheck only | `npx tsc --noEmit` |

Ports are chosen by Expo; **8081** is typical for web in this project—confirm in the terminal if something fails to load.

---

## 5. Environment variables

Bundled at build time (Expo):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Use a root `.env` for local runs (see Expo env docs). Do not commit secrets.

---

## 6. Domain docs (after toolchain)

| Doc | Purpose |
|-----|---------|
| `SCHEMA.md` | Database schema and migrations mindset |
| `project_rules.md` | UI/theme and product constraints |

---

## 7. Definition of done (agents)

Before opening a PR:

1. `npm ci`
2. `npx tsc --noEmit`
3. Smoke the surface you touched (e.g. `npm run web` for UI).

CI runs the same Node version as `.nvmrc` and executes install + typecheck—match that locally when possible.
