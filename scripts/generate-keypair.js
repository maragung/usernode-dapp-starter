#!/usr/bin/env node
/**
 * generate-keypair.js
 *
 * Generates one or more usernode keypairs. Tries, in order:
 *   1. A running node's RPC (POST /wallet/account)
 *   2. The `usernode` CLI binary (misc generate-account)
 *
 * Usage:
 *   node scripts/generate-keypair.js [options]
 *
 * Options:
 *   --node-url URL   Node RPC base URL (default: http://localhost:3000)
 *   --count N        Number of keypairs to generate (default: 1)
 *   --json           Output as JSON (for scripting)
 *   --env [PATH]     Write APP_PUBKEY, APP_SECRET_KEY, NODE_RPC_URL to a .env
 *                    file (default: .env in repo root). Creates the file if it
 *                    doesn't exist; appends missing vars if it does.
 *   --cli-path PATH  Path to the usernode CLI binary
 */

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const DEFAULT_NODE_URL = "http://localhost:3000";
const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  let nodeUrl = DEFAULT_NODE_URL;
  let count = 1;
  let json = false;
  let cliPath = null;
  let envFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--node-url" && args[i + 1]) nodeUrl = args[++i];
    else if (args[i] === "--count" && args[i + 1]) {
      count = parseInt(args[++i], 10);
      if (!Number.isFinite(count) || count < 1) {
        console.error("Error: --count must be a positive integer");
        process.exit(1);
      }
    }
    else if (args[i] === "--json") json = true;
    else if (args[i] === "--env") {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        envFile = path.resolve(args[++i]);
      } else {
        envFile = path.join(REPO_ROOT, ".env");
      }
    }
    else if (args[i] === "--cli-path" && args[i + 1]) cliPath = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`Usage: node scripts/generate-keypair.js [options]

Generates usernode keypairs for use as dapp destination addresses.

Options:
  --node-url URL   Node RPC URL (default: ${DEFAULT_NODE_URL})
  --count N        Number of keypairs (default: 1)
  --json           Machine-readable JSON output
  --env [PATH]     Write APP_PUBKEY, APP_SECRET_KEY, NODE_RPC_URL to .env
                   (default: .env in repo root). Only adds missing vars.
  --cli-path PATH  Path to usernode CLI binary

The script tries these methods in order:
  1. POST to <node-url>/wallet/account (requires a running node)
  2. Run the 'usernode' CLI binary (looks in PATH, ../usernode/target, etc.)`);
      process.exit(0);
    }
  }

  return { nodeUrl, count, json, cliPath, envFile };
}

// ── Method 1: Node RPC ──────────────────────────────────────────────────────

async function tryRpc(nodeUrl) {
  const url = `${nodeUrl.replace(/\/+$/, "")}/wallet/account`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ── Method 2: CLI binary ────────────────────────────────────────────────────

function findCliBinary(explicitPath) {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) return explicitPath;
    return null;
  }

  const candidates = [
    path.resolve(REPO_ROOT, "..", "usernode", "target", "release", "usernode"),
    path.resolve(REPO_ROOT, "..", "usernode", "target", "debug", "usernode"),
    "usernode",
  ];

  for (const c of candidates) {
    try {
      if (path.isAbsolute(c)) {
        if (fs.existsSync(c)) return c;
      } else {
        execFileSync("which", [c], { stdio: "pipe" });
        return c;
      }
    } catch (_) {}
  }
  return null;
}

function tryCliBinary(binPath) {
  const raw = execFileSync(binPath, ["misc", "generate-account", "--json"], {
    encoding: "utf8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return JSON.parse(raw.trim());
}

// ── .env helpers ────────────────────────────────────────────────────────────

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const vars = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

function writeEnvVars(filePath, nodeUrl, keypair) {
  const existing = parseEnvFile(filePath);
  const toAdd = {};

  if (!existing.APP_PUBKEY) toAdd.APP_PUBKEY = keypair.address;
  if (!existing.APP_SECRET_KEY) toAdd.APP_SECRET_KEY = keypair.secret_key;
  if (!existing.NODE_RPC_URL) toAdd.NODE_RPC_URL = nodeUrl;

  const keys = Object.keys(toAdd);
  if (keys.length === 0) {
    console.error(`\n.env already has APP_PUBKEY, APP_SECRET_KEY, NODE_RPC_URL — no changes made.`);
    return;
  }

  const block = keys.map((k) => `${k}=${toAdd[k]}`).join("\n");
  const fileExists = fs.existsSync(filePath);

  if (fileExists) {
    const content = fs.readFileSync(filePath, "utf8");
    const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(filePath, sep + block + "\n");
  } else {
    fs.writeFileSync(filePath, block + "\n");
  }

  const rel = path.relative(process.cwd(), filePath) || filePath;
  console.error(`\nWrote to ${rel}:`);
  for (const k of keys) console.error(`  ${k}=${toAdd[k]}`);
  if (Object.keys(existing).length > 0) {
    const skipped = ["APP_PUBKEY", "APP_SECRET_KEY", "NODE_RPC_URL"].filter((k) => existing[k]);
    if (skipped.length > 0) console.error(`  (kept existing: ${skipped.join(", ")})`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function generateOne(nodeUrl, cliBin) {
  try {
    return { method: "rpc", ...(await tryRpc(nodeUrl)) };
  } catch (_) {}

  if (cliBin) {
    try {
      return { method: "cli", ...tryCliBinary(cliBin) };
    } catch (_) {}
  }

  return null;
}

async function main() {
  const { nodeUrl, count, json, cliPath, envFile } = parseArgs();
  const cliBin = findCliBinary(cliPath);

  if (!json) {
    console.error(`Trying node RPC at ${nodeUrl} ...`);
    if (cliBin) console.error(`CLI binary found: ${cliBin}`);
    else console.error("No CLI binary found (optional fallback)");
  }

  const results = [];

  for (let i = 0; i < count; i++) {
    const kp = await generateOne(nodeUrl, cliBin);
    if (!kp) {
      console.error(`\nError: Could not generate keypair. Make sure either:`);
      console.error(`  • A usernode is running at ${nodeUrl}`);
      console.error(`  • The 'usernode' CLI is built and in your PATH`);
      console.error(`    (cd ../usernode && cargo build -p usernode-cli --release)`);
      process.exit(1);
    }

    results.push(kp);

    if (!json) {
      if (count > 1) console.log(`\n── Keypair ${i + 1} (via ${kp.method}) ──`);
      else console.log(`\nGenerated via ${kp.method}:`);
      console.log(`  address:    ${kp.address}`);
      if (kp.public_key) console.log(`  public_key: ${kp.public_key}`);
      console.log(`  secret_key: ${kp.secret_key}`);
    }
  }

  if (json) {
    const out = results.map(({ method, ...rest }) => rest);
    console.log(JSON.stringify(count === 1 ? out[0] : out, null, 2));
  } else {
    console.log(`\nUse the 'address' as APP_PUBKEY in your dapp.`);
    console.log(`Keep the secret_key safe — it controls funds sent to the address.`);
  }

  if (envFile && results.length > 0) {
    writeEnvVars(envFile, nodeUrl, results[0]);
  }
}

main();
