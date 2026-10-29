export type DataType = "numerical" | "categorical" | "datetime" | "boolean" | "id" | "binary";

export interface ColumnProfile {
  name: string;
  dataType: DataType;
  originalType: string;
  numericalType?: "continuous" | "discrete" | "binary";
  isBinary?: boolean;
  isDiscrete?: boolean;
  totalCount: number;
  uniqueCount: number;
  uniqueRate: number;
  missingCount: number;
  missingRate: number;
  exampleValues: (string | number | boolean)[];
  isPossibleId: boolean;
  isConstant: boolean;
  // Numerical stats
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  outlierCount?: number;
  // Categorical stats
  topValues?: { value: string; count: number; percentage: number }[];
}

export interface QualityIssue {
  id: string;
  type: "missing" | "duplicate" | "constant" | "high_cardinality" | "outlier" | "id_leakage";
  category?: "data_corruption" | "modeling_consideration";
  severity: "high" | "medium" | "low";
  column?: string;
  message: string;
  description: string;
  recommendation: string;
  impactScore: number;
}

export interface QualityReport {
  qualityScore: number; // 0 - 100
  totalRows: number;
  totalCols: number;
  totalCells: number;
  totalMissingCells: number;
  missingRate: number;
  columnsWithMissing: string[];
  duplicateRows: number;
  duplicateRate: number;
  constantColumns: string[];
  highCardinalityColumns: string[];
  outlierCount: number;
  columnsWithOutliers: string[];
  issues: QualityIssue[];
}

export interface CleaningOperation {
  id: string;
  name: string;
  column?: string;
  description: string;
  parameters?: Record<string, any>;
  enabled: boolean;
}

export interface CleaningLogEntry {
  id: string;
  timestamp: string;
  operation: string;
  column: string;
  before: string;
  after: string;
  reason: string;
  affectedCount: number;
}

export interface ProblemDetection {
  hasTarget: boolean;
  targetColumn?: string;
  taskType: "classification" | "regression" | "none";
  confidence: number;
  reason: string;
  candidateTargets: {
    column: string;
    taskType: "classification" | "regression";
    reason: string;
    score: number;
  }[];
  isOverride?: boolean;
}

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][]; // [actual][predicted]
}

export interface RocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface ModelMetricScores {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  rocAuc?: number | null;
  mae?: number;
  mse?: number;
  rmse?: number;
  r2?: number;
  mape?: number;
}

export interface MLModelResult {
  id: string;
  name: string;
  algorithm: string;
  taskType: "classification" | "regression";
  primaryMetric: string;
  primaryMetricKey?: string;
  primaryMetricValue: number;
  metrics: ModelMetricScores;
  trainingTimeMs: number;
  confusionMatrix?: ConfusionMatrix;
  rocCurve?: RocPoint[];
  featureImportance: { feature: string; importance: number; direction?: "positive" | "negative" }[];
  status: "trained" | "failed";
  errorMessage?: string;
  isBest?: boolean;
  cvMean?: number;
  cvStd?: number;
  cvFolds?: number;
}

export interface AutoMLSummary {
  taskType: "classification" | "regression";
  targetColumn: string;
  primaryMetric?: string;
  primaryMetricLabel?: string;
  selectedModel: MLModelResult;
  models: MLModelResult[];
  trainCount: number;
  testCount: number;
  featureNames: string[];
  selectionReason: string;
  baselineMetric: string;
  baselineValue: number;
  testSplitRatio: number;
  cvFolds?: number;
  excludedColumns?: string[];
  preprocessing?: string;
}

export interface AIInsights {
  executiveSummary: string;
  keyFindings: string[];
  businessInsights: string[];
  recommendedActions: string[];
  cautions: string[];
  fallback?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface DatasetSession {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  totalRows: number;
  isSampled?: boolean;
  datasetId?: string;
  sourceFile?: File;
  rawRows: Record<string, any>[];
  cleanedRows: Record<string, any>[];
  columns: string[];
  cleanedColumns?: string[];
  columnProfiles: ColumnProfile[];
  qualityReport: QualityReport;
  cleaningLogs: CleaningLogEntry[];
  correlationMatrix: { col1: string; col2: string; correlation: number }[];
  problemDetection: ProblemDetection;
  automlSummary?: AutoMLSummary;
  aiInsights?: AIInsights;
}

export type ActiveTab =
  | "landing"
  | "upload"
  | "overview"
  | "quality"
  | "cleaning"
  | "eda"
  | "automl"
  | "evaluation"
  | "explainability"
  | "insights"
  | "dashboard"
  | "assistant"
  | "report";
