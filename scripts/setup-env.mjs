#!/usr/bin/env node
/**
 * Seed the `.env` files from the one `.env.example` at the repo root.
 *
 *   pnpm run setup:env
 *
 * (Named `setup:env`, not `setup`: `pnpm setup` is a built-in pnpm command that
 * edits your shell profile, and it wins over a script of the same name.)
 *
 * ── Why one example file ──────────────────────────────────────────────────────
 *
 * Two apps need environment, and the obvious layout — an `.env.example` beside
 * each — means the same integration address is documented in two places and
 * explained twice. They drift. So there is one example at the root, split into
 * per-app sections by `# ==>` markers, and this script is what turns it into the
 * two real files. The example stays the single thing you read and edit.
 *
 * ── Four rules ────────────────────────────────────────────────────────────────
 *
 *  1. **Never clobber a value you typed.** A key is filled only when it is
 *     missing, empty, or still holding the placeholder the example ships with.
 *  2. **Adopt new keys on re-run.** A key added to the example after you set up
 *     is appended to your `.env`, with its comment, rather than silently missing
 *     until something fails at boot. This is the property that makes a single
 *     example worth having.
 *  3. **Fill everything that can be derived.** The attestation keypair and the
 *     LAN address are both things a machine can work out; making a human paste
 *     them is how a demo acquires a "step 4 that never works".
 *  4. **Say plainly what's left.** The Privy client id and app secret cannot be
 *     derived from anything on this machine.
 *
 * The two apps share two values — the Yodl integration address and the Privy app
 * id — and both are propagated rather than asked for twice. If the addresses
 * disagree, every webhook is rejected as addressed elsewhere and no payment
 * reaches the feed; if the Privy app ids disagree, every access token the app
 * sends fails the API's audience check and signup quietly loses the OTP skip.
 * Both are genuinely miserable things to debug.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = join(root, '.env.example');

/** Marks the start of a section, and names the file it becomes. */
const SECTION = /^#\s*==>\s*(\S+)\s*$/;

/**
 * Values the example ships with, treated as "not yet set" so the script fills
 * over them. Only ever obvious non-values: a real setting that happened to equal
 * one of these would be indistinguishable from a placeholder.
 */
const PLACEHOLDERS = new Set([
  '',
  '0x0000000000000000000000000000000000000000',
  'placeholder-app-id',
  'placeholder-client-id',
  'http://localhost:8787',
]);

// ── a very small .env reader/writer ────────────────────────────────────────
// Not a dependency. It handles the subset this repo's files use — `KEY=value`,
// comments, blank lines — and preserves everything it does not understand, which
// is the property that matters when rewriting a file in place.

const KEY_LINE = /^\s*([A-Z0-9_]+)\s*=(.*)$/;

