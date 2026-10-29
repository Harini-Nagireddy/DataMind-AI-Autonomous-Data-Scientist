import { ColumnProfile, CleaningLogEntry } from "../types";
import Papa from "papaparse";

export interface CleaningOptions {
  removeDuplicates: boolean;
  imputeNumerical: "median" | "mean" | "zero" | "none";
  imputeCategorical: "mode" | "missing_tag" | "none";
  dropConstantColumns: boolean;
  dropIdColumns: boolean;
  trimStrings: boolean;
  removeOutliers: boolean;
}

export const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  removeDuplicates: true,
  imputeNumerical: "median",
  imputeCategorical: "mode",
  dropConstantColumns: true,
  dropIdColumns: false,
  trimStrings: true,
  removeOutliers: false,
};

const MISSING_TOKENS = new Set([
  "",
  "na",
  "n/a",
  "nan",
  "null",
  "none",
  "nil",
  "missing",
  "?",
  "-"
]);

function isMissingValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "string") {
    return MISSING_TOKENS.has(value.trim().toLowerCase());
  }
  return false;
}

function addLog(
  logs: CleaningLogEntry[],
  id: string,
  operation: string,
  column: string,
  before: string,
  after: string,
  reason: string,
  affectedCount: number
) {
  logs.push({
    id,
    timestamp: new Date().toLocaleTimeString(),
    operation,
    column,
    before,
    after,
    reason,
    affectedCount,
  });
}

