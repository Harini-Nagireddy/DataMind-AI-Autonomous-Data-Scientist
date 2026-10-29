import { ColumnProfile, DataType, QualityReport, QualityIssue, ProblemDetection } from "../types";

export function profileDataset(
  columns: string[],
  rows: Record<string, any>[]
): {
  columnProfiles: ColumnProfile[];
  qualityReport: QualityReport;
  correlationMatrix: { col1: string; col2: string; correlation: number }[];
  problemDetection: ProblemDetection;
} {
  const totalRows = rows.length;
  const totalCols = columns.length;
  const totalCells = totalRows * totalCols;

  if (totalRows === 0 || totalCols === 0) {
    throw new Error("Cannot profile an empty dataset.");
  }

  // 1. Column Profiling
  const columnProfiles: ColumnProfile[] = columns.map((col) => {
    return profileColumn(col, rows);
  });

  // 2. Duplicate rows detection
  const rowStrings = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const serialized = JSON.stringify(row);
    if (rowStrings.has(serialized)) {
      duplicateRows++;
    } else {
      rowStrings.add(serialized);
    }
  }

  // 3. Quality metrics & issues
  let totalMissingCells = 0;
  const columnsWithMissing: string[] = [];
  const constantColumns: string[] = [];
  const highCardinalityColumns: string[] = [];
  const columnsWithOutliers: string[] = [];
  let totalOutlierCount = 0;
  const issues: QualityIssue[] = [];

  for (const cp of columnProfiles) {
    totalMissingCells += cp.missingCount;
    if (cp.missingCount > 0) {
      columnsWithMissing.push(cp.name);
      const severity = cp.missingRate > 25 ? "high" : cp.missingRate > 5 ? "medium" : "low";
      issues.push({
        id: `missing-${cp.name}`,
        type: "missing",
        category: "data_corruption",
        severity,
        column: cp.name,
        message: `Missing values in '${cp.name}'`,
        description: `Column has ${cp.missingCount} empty cells (${cp.missingRate.toFixed(1)}% of total rows).`,
        recommendation:
          cp.dataType === "numerical"
            ? "Impute missing values with column median/mean or drop rows."
            : "Impute with mode or designate a 'Missing' category.",
        impactScore: Math.max(0, Math.min(20, Math.round(cp.missingRate * 0.8))),
      });
    }

    if (cp.isConstant) {
      constantColumns.push(cp.name);
      issues.push({
        id: `constant-${cp.name}`,
        type: "constant",
        category: "data_corruption",
        severity: "medium",
        column: cp.name,
        message: `Constant feature '${cp.name}'`,
        description: `Column contains only a single distinct value across all rows, offering zero predictive variance.`,
        recommendation: "Remove this column from modeling pipelines to save compute and eliminate zero-variance noise.",
        impactScore: 10,
      });
    }

    if (cp.dataType === "categorical" && cp.uniqueCount > 50 && cp.uniqueRate > 0.6 && !cp.isPossibleId) {
      highCardinalityColumns.push(cp.name);
      issues.push({
        id: `high-card-${cp.name}`,
        type: "high_cardinality",
        category: "modeling_consideration",
        severity: "medium",
        column: cp.name,
        message: `High cardinality in '${cp.name}'`,
        description: `Column has ${cp.uniqueCount} distinct text categories (${cp.uniqueRate.toFixed(1)}% unique), risking overfitting in ML.`,
        recommendation: "Group infrequent categories into 'Other' or apply target encoding.",
        impactScore: 0,
      });
    }

    if (cp.isPossibleId) {
      issues.push({
        id: `id-leak-${cp.name}`,
        type: "id_leakage",
        category: "modeling_consideration",
        severity: "low",
        column: cp.name,
        message: `Identifier column detected: '${cp.name}'`,
        description: `Column appears to be a unique primary key or ID with no direct generalizable predictive power.`,
        recommendation: "Exclude from training features to avoid ID target leakage.",
        impactScore: 0,
      });
    }

    if (cp.outlierCount && cp.outlierCount > 0) {
      columnsWithOutliers.push(cp.name);
      totalOutlierCount += cp.outlierCount;
      if (cp.outlierCount / totalRows > 0.05) {
        issues.push({
          id: `outlier-${cp.name}`,
          type: "outlier",
          category: "data_corruption",
          severity: "medium",
          column: cp.name,
          message: `Outliers detected in '${cp.name}'`,
          description: `Identified ${cp.outlierCount} records outside 1.5x IQR Tukey fences in continuous numerical feature '${cp.name}'.`,
          recommendation: "Inspect extreme values for data entry anomalies or apply robust scaling (Winsorization/log transform).",
          impactScore: 8,
        });
      }
    }
  }

  if (duplicateRows > 0) {
    const dupRate = (duplicateRows / totalRows) * 100;
    issues.push({
      id: "duplicate-rows",
      type: "duplicate",
      category: "data_corruption",
      severity: dupRate > 10 ? "high" : "medium",
      message: `${duplicateRows} duplicate rows detected`,
      description: `Found ${duplicateRows} identical records (${dupRate.toFixed(1)}% of rows) that could bias analysis.`,
      recommendation: "Run automated deduplication in Data Cleaning to keep unique rows.",
      impactScore: Math.min(25, Math.round(dupRate * 1.5)),
    });
  }

  // Calculate Data Quality Score (0 to 100)
  const missingRate = totalCells > 0 ? (totalMissingCells / totalCells) * 100 : 0;
  const duplicateRate = totalRows > 0 ? (duplicateRows / totalRows) * 100 : 0;
  const outlierRate = totalRows > 0 ? (totalOutlierCount / (totalRows * Math.max(1, columnsWithOutliers.length))) * 100 : 0;

  let qualityScore = 100;
  qualityScore -= Math.min(35, missingRate * 1.2);
  qualityScore -= Math.min(25, duplicateRate * 1.8);
  qualityScore -= Math.min(15, constantColumns.length * 6);
  qualityScore -= Math.min(15, outlierRate * 0.4);
  qualityScore = Math.max(10, Math.min(100, Math.round(qualityScore)));

  const qualityReport: QualityReport = {
    qualityScore,
    totalRows,
    totalCols,
    totalCells,
    totalMissingCells,
    missingRate: Number(missingRate.toFixed(2)),
    columnsWithMissing,
    duplicateRows,
    duplicateRate: Number(duplicateRate.toFixed(2)),
    constantColumns,
    highCardinalityColumns,
    outlierCount: totalOutlierCount,
    columnsWithOutliers,
    issues,
  };

  // 4. Correlation Matrix for numerical and binary columns
  const numProfiles = columnProfiles
    .filter((c) => (c.dataType === "numerical" || c.dataType === "binary") && !c.isPossibleId)
    .slice(0, 30); // Keep browser-side correlation bounded for wide datasets.
  const correlationMatrix: { col1: string; col2: string; correlation: number }[] = [];

  for (let i = 0; i < numProfiles.length; i++) {
    for (let j = i; j < numProfiles.length; j++) {
      const col1 = numProfiles[i].name;
      const col2 = numProfiles[j].name;
      const corr = calculatePearsonCorrelation(col1, col2, rows);
      correlationMatrix.push({
        col1,
        col2,
        correlation: Number(corr.toFixed(3)),
      });
    }
  }

  // 5. Problem & Target Detection
  const problemDetection = detectProblem(columnProfiles, rows);

  return {
    columnProfiles,
    qualityReport,
    correlationMatrix,
    problemDetection,
  };
}

