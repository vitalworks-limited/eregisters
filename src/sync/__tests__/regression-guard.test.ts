import * as fs from "fs";
import * as path from "path";

/**
 * Static regression guards.
 *
 * Why: production was overloaded because routine sync used
 * `fields=*,enrollments[*,events[*]]`, `pageSize=100`, and bulk
 * `async=false` tracker imports. These tests fail loudly if any of
 * those patterns reappear in routine sync code paths.
 */

const SRC_DIR = path.resolve(__dirname, "../../");

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "__tests__")
            continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            listSourceFiles(full, acc);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            acc.push(full);
        }
    }
    return acc;
}

const ALL_FILES = listSourceFiles(SRC_DIR);

/** Files allowed to mention the bad pattern (e.g. tests, telemetry, docs). */
const ALLOWED_FILES = new Set<string>([
    path.resolve(SRC_DIR, "sync/config.ts"),
]);

/**
 * True if a line is either a `// ...` line comment or a single-line
 * block comment ( `* ...` inside a /* ... *​/ block). Block-comment
 * detection is line-local — we trim leading whitespace and check the
 * first non-whitespace character.
 */
function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
    );
}

function findMatches(pattern: RegExp) {
    const hits: Array<{ file: string; line: number; text: string }> = [];
    for (const file of ALL_FILES) {
        if (ALLOWED_FILES.has(file)) continue;
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (isCommentLine(lines[i])) continue;
            if (pattern.test(lines[i])) {
                hits.push({ file, line: i + 1, text: lines[i].trim() });
            }
        }
    }
    return hits;
}

describe("regression guard: routine sync must not regress", () => {
    test("no source file requests fields=*,enrollments[*,events[*]]", () => {
        const hits = findMatches(/enrollments\[\*,events\[\*\]\]/);
        expect(hits).toEqual([]);
    });

    test("no tracker-resource request uses fields=`*`", () => {
        // Tracker-specific: detect when a query block containing
        // tracker/trackedEntities or tracker/events also has `fields: "*"`.
        const offenders: string[] = [];
        for (const file of ALL_FILES) {
            if (ALLOWED_FILES.has(file)) continue;
            const text = fs.readFileSync(file, "utf8");
            if (!/tracker\/(trackedEntities|events)\b/.test(text)) continue;
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (isCommentLine(lines[i])) continue;
                if (!/fields:\s*["']\*["']/.test(lines[i])) continue;
                // Look back up to 30 lines for a tracker resource declaration.
                const start = Math.max(0, i - 30);
                const ctx = lines.slice(start, i).join("\n");
                if (/tracker\/(trackedEntities|events)\b/.test(ctx)) {
                    offenders.push(`${file}:${i + 1}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test("no source file hard-codes tracker pageSize=100", () => {
        // pageSize: 100 is allowed in non-tracker code (e.g. UI tables).
        // Flag only when within a tracker request context.
        const offenders: string[] = [];
        for (const file of ALL_FILES) {
            if (ALLOWED_FILES.has(file)) continue;
            const text = fs.readFileSync(file, "utf8");
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (isCommentLine(lines[i])) continue;
                if (!/pageSize\s*[:=]\s*100\b/.test(lines[i])) continue;
                const start = Math.max(0, i - 30);
                const end = Math.min(lines.length, i + 5);
                const ctx = lines.slice(start, end).join("\n");
                if (/tracker\/(trackedEntities|events)\b/.test(ctx)) {
                    offenders.push(`${file}:${i + 1}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test("no source file passes async: false to bulk tracker mutate", () => {
        // We only fail on the literal `async: false` token inside a tracker
        // mutate params block. The async helper itself accepts a boolean
        // parameter (which is fine).
        const hits = findMatches(/async:\s*false\b/);
        expect(hits).toEqual([]);
    });
});
