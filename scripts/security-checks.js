#!/usr/bin/env node
'use strict';

/**
 * Static security guardrails.
 *
 * These exist because most of the 35 findings were not novel techniques - they
 * were a correct pattern applied inconsistently. A guardrail that fails the build
 * is worth more over time than any individual fix.
 *
 * Run with: npm run security:check
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['controllers', 'services', 'middleware', 'helpers', 'routes', 'models', 'config', 'validation'];

function walk(dir, out = []) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return out;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel, out);
        else if (entry.name.endsWith('.js')) out.push(rel);
    }
    return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(d));

/**
 * Strip comments before testing. Otherwise a comment explaining why a pattern is
 * dangerous trips the check that looks for it.
 */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1');    // line comments, keeping URLs
}

const CHECKS = [
    {
        id: 'SEC-006',
        name: 'No template literals inside sequelize.query()',
        // A reviewed interpolation whose value provably cannot carry SQL (a
        // constant identifier, or clause fragments that are themselves literals
        // with the values bound) must be marked // sql-safe: <reason>.
        test: (src, file, raw) => raw
            .split(/\r?\n/)
            .some((line) => /`[^`]*\$\{/.test(line)
                && /\b(query|literal)\(|^\s*`/.test(line)
                && /(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|WHERE|FROM)\b/i.test(line)
                && !/sql-safe:/.test(line)),
        hint: 'Use named replacements, or helpers/sqlSafe.js for IN (...) lists.',
    },
    {
        id: 'SEC-006',
        name: 'No interpolation inside Sequelize.literal()',
        test: (src) => /literal\(\s*`[^`]*\$\{(?!\s*(uid|utype|safe))/.test(src),
        hint: 'literal() emits raw SQL. Coerce to an integer first, or restructure.',
    },
    {
        id: 'SEC-010',
        name: 'No process.env fallback literals',
        test: (src) => /process\.env\.[A-Z0-9_]+\s*\|\|\s*['"][^'"]{8,}['"]/.test(src),
        hint: 'A fallback publishes the secret it falls back from. Fail closed instead.',
    },
    {
        id: 'SEC-018',
        name: 'No Math.random() for identifiers',
        test: (src) => /Math\.random\(\)/.test(src),
        hint: 'Use helpers/secureRandom.js (crypto.randomInt / randomBytes).',
    },
    {
        id: 'SEC-003',
        name: 'No MD5 password hashing',
        test: (src, file) => file !== path.join('helpers', 'passwordHelper.js')
            && /createHash\(\s*['"]md5['"]\s*\)/.test(src),
        hint: 'Use helpers/passwordHelper.js (bcrypt).',
    },
    {
        id: 'SEC-035',
        name: 'No hardcoded password literals',
        test: (src) => /\b(password|passwd|pwd)\s*=\s*['"][^'"]{6,}['"]/i.test(src),
        hint: 'Issue a single-use invitation instead of a shared default.',
    },
    {
        id: 'SEC-001',
        name: 'No authorization decisions from request headers',
        // The login handler reads a `role` header to choose which table to check.
        // That is a pre-authentication selector, not an authorization decision -
        // the password must still match, and the issued token's role is set by the
        // server. Such a line must carry an explicit marker.
        // Tested against the RAW source so the marker comment is still visible.
        test: (src, file, raw) => raw
            .split(/\r?\n/)
            .some((line) => /req\.header\(\s*['"](role|companyId)['"]\s*\)/.test(line)
                && !/pre-auth-selector/.test(line)),
        hint: 'Identity and tenant scope come from the verified token (req.user). '
            + 'If it is genuinely a pre-auth selector, mark the line // pre-auth-selector.',
    },
    {
        id: 'SEC-016',
        name: 'No console.log in request-handling code',
        test: (src, file) => /^(controllers|services|middleware)[\\/]/.test(file)
            && /^\s*console\.log\(/m.test(src),
        hint: 'Use console.error for failures, and never log bodies, tokens or PHI.',
    },
];

let failures = 0;

for (const file of FILES) {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const src = stripComments(raw);
    for (const check of CHECKS) {
        if (check.test(src, file, raw)) {
            console.error(`✗ [${check.id}] ${check.name}\n    ${file}\n    ${check.hint}\n`);
            failures++;
        }
    }
}

if (failures > 0) {
    console.error(`${failures} security check failure(s).`);
    process.exit(1);
}

console.log(`✓ All ${CHECKS.length} security checks passed across ${FILES.length} files.`);