function profileColumn(col: string, rows: Record<string, any>[]): ColumnProfile {
  const totalCount = rows.length;
  let missingCount = 0;
  const nonNullValues: any[] = [];
  const valueCounts = new Map<any, number>();

  for (const row of rows) {
    const val = row[col];
    if (val === null || val === undefined || val === "" || (typeof val === "number" && isNaN(val))) {
      missingCount++;
    } else {
      nonNullValues.push(val);
      const strVal = String(val);
      valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);
    }
  }

  const uniqueCount = valueCounts.size;
  const uniqueRate = totalCount > 0 ? (uniqueCount / totalCount) * 100 : 0;
  const missingRate = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;
  const isConstant = uniqueCount <= 1 && missingCount < totalCount;

  // Example distinct values
  const exampleValues = Array.from(valueCounts.keys()).slice(0, 5);

  // Detect Data Type & Discrete/Binary Subtype
  const { dataType, originalType, isPossibleId, isBinary, isDiscrete, numericalType } = detectColumnDataType(
    col,
    nonNullValues,
    uniqueCount,
    totalCount
  );

  // Numerical Statistics
  let min: number | undefined;
  let max: number | undefined;
  let mean: number | undefined;
  let median: number | undefined;
  let std: number | undefined;
  let q1: number | undefined;
  let q3: number | undefined;
  let iqr: number | undefined;
  let outlierCount: number | undefined;

  const isNumericOrBinary = (dataType === "numerical" || dataType === "binary") && !isPossibleId;

  if (isNumericOrBinary && nonNullValues.length > 0) {
    const numVals = nonNullValues.map(Number).filter((v) => !isNaN(v)).sort((a, b) => a - b);
    if (numVals.length > 0) {
      min = numVals[0];
      max = numVals[numVals.length - 1];
      const sum = numVals.reduce((acc, v) => acc + v, 0);
      mean = Number((sum / numVals.length).toFixed(3));

      // Median & Quartiles
      median = getPercentile(numVals, 0.5);
      q1 = getPercentile(numVals, 0.25);
      q3 = getPercentile(numVals, 0.75);
      iqr = Number((q3 - q1).toFixed(3));

      // Standard deviation
      const variance =
        numVals.reduce((acc, v) => acc + Math.pow(v - (mean as number), 2), 0) / Math.max(1, numVals.length - 1);
      std = Number(Math.sqrt(variance).toFixed(3));

      // Statistical Rule for Tukey IQR Outlier Detection:
      // Only apply Tukey IQR outlier detection to genuinely continuous numerical variables
      // where the method is statistically meaningful.
      // Do NOT apply Tukey IQR to:
      //  1. Binary columns (isBinary or dataType === 'binary', e.g. SeniorCitizen 0/1)
      //  2. Boolean columns (dataType === 'boolean')
      //  3. Categorical columns (dataType === 'categorical')
      //  4. ID/identifier columns (dataType === 'id' or isPossibleId)
      //  5. Discrete columns with very few unique values (isDiscrete or uniqueCount <= 10)
      //  6. Columns where IQR is 0 (where quartile fences collapse to a single value)
      const isEligibleForIqr =
        dataType === "numerical" &&
        !isBinary &&
        !isDiscrete &&
        numericalType === "continuous" &&
        uniqueCount > 10 &&
        iqr > 0;

      if (isEligibleForIqr) {
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        outlierCount = numVals.filter((v) => v < lowerBound || v > upperBound).length;
      } else {
        outlierCount = 0;
      }
    }
  }

  // Top categorical values
  let topValues: { value: string; count: number; percentage: number }[] | undefined;
  if (nonNullValues.length > 0) {
    const sorted = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({
        value,
        count,
        percentage: Number(((count / nonNullValues.length) * 100).toFixed(1)),
      }));
    topValues = sorted;
  }

  return {
    name: col,
    dataType,
    originalType,
    numericalType,
    isBinary,
    isDiscrete,
    totalCount,
    uniqueCount,
    uniqueRate: Number(uniqueRate.toFixed(1)),
    missingCount,
    missingRate: Number(missingRate.toFixed(1)),
    exampleValues,
    isPossibleId,
    isConstant,
    min,
    max,
    mean,
    median,
    std,
    q1,
    q3,
    iqr,
    outlierCount,
    topValues,
  };
}