const parse = (text) => {
  const values = new Map();
  for (const line of text.split('\n')) {
    const match = KEY_LINE.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
};

/** Rewrite the given keys in place, keeping comments, order and spacing. */
const put = (text, updates) => {
  let out = text;
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^(\\s*${key}\\s*=).*$`, 'm');
    out = pattern.test(out)
      ? out.replace(pattern, `$1${value}`)
      : `${out.trimEnd()}\n${key}=${value}\n`;
  }
  return out;
};

const isUnset = (values, key) => PLACEHOLDERS.has(values.get(key) ?? '');

/**
 * Split the example into `{ target, text }` per `# ==>` marker.
 *
 * Anything before the first marker is the file's own preamble and belongs to no
 * app, so it is dropped rather than copied into both.
 */
function splitExample(text) {
  const sections = [];
  let current = null;

  for (const line of text.split('\n')) {
    const match = SECTION.exec(line);
    if (match) {
      current = { target: match[1], lines: [] };
      sections.push(current);
      continue;
    }
    current?.lines.push(line);
  }

  return sections.map(({ target, lines }) => ({
    target,
    // Trim the blank lines the markers leave at each seam.
    text: `${lines.join('\n').trim()}\n`,
  }));
}

/**
 * A key present in the example but missing from an existing `.env`, together
 * with the comment block immediately above it — so an adopted key arrives
 * explained rather than bare.
 */
function missingKeyBlocks(exampleText, existing) {
  const lines = exampleText.split('\n');
  const blocks = [];
  let comment = [];

  for (const line of lines) {
    if (line.trim().startsWith('#')) {
      comment.push(line);
      continue;
    }
    const match = KEY_LINE.exec(line);
    if (match) {
      if (!existing.has(match[1])) blocks.push([...comment, line].join('\n'));
      comment = [];
      continue;
    }
    // A blank line ends a comment block, so a comment two paragraphs up doesn't
    // get attached to an unrelated key.
    if (line.trim() === '') comment = [];
  }

  return blocks;
}

// ── derivations ────────────────────────────────────────────────────────────

/**
 * The address the phone should call the API on.
 *
 * `localhost` on a device is the device, so the most common way to lose an
 * afternoon here is a phone quietly failing to reach a server that is running
 * perfectly. Prefer a real IPv4 on a physical interface; skip VPN and container
 * bridges, which are up far more often than they are useful.
 */
function lanAddress() {
  const skip = /^(docker|br-|veth|virbr|tun|tap|nordlynx|wg|utun|zt)/;
  const candidates = [];

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // Rank wireless first: it is the interface a phone is most likely to share.
      candidates.push({ name, ip: address.address, rank: /^(wl|en0|wlan)/.test(name) ? 0 : 1 });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0] ?? null;
}

/** Ed25519 keypair for email attestation, base64-encoded PKCS#8. */
async function generateAttestationKey() {
  const { exportPKCS8, generateKeyPair } = await import('jose');
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const pem = (await exportPKCS8(privateKey)).trimEnd();
  return Buffer.from(pem, 'utf8').toString('base64');
}

// ── run ────────────────────────────────────────────────────────────────────

const log = [];
const todo = [];
const note = (message) => log.push(message);

if (!existsSync(EXAMPLE)) {
  console.error(`\n  Missing ${relative(root, EXAMPLE)} — it is the source for both .env files.\n`);
  process.exit(1);
}

const sections = splitExample(await readFile(EXAMPLE, 'utf8'));
if (sections.length === 0) {
  console.error('\n  .env.example has no `# ==> path` markers, so there is nothing to split.\n');
  process.exit(1);
}

/** Seed a target from its section, or adopt any keys the section has gained. */
async function seed({ target, text }) {
  const path = join(root, target);

  if (!existsSync(path)) {
    await writeFile(path, text);
    note(`created  ${target}`);
    return { path, text };
  }

  let current = await readFile(path, 'utf8');
  const adopted = missingKeyBlocks(text, parse(current));

  if (adopted.length > 0) {
    current = `${current.trimEnd()}\n\n${adopted.join('\n\n')}\n`;
    await writeFile(path, current);
    const names = adopted.map((block) => KEY_LINE.exec(block.split('\n').at(-1))?.[1]);
    note(`updated  ${target} — adopted ${names.join(', ')}`);
  }

  return { path, text: current };
}

const files = new Map();
for (const section of sections) {
  files.set(section.target, await seed(section));
}

const apiFile = files.get('apps/api/.env');
const mobileFile = files.get('apps/mobile/.env');
if (!apiFile || !mobileFile) {
  console.error('\n  .env.example is missing a section for apps/api/.env or apps/mobile/.env.\n');
  process.exit(1);
}

let apiText = apiFile.text;
let mobileText = mobileFile.text;
let api = parse(apiText);
let mobile = parse(mobileText);

// 1. The integration address — one value, two files. Whichever side already has
//    a real one wins.
const existingAddress = !isUnset(api, 'YODL_INTEGRATION_ADDRESS')
  ? api.get('YODL_INTEGRATION_ADDRESS')
  : !isUnset(mobile, 'EXPO_PUBLIC_YODL_INTEGRATION_ADDRESS')
    ? mobile.get('EXPO_PUBLIC_YODL_INTEGRATION_ADDRESS')
    : null;

const DOCS_SAMPLE_ADDRESS = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';
const address = existingAddress ?? DOCS_SAMPLE_ADDRESS;

if (existingAddress) {
  note(`address  ${address}`);
} else {
  todo.push(
    "YODL_INTEGRATION_ADDRESS — currently the sample address from Yodl's docs.\n" +
      '    Replace it in BOTH .env files with your registered address, or every\n' +
      '    payment you make will be attributed to somebody else.\n' +
      '    https://docs.yodl.me/integrations/integration-address',
  );
}

apiText = put(apiText, { YODL_INTEGRATION_ADDRESS: address });
mobileText = put(mobileText, { EXPO_PUBLIC_YODL_INTEGRATION_ADDRESS: address });

// 2. Email attestation keypair.
if (isUnset(api, 'YODL_ATTESTATION_PRIVATE_KEY')) {
  const kid = `nightmarket-${new Date().toISOString().slice(0, 7)}-${randomUUID().slice(0, 4)}`;
  apiText = put(apiText, {
    YODL_ATTESTATION_PRIVATE_KEY: await generateAttestationKey(),
    YODL_ATTESTATION_KID: kid,
  });
  note(`keypair  generated, kid=${kid}`);
} else {
  note('keypair  already set, left alone');
}

// 3. The Privy app id — one value, two files, exactly like the address above.
//    The API needs it to check the `aud` of the access tokens the app sends and to
//    find the right JWKS; the app needs it to log anyone in. Only the app can be
//    asked for it, so whichever side has it wins and the other is filled from it.
const privyAppId = !isUnset(mobile, 'EXPO_PUBLIC_PRIVY_APP_ID')
  ? mobile.get('EXPO_PUBLIC_PRIVY_APP_ID')
  : !isUnset(api, 'PRIVY_APP_ID')
    ? api.get('PRIVY_APP_ID')
    : null;

if (privyAppId) {
  apiText = put(apiText, { PRIVY_APP_ID: privyAppId });
  mobileText = put(mobileText, { EXPO_PUBLIC_PRIVY_APP_ID: privyAppId });
  note(`privy    app id ${privyAppId}, propagated to both`);
}

// 4. Where the phone reaches the API.
if (isUnset(mobile, 'EXPO_PUBLIC_API_URL')) {
  const lan = lanAddress();
  const port = api.get('PORT') || '8787';
  if (lan) {
    mobileText = put(mobileText, { EXPO_PUBLIC_API_URL: `http://${lan.ip}:${port}` });
    note(`api url  http://${lan.ip}:${port}  (via ${lan.name})`);
  } else {
    todo.push(
      'EXPO_PUBLIC_API_URL — no LAN address found, so it is still localhost.\n' +
        '    That works on a simulator. On a physical device, localhost is the phone.',
    );
  }
} else {
  note(`api url  ${mobile.get('EXPO_PUBLIC_API_URL')}  (already set)`);
}

await writeFile(apiFile.path, apiText);
await writeFile(mobileFile.path, mobileText);

// 5. What's left. Re-read, so the report reflects what is actually on disk.
api = parse(await readFile(apiFile.path, 'utf8'));
mobile = parse(await readFile(mobileFile.path, 'utf8'));

if (isUnset(mobile, 'EXPO_PUBLIC_PRIVY_APP_ID') || isUnset(mobile, 'EXPO_PUBLIC_PRIVY_CLIENT_ID')) {
  todo.push(
    'EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID in apps/mobile/.env\n' +
      '    A mobile app needs BOTH — the client is what authorises a non-web\n' +
      '    platform to call Privy, and login fails confusingly with only the app id.\n' +
      '    https://dashboard.privy.io  →  your app  →  Clients',
  );
}

if (isUnset(api, 'PRIVY_APP_SECRET')) {
  note('optional PRIVY_APP_SECRET unset — email attestation declines, so signup uses the OTP');
  todo.push(
    "PRIVY_APP_SECRET in apps/api/.env — needed to skip Yodl's OTP.\n" +
      '    It is how the API reads the email Privy already verified for the caller.\n' +
      '    Without it the attestation route cannot tell one caller from another, so\n' +
      '    it declines every request and signup falls back to the emailed code.\n' +
      '    Server-side only — it can read every user in your app, so it must never\n' +
      '    be given an EXPO_PUBLIC_ twin.\n' +
      '    https://dashboard.privy.io  →  your app  →  App settings  →  Basics',
  );
}

if (isUnset(api, 'YODL_API_SECRET')) {
  note('optional YODL_API_SECRET unset — /v1/yodl/payments returns 501, everything else works');
}

console.log('\n  nightmarket · environment');
console.log(`  seeded from ${relative(root, EXAMPLE)}\n`);
for (const line of log) console.log(`  ${line}`);

if (todo.length > 0) {
  console.log('\n  Still needs you:\n');
  for (const [index, item] of todo.entries()) console.log(`  ${index + 1}. ${item}\n`);
} else {
  console.log('\n  Nothing left to fill in.\n');
}

console.log('  Then:  pnpm dev:api   and   pnpm --filter @nightmarket/mobile ios\n');
