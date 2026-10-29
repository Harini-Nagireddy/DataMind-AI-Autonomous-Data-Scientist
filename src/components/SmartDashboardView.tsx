import React, { useState, useMemo, useEffect } from "react";
import { DatasetSession } from "../types";
import {
  SlidersHorizontal,
  BarChart3,
  TrendingUp,
  PieChart,
  Filter,
  Layers,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Database,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SmartDashboardViewProps {
  session: DatasetSession;
  onNavigateToAssistant: () => void;
}

export const SmartDashboardView: React.FC<SmartDashboardViewProps> = ({
  session,
  onNavigateToAssistant,
}) => {
  const { cleanedRows, columnProfiles, automlSummary } = session;

  // ============================================================
  // NON-METRIC COLUMN DETECTION
  // ============================================================
  // Business metrics must be genuine measurements.
  //
  // Numeric identifiers/contact/location-code fields such as:
  // Phone, ZIP, Customer ID, Transaction ID, etc.
  // must never be averaged, summed, used as sliders,
  // or plotted as continuous business metrics.
  const isNonMetricColumn = (
    columnName: string,
    isPossibleId?: boolean
  ) => {
    if (isPossibleId) return true;

    const lowerName = columnName.toLowerCase().trim();

    const normalized = lowerName.replace(/[^a-z0-9]/g, "");

    const tokens = lowerName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    const semanticIdentifierTerms = [
      "uuid",
      "guid",
      "hash",
      "ssn",
      "isbn",

      "custid",
      "customerid",
      "customer_id",

      "empid",
      "employeeid",
      "employee_id",

      "transid",
      "transactionid",
      "transaction_id",

      "accountid",
      "account_id",

      "userid",
      "user_id",

      "recordid",
      "record_id",

      "rowid",
      "row_id",

      "orderid",
      "order_id",

      "productid",
      "product_id",

      "id",
      "key",
      "code",

      // Contact / phone fields
      "phone",
      "phonenumber",
      "mobile",
      "mobilenumber",
      "telephone",
      "telephonenumber",
      "tel",
      "fax",
      "contact",
      "contactnumber",

      // Geographic / postal codes
      "zip",
      "zipcode",
      "postal",
      "postalcode",
      "pincode",
      "postcode",
    ];

    return semanticIdentifierTerms.some((term) => {
      const normalizedTerm = term.replace(/[^a-z0-9]/g, "");

      if (
        normalizedTerm === "id" ||
        normalizedTerm === "key" ||
        normalizedTerm === "code"
      ) {
        return tokens.includes(normalizedTerm);
      }

      return (
        normalized === normalizedTerm ||
        normalized.startsWith(normalizedTerm) ||
        normalized.endsWith(normalizedTerm) ||
        normalized.includes(normalizedTerm)
      );
    });
  };

  // ============================================================
  // TEMPORAL COLUMN DETECTION
  // ============================================================
  // Year, Month, Quarter, Date, Timestamp etc. are dimensions/time
  // fields, NOT business measures.
  //
  // Therefore:
  //   Year       -> should NOT become AVG YEAR
  //   Month      -> should NOT become AVG MONTH
  //   Date       -> should NOT become AVG DATE
  //
  // They can still be used elsewhere for trends/time analysis.
  const isTemporalColumn = (columnName: string) => {
    const lowerName = columnName.toLowerCase().trim();

    const normalized = lowerName.replace(/[^a-z0-9]/g, "");

    const temporalTerms = [
      "year",
      "fiscalyear",
      "calendar_year",
      "calendaryear",

      "month",
      "fiscalmonth",

      "quarter",
      "fiscalquarter",

      "week",
      "weeknumber",

      "date",
      "datetime",
      "timestamp",
      "time",

      "createddate",
      "createdat",

      "updateddate",
      "updatedat",

      "orderdate",
      "order_date",

      "purchasedate",
      "purchase_date",

      "transactiondate",
      "transaction_date",

      "deliverydate",
      "delivery_date",

      "startdate",
      "start_date",

      "enddate",
      "end_date",

      "birthdate",
      "dob",
    ];

    return temporalTerms.some((term) => {
      const normalizedTerm = term.replace(/[^a-z0-9]/g, "");

      return (
        normalized === normalizedTerm ||
        normalized.startsWith(normalizedTerm) ||
        normalized.endsWith(normalizedTerm)
      );
    });
  };

  // ============================================================
  // DATASET-AWARE GRAPH SCALE HELPERS
  // ============================================================
  // Graph axes must be derived from the values currently being plotted.
  // This keeps the visual scale correct for small, large, negative,
  // decimal, and filtered datasets without changing the chart data.
  const getChartDomain = (
    values: number[],
    includeZeroForPositive = true
  ): [number, number] => {
    const validValues = values.filter((value) =>
      Number.isFinite(value)
    );

    if (validValues.length === 0) {
      return [0, 1];
    }

    let min = Math.min(...validValues);
    let max = Math.max(...validValues);

    // Constant values need a small visible range.
    if (min === max) {
      const padding = Math.abs(min) * 0.1 || 1;

      if (includeZeroForPositive && min >= 0) {
        return [0, Math.ceil(max + padding)];
      }

      return [min - padding, max + padding];
    }

    // Counts and positive measurements should normally start at zero.
    // Mixed/negative values must preserve their real lower bound.
    if (includeZeroForPositive && min >= 0) {
      min = 0;
    } else {
      const range = max - min;
      const padding = range * 0.05;
      min -= padding;
      max += padding;
    }

    const range = max - min;
    const roughStep = range / 5;

    if (!Number.isFinite(roughStep) || roughStep <= 0) {
      return [min, max];
    }

    const magnitude = Math.pow(
      10,
      Math.floor(Math.log10(roughStep))
    );

    const normalized = roughStep / magnitude;

    let multiplier: number;

    if (normalized <= 1) {
      multiplier = 1;
    } else if (normalized <= 2) {
      multiplier = 2;
    } else if (normalized <= 5) {
      multiplier = 5;
    } else {
      multiplier = 10;
    }

    const niceStep = multiplier * magnitude;

    if (!Number.isFinite(niceStep) || niceStep <= 0) {
      return [min, max];
    }

    const niceMin =
      min >= 0
        ? 0
        : Math.floor(min / niceStep) * niceStep;

    const niceMax =
      Math.ceil(max / niceStep) * niceStep;

    return [niceMin, niceMax];
  };

  // ============================================================
  // BUSINESS NUMERICAL COLUMNS
  // ============================================================
  // Only genuine numerical business measurements are allowed.
  //
  // Excluded:
  //   - IDs
  //   - Phone numbers
  //   - ZIP/postal codes
  //   - Codes
  //   - Dates
  //   - Years
  //   - Months
  //   - Other temporal fields
  const numCols = useMemo(() => {
    return columnProfiles
      .filter(
        (c) =>
          (c.dataType === "numerical" || c.dataType === "binary") &&
          !isNonMetricColumn(c.name, c.isPossibleId) &&
          !isTemporalColumn(c.name)
      )
      .map((c) => c.name);
  }, [columnProfiles]);

  // ============================================================
  // CATEGORICAL COLUMNS
  // ============================================================
  const catCols = useMemo(() => {
    return columnProfiles
      .filter(
        (c) => c.dataType === "categorical" || c.dataType === "boolean"
      )
      .map((c) => c.name);
  }, [columnProfiles]);

  // ============================================================
  // DATE COLUMNS
  // ============================================================
  // Kept available for future time-based dashboard features.
  const dateCols = useMemo(() => {
    return columnProfiles
      .filter((c) => c.dataType === "datetime")
      .map((c) => c.name);
  }, [columnProfiles]);

  // Prevent unused-variable build warnings in configurations that
  // perform strict checking.
  void dateCols;

  // ============================================================
  // FILTER STATE
  // ============================================================
  const primaryCatCol = catCols[0] || "";

  const [selectedCategory, setSelectedCategory] =
    useState<string>("ALL");

  const primaryNumCol = numCols[0] || "";

  // ============================================================
  // DATASET-AWARE NUMERICAL FILTER METADATA
  // ============================================================
  // Instead of the old hardcoded:
  //
  // min = 0
  // max = 1000
  // step = 50
  //
  // the dashboard reads the actual values from the selected
  // numerical column and calculates a suitable range/step.
  const numericFilterMeta = useMemo(() => {
    if (!primaryNumCol || cleanedRows.length === 0) {
      return {
        min: 0,
        max: 0,
        step: 1,
        hasRange: false,
      };
    }

    const values = cleanedRows
      .map((row) => Number(row[primaryNumCol]))
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        step: 1,
        hasRange: false,
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    const range = max - min;

    // No meaningful range.
    if (!Number.isFinite(range) || range <= 0) {
      return {
        min,
        max,
        step: 1,
        hasRange: false,
      };
    }

    // ----------------------------------------------------------
    // AUTOMATIC STEP CALCULATION
    // ----------------------------------------------------------
    // Aim for approximately 50–100 useful slider positions.
    //
    // Examples:
    //   Age:       18–50       -> step around 0.5/1
    //   Income:    20k–200k    -> step around thousands
    //   Amount:    10–10,000   -> sensible decimal/integer step
    //
    // The algorithm finds a "nice" step using 1/2/5 × 10^n.
    const roughStep = range / 80;

    const magnitude = Math.pow(
      10,
      Math.floor(Math.log10(Math.max(roughStep, Number.EPSILON)))
    );

    const normalizedStep = roughStep / magnitude;

    let stepMultiplier: number;

    if (normalizedStep <= 1) {
      stepMultiplier = 1;
    } else if (normalizedStep <= 2) {
      stepMultiplier = 2;
    } else if (normalizedStep <= 5) {
      stepMultiplier = 5;
    } else {
      stepMultiplier = 10;
    }

    const calculatedStep = stepMultiplier * magnitude;

    // Make sure the step is a sensible positive finite number.
    const step =
      Number.isFinite(calculatedStep) && calculatedStep > 0
        ? calculatedStep
        : 1;

    return {
      min,
      max,
      step,
      hasRange: true,
    };
  }, [cleanedRows, primaryNumCol]);

  // ============================================================
  // MINIMUM NUMERICAL FILTER VALUE
  // ============================================================
  // The initial value is the REAL minimum from the dataset.
  const [minNumericValue, setMinNumericValue] =
    useState<number>(0);

  // Whenever the selected numerical field changes, reset the
  // slider to that field's actual minimum.
  useEffect(() => {
    setMinNumericValue(numericFilterMeta.min);
  }, [numericFilterMeta.min, primaryNumCol]);

  // ============================================================
  // AVAILABLE CATEGORIES
  // ============================================================
  const availableCategories = useMemo(() => {
    if (!primaryCatCol) return [];

    const set = new Set<string>();

    cleanedRows.forEach((row) => {
      const val = String(row[primaryCatCol] ?? "");

      if (val) {
        set.add(val);
      }
    });

    return Array.from(set).slice(0, 15);
  }, [primaryCatCol, cleanedRows]);

  // ============================================================
  // DYNAMIC ROW FILTERING
  // ============================================================
  const filteredRows = useMemo(() => {
    return cleanedRows.filter((row) => {
      // Category filter
      if (primaryCatCol && selectedCategory !== "ALL") {
        if (String(row[primaryCatCol]) !== selectedCategory) {
          return false;
        }
      }

      // Numerical minimum filter
      if (primaryNumCol) {
        const value = Number(row[primaryNumCol]);

        // Ignore invalid numerical values.
        if (!Number.isFinite(value)) {
          return false;
        }

        if (value < minNumericValue) {
          return false;
        }
      }

      return true;
    });
  }, [
    cleanedRows,
    primaryCatCol,
    selectedCategory,
    primaryNumCol,
    minNumericValue,
  ]);

  // ============================================================
  // DYNAMIC KPIs
  // ============================================================
  const kpis = useMemo(() => {
    const totalCount = filteredRows.length;

    // Pick the top 2 genuine business numerical columns.
    //
    // Because numCols already excludes:
    //   - Phone
    //   - ZIP
    //   - IDs
    //   - Year
    //   - Date
    //   - Month
    //
    // these will only be actual measurement fields.
    const num1 = numCols[0];
    const num2 = numCols[1];

    let num1Sum = 0;
    let num1Avg = 0;
    let num2Avg = 0;

    if (num1 && totalCount > 0) {
      num1Sum = filteredRows.reduce(
        (acc, row) => acc + (Number(row[num1]) || 0),
        0
      );

      num1Avg = num1Sum / totalCount;
    }

    if (num2 && totalCount > 0) {
      const sum2 = filteredRows.reduce(
        (acc, row) => acc + (Number(row[num2]) || 0),
        0
      );

      num2Avg = sum2 / totalCount;
    }

    return {
      totalCount,
      num1Name: num1,
      num1Avg: Number(num1Avg.toFixed(2)),
      num1Sum: Number(num1Sum.toFixed(0)),
      num2Name: num2,
      num2Avg: Number(num2Avg.toFixed(2)),
    };
  }, [filteredRows, numCols]);

  // ============================================================
  // CHART 1: CATEGORICAL BREAKDOWN
  // ============================================================
  const categoryChartData = useMemo(() => {
    const targetCat = catCols[0];

    if (!targetCat) return [];

    const counts = new Map<string, number>();

    filteredRows.forEach((row) => {
      const val = String(row[targetCat] ?? "Unknown");

      counts.set(val, (counts.get(val) || 0) + 1);
    });

    return Array.from(counts.entries())
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        count,
      }));
  }, [filteredRows, catCols]);

  // The category chart scale is calculated from the actual values
  // currently displayed after all active filters are applied.
  const categoryChartDomain = useMemo(() => {
    return getChartDomain(
      categoryChartData.map((item) => item.count),
      true
    );
  }, [categoryChartData]);

  // ============================================================
  // CHART 2: NUMERICAL METRIC BY CATEGORY
  // ============================================================
  const metricByCategoryData = useMemo(() => {
    const cat = catCols[0];
    const num = numCols[0];

    if (!cat || !num) return [];

    const map = new Map<
      string,
      {
        sum: number;
        count: number;
      }
    >();

    filteredRows.forEach((row) => {
      const key = String(row[cat] ?? "Other");
      const value = Number(row[num]);

      if (!Number.isNaN(value) && Number.isFinite(value)) {
        const current = map.get(key) || {
          sum: 0,
          count: 0,
        };

        map.set(key, {
          sum: current.sum + value,
          count: current.count + 1,
        });
      }
    });

    return Array.from(map.entries())
      .slice(0, 8)
      .map(([name, stats]) => ({
        name,
        average:
          stats.count > 0
            ? Number((stats.sum / stats.count).toFixed(2))
            : 0,
      }));
  }, [filteredRows, catCols, numCols]);

  // The metric chart scale is also recalculated from the actual
  // averages being displayed. No fixed 0-1000/0-10000 range is used.
  const metricChartDomain = useMemo(() => {
    return getChartDomain(
      metricByCategoryData.map((item) => item.average),
      true
    );
  }, [metricByCategoryData]);

  // ============================================================
  // CHART 3: DISTRIBUTION HISTOGRAM
  // ============================================================
  const distributionData = useMemo(() => {
    const num = numCols[0];

    if (!num || filteredRows.length === 0) {
      return [];
    }

    const vals = filteredRows
      .map((row) => Number(row[num]))
      .filter(
        (value) => Number.isFinite(value)
      );

    if (vals.length === 0) {
      return [];
    }

    const min = Math.min(...vals);
    const max = Math.max(...vals);

    const bins = 8;

    // Handle a constant-value field safely.
    if (min === max) {
      return [
        {
          bin: `${min.toLocaleString()}`,
          count: vals.length,
        },
      ];
    }

    const step = (max - min) / bins;

    if (!Number.isFinite(step) || step <= 0) {
      return [];
    }

    const res = Array.from(
      { length: bins },
      (_, index) => ({
        bin: `${(
          min +
          index * step
        ).toFixed(0)} - ${(
          min +
          (index + 1) * step
        ).toFixed(0)}`,
        count: 0,
      })
    );

    vals.forEach((value) => {
      const idx = Math.min(
        bins - 1,
        Math.floor(
          (value - min) /
            Math.max(Number.EPSILON, step)
        )
      );

      if (idx >= 0 && idx < bins) {
        res[idx].count++;
      }
    });

    return res;
  }, [filteredRows, numCols]);

  // Keep the existing palette available for future charts.
  const COLORS = [
    "#6366f1",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#8b5cf6",
  ];

  // Prevent strict configurations from reporting COLORS as unused
  // while preserving the existing dashboard palette.
  void COLORS;

  // ============================================================
  // FILTER RESET
  // ============================================================
  const hasActiveFilters =
    selectedCategory !== "ALL" ||
    (numericFilterMeta.hasRange &&
      minNumericValue > numericFilterMeta.min);

  const resetFilters = () => {
    setSelectedCategory("ALL");
    setMinNumericValue(numericFilterMeta.min);
  };

  // ============================================================
  // DISPLAY HELPERS
  // ============================================================
  const formatFilterValue = (value: number) => {
    if (!Number.isFinite(value)) {
      return "0";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Adaptive Smart Dashboard
            </h1>

            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono border border-cyan-500/25">
              Reactive Telemetry
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-1">
            Dynamic business KPIs and interactive charts automatically
            structured around your dataset&apos;s dimensions.
          </p>
        </div>

        <button
          onClick={onNavigateToAssistant}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <span>AI Data Assistant</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* ====================================================== */}
      {/* DYNAMIC FILTER CONTROLS */}
      {/* ====================================================== */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-400" />

            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Interactive Slice &amp; Dice Filters
            </h2>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* ================================================== */}
          {/* CATEGORY FILTER */}
          {/* ================================================== */}
          {primaryCatCol && (
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Filter by {primaryCatCol}:
              </label>

              <select
                value={selectedCategory}
                onChange={(e) =>
                  setSelectedCategory(e.target.value)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">
                  All Categories (Entire Dataset)
                </option>

                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ================================================== */}
          {/* DATASET-AWARE NUMERICAL SLIDER */}
          {/* ================================================== */}
          {primaryNumCol && numericFilterMeta.hasRange && (
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Min {primaryNumCol}:{" "}
                <span className="text-slate-200">
                  {formatFilterValue(minNumericValue)}
                </span>
              </label>

              <input
                type="range"
                min={numericFilterMeta.min}
                max={numericFilterMeta.max}
                step={numericFilterMeta.step}
                value={Math.min(
                  Math.max(
                    minNumericValue,
                    numericFilterMeta.min
                  ),
                  numericFilterMeta.max
                )}
                onChange={(e) =>
                  setMinNumericValue(
                    Number(e.target.value)
                  )
                }
                className="w-full accent-indigo-500"
              />

              <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-mono">
                <span>
                  {formatFilterValue(
                    numericFilterMeta.min
                  )}
                </span>

                <span>
                  {formatFilterValue(
                    numericFilterMeta.max
                  )}
                </span>
              </div>

              <div className="mt-1 text-[9px] text-slate-600">
                Step:{" "}
                {formatFilterValue(
                  numericFilterMeta.step
                )}
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* NO NUMERICAL FILTER MESSAGE */}
          {/* ================================================== */}
          {primaryNumCol && !numericFilterMeta.hasRange && (
            <div className="flex items-center">
              <span className="text-[11px] text-slate-500">
                {primaryNumCol} has no meaningful numerical
                range for filtering.
              </span>
            </div>
          )}

          {/* ================================================== */}
          {/* ACTIVE SELECTION */}
          {/* ================================================== */}
          <div className="flex items-center">
            <span className="text-xs text-slate-400 font-mono">
              Active Selection:{" "}
              <strong className="text-white">
                {filteredRows.length.toLocaleString()}
              </strong>{" "}
              of{" "}
              {cleanedRows.length.toLocaleString()} records
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* DYNAMIC KPI CARDS */}
      {/* ====================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Filtered Records */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Filtered Records
          </span>

          <span className="text-2xl font-bold font-mono text-white block">
            {kpis.totalCount.toLocaleString()}
          </span>

          <span className="text-[10px] text-slate-400 block">
            {cleanedRows.length > 0
              ? (
                  (kpis.totalCount /
                    cleanedRows.length) *
                  100
                ).toFixed(0)
              : 0}
            % of total volume
          </span>
        </div>

        {/* First Business Metric */}
        {kpis.num1Name && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              Avg {kpis.num1Name}
            </span>

            <span className="text-2xl font-bold font-mono text-cyan-400 block">
              {kpis.num1Avg.toLocaleString()}
            </span>

            <span className="text-[10px] text-slate-400 block">
              Sum: {kpis.num1Sum.toLocaleString()}
            </span>
          </div>
        )}

        {/* Second Business Metric */}
        {kpis.num2Name && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              Avg {kpis.num2Name}
            </span>

            <span className="text-2xl font-bold font-mono text-indigo-400 block">
              {kpis.num2Avg.toLocaleString()}
            </span>

            <span className="text-[10px] text-slate-400 block">
              Mean sample level
            </span>
          </div>
        )}

        {/* AutoML Target Forecast */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Target Forecast
          </span>

          <span className="text-base font-bold font-mono text-purple-300 block truncate">
            {automlSummary?.selectedModel?.name ||
              "AutoML Verified"}
          </span>

          <span className="text-[10px] text-slate-400 block">
            {automlSummary?.selectedModel?.primaryMetric ||
              "Metric"}
            :{" "}
            {automlSummary?.selectedModel?.primaryMetricValue !==
            undefined
              ? automlSummary.selectedModel.primaryMetricValue.toFixed(
                  3
                )
              : "—"}
          </span>
        </div>
      </div>

      {/* ====================================================== */}
      {/* DYNAMIC CHARTS GRID */}
      {/* ====================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ==================================================== */}
        {/* CHART 1 — CATEGORY VOLUME */}
        {/* ==================================================== */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />

              <span>
                Volume Breakdown by{" "}
                {primaryCatCol || "Category"}
              </span>
            </h3>

            <span className="text-xs text-slate-400 font-mono">
              {categoryChartData.length} groups
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={categoryChartData}
                margin={{
                  top: 10,
                  right: 20,
                  left: -10,
                  bottom: 20,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.5}
                />

                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={10}
                  angle={-15}
                  textAnchor="end"
                />

                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={categoryChartDomain}
                  allowDecimals={false}
                />

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                  }}
                />

                <Bar
                  dataKey="count"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ==================================================== */}
        {/* CHART 2 — BUSINESS METRIC BY CATEGORY */}
        {/* ==================================================== */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />

              <span>
                {numCols[0]
                  ? `Average ${numCols[0]}`
                  : "Average Metric"}{" "}
                {catCols[0]
                  ? `by ${catCols[0]}`
                  : ""}
              </span>
            </h3>

            <span className="text-xs text-slate-400 font-mono">
              Mean Values
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={metricByCategoryData}
                margin={{
                  top: 10,
                  right: 20,
                  left: -10,
                  bottom: 20,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.5}
                />

                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={10}
                  angle={-15}
                  textAnchor="end"
                />

                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={metricChartDomain}
                  allowDecimals={true}
                />

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                  }}
                />

                <Bar
                  dataKey="average"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};