function detectColumnDataType(
  colName: string,
  values: any[],
  uniqueCount: number,
  totalRows: number
): {
  dataType: DataType;
  originalType: string;
  isPossibleId: boolean;
  isBinary: boolean;
  isDiscrete: boolean;
  numericalType?: "continuous" | "discrete" | "binary";
} {
  if (values.length === 0) {
    return {
      dataType: "categorical",
      originalType: "empty",
      isPossibleId: false,
      isBinary: false,
      isDiscrete: true,
    };
  }

  const lowerName = colName.toLowerCase().trim();

  // Semantic identifier/contact/location-code detection.
  // These fields can be stored as numbers but must NOT be treated as
  // continuous business metrics because averaging them has no analytical meaning.
  const identifierKeywords = [
    "uuid", "guid", "hash", "ssn", "isbn", "custid", "customerid",
    "empid", "employeeid", "transid", "transactionid", "accountid",
    "userid", "user_id", "customer_id", "transaction_id", "recordid",
    "rowid", "orderid", "productid", "employee_id", "account_id",
    "record_id", "row_id", "order_id", "product_id", "id", "key", "code",
  ];
  const contactKeywords = [
    "phone", "mobile", "telephone", "tel", "fax", "contact",
    "contactnumber", "contact_number", "mobilenumber", "mobile_number",
    "phonenumber", "phone_number", "telephonenumber", "telephone_number",
  ];
  const locationCodeKeywords = [
    "zip", "zipcode", "zip_code", "postal", "postalcode", "postal_code",
    "pincode", "pin_code", "postcode", "post_code",
  ];

  const normalizedName = lowerName.replace(/[^a-z0-9]/g, "");
  const tokenizedName = lowerName.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9]+/).filter(Boolean);

  const matchesSemanticKeyword = (keywords: string[]) =>
    keywords.some((keyword) => {
      const normalizedKeyword = keyword.replace(/[^a-z0-9]/g, "");
      const isGenericToken = normalizedKeyword === "id" || normalizedKeyword === "key" || normalizedKeyword === "code";

      if (isGenericToken) {
        return tokenizedName.includes(normalizedKeyword);
      }

      return (
        normalizedName === normalizedKeyword ||
        normalizedName.startsWith(normalizedKeyword) ||
        normalizedName.endsWith(normalizedKeyword) ||
        normalizedName.includes(normalizedKeyword)
      );
    });

  const isIdentifierLikeName = matchesSemanticKeyword(identifierKeywords);
  const isContactLikeName = matchesSemanticKeyword(contactKeywords);
  const isLocationCodeLikeName = matchesSemanticKeyword(locationCodeKeywords);
  const isSemanticIdentifierName =
    isIdentifierLikeName || isContactLikeName || isLocationCodeLikeName;

  const isHighUnique = values.length > 10 && uniqueCount / values.length > 0.92;

  // Explicit semantic identifiers take priority over numeric detection.
  // Phone numbers, postal/ZIP codes and database identifiers are not
  // meaningful continuous measurements even when they contain only digits.
  if (isSemanticIdentifierName && (isHighUnique || values.length > 0)) {
    return {
      dataType: "id",
      originalType: typeof values[0],
      isPossibleId: true,
      isBinary: false,
      isDiscrete: true,
      numericalType: "discrete",
    };
  }

  // Check boolean
  let boolCount = 0;
  for (const v of values) {
    if (typeof v === "boolean" || v === "true" || v === "false" || v === "True" || v === "False") {
      boolCount++;
    }
  }
  if (boolCount / values.length > 0.85) {
    return {
      dataType: "boolean",
      originalType: "boolean",
      isPossibleId: false,
      isBinary: true,
      isDiscrete: true,
    };
  }

  // Check number
  let numCount = 0;
  const parsedNums: number[] = [];
  for (const v of values) {
    if (typeof v === "number" && !isNaN(v)) {
      numCount++;
      parsedNums.push(v);
    } else if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
      numCount++;
      parsedNums.push(Number(v));
    }
  }

  if (numCount / values.length > 0.85) {
    // If it's an integer sequence or 100% unique ID like row_id
    if (isSemanticIdentifierName && isHighUnique) {
      return {
        dataType: "id",
        originalType: "integer",
        isPossibleId: true,
        isBinary: false,
        isDiscrete: true,
        numericalType: "discrete",
      };
    }

    const distinctNums = new Set(parsedNums);
    const distinctCount = distinctNums.size;

    // Binary numeric (0/1 or exactly 2 distinct numeric values)
    if (distinctCount === 2) {
      const isZeroOne = distinctNums.has(0) && distinctNums.has(1);
      return {
        dataType: "binary",
        originalType: isZeroOne ? "binary_0_1" : "binary_number",
        isPossibleId: false,
        isBinary: true,
        isDiscrete: true,
        numericalType: "binary",
      };
    }

    // Discrete numeric with very few unique values (e.g. <= 10 unique levels)
    const allIntegers = parsedNums.every((n) => Number.isInteger(n));
    if (distinctCount <= 10) {
      return {
        dataType: "numerical",
        originalType: allIntegers ? "discrete_integer" : "discrete_number",
        isPossibleId: false,
        isBinary: false,
        isDiscrete: true,
        numericalType: "discrete",
      };
    }

    // Genuinely continuous numerical variable
    return {
      dataType: "numerical",
      originalType: allIntegers ? "continuous_integer" : "continuous_float",
      isPossibleId: false,
      isBinary: false,
      isDiscrete: false,
      numericalType: "continuous",
    };
  }

  // Check datetime
  let dateCount = 0;
  for (const v of values.slice(0, 50)) {
    if (typeof v === "string" && v.length >= 8 && v.length <= 30) {
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v) || !isNaN(Date.parse(v))) {
        dateCount++;
      }
    }
  }
  if (dateCount / Math.min(values.length, 50) > 0.8) {
    return {
      dataType: "datetime",
      originalType: "date",
      isPossibleId: false,
      isBinary: false,
      isDiscrete: true,
    };
  }

  // Fallback categorical
  const isBinaryCat = uniqueCount === 2;
  return {
    dataType: isHighUnique && isSemanticIdentifierName ? "id" : "categorical",
    originalType: "string",
    isPossibleId: isHighUnique && isSemanticIdentifierName,
    isBinary: isBinaryCat,
    isDiscrete: true,
  };
}

