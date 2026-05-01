import { execFileSync } from "node:child_process";

const SCORE_THRESHOLD = 95;

function extractJsonFromOutput(rawOutput) {
  const trimmed = rawOutput.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("react-doctor did not return JSON output.");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function getFindings(report) {
  if (Array.isArray(report.findings)) {
    return report.findings;
  }

  if (Array.isArray(report.diagnostics)) {
    return report.diagnostics;
  }

  if (Array.isArray(report.projects)) {
    return report.projects.flatMap((project) => {
      if (Array.isArray(project.findings)) {
        return project.findings;
      }

      if (Array.isArray(project.diagnostics)) {
        return project.diagnostics;
      }

      return [];
    });
  }

  return [];
}

function normalizeSeverity(finding) {
  const severity =
    finding?.severity ??
    finding?.level ??
    finding?.priority ??
    finding?.impact ??
    "";

  return String(severity).trim().toLowerCase();
}

function getScore(report) {
  const summaryScore = Number(report?.summary?.score);

  if (Number.isFinite(summaryScore)) {
    return summaryScore;
  }

  const projectScore = Number(report?.projects?.[0]?.score?.score);

  if (Number.isFinite(projectScore)) {
    return projectScore;
  }

  throw new Error("Unable to resolve react-doctor score from JSON report.");
}

function resolveMajorPolicy(report, findings) {
  const summary = report?.summary ?? {};
  const severities = new Set(findings.map(normalizeSeverity).filter(Boolean));

  if (
    severities.has("major") ||
    severities.has("critical") ||
    Number.isFinite(Number(summary.majorCount))
  ) {
    const majorCountFromSummary =
      Number(summary.majorCount || 0) + Number(summary.criticalCount || 0);

    const majorCount =
      majorCountFromSummary > 0
        ? majorCountFromSummary
        : findings.filter((finding) => {
            const severity = normalizeSeverity(finding);
            return severity === "major" || severity === "critical";
          }).length;

    return {
      majorCount,
      definition:
        "explicit `major` severity findings (and `critical`, if present)",
    };
  }

  if (severities.has("error") || Number.isFinite(Number(summary.errorCount))) {
    const majorCount = Number.isFinite(Number(summary.errorCount))
      ? Number(summary.errorCount)
      : findings.filter((finding) => normalizeSeverity(finding) === "error")
          .length;

    return {
      majorCount,
      definition:
        "major-equivalent = `severity: error` (react-doctor JSON has `error|warning`, not `major`)",
    };
  }

  if (severities.has("high") || Number.isFinite(Number(summary.highCount))) {
    const majorCount = Number.isFinite(Number(summary.highCount))
      ? Number(summary.highCount)
      : findings.filter((finding) => normalizeSeverity(finding) === "high")
          .length;

    return {
      majorCount,
      definition:
        "major-equivalent = `severity: high` (closest available tier in report)",
    };
  }

  return {
    majorCount: 0,
    definition:
      "no compatible severity tier found in report; treated as zero major findings",
  };
}

function run() {
  let rawOutput = "";

  try {
    // Keep score gate aligned to React diagnostics only; dead-code warnings are tracked separately.
    rawOutput = execFileSync(
      "npx",
      [
        "react-doctor",
        ".",
        "--json",
        "--json-compact",
        "--no-dead-code",
        "--fail-on",
        "none",
        "--offline",
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    const stdout = String(error?.stdout ?? "");
    const stderr = String(error?.stderr ?? "");
    const message = stderr || stdout || error.message;
    throw new Error(`react-doctor execution failed: ${message}`);
  }

  const report = extractJsonFromOutput(rawOutput);
  const score = getScore(report);
  const findings = getFindings(report);
  const { majorCount, definition } = resolveMajorPolicy(report, findings);

  const failures = [];

  if (score <= SCORE_THRESHOLD) {
    failures.push(`score ${score} must be greater than ${SCORE_THRESHOLD}`);
  }

  if (majorCount > 0) {
    failures.push(`major findings ${majorCount} must be zero (${definition})`);
  }

  if (failures.length > 0) {
    console.error("react-doctor verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("react-doctor verification passed.");
  console.log(`- score: ${score} (> ${SCORE_THRESHOLD})`);
  console.log(`- major findings: ${majorCount} (${definition})`);
}

run();
