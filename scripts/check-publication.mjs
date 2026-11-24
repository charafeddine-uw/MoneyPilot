import { readdirSync, readFileSync, statSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootFiles = new Set([
  ".gitignore",
  ".env.example",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
]);
const publicImages = new Set([
  "public/icon-180.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "docs/screenshots/parametres-mobile.jpg",
]);
const privateRoots = [
  "archive",
  "work",
  "outputs",
  "supabase",
  "backups",
  "sauvegardes",
  "exports",
  "private",
  "personal",
  "donnees",
  "data",
];
const privateDocs = new Set([
  "PROJECT_CONTEXT.md",
  "docs/SUPABASE_SETUP.md",
  "docs/SUPABASE_CONNECTED.md",
  "docs/AUDIT_V0.md",
]);
const blockedExtensions =
  /\.(?:json|jsonl|ndjson|csv|tsv|ofx|qif|qfx|sqlite3?|db|pem|key|p12|pfx|keystore|zip|tar|gz|7z|pdf|docx|xlsx?|txt|log|png|jpe?g|webp)$/i;
export function inspectPath(file) {
  const path = file.replaceAll("\\", "/");
  const parts = path.split("/");
  if (
    privateRoots.some((name) => parts.includes(name)) ||
    privateDocs.has(path)
  )
    return "archive, donnée ou document de travail privé";
  if (parts.some((part) => part.startsWith(".env")) && path !== ".env.example")
    return "configuration locale";
  if (
    parts.some((part) => ["node_modules", "dist", ".git"].includes(part)) ||
    /(?:^|\/)\.npmrc$/.test(path) ||
    /\.tsbuildinfo$/.test(path)
  )
    return "fichier local ou généré";
  if (
    blockedExtensions.test(path) &&
    !rootFiles.has(path) &&
    !publicImages.has(path)
  )
    return "format de données personnelles, archive ou image non approuvée";
  return null;
}
export function inspectContent(content) {
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(content))
    return "clé privée";
  if (
    /\b(?:sb_secret_[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(
      content,
    )
  )
    return "signature de clé ou de jeton sensible";
  if (/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(content))
    return "jeton JWT";
  if (
    /(?:^|\n)\s*(?:TEST_[AB]_PASSWORD|[A-Z_]*(?:SECRET|PASSWORD|TOKEN|API_KEY))\s*=\s*[^\s#][^\n]*/i.test(
      content,
    )
  )
    return "affectation d’identifiant sensible";
  if (
    /(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{8,}["']/i.test(
      content,
    )
  )
    return "identifiant potentiellement codé en dur";
  if (
    /"format"\s*:\s*"MoneyPilot"/.test(content) ||
    /"initialBalance"\s*:\s*-?\d+[\s\S]*"transactions"\s*:/.test(content)
  )
    return "sauvegarde financière, même sous une autre extension";
  if (
    /\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(
      content,
    )
  )
    return "adresse e-mail à vérifier";
  if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(content))
    return "chemin personnel absolu";
  return null;
}
function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.status !== 0)
    throw new Error("Commande Git de lecture impossible.");
  return result.stdout;
}
export function candidateFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error("Lien symbolique à vérifier avant publication.");
      const abs = resolve(dir, entry.name),
        path = relative(root, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        if (
          !["node_modules", "dist", ".git", ...privateRoots].includes(
            entry.name,
          ) &&
          !entry.name.startsWith(".")
        )
          walk(abs);
        else if (path === ".githooks") walk(abs);
      } else if (
        entry.isFile() &&
        !inspectPath(path) &&
        (rootFiles.has(path) ||
          /^(?:src|public|scripts|tests|docs|\.githooks)\//.test(path))
      )
        files.push(path);
    }
  }
  walk(root);
  return files.sort();
}
export function checkPublication(root, staged = false) {
  const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  const hasGit =
    probe.status === 0 &&
    realpathSync(probe.stdout.trim()) === realpathSync(root);
  if (staged && !hasGit) throw new Error("Aucun dépôt Git dans ce dossier.");
  const files = hasGit
    ? git(
        staged
          ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
          : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        root,
      )
        .split("\0")
        .filter(Boolean)
    : candidateFiles(root);
  const issues = [];
  for (const file of new Set(files)) {
    const pathProblem = inspectPath(file);
    if (pathProblem) {
      issues.push({ file, reason: pathProblem });
      continue;
    }
    let bytes;
    if (staged) bytes = Buffer.from(git(["show", `:${file}`], root));
    else {
      const full = resolve(root, file);
      try {
        if (!statSync(full).isFile()) continue;
        bytes = readFileSync(full);
      } catch {
        continue;
      }
    }
    if (publicImages.has(file)) continue; // Images explicitement relues, pas de détection visuelle automatique.
    const problem = inspectContent(bytes.toString("utf8"));
    if (problem) issues.push({ file, reason: problem });
  }
  return {
    scope: hasGit
      ? staged
        ? "index Git"
        : "fichiers suivis et non ignorés"
      : "liste de publication proposée (aucun dépôt Git)",
    files: [...new Set(files)],
    issues,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = checkPublication(
      process.cwd(),
      process.argv.includes("--staged"),
    );
    for (const item of result.issues)
      console.error(`${item.file} : ${item.reason}`);
    if (result.issues.length) {
      console.error(
        "Publication bloquée. Aucun contenu sensible n’a été affiché.",
      );
      process.exitCode = 1;
    } else
      console.log(
        `Contrôle réussi : ${result.files.length} fichiers, ${result.scope}. Ce contrôle ne remplace pas une revue humaine des captures et de l’historique.`,
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