function getPercentile(sortedVals: number[], percentile: number): number {
  if (sortedVals.length === 0) return 0;
  const index = (sortedVals.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) {
    return Number(sortedVals[lower].toFixed(3));
  }
  return Number((sortedVals[lower] * (1 - weight) + sortedVals[upper] * weight).toFixed(3));
}

function calculatePearsonCorrelation(col1: string, col2: string, rows: Record<string, any>[]): number {
  const pairs: [number, number][] = [];
  for (const row of rows) {
    const v1 = Number(row[col1]);
    const v2 = Number(row[col2]);
    if (!isNaN(v1) && !isNaN(v2) && row[col1] !== null && row[col2] !== null) {
      pairs.push([v1, v2]);
    }
  }

  if (pairs.length < 3) return 0;

  const n = pairs.length;
  let sum1 = 0;
  let sum2 = 0;
  for (const [x, y] of pairs) {
    sum1 += x;
    sum2 += y;
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (const [x, y] of pairs) {
    const diff1 = x - mean1;
    const diff2 = y - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  if (denominator === 0) return 0;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

function detectProblem(columnProfiles: ColumnProfile[], rows: Record<string, any>[]): ProblemDetection {
  const candidateTargets: ProblemDetection["candidateTargets"] = [];

  const targetKeywords = [
    "target",
    "label",
    "churn",
    "attrition",
    "default",
    "fraud",
    "converted",
    "outcome",
    "survived",
    "status",
    "sales",
    "revenue",
    "price",
    "salary",
    "profit",
    "amount",
    "loss",
    "score",
    "rating",
  ];

  for (const cp of columnProfiles) {
    if (cp.isPossibleId || cp.isConstant || cp.missingRate > 40) {
      continue;
    }

    const lowerName = cp.name.toLowerCase();
    let score = 0;

    // Keyword match
    for (const kw of targetKeywords) {
      if (lowerName === kw) {
        score += 50;
        break;
      } else if (lowerName.includes(kw)) {
        score += 30;
        break;
      }
    }

    // Binary or low-cardinality classification candidate
    if ((cp.dataType === "categorical" || cp.dataType === "boolean" || cp.dataType === "binary" || cp.dataType === "numerical") && cp.uniqueCount >= 2 && cp.uniqueCount <= 10) {
      score += 25;
      candidateTargets.push({
        column: cp.name,
        taskType: "classification",
        reason: `'${cp.name}' has ${cp.uniqueCount} distinct discrete classes suitable for classification.`,
        score,
      });
    } else if (cp.dataType === "numerical" && cp.uniqueCount > 10) {
      score += 20;
      candidateTargets.push({
        column: cp.name,
        taskType: "regression",
        reason: `'${cp.name}' is a continuous numeric metric with ${cp.uniqueCount} unique values suitable for regression.`,
        score,
      });
    }
  }

  candidateTargets.sort((a, b) => b.score - a.score);

  if (candidateTargets.length > 0 && candidateTargets[0].score >= 30) {
    const top = candidateTargets[0];
    return {
      hasTarget: true,
      targetColumn: top.column,
      taskType: top.taskType,
      confidence: Math.min(95, top.score + 20),
      reason: top.reason,
      candidateTargets,
    };
  } else if (candidateTargets.length > 0) {
    const top = candidateTargets[0];
    return {
      hasTarget: true,
      targetColumn: top.column,
      taskType: top.taskType,
      confidence: 50,
      reason: `Suggested '${top.column}' as a potential modeling target based on distribution.`,
      candidateTargets,
    };
  }

  return {
    hasTarget: false,
    taskType: "none",
    confidence: 0,
    reason: "No distinct target variable detected; full dataset is ready for exploratory data analysis.",
    candidateTargets: [],
  };
}