function numericValues(rows: Record<string, any>[], col: string): number[] {
  return rows
    .map((row) => {
      const value = row[col];
      if (isMissingValue(value)) return NaN;

      if (typeof value === "string") {
        const normalized = value.replace(/[$€£₹,\s]/g, "");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number | undefined {
  if (!sorted.length) return undefined;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

/**
 * Some numeric-looking columns are identifiers or codes rather than
 * measurements. Tukey IQR must never be used on those fields.
 */
function isProtectedNonMetricColumn(
  column: string,
  profile?: ColumnProfile
): boolean {
  const name = column.toLowerCase().replace(/[\s-]+/g, "_");

  const protectedNamePatterns = [
    "id",
    "uuid",
    "guid",
    "key",
    "code",
    "phone",
    "mobile",
    "telephone",
    "zip",
    "zipcode",
    "postal",
    "pincode",
    "year",
    "date",
    "time",
    "timestamp"
  ];

  if (
    protectedNamePatterns.some(
      (token) =>
        name === token ||
        name.startsWith(`${token}_`) ||
        name.endsWith(`_${token}`) ||
        name.includes(`_${token}_`)
    )
  ) {
    return true;
  }

  if (profile?.isPossibleId) return true;
  if (profile?.isBinary) return true;
  if (profile?.isDiscrete) return true;
  if (profile?.numericalType !== "continuous") return true;

  return false;
}

/**
 * Tukey IQR is applied ONCE to each genuinely continuous numeric feature.
 *
 * Important:
 * - Q1/Q3 are calculated from the current dataset after imputation.
 * - One fixed fence is calculated per eligible column.
 * - A row is removed only if its value is outside a valid fence.
 * - Fences are NOT recalculated after rows are removed.
 * - There is no iterative/repeated outlier removal.
 */
function getIqrFences(
  rows: Record<string, any>[],
  columns: string[],
  profiles: ColumnProfile[]
): Record<string, { lower: number; upper: number; q1: number; q3: number; iqr: number }> {
  const fences: Record<
    string,
    { lower: number; upper: number; q1: number; q3: number; iqr: number }
  > = {};

  for (const col of columns) {
    const profile = profiles.find((p) => p.name === col);

    if (!profile) continue;
    if (profile.dataType !== "numerical") continue;
    if (isProtectedNonMetricColumn(col, profile)) continue;

    const values = numericValues(rows, col);

    // Need a meaningful continuous distribution.
    if (values.length < 4) continue;
    if (new Set(values).size <= 10) continue;

    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);

    if (q1 === undefined || q3 === undefined) continue;

    const iqr = q3 - q1;
    if (!(iqr > 0) || !Number.isFinite(iqr)) continue;

    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    if (!Number.isFinite(lower) || !Number.isFinite(upper)) continue;

    fences[col] = { lower, upper, q1, q3, iqr };
  }

  return fences;
}

function createUniqueId(
  column: string,
  index: number,
  used: Set<string>
): string {
  const base =
    column
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "ID";

  let candidate = `${base}_MISSING_${String(index).padStart(6, "0")}`;
  let counter = 1;

  while (used.has(candidate)) {
    candidate = `${base}_MISSING_${String(index).padStart(6, "0")}_${counter++}`;
  }

  used.add(candidate);
  return candidate;
}

export function cleanDataset(
  rawRows: Record<string, any>[],
  columns: string[],
  columnProfiles: ColumnProfile[],
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): {
  cleanedRows: Record<string, any>[];
  cleanedColumns: string[];
  logs: CleaningLogEntry[];
} {
  const logs: CleaningLogEntry[] = [];
  let workingRows = rawRows.map((row) => ({ ...row }));
  let workingColumns = [...columns];

  const originalRowCount = workingRows.length;

  // ---------------------------------------------------------------------------
  // 1. Normalize missing values and trim strings.
  // ---------------------------------------------------------------------------
  for (const row of workingRows) {
    for (const col of workingColumns) {
      const value = row[col];

      if (isMissingValue(value)) {
        row[col] = null;
      } else if (options.trimStrings && typeof value === "string") {
        row[col] = value.trim();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Remove exact duplicate records.
  // ---------------------------------------------------------------------------
  if (options.removeDuplicates) {
    const before = workingRows.length;
    const seen = new Set<string>();
    const uniqueRows: Record<string, any>[] = [];

    for (const row of workingRows) {
      const key = JSON.stringify(workingColumns.map((col) => row[col]));

      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    }

    workingRows = uniqueRows;

    const removed = before - workingRows.length;

    if (removed > 0) {
      addLog(
        logs,
        "log-dedup",
        "Deduplication",
        "Entire Record",
        `${before} rows`,
        `${workingRows.length} unique rows`,
        "Removed exact duplicate records.",
        removed
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Drop constant columns only when explicitly enabled.
  // ---------------------------------------------------------------------------
  if (options.dropConstantColumns) {
    const droppedColumns: string[] = [];

    for (const col of workingColumns) {
      const values = workingRows
        .map((row) => row[col])
        .filter((value) => !isMissingValue(value));

      const uniqueValues = new Set(values.map((value) => String(value)));

      if (values.length > 0 && uniqueValues.size <= 1) {
        droppedColumns.push(col);
      }
    }

    if (droppedColumns.length > 0) {
      workingColumns = workingColumns.filter(
        (col) => !droppedColumns.includes(col)
      );

      for (const row of workingRows) {
        for (const col of droppedColumns) {
          delete row[col];
        }
      }

      for (const col of droppedColumns) {
        addLog(
          logs,
          `log-drop-const-${col}`,
          "Drop Constant Feature",
          col,
          "One distinct non-missing value",
          "Column removed",
          "A constant feature has no variance.",
          workingRows.length
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Drop identifiers only when explicitly enabled.
  // ---------------------------------------------------------------------------
  if (options.dropIdColumns) {
    const droppedIds = workingColumns.filter((col) => {
      const profile = columnProfiles.find((p) => p.name === col);
      return Boolean(profile?.isPossibleId);
    });

    if (droppedIds.length > 0) {
      workingColumns = workingColumns.filter(
        (col) => !droppedIds.includes(col)
      );

      for (const row of workingRows) {
        for (const col of droppedIds) {
          delete row[col];
        }
      }

      for (const col of droppedIds) {
        addLog(
          logs,
          `log-drop-id-${col}`,
          "Drop Identifier Column",
          col,
          "Identifier column",
          "Column removed",
          "Identifier columns were explicitly configured for removal.",
          workingRows.length
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Numerical imputation.
  // Median is calculated from the CURRENT valid values.
  // ---------------------------------------------------------------------------
  if (options.imputeNumerical !== "none") {
    for (const col of workingColumns) {
      const profile = columnProfiles.find((p) => p.name === col);

      if (
        !profile ||
        (profile.dataType !== "numerical" &&
          profile.dataType !== "binary")
      ) {
        continue;
      }

      const values = numericValues(workingRows, col);
      if (!values.length) continue;

      const median = percentile(values, 0.5);
      const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length;

      let replacement: number | undefined;

      if (options.imputeNumerical === "median") replacement = median;
      else if (options.imputeNumerical === "mean") replacement = mean;
      else if (options.imputeNumerical === "zero") replacement = 0;

      if (replacement === undefined || !Number.isFinite(replacement)) {
        continue;
      }

      let affected = 0;

      for (const row of workingRows) {
        if (isMissingValue(row[col])) {
          row[col] = replacement;
          affected++;
        }
      }

      if (affected > 0) {
        addLog(
          logs,
          `log-impute-num-${col}`,
          `Numerical Imputation (${options.imputeNumerical})`,
          col,
          `${affected} missing cells`,
          `Filled with ${Number(replacement.toFixed(6))}`,
          `Used the ${options.imputeNumerical} of the current valid numeric distribution.`,
          affected
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Categorical/boolean mode imputation.
  // ---------------------------------------------------------------------------
  if (options.imputeCategorical !== "none") {
    for (const col of workingColumns) {
      const profile = columnProfiles.find((p) => p.name === col);

      if (
        !profile ||
        (profile.dataType !== "categorical" &&
          profile.dataType !== "boolean")
      ) {
        continue;
      }

      let replacement = "Missing";

      if (options.imputeCategorical === "mode") {
        const counts = new Map<string, number>();

        for (const row of workingRows) {
          if (!isMissingValue(row[col])) {
            const value = String(row[col]);
            counts.set(value, (counts.get(value) || 0) + 1);
          }
        }

        replacement =
          [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
          "Missing";
      }

      let affected = 0;

      for (const row of workingRows) {
        if (isMissingValue(row[col])) {
          row[col] = replacement;
          affected++;
        }
      }

      if (affected > 0) {
        addLog(
          logs,
          `log-impute-cat-${col}`,
          `Categorical Imputation (${options.imputeCategorical})`,
          col,
          `${affected} missing cells`,
          `Filled with '${replacement}'`,
          options.imputeCategorical === "mode"
            ? "Used the most frequent valid category in the current dataset."
            : "Used an explicit Missing category.",
          affected
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Complete missing identifiers without deleting their rows.
  // ---------------------------------------------------------------------------
  for (const col of workingColumns) {
    const profile = columnProfiles.find((p) => p.name === col);

    if (!profile?.isPossibleId) continue;

    const used = new Set<string>();

    for (const row of workingRows) {
      if (!isMissingValue(row[col])) {
        used.add(String(row[col]));
      }
    }

    let affected = 0;
    let sequence = 1;

    for (const row of workingRows) {
      if (isMissingValue(row[col])) {
        row[col] = createUniqueId(col, sequence++, used);
        affected++;
      }
    }

    if (affected > 0) {
      addLog(
        logs,
        `log-impute-id-${col}`,
        "Identifier Completion",
        col,
        `${affected} missing identifier values`,
        "Unique placeholders generated",
        "IDs are completed without statistical imputation or row deletion.",
        affected
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 8. ONE-SHOT TUKEY IQR OUTLIER FILTER.
  //
  // IMPORTANT:
  // Q1, Q3 and the 1.5×IQR fences are calculated ONCE from the current
  // distribution. Rows are then filtered once. The fences are NEVER
  // recalculated after deletion.
  // ---------------------------------------------------------------------------
  if (options.removeOutliers) {
    const fences = getIqrFences(
      workingRows,
      workingColumns,
      columnProfiles
    );

    const eligibleColumns = Object.keys(fences);

    if (eligibleColumns.length > 0) {
      const before = workingRows.length;
      const removedByColumn = new Map<string, number>();
      const keptRows: Record<string, any>[] = [];

      for (const row of workingRows) {
        let isOutlierRow = false;
        const rowOutlierColumns: string[] = [];

        for (const col of eligibleColumns) {
          const value = Number(row[col]);

          if (!Number.isFinite(value)) continue;

          const fence = fences[col];

          if (value < fence.lower || value > fence.upper) {
            isOutlierRow = true;
            rowOutlierColumns.push(col);
          }
        }

        if (isOutlierRow) {
          for (const col of rowOutlierColumns) {
            removedByColumn.set(
              col,
              (removedByColumn.get(col) || 0) + 1
            );
          }
        } else {
          keptRows.push(row);
        }
      }

      workingRows = keptRows;

      const removed = before - workingRows.length;

      const fenceSummary = eligibleColumns
        .map((col) => {
          const f = fences[col];
          return `${col}: [${f.lower.toFixed(3)}, ${f.upper.toFixed(3)}]`;
        })
        .join("; ");

      addLog(
        logs,
        "log-outliers",
        "Filter Tukey IQR Outliers",
        eligibleColumns.join(", "),
        `${before} rows`,
        `${workingRows.length} rows`,
        `Single-pass Tukey filtering. Lower Fence = Q1 − 1.5×IQR; Upper Fence = Q3 + 1.5×IQR. Fences were calculated once and were not recalculated after row removal. ${fenceSummary}`,
        removed
      );

      for (const [col, count] of removedByColumn.entries()) {
        const f = fences[col];

        addLog(
          logs,
          `log-outlier-column-${col}`,
          "Tukey IQR Column Audit",
          col,
          `Q1=${f.q1.toFixed(3)}, Q3=${f.q3.toFixed(3)}, IQR=${f.iqr.toFixed(3)}`,
          `Lower=${f.lower.toFixed(3)}, Upper=${f.upper.toFixed(3)}`,
          `${count} retained-candidate records were outside the column's 1.5×IQR fence.`,
          count
        );
      }
    } else {
      addLog(
        logs,
        "log-outliers-none",
        "Tukey IQR Validation",
        "Continuous Numerical Features",
        `${workingRows.length} rows`,
        `${workingRows.length} rows`,
        "No eligible continuous numerical feature had a valid non-zero IQR fence.",
        0
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 9. FINAL VALIDATION ONLY.
  // No additional row deletion occurs here.
  // ---------------------------------------------------------------------------
  let finalMissingCells = 0;

  for (const row of workingRows) {
    for (const col of workingColumns) {
      if (isMissingValue(row[col])) finalMissingCells++;
    }
  }

  const seen = new Set<string>();
  let finalDuplicateRows = 0;

  for (const row of workingRows) {
    const key = JSON.stringify(workingColumns.map((col) => row[col]));

    if (seen.has(key)) finalDuplicateRows++;
    else seen.add(key);
  }

  addLog(
    logs,
    "log-final-validation",
    "Final Cleaning Validation",
    "Entire Dataset",
    `${originalRowCount} original rows`,
    `${workingRows.length} final rows`,
    `Final validation completed without an additional cleaning pass. Remaining missing cells: ${finalMissingCells}. Remaining exact duplicate rows: ${finalDuplicateRows}.`,
    originalRowCount - workingRows.length
  );

  return {
    cleanedRows: workingRows,
    cleanedColumns: workingColumns,
    logs,
  };
}

export function downloadDatasetAsCsv(
  rows: Record<string, any>[],
  filename: string = "cleaned_dataset.csv"
) {
  const csv = Papa.unparse(rows);

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.setAttribute("href", url);
  link.setAttribute("download", filename);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
