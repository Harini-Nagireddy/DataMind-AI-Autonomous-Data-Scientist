import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Papa from "papaparse";
import { signup, login, createSession, getSessionUser, destroySession, getCookie, AUTH_COOKIE, AUTH_COOKIE_MAX_AGE } from "./auth-store";

dotenv.config();

const app = express();
const PORT = 3000;
const ML_PORT = Number(process.env.ML_PORT || 8000);
const DATASET_DIR = path.join(os.tmpdir(), "datamind-ai-datasets");
const DATASET_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB safety limit
const datasetFiles = new Map<string, { path: string; fileName: string; size: number; createdAt: number }>();
fs.mkdirSync(DATASET_DIR, { recursive: true });

let mlProcess: ChildProcess | null = null;

// ============================================================
// AUTHENTICATION
// ============================================================
// Authentication is deliberately isolated from the data-science
// pipeline. Existing analysis/AutoML code does not depend on
// user credentials; protected API requests simply require a
// valid server-side session cookie.
// ============================================================
function setAuthCookie(res: express.Response, token: string) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`);
}

function clearAuthCookie(res: express.Response) {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getSessionUser(getCookie(req, AUTH_COOKIE));
  if (!user) return res.status(401).json({ error: "Authentication required", message: "Please log in to continue." });
  (req as any).user = user;
  next();
}


// ============================================================
// LARGE DATASET STREAM UPLOAD
// ============================================================
// The browser uploads the original CSV as a binary stream. The
// server writes it directly to disk; the dataset is NOT copied
// into Express JSON memory or React state.
// ============================================================
app.post("/api/datasets/upload", requireAuth, (req, res) => {
  const fileName = decodeURIComponent(String(req.header("X-DataMind-File-Name") || "dataset.csv"));
  const ext = path.extname(fileName).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
    return res.status(400).json({ error: "Unsupported dataset format.", message: "Please upload CSV, XLSX, or XLS." });
  }

  const datasetId = crypto.randomUUID();
  const destination = path.join(DATASET_DIR, `${datasetId}${ext}`);
  const output = fs.createWriteStream(destination, { flags: "wx" });
  let bytes = 0;
  let aborted = false;

  const fail = (status: number, message: string) => {
    if (aborted) return;
    aborted = true;
    output.destroy();
    fs.rm(destination, { force: true }, () => {});
    if (!res.headersSent) res.status(status).json({ error: "Dataset upload failed", message });
  };

  req.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > DATASET_MAX_BYTES) {
      req.destroy();
      fail(413, "Dataset exceeds the 1 GB safety limit.");
      return;
    }
    if (!output.write(chunk)) req.pause();
  });
  output.on("drain", () => req.resume());
  req.on("aborted", () => fail(499, "Dataset upload was cancelled."));
  req.on("error", (err) => fail(500, err.message));
  output.on("error", (err) => fail(500, err.message));
  req.on("end", () => {
    if (aborted) return;
    output.end(() => {
      datasetFiles.set(datasetId, { path: destination, fileName, size: bytes, createdAt: Date.now() });
      res.json({ datasetId, fileName, size: bytes });
    });
  });
});

// ============================================================
// LARGE DATASET SERVER-SIDE PREVIEW
// ============================================================
// Large files are never parsed row-by-row in React. The server reads
// them in a stream, drops empty records, keeps only a bounded preview,
// and returns the original source row count.
app.get("/api/datasets/:datasetId/preview", requireAuth, (req, res) => {
  const stored = datasetFiles.get(req.params.datasetId);
  if (!stored || !fs.existsSync(stored.path)) {
    return res.status(404).json({ error: "Dataset source not found.", message: "The dataset upload has expired. Please upload it again." });
  }

  const ext = path.extname(stored.fileName).toLowerCase();
  if (ext !== ".csv" && ext !== ".xls" && ext !== ".xlsx") {
    return res.status(400).json({ error: "Unsupported dataset format." });
  }

  const PREVIEW_LIMIT = 150_000;
  const rows: Record<string, any>[] = [];
  let totalRows = 0;
  let columns: string[] = [];
  let settled = false;

  const finish = (status: number, payload: any) => {
    if (settled) return;
    settled = true;
    return res.status(status).json(payload);
  };

  // A text file with an .xls extension (such as household_power_consumption.csv.xls)
  // is treated as delimited text. Genuine binary Excel remains supported by the
  // existing Excel path for smaller files.
  const stream = fs.createReadStream(stored.path);
  let firstChunk = Buffer.alloc(0);
  stream.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (firstChunk.length < 8192) firstChunk = Buffer.concat([firstChunk, buffer]).subarray(0, 8192);
    if (firstChunk.includes(0)) {
      stream.destroy(new Error("BINARY_EXCEL"));
    }
  });
  stream.on("error", async (err: any) => {
    if (err?.message === "BINARY_EXCEL") {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.readFile(stored.path, { cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null, blankrows: false });
        if (!json.length) return finish(400, { error: "Dataset is empty.", message: "The Excel workbook contains no usable rows." });
        columns = Object.keys(json[0]);
        totalRows = json.length;
        rows.push(...json.slice(0, PREVIEW_LIMIT));
        return finish(200, { columns, rows, totalRows, totalCols: columns.length, sampled: totalRows > PREVIEW_LIMIT });
      } catch (excelErr: any) {
        return finish(400, { error: "Dataset preview failed", message: excelErr?.message || "Unable to read the Excel workbook." });
      }
    }
    return finish(400, { error: "Dataset preview failed", message: err?.message || "Unable to read the dataset." });
  });
  stream.on("end", () => { if (!settled && !columns.length) finish(400, { error: "Dataset preview failed", message: "The dataset contains no readable tabular rows." }); });

  Papa.parse(stream as any, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: "greedy",
    delimiter: "",
    chunkSize: 1024 * 1024,
    chunk: (results: any) => {
      if (settled) return;
      const fields = results.meta?.fields || [];
      if (!columns.length) columns = fields.map((c: string, i: number) => c?.trim() || `Column_${i + 1}`);
      for (const row of results.data || []) {
        if (!row) continue;
        // PapaParse has already removed completely blank lines. This explicit
        // check uses the known header fields rather than Object.keys(row).
        const hasValue = fields.some((field: string) => {
          const value = row[field];
          return value !== null && value !== undefined && String(value).trim() !== "";
        });
        if (!hasValue) continue;
        totalRows++;
        if (rows.length < PREVIEW_LIMIT) rows.push(row);
      }
    },
    complete: () => {
      if (!settled) finish(200, { columns, rows, totalRows, totalCols: columns.length, sampled: totalRows > PREVIEW_LIMIT });
    },
    error: (err: any) => {
      if (!settled) finish(400, { error: "Dataset preview failed", message: err?.message || "Unable to parse the dataset." });
    },
  });
});

// ============================================================
// REQUEST BODY LIMITS
// ============================================================
// Increased because uploaded datasets can be larger than 50 MB.
// AutoML requests contain the dataset rows as JSON.
//
// 200 MB gives enough room for large uploaded datasets while
// still providing a reasonable upper safety limit.
// ============================================================

app.use(
  express.json({
    limit: "200mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "200mb",
  })
);

app.post("/api/auth/signup", async (req, res) => {
  try {
    const user = await signup(String(req.body?.name || ""), String(req.body?.email || ""), String(req.body?.password || ""));
    const token = createSession(user.id);
    setAuthCookie(res, token);
    return res.status(201).json({ user });
  } catch (error: any) {
    return res.status(400).json({ error: "Signup failed", message: error?.message || "Unable to create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await login(String(req.body?.email || ""), String(req.body?.password || ""));
    const token = createSession(user.id);
    setAuthCookie(res, token);
    return res.json({ user });
  } catch (error: any) {
    return res.status(401).json({ error: "Login failed", message: error?.message || "Invalid email or password." });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(getCookie(req, AUTH_COOKIE));
  return user ? res.json({ user }) : res.status(401).json({ error: "Not authenticated" });
});

app.post("/api/auth/logout", (req, res) => {
  destroySession(getCookie(req, AUTH_COOKIE));
  clearAuthCookie(res);
  return res.json({ success: true });
});

// ============================================================
// PYTHON ML SERVICE
// ============================================================

async function mlHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${ML_PORT}/health`
    );

    return response.ok;
  } catch {
    return false;
  }
}

async function startMlService(): Promise<void> {
  if (await mlHealth()) {
    console.log(
      `Python ML service already running on http://127.0.0.1:${ML_PORT}`
    );

    return;
  }

  const python =
    process.env.PYTHON_EXECUTABLE || "python";

  console.log(
    `Starting Python ML service using: ${python}`
  );

  mlProcess = spawn(
    python,
    [
      "-m",
      "uvicorn",
      "ml_service.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(ML_PORT),
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  mlProcess.stdout?.on("data", (data) => {
    console.log(
      `[Python ML] ${String(data).trimEnd()}`
    );
  });

  mlProcess.stderr?.on("data", (data) => {
    console.log(
      `[Python ML] ${String(data).trimEnd()}`
    );
  });

  mlProcess.on("error", (error) => {
    console.error(
      "Failed to start Python ML service:",
      error.message
    );
  });

  mlProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(
        `Python ML service exited with code ${code}.`
      );
    }
  });

  // Wait up to 10 seconds for Python service
  for (let i = 0; i < 40; i++) {
    if (await mlHealth()) {
      console.log(
        `Python ML service ready on http://127.0.0.1:${ML_PORT}`
      );

      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 250)
    );
  }

  console.warn(
    "Python ML service did not become ready."
  );

  console.warn(
    "Run: pip install -r requirements.txt"
  );
}

// ============================================================
// ML HEALTH ENDPOINT
// ============================================================

app.get("/api/ml/health", async (_req, res) => {
  const ok = await mlHealth();

  return res
    .status(ok ? 200 : 503)
    .json({
      status: ok ? "ok" : "unavailable",
      service: "scikit-learn",
    });
});

// ============================================================
// GENERIC TARGET RECOMMENDATION PROXY
// ============================================================

app.post("/api/ml/recommend-target", requireAuth, async (req, res) => {
  try {
    const requestBody = req.body || {};
    const datasetId = requestBody.datasetId || "";
    const stored = datasetId ? datasetFiles.get(datasetId) : undefined;

    if (datasetId && !stored) {
      return res.status(404).json({
        error: "Dataset source not found.",
        message: "The dataset session has expired. Please upload the dataset again.",
      });
    }

    if (!(await mlHealth())) {
      await startMlService();
    }

    if (!(await mlHealth())) {
      return res.status(503).json({
        error: "Python ML service is unavailable.",
        message: "The target recommendation service could not be started.",
      });
    }

    const upstreamBody = {
      rows: Array.isArray(requestBody.rows) ? requestBody.rows : [],
      targetCol: "",
      taskType: "classification",
      columnProfiles: Array.isArray(requestBody.columnProfiles) ? requestBody.columnProfiles : [],
      randomState: Number(requestBody.randomState || 42),
      datasetPath: stored?.path || requestBody.datasetPath || undefined,
      sourceFileName: stored?.fileName || requestBody.sourceFileName || undefined,
      sourceFileSize: stored?.size || requestBody.sourceFileSize || undefined,
    };

    const upstream = await fetch(`http://127.0.0.1:${ML_PORT}/recommend-target`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(upstreamBody),
    });

    const raw = await upstream.text();
    let payload: any;
    try { payload = JSON.parse(raw); }
    catch { payload = { error: "Invalid response from Python target recommendation service." }; }

    return res.status(upstream.status).json(payload);
  } catch (error: any) {
    console.error("Target recommendation proxy failed:", error);
    return res.status(500).json({
      error: "Target recommendation failed.",
      message: error?.message || "Unexpected server error.",
    });
  }
});

// ============================================================
// AUTOML PROXY
// ============================================================

app.post("/api/ml/automl", requireAuth, async (req, res) => {
  try {
    // --------------------------------------------------------
    // Check received request
    // --------------------------------------------------------

    const requestBody = req.body;

    if (!requestBody) {
      return res.status(400).json({
        error: "Empty AutoML request.",
        message:
          "No dataset data was received by the DataMind server.",
      });
    }

    const rows = Array.isArray(requestBody.rows) ? requestBody.rows : [];
    const targetCol = requestBody.targetCol || "";
    const taskType = requestBody.taskType || "";
    const datasetId = requestBody.datasetId || "";
    const stored = datasetId ? datasetFiles.get(datasetId) : undefined;
    if (datasetId && !stored) {
      return res.status(404).json({ error: "Dataset source not found.", message: "The large dataset session has expired. Please upload the dataset again." });
    }

    console.log(
      "============================================================"
    );

    console.log(
      "AUTO ML REQUEST"
    );

    console.log(
      `Rows received in JSON: ${rows.length.toLocaleString()}`
    );

    console.log(
      `Target column: ${targetCol}`
    );

    console.log(
      `Task type: ${taskType}`
    );

    console.log(
      `Request body size: ${(Buffer.byteLength(JSON.stringify({ ...requestBody, rows: undefined }), "utf8") / (1024 * 1024)).toFixed(2)} MB (metadata only)`
    );

    console.log(
      "============================================================"
    );

    // --------------------------------------------------------
    // Make sure Python service is running
    // --------------------------------------------------------

    if (!(await mlHealth())) {
      await startMlService();
    }

    // --------------------------------------------------------
    // Check Python service again
    // --------------------------------------------------------

    if (!(await mlHealth())) {
      return res.status(503).json({
        error:
          "Python ML service is unavailable.",
        message:
          "Install Python dependencies with 'pip install -r requirements.txt' and restart DataMind using 'npm run dev'.",
      });
    }

    console.log(`Forwarding AutoML request to Python service on port ${ML_PORT}`);

    const upstreamBody = {
      ...requestBody,
      datasetPath: stored?.path || requestBody.datasetPath || undefined,
      sourceFileName: stored?.fileName || undefined,
      sourceFileSize: stored?.size || undefined,
    };

    // --------------------------------------------------------
    // Send only metadata to Python for large datasets.
    // Python reads the source file directly from disk.
    // --------------------------------------------------------

    const upstream = await fetch(
      `http://127.0.0.1:${ML_PORT}/automl`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body: JSON.stringify(upstreamBody),

        signal:
          AbortSignal.timeout(
            10 * 60 * 1000
          ),
      }
    );

    // --------------------------------------------------------
    // Read response
    // --------------------------------------------------------

    const raw =
      await upstream.text();

    const contentType =
      upstream.headers.get(
        "content-type"
      ) || "";

    console.log(
      `Python AutoML HTTP status: ${upstream.status}`
    );

    console.log(
      `Python AutoML content type: ${
        contentType || "unknown"
      }`
    );

    // --------------------------------------------------------
    // Handle non-JSON response
    // --------------------------------------------------------

    if (
      !contentType
        .toLowerCase()
        .includes(
          "application/json"
        )
    ) {
      const preview =
        raw
          .replace(/\s+/g, " ")
          .slice(0, 1000);

      console.error(
        "Python AutoML returned non-JSON response."
      );

      console.error(
        `Content-Type: ${
          contentType || "unknown"
        }`
      );

      console.error(
        `HTTP Status: ${upstream.status}`
      );

      console.error(
        `Response preview: ${preview}`
      );

      return res
        .status(
          upstream.ok
            ? 502
            : upstream.status
        )
        .json({
          error:
            "Python AutoML service returned a non-JSON response.",

          message:
            "The ML service returned an HTML/text response instead of JSON.",

          upstreamStatus:
            upstream.status,

          contentType:
            contentType || null,
        });
    }

    // --------------------------------------------------------
    // Parse JSON safely
    // --------------------------------------------------------

    let payload: any;

    try {
      payload =
        JSON.parse(raw);
    } catch (error: any) {
      console.error(
        "Python AutoML returned invalid JSON:",
        error?.message ||
          error
      );

      console.error(
        "Raw response preview:",
        raw.slice(0, 2000)
      );

      return res
        .status(502)
        .json({
          error:
            "Python AutoML service returned invalid JSON.",

          message:
            "The ML service response could not be parsed as JSON.",
        });
    }

    // --------------------------------------------------------
    // Forward Python response
    // --------------------------------------------------------

    return res
      .status(upstream.status)
      .json(payload);

  } catch (error: any) {
    console.error(
      "============================================================"
    );

    console.error(
      "ML PROXY ERROR"
    );

    console.error(error);

    console.error(
      "============================================================"
    );

    return res
      .status(500)
      .json({
        error:
          "Failed to run Python AutoML service",

        message:
          error?.message ||
          "Unknown error",
      });
  }
});

// ============================================================
// GEMINI CLIENT
// ============================================================

let aiClient:
  GoogleGenAI | null = null;

function getAi():
  GoogleGenAI | null {
  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!aiClient) {
    aiClient =
      new GoogleGenAI({
        apiKey,

        httpOptions: {
          headers: {
            "User-Agent":
              "aistudio-build",
          },
        },
      });
  }

  return aiClient;
}

// ============================================================
// RESILIENT GEMINI REQUESTS
// ============================================================
// Gemini can temporarily return 429/5xx responses or experience
// transient network timeouts. Keep those failures from making the
// whole DataMind AI experience appear broken. We retry the primary
// model with exponential backoff and then try a stable fallback model.
// Permanent client errors (for example 400/401/403) are not retried.
// ============================================================

// Gemini 3.5 Flash-Lite is the single configured production model for
// DataMind AI. It is optimized for high-throughput, low-latency workloads.
// We retry this same model briefly for transient 408/429/5xx/network errors;
// if it remains unavailable, the application uses its verified local fallback.
const GEMINI_PRIMARY_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL ||
  "gemini-3.5-flash-lite";

const GEMINI_SECONDARY_FALLBACK_MODEL =
  process.env.GEMINI_SECONDARY_FALLBACK_MODEL ||
  "gemini-3.5-flash-lite";

function getGeminiErrorStatus(error: any): number | null {
  const candidates = [
    error?.status,
    error?.code,
    error?.error?.status,
    error?.error?.code,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 100 && numeric <= 599) {
      return numeric;
    }
  }

  const message = String(
    error?.message ||
      error?.error?.message ||
      error ||
      ""
  );

  const match = message.match(/\b(408|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
}

function isRetryableGeminiError(error: any): boolean {
  const status = getGeminiErrorStatus(error);
  if (status !== null) {
    return status === 408 || status === 429 || status >= 500;
  }

  const message = String(
    error?.message ||
      error?.error?.message ||
      error ||
      ""
  ).toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connecttimeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable") ||
    message.includes("unavailable")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateGeminiWithFallback(
  ai: GoogleGenAI,
  request: any
): Promise<{ response: any; model: string }> {
  // Keep one model for predictable behavior and lower model-switching
  // overhead. Flash-Lite is retried briefly for transient service/network
  // failures; the caller then uses DataMind's verified local fallback.
  const models = Array.from(
    new Set([
      GEMINI_PRIMARY_MODEL,
      GEMINI_FALLBACK_MODEL,
      GEMINI_SECONDARY_FALLBACK_MODEL,
    ].filter(Boolean))
  );

  let lastError: any = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    // Retry the configured Flash-Lite model up to three times. Because all
    // configured fallbacks intentionally point to the same model, the Set()
    // above normally leaves exactly one model in this list.
    const attempts = 3;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        console.log(
          `[Gemini] Attempt ${attempt + 1}/${attempts} using ${model}`
        );

        const response = await ai.models.generateContent({
          ...request,
          model,
        });

        console.log(`[Gemini] Success using ${model}`);
        return { response, model };
      } catch (error: any) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        const status = getGeminiErrorStatus(error);

        console.warn(
          `[Gemini] ${model} failed (attempt ${attempt + 1}/${attempts}, status ${status ?? "network"}):`,
          error?.message || error
        );

        if (!retryable || attempt >= attempts - 1) {
          break;
        }

        const delay =
          2000 * Math.pow(2, attempt) +
          Math.floor(Math.random() * 500);
        console.warn(`[Gemini] Retrying ${model} in ${delay}ms...`);
        await sleep(delay);
      }
    }

    if (modelIndex < models.length - 1) {
      console.warn(
        `[Gemini] Switching from ${model} to ${models[modelIndex + 1]}`
      );
    }
  }

  throw lastError || new Error("All configured Gemini models failed.");
}

// ============================================================
// GENERAL API HEALTH
// ============================================================

app.get(
  "/api/health",
  (_req, res) => {
    return res.json({
      status: "ok",

      hasApiKey:
        !!process.env
          .GEMINI_API_KEY,
      geminiModel: GEMINI_PRIMARY_MODEL,
      geminiModels: Array.from(
        new Set([
          GEMINI_PRIMARY_MODEL,
          GEMINI_FALLBACK_MODEL,
          GEMINI_SECONDARY_FALLBACK_MODEL,
        ])
      ),

      time:
        new Date().toISOString(),
    });
  }
);

// ============================================================
// AI DATA INSIGHTS
// DATASET-SPECIFIC GEMINI ANALYSIS
// ============================================================

app.post(
  "/api/gemini/insights",
  requireAuth,
  async (req, res) => {
    try {
      const {
        datasetSummary,
        qualityReport,
        correlationHighlights,
        problemDetection,
        mlResults,

        // Rich analytical evidence
        columnProfiles,
        numericAnalysis,
        categoricalAnalysis,
        featureImportance,
        outlierAnalysis,
        targetAnalysis,
        trendAnalysis,
        schemaAnalysis,
      } = req.body;

      const ai = getAi();

      // ========================================================
      // SAFE HELPERS
      // ========================================================

      const arr = (value: any): any[] =>
        Array.isArray(value) ? value : [];

      const num = (
        value: any,
        fallback: any = null
      ) => {
        const n = Number(value);
        return Number.isFinite(n)
          ? n
          : fallback;
      };

      const stringifySafe = (
        value: any,
        limit = 25000
      ) => {
        try {
          const result = JSON.stringify(
            value ?? null,
            null,
            2
          );

          if (result.length <= limit) {
            return result;
          }

          return (
            result.slice(0, limit) +
            "\n...[evidence truncated]"
          );
        } catch {
          return "Unavailable";
        }
      };

      // ========================================================
      // BASIC DATASET INFORMATION
      // ========================================================

      const numericColumns =
        arr(datasetSummary?.numCols);

      const categoricalColumns =
        arr(datasetSummary?.catCols);

      const correlations =
        arr(correlationHighlights);

      const profiles =
        arr(columnProfiles);

      const numericEvidence =
        arr(numericAnalysis);

      const categoricalEvidence =
        arr(categoricalAnalysis);

      const importanceEvidence =
        arr(featureImportance);

      const outliers =
        arr(outlierAnalysis);

      const targetEvidence =
        arr(targetAnalysis);

      const trends =
        arr(trendAnalysis);

      const qualityIssues =
        arr(qualityReport?.issues);

      // ========================================================
      // BUILD VERIFIED EVIDENCE PACKAGE
      //
      // IMPORTANT:
      // RAW DATA IS NEVER SENT TO GEMINI.
      // ONLY COMPUTED SUMMARIES ARE SENT.
      // ========================================================

      const evidencePackage = {
        dataset: {
          name:
            datasetSummary?.name ||
            "Dataset",

          rows:
            num(
              datasetSummary?.totalRows
            ),

          columns:
            num(
              datasetSummary?.totalCols
            ),

          numericColumns,

          categoricalColumns,
        },

        schema:
          schemaAnalysis || {
            numericColumns,
            categoricalColumns,
            totalColumns:
              datasetSummary?.totalCols,
          },

        quality: {
          score:
            num(
              qualityReport?.qualityScore
            ),

          totalMissingCells:
            num(
              qualityReport?.totalMissingCells,
              0
            ),

          missingRate:
            num(
              qualityReport?.missingRate,
              0
            ),

          duplicateRows:
            num(
              qualityReport?.duplicateRows,
              0
            ),

          outlierCount:
            num(
              qualityReport?.outlierCount,
              0
            ),

          columnsWithMissing:
            arr(
              qualityReport?.columnsWithMissing
            ),

          issues:
            qualityIssues,
        },

        numericProfiles:
          numericEvidence.length > 0
            ? numericEvidence
            : profiles,

        categoricalProfiles:
          categoricalEvidence,

        relationships:
          correlations,

        featureImportance:
          importanceEvidence,

        outliers,

        targetAnalysis:
          targetEvidence,

        trends,

        problemDetection: {
          hasTarget:
            !!problemDetection?.hasTarget,

          taskType:
            problemDetection?.taskType ||
            null,

          targetColumn:
            problemDetection?.targetColumn ||
            null,

          reason:
            problemDetection?.reason ||
            null,
        },

        automl: {
          selectedModel:
            mlResults?.selectedModel?.name ||
            null,

          primaryMetric:
            mlResults?.selectedModel
              ?.primaryMetric ||
            null,

          primaryMetricValue:
            num(
              mlResults?.selectedModel
                ?.primaryMetricValue
            ),

          testSize:
            num(
              mlResults?.testSize
            ),

          models:
            arr(
              mlResults?.models
            ).map(
              (model: any) => ({
                name:
                  model?.name,

                primaryMetric:
                  model?.primaryMetric,

                primaryMetricValue:
                  num(
                    model?.primaryMetricValue
                  ),

                accuracy:
                  num(model?.accuracy),

                precision:
                  num(model?.precision),

                recall:
                  num(model?.recall),

                f1:
                  num(model?.f1),

                rocAuc:
                  num(model?.rocAuc),

                r2:
                  num(model?.r2),

                mae:
                  num(model?.mae),

                mse:
                  num(model?.mse),

                rmse:
                  num(model?.rmse),

                mape:
                  num(model?.mape),
              })
            ),
        },
      };

      // ========================================================
      // FALLBACK IF GEMINI API KEY IS NOT AVAILABLE
      // ========================================================

      if (!ai) {
        const name =
          datasetSummary?.name ||
          "Dataset";

        const rows =
          datasetSummary?.totalRows ??
          "N/A";

        const cols =
          datasetSummary?.totalCols ??
          "N/A";

        const quality =
          qualityReport?.qualityScore ??
          "N/A";

        const target =
          problemDetection?.targetColumn;

        const task =
          problemDetection?.taskType;

        const strongestCorrelation =
          correlations.length > 0
            ? correlations[0]
            : null;

        return res.json({
          fallback: true,

          executiveSummary:
            `${name} contains ${rows} records across ${cols} columns. ` +
            `The computed data quality score is ${quality}%. ` +
            `${
              target
                ? `The detected target is '${target}' for ${task || "predictive"} analysis.`
                : "No predictive target was established by the current analysis."
            }`,

          keyFindings: [
            numericColumns.length > 0
              ? `${numericColumns.length} numeric columns were identified, including ${numericColumns.slice(0, 5).join(", ")}.`
              : "No numeric columns were identified.",

            categoricalColumns.length > 0
              ? `${categoricalColumns.length} categorical columns were identified, including ${categoricalColumns.slice(0, 5).join(", ")}.`
              : "No categorical columns were identified.",

            qualityReport?.totalMissingCells > 0
              ? `${qualityReport.totalMissingCells} missing cells were detected with a missing rate of ${qualityReport.missingRate}%.`
              : "No missing cells were detected.",

            qualityReport?.duplicateRows > 0
              ? `${qualityReport.duplicateRows} duplicate rows were detected.`
              : "No duplicate rows were detected.",

            strongestCorrelation
              ? `The strongest supplied relationship is between ${strongestCorrelation.col1} and ${strongestCorrelation.col2}, with correlation ${Number(strongestCorrelation.correlation).toFixed(2)}.`
              : "No correlation relationship was supplied.",
          ],

          businessInsights: [
            target
              ? `The current predictive analysis is centered on '${target}'.`
              : "The supplied evidence does not establish a predictive target.",

            strongestCorrelation
              ? `${strongestCorrelation.col1} and ${strongestCorrelation.col2} show the strongest supplied numeric relationship and should be examined together.`
              : "No relationship-specific interpretation can be established from the supplied correlation evidence.",

            importanceEvidence.length > 0
              ? "Feature-importance evidence is available for identifying variables associated with model predictions."
              : "Feature-importance evidence was not supplied, so driver-level conclusions should not be made.",
          ],

          recommendedActions: [
            qualityIssues.length > 0
              ? "Review the detected data-quality issues before relying on downstream analysis."
              : "Continue with the analytical workflow because no quality issues were supplied.",

            target
              ? `Review the variables associated with '${target}' before final feature selection.`
              : "Use exploratory analysis to identify meaningful structure before predictive modeling.",

            correlations.length > 0
              ? "Investigate the strongest supplied relationships for redundancy or predictive signal."
              : "Generate relationship analysis before drawing variable-level conclusions.",
          ],

          cautions: [
            qualityReport?.outlierCount > 0
              ? `${qualityReport.outlierCount} statistical outliers were detected.`
              : "No outlier count was supplied.",

            mlResults?.testSize
              ? `AutoML evaluation used a ${Math.round(mlResults.testSize * 100)}% held-out test split.`
              : "AutoML evaluation details were not supplied.",

            "Gemini was unavailable, so this response uses the deterministic fallback analysis.",
          ],
        });
      }

      // ========================================================
      // GEMINI PROMPT
      // ========================================================

      const prompt = `
You are DataMind AI, an autonomous expert data scientist.

Analyze ONE specific user-uploaded dataset using ONLY the
verified computed evidence supplied below.

============================================================
CORE REQUIREMENT
============================================================

The response MUST be genuinely specific to this dataset.

Do NOT produce generic statements that could apply to any dataset.

For example, DO NOT say:

"The data can help improve decision making."

"The organization should leverage analytics."

"The dataset contains useful insights."

"Further analysis is recommended."

Instead, identify actual:

- column names
- target columns
- category values
- numerical statistics
- correlations
- missing-value patterns
- duplicate patterns
- outliers
- feature importance
- trends
- model metrics
- differences between models

Every insight must be connected to evidence.

============================================================
STRICT EVIDENCE RULES
============================================================

1. Never invent numbers.

2. Never invent column names.

3. Never invent categories.

4. Never invent relationships.

5. Never invent trends.

6. Never invent business meanings.

7. Never claim causation from correlation.

8. Do not assume the meaning of a column solely from its name.

9. If evidence is insufficient, explicitly say:
   "The supplied evidence is insufficient to establish this pattern."

10. Do not create recommendations unrelated to observed evidence.

11. If AutoML metrics are supplied, use the actual metrics.

12. Consider multiple metrics rather than only the primary metric.

13. Do not treat a large number of rows as a problem by itself.

14. Do not claim that a model is universally superior.

============================================================
DATASET EVIDENCE
============================================================

${stringifySafe(
  evidencePackage,
  30000
)}

============================================================
ANALYSIS TASK
============================================================

Analyze:

1. Dataset structure
2. Data quality
3. Important variables
4. Relationships between variables
5. Target behavior
6. Outliers
7. Trends when available
8. AutoML performance
9. Practical analytical implications

============================================================
EXECUTIVE SUMMARY
============================================================

Write 2-3 sentences.

The summary must mention actual characteristics of THIS dataset.

============================================================
KEY FINDINGS
============================================================

Return 3-6 findings.

Each finding must contain:

- specific variable/category/relationship
- actual supplied evidence
- analytical interpretation

============================================================
BUSINESS / DOMAIN INSIGHTS
============================================================

Return 3-5 insights.

Use actual columns and patterns.

If the domain cannot be reliably established,
describe the analytical implication without inventing domain context.

============================================================
RECOMMENDED ACTIONS
============================================================

Return 3-5 actions.

Each action MUST be linked to an observed issue or pattern.

Examples:

Missing values
-> investigate affected columns

Strong correlation
-> investigate redundancy or shared information

Feature importance
-> prioritize the feature for interpretation

Class imbalance
-> inspect class distribution and evaluation metrics

Poor metric
-> investigate feature quality/model suitability

Outliers
-> inspect extreme observations

============================================================
CAUTIONS
============================================================

Return 2-4 specific caveats.

Possible examples:

- missing data
- duplicate rows
- outliers
- class imbalance
- multicollinearity
- weak predictive signal
- metric disagreement
- train/test limitations
- insufficient evidence

============================================================
AUTOML INTERPRETATION
============================================================

For regression, use when available:

R²
MAE
MSE
RMSE
MAPE

For classification, use when available:

Accuracy
Precision
Recall
F1
ROC-AUC

Do not invent metrics that are missing.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Use exactly:

{
  "executiveSummary": "2-3 dataset-specific sentences",

  "keyFindings": [
    "specific evidence-based finding"
  ],

  "businessInsights": [
    "specific evidence-based analytical implication"
  ],

  "recommendedActions": [
    "specific evidence-linked recommendation"
  ],

  "cautions": [
    "specific evidence-based caveat"
  ]
}

Do not return Markdown.
Do not return code fences.
Do not add text outside JSON.
`;

      // ========================================================
      // CALL GEMINI
      // ========================================================

      const { response } =
        await generateGeminiWithFallback(
          ai,
          {
            contents: prompt,
            config: {
              responseMimeType:
                "application/json",
            },
          }
        );

      const rawText =
        response.text || "{}";

      // ========================================================
      // PARSE GEMINI RESPONSE
      // ========================================================

      let parsed: any;

      try {
        parsed =
          JSON.parse(rawText);
      } catch (parseError) {
        console.error(
          "Gemini returned invalid JSON:",
          rawText.slice(0, 3000)
        );

        return res.status(502).json({
          error:
            "Gemini returned an invalid JSON response.",
        });
      }

      // ========================================================
      // NORMALIZE GEMINI RESPONSE
      // ========================================================

      const result = {
        fallback: false,

        executiveSummary:
          typeof parsed?.executiveSummary ===
          "string"
            ? parsed.executiveSummary
            : "No executive summary was generated.",

        keyFindings:
          Array.isArray(
            parsed?.keyFindings
          )
            ? parsed.keyFindings
                .filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
                .slice(0, 6)
            : [],

        businessInsights:
          Array.isArray(
            parsed?.businessInsights
          )
            ? parsed.businessInsights
                .filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
                .slice(0, 5)
            : [],

        recommendedActions:
          Array.isArray(
            parsed?.recommendedActions
          )
            ? parsed.recommendedActions
                .filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
                .slice(0, 5)
            : [],

        cautions:
          Array.isArray(
            parsed?.cautions
          )
            ? parsed.cautions
                .filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
                .slice(0, 4)
            : [],
      };

      return res.json(
        result
      );

    } catch (error: any) {
      console.error(
        "Gemini insights error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to generate AI insights.",

        message:
          error?.message ||
          "Unknown Gemini error.",
      });
    }
  }
);


// ============================================================
// ASSISTANT DATASET LOADER
// ============================================================
// Large CSV datasets are uploaded to DATASET_DIR and the browser keeps
// only a bounded preview. The Assistant can therefore use the server-side
// source when an active datasetId is available instead of sending millions
// of rows through the browser JSON request.
async function loadAssistantDatasetRows(datasetId: string): Promise<Record<string, any>[]> {
  const stored = datasetFiles.get(datasetId);
  if (!stored || !fs.existsSync(stored.path)) {
    throw new Error("The server-side dataset source is no longer available. Please upload the dataset again.");
  }

  const ext = path.extname(stored.fileName).toLowerCase();

  if (ext === ".csv" || ext === ".xls") {
    const rows: Record<string, any>[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(stored.path);
      Papa.parse(stream as any, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: "greedy",
        delimiter: "",
        chunkSize: 1024 * 1024,
        chunk: (results: any) => {
          for (const row of results.data || []) {
            if (!row) continue;
            const fields = results.meta?.fields || Object.keys(row);
            const hasValue = fields.some((field: string) => {
              const value = row[field];
              return value !== null && value !== undefined && String(value).trim() !== "";
            });
            if (hasValue) rows.push(row);
          }
        },
        complete: () => resolve(),
        error: (err: any) => reject(err),
      });
    });
    return rows;
  }

  if (ext === ".xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(stored.path, { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
      blankrows: false,
    });
  }

  throw new Error(`Unsupported server-side dataset format: ${ext}`);
}

// ============================================================
// AI DATA ASSISTANT
// UNIVERSAL DATA Q&A
// ============================================================

type AssistantPlan = {
  operation: string;
  column?: string;
  columns?: string[];
  groupBy?: string;
  valueColumn?: string;
  aggregation?: string;
  filterColumn?: string;
  filterOperator?: string;
  filterValue?: any;
  topN?: number;
  descending?: boolean;
  subject?: string;
};

// ------------------------------------------------------------
// Utility: Missing value
// ------------------------------------------------------------

function isMissingValue(
  value: any
): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" &&
      value.trim() === "")
  );
}

// ------------------------------------------------------------
// Utility: Numeric values
// ------------------------------------------------------------

function numericValues(
  rows: Record<string, any>[],
  column: string
): number[] {
  return rows
    .map((row) =>
      Number(row?.[column])
    )
    .filter((value) =>
      Number.isFinite(value)
    );
}

// ------------------------------------------------------------
// Utility: Resolve column
// ------------------------------------------------------------

function resolveColumn(
  requested: string | undefined,
  columns: string[]
): string | undefined {
  if (!requested) {
    return undefined;
  }

  const wanted =
    String(requested)
      .trim()
      .toLowerCase();

  const exact = columns.find(
    (column) =>
      column.toLowerCase() ===
      wanted
  );

  if (exact) {
    return exact;
  }

  const normalized =
    wanted.replace(
      /[^a-z0-9]/g,
      ""
    );

  return (
    columns.find(
      (column: string) =>
        column
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ""
          ) === normalized
    ) ||
    columns.find(
      (column: string) =>
        column
          .toLowerCase()
          .includes(wanted) ||
        wanted.includes(
          column.toLowerCase()
        )
    )
  );
}

// ------------------------------------------------------------
// Utility: Infer column
// ------------------------------------------------------------

function inferColumnFromQuestion(
  question: string,
  columns: string[],
  numericCols: string[] = []
): string | undefined {
  const q =
    question.toLowerCase();

  const ordered = [
    ...columns,
  ].sort(
    (a, b) =>
      b.length - a.length
  );

  const direct =
    ordered.find((column: string) =>
      q.includes(
        column.toLowerCase()
      )
    );

  if (direct) {
    return direct;
  }

  const normalized =
    q.replace(
      /[^a-z0-9]/g,
      ""
    );

  return [
    ...ordered,
    ...numericCols,
  ].find((column) =>
    normalized.includes(
      column
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ""
        )
    )
  );
}

// ------------------------------------------------------------
// Percentile
// ------------------------------------------------------------

function percentile(
  sorted: number[],
  p: number
): number {
  if (!sorted.length) {
    return NaN;
  }

  const index =
    (sorted.length - 1) * p;

  const lower =
    Math.floor(index);

  const upper =
    Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return (
    sorted[lower] +
    (sorted[upper] -
      sorted[lower]) *
      (index - lower)
  );
}

// ------------------------------------------------------------
// Correlation
// ------------------------------------------------------------

function correlation(
  a: number[],
  b: number[]
): number {
  const n = Math.min(
    a.length,
    b.length
  );

  if (n < 2) {
    return NaN;
  }

  const ax = a.slice(0, n);
  const bx = b.slice(0, n);

  const am =
    ax.reduce(
      (x, y) => x + y,
      0
    ) / n;

  const bm =
    bx.reduce(
      (x, y) => x + y,
      0
    ) / n;

  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;

  for (
    let i = 0;
    i < n;
    i++
  ) {
    const x =
      ax[i] - am;

    const y =
      bx[i] - bm;

    numerator +=
      x * y;

    denominatorA +=
      x * x;

    denominatorB +=
      y * y;
  }

  return denominatorA &&
    denominatorB
    ? numerator /
        Math.sqrt(
          denominatorA *
            denominatorB
        )
    : NaN;
}

// ============================================================
// EXECUTE ASSISTANT PLAN
// ============================================================

function executeAssistantPlan(
  plan: AssistantPlan,
  rows: Record<string, any>[],
  context: any
): any {
  const contextualOperations = new Set([
    "workflow",
    "project",
    "schema_details",
    "quality",
    "cleaning",
    "eda",
    "automl",
    "evaluation",
    "recommendations",
    "insights",
    "report",
    "target",
    "models",
    "metrics",
    "explainability",
    "column_profile",
  ]);

  const opName = String(plan.operation || "").toLowerCase();

  if (contextualOperations.has(opName)) {
    const base = {
      operation: opName,
      datasetSummary: context?.datasetSummary || {},
      schema: context?.schemaAnalysis || {},
      columnProfiles: context?.columnProfiles || [],
      qualityReport: context?.qualityReport || {},
      cleaning: context?.cleaning || {},
      eda: context?.eda || {},
      problemDetection: context?.problemDetection || {},
      mlResults: context?.mlResults || null,
      evaluation: context?.evaluation || {},
      explainability: context?.explainability || {},
      aiInsights: context?.aiInsights || null,
      report: context?.report || {},
      project: context?.project || {},
    };

    if (opName === "schema_details") {
      return {
        ...base,
        profiles: (context?.columnProfiles || []).map((p: any) => ({
          name: p.name,
          dataType: p.dataType,
          originalType: p.originalType,
          numericalType: p.numericalType,
          uniqueCount: p.uniqueCount,
          uniqueRate: p.uniqueRate,
          missingCount: p.missingCount,
          missingRate: p.missingRate,
          isPossibleId: p.isPossibleId,
          isConstant: p.isConstant,
          isBinary: p.isBinary,
          isDiscrete: p.isDiscrete,
          min: p.min,
          max: p.max,
          mean: p.mean,
          median: p.median,
          std: p.std,
          q1: p.q1,
          q3: p.q3,
          iqr: p.iqr,
          outlierCount: p.outlierCount,
          topValues: p.topValues,
        })),
      };
    }

    if (opName === "column_profile") {
      const allColumns = context?.datasetSummary?.allColumns || [];
      const target = resolveColumn(plan.column, allColumns);
      const profile = (context?.columnProfiles || []).find((p: any) => p.name === target);
      return profile
        ? { ...base, column: target, profile }
        : { ...base, error: `Column '${plan.column || ""}' was not found.`, availableColumns: allColumns };
    }

    if (opName === "target") {
      return {
        ...base,
        target: context?.problemDetection || {},
      };
    }

    if (opName === "models" || opName === "automl") {
      return {
        ...base,
        automl: context?.mlResults || null,
      };
    }

    if (opName === "metrics" || opName === "evaluation") {
      return {
        ...base,
        evaluation: context?.evaluation || {},
        automl: context?.mlResults || null,
      };
    }

    return base;
  }

  const columns =
    Object.keys(
      rows[0] ||
        context?.datasetSummary
          ?.columns ||
        {}
    );

  const allColumns =
    Array.isArray(
      context?.datasetSummary
        ?.allColumns
    )
      ? context.datasetSummary
          .allColumns
      : columns;

  const numericCols =
    Array.isArray(
      context?.datasetSummary
        ?.numCols
    )
      ? context.datasetSummary
          .numCols
      : [];

  const col =
    resolveColumn(
      plan.column,
      allColumns
    ) ||
    inferColumnFromQuestion(
      plan.column || "",
      allColumns,
      numericCols
    );

  const op = String(
    plan.operation ||
      "summary"
  ).toLowerCase();

  if (op === "schema") {
    return {
      operation: op,
      rows: rows.length,
      columns: allColumns,
    };
  }

  if (op === "row_count") {
    return {
      operation: op,
      rowCount: rows.length,
    };
  }

  if (op === "column_count") {
    return {
      operation: op,
      columnCount:
        allColumns.length,
    };
  }

  if (
    op === "missing" ||
    op === "missing_rate"
  ) {
    const targets =
      plan.columns?.length
        ? plan.columns
            .map((column) =>
              resolveColumn(
                column,
                allColumns
              )
            )
            .filter(
              Boolean
            ) as string[]
        : col
        ? [col]
        : allColumns;

    const result =
      targets.map(
        (column: string) => {
          const missingCount =
            rows.filter(
              (row) =>
                isMissingValue(
                  row[column]
                )
            ).length;

          return {
            column,
            missingCount,
            missingRate:
              rows.length
                ? (missingCount /
                    rows.length) *
                  100
                : 0,
          };
        }
      );

    return {
      operation: op,
      result,
    };
  }

  if (op === "quality") {
    return {
      operation: op,
      qualityReport:
        context.qualityReport ||
        null,
    };
  }

  if (op === "model") {
    return {
      operation: op,
      problemDetection:
        context.problemDetection ||
        null,
      mlResults:
        context.mlResults ||
        null,
    };
  }

  if (op === "importance") {
    return {
      operation: op,
      featureImportance:
        context.mlResults
          ?.selectedModel
          ?.featureImportance ||
        [],
    };
  }

  if (op === "correlation") {
    return {
      operation: op,
      correlations:
        context.correlationHighlights ||
        [],
    };
  }

  if (op === "overview") {
    return {
      operation: op,
      rows: rows.length,
      columns: allColumns,
      profiles:
        context.columnProfiles ||
        [],
      quality:
        context.qualityReport ||
        {},
      correlations:
        context.correlationHighlights ||
        [],
    };
  }

  if (op === "outliers") {
    if (!col) {
      return {
        error:
          "No matching numeric column was identified.",
      };
    }

    const nums =
      numericValues(
        rows,
        col
      );

    if (!nums.length) {
      return {
        error: `Column '${col}' does not contain numeric values.`,
      };
    }

    const sorted = [
      ...nums,
    ].sort(
      (a, b) => a - b
    );

    const q1 =
      percentile(
        sorted,
        0.25
      );

    const q3 =
      percentile(
        sorted,
        0.75
      );

    const iqr =
      q3 - q1;

    const lowerBound =
      q1 - 1.5 * iqr;

    const upperBound =
      q3 + 1.5 * iqr;

    const outlierRows =
      rows.filter(
        (row) => {
          const value =
            Number(
              row[col!]
            );

          return (
            Number.isFinite(
              value
            ) &&
            (value <
              lowerBound ||
              value >
                upperBound)
          );
        }
      );

    return {
      operation: op,
      column: col,
      q1,
      q3,
      iqr,
      lowerBound,
      upperBound,
      outlierCount:
        outlierRows.length,
      outlierRate:
        rows.length
          ? (outlierRows.length /
              rows.length) *
            100
          : 0,
      sample:
        outlierRows.slice(
          0,
          10
        ),
    };
  }

  if (
    op === "top_values" ||
    op === "bottom_values"
  ) {
    if (!col) {
      return {
        error:
          "No matching column was identified.",
      };
    }

    const n = Math.max(
      1,
      Math.min(
        plan.topN || 5,
        50
      )
    );

    const values = rows
      .map((row) => ({
        value:
          row[col!],
        numeric:
          Number(
            row[col!]
          ),
      }))
      .filter((item) =>
        Number.isFinite(
          item.numeric
        )
      );

    values.sort(
      (a, b) =>
        op === "top_values"
          ? b.numeric -
            a.numeric
          : a.numeric -
            b.numeric
    );

    return {
      operation: op,
      column: col,
      values:
        values
          .slice(0, n)
          .map(
            (item) =>
              item.value
          ),
    };
  }

  if (op === "value_counts") {
    if (!col) {
      return {
        error:
          "No matching column was identified.",
      };
    }

    const counts =
      new Map<
        string,
        number
      >();

    for (const row of rows) {
      const key = String(
        row[col] ??
          "(missing)"
      );

      counts.set(
        key,
        (counts.get(key) ||
          0) + 1
      );
    }

    return {
      operation: op,
      column: col,
      values: [
        ...counts.entries(),
      ]
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .slice(
          0,
          plan.topN || 10
        )
        .map(
          ([
            value,
            count,
          ]) => ({
            value,
            count,
            percentage:
              rows.length
                ? (count /
                    rows.length) *
                  100
                : 0,
          })
        ),
    };
  }

  if (
    op ===
    "group_aggregate"
  ) {
    const group =
      resolveColumn(
        plan.groupBy,
        allColumns
      );

    const value =
      resolveColumn(
        plan.valueColumn,
        allColumns
      ) || col;

    if (
      !group ||
      (plan.aggregation !==
        "count" &&
        !value)
    ) {
      return {
        error:
          "A group-by column and a value column are required for this operation.",
      };
    }

    const groups =
      new Map<
        string,
        number[]
      >();

    const aggregation =
      plan.aggregation ||
      "mean";

    for (const row of rows) {
      if (
        isMissingValue(
          row[group]
        )
      ) {
        continue;
      }

      const key =
        String(
          row[group]
        );

      if (
        !groups.has(
          key
        )
      ) {
        groups.set(
          key,
          []
        );
      }

      if (
        aggregation ===
        "count"
      ) {
        groups
          .get(key)!
          .push(1);
      } else {
        const number =
          Number(
            row[value!]
          );

        if (
          Number.isFinite(
            number
          )
        ) {
          groups
            .get(key)!
            .push(number);
        }
      }
    }

    const values =
      [
        ...groups.entries(),
      ]
        .map(
          ([
            key,
            numbers,
          ]) => {
            const sorted = [
              ...numbers,
            ].sort(
              (a, b) =>
                a - b
            );

            let result =
              numbers.reduce(
                (a, b) =>
                  a + b,
                0
              ) /
              numbers.length;

            if (
              aggregation ===
              "sum"
            ) {
              result =
                numbers.reduce(
                  (a, b) =>
                    a + b,
                  0
                );
            }

            if (
              aggregation ===
              "min"
            ) {
              result =
                Math.min(
                  ...numbers
                );
            }

            if (
              aggregation ===
              "max"
            ) {
              result =
                Math.max(
                  ...numbers
                );
            }

            if (
              aggregation ===
              "median"
            ) {
              result =
                percentile(
                  sorted,
                  0.5
                );
            }

            if (
              aggregation ===
              "count"
            ) {
              result =
                numbers.length;
            }

            return {
              group: key,
              value: result,
              count:
                numbers.length,
            };
          }
        )
        .sort(
          (a, b) =>
            b.value - a.value
        );

    return {
      operation: op,
      groupBy: group,
      valueColumn: value,
      aggregation,
      values:
        values.slice(
          0,
          plan.topN || 20
        ),
    };
  }

  if (op === "filter") {
    const filterColumn =
      resolveColumn(
        plan.filterColumn,
        allColumns
      );

    if (!filterColumn) {
      return {
        error:
          "No matching filter column was identified.",
      };
    }

    const value =
      plan.filterValue;

    const operator =
      plan.filterOperator ||
      "equals";

    const filtered =
      rows.filter(
        (row) => {
          const actual =
            row[
              filterColumn
            ];

          const actualNumber =
            Number(actual);

          const valueNumber =
            Number(value);

          const numeric =
            Number.isFinite(
              actualNumber
            ) &&
            Number.isFinite(
              valueNumber
            );

          if (
            operator === "gt"
          ) {
            return numeric
              ? actualNumber >
                  valueNumber
              : String(
                  actual
                ) >
                  String(
                    value
                  );
          }

          if (
            operator === "gte"
          ) {
            return numeric
              ? actualNumber >=
                  valueNumber
              : String(
                  actual
                ) >=
                  String(
                    value
                  );
          }

          if (
            operator === "lt"
          ) {
            return numeric
              ? actualNumber <
                  valueNumber
              : String(
                  actual
                ) <
                  String(
                    value
                  );
          }

          if (
            operator === "lte"
          ) {
            return numeric
              ? actualNumber <=
                  valueNumber
              : String(
                  actual
                ) <=
                  String(
                    value
                  );
          }

          if (
            operator ===
            "contains"
          ) {
            return String(
              actual ?? ""
            )
              .toLowerCase()
              .includes(
                String(
                  value
                ).toLowerCase()
              );
          }

          return (
            String(
              actual ?? ""
            ).toLowerCase() ===
            String(
              value ?? ""
            ).toLowerCase()
          );
        }
      );

    return {
      operation: op,
      filterColumn,
      operator,
      filterValue: value,
      matchingRows:
        filtered.length,
      sample:
        filtered.slice(
          0,
          10
        ),
    };
  }

  if (
    op ===
    "correlation_pair"
  ) {
    const cols =
      (plan.columns || [])
        .map((column) =>
          resolveColumn(
            column,
            allColumns
          )
        )
        .filter(
          Boolean
        ) as string[];

    if (cols.length < 2) {
      return {
        error:
          "Two numeric columns are required for correlation.",
      };
    }

    const a: number[] = [];
    const b: number[] = [];

    for (const row of rows) {
      const x = Number(
        row[cols[0]]
      );

      const y = Number(
        row[cols[1]]
      );

      if (
        Number.isFinite(
          x
        ) &&
        Number.isFinite(
          y
        )
      ) {
        a.push(x);
        b.push(y);
      }
    }

    return {
      operation: op,
      columns:
        cols.slice(0, 2),
      correlation:
        correlation(a, b),
      pairCount:
        a.length,
    };
  }

  if (!col) {
    return {
      error:
        "No matching column was identified. Available columns: " +
        allColumns.join(", "),
    };
  }

  const nums =
    numericValues(
      rows,
      col
    );

  if (
    !nums.length &&
    op !== "count"
  ) {
    return {
      error: `Column '${col}' does not contain numeric values that can be aggregated.`,
    };
  }

  const sorted = [
    ...nums,
  ].sort(
    (a, b) => a - b
  );

  const mean = nums.length
    ? nums.reduce(
        (a, b) =>
          a + b,
        0
      ) / nums.length
    : NaN;

  const variance =
    nums.length
      ? nums.reduce(
          (sum, value) =>
            sum +
            (value -
              mean) **
              2,
          0
        ) / nums.length
      : NaN;

  let value: any;

  if (op === "min") {
    value =
      Math.min(...nums);
  } else if (
    op === "max"
  ) {
    value =
      Math.max(...nums);
  } else if (
    op === "median"
  ) {
    value =
      percentile(
        sorted,
        0.5
      );
  } else if (
    op === "sum"
  ) {
    value =
      nums.reduce(
        (a, b) =>
          a + b,
        0
      );
  } else if (
    op === "std" ||
    op ===
      "standard_deviation"
  ) {
    value =
      Math.sqrt(
        variance
      );
  } else if (
    op === "range"
  ) {
    value =
      Math.max(...nums) -
      Math.min(...nums);
  } else if (
    op === "count"
  ) {
    value =
      rows.filter(
        (row) =>
          !isMissingValue(
            row[col!]
          )
      ).length;
  } else if (
    op === "stats" ||
    op === "summary" ||
    op === "describe"
  ) {
    value = {
      count:
        nums.length,
      mean,
      min:
        Math.min(...nums),
      max:
        Math.max(...nums),
      median:
        percentile(
          sorted,
          0.5
        ),
      std:
        Math.sqrt(
          variance
        ),
      q1:
        percentile(
          sorted,
          0.25
        ),
      q3:
        percentile(
          sorted,
          0.75
        ),
    };
  } else {
    value = mean;
  }

  return {
    operation: op,
    column: col,
    value,
    numericCount:
      nums.length,
  };
}

// ============================================================
// HEURISTIC PLAN
// ============================================================

function heuristicPlan(
  question: string,
  context: any
): AssistantPlan {
  const q =
    question.toLowerCase();

  const allColumns =
    context?.datasetSummary
      ?.allColumns || [];

  const numericCols =
    context?.datasetSummary
      ?.numCols || [];

  const col =
    inferColumnFromQuestion(
      q,
      allColumns,
      numericCols
    );

  // Workflow / project-level questions
  if (/what (does|is) this project|how does (this|the) project work|project workflow|complete workflow|entire workflow|end[- ]to[- ]end|from upload|from uploading|how does datamind/.test(q)) {
    return { operation: "workflow" };
  }

  if (/schema|column type|data type|numerical columns|categorical columns|datetime columns|boolean columns|identifier columns/.test(q) && /type|column|schema|which/.test(q)) {
    return { operation: "schema_details" };
  }

  if (/cleaning|cleaned|preprocess|preprocessing|imputation|duplicate removal|removed duplicates|outlier removal|what changed after cleaning/.test(q)) {
    return { operation: "cleaning" };
  }

  if (/eda|exploratory|distribution|trend|relationship|pattern|descriptive analysis|data exploration/.test(q)) {
    return { operation: "eda" };
  }

  if (/automl|model(s)?|leaderboard|cross.?validation|cv|training|trained|algorithm|which model|model comparison/.test(q)) {
    return { operation: "automl" };
  }

  if (/evaluation|accuracy|precision|recall|f1|roc.?auc|r2|rmse|mae|mse|mape|confusion matrix|test set|held.?out/.test(q)) {
    return { operation: "evaluation" };
  }

  if (/recommend|recommendation|what should i do|what do you suggest|next step|improve|improvement|should i|how can i improve/.test(q)) {
    return { operation: "recommendations" };
  }

  if (/report|documentation|final report|generate report|report sections/.test(q)) {
    return { operation: "report" };
  }

  if (/insight|business insight|key finding|executive summary/.test(q)) {
    return { operation: "insights" };
  }

  if (/outlier|anomal|extreme value/.test(
      q
    )
  ) {
    return {
      operation:
        "outliers",
      column: col,
    };
  }

  if (
    /overview|describe|summarize|summary|general pattern/.test(
      q
    )
  ) {
    return {
      operation:
        "overview",
    };
  }

  if (
    /top\s*\d+|highest|largest|most/.test(
      q
    ) &&
    col
  ) {
    return {
      operation:
        "top_values",
      column: col,
      topN:
        Number(
          (
            q.match(
              /top\s*(\d+)/
            ) || []
          )[1]
        ) || 5,
    };
  }

  if (
    /bottom\s*\d+|lowest|smallest|least/.test(
      q
    ) &&
    col
  ) {
    return {
      operation:
        "bottom_values",
      column: col,
      topN:
        Number(
          (
            q.match(
              /bottom\s*(\d+)/
            ) || []
          )[1]
        ) || 5,
    };
  }

  if (
    /missing|blank|null|empty/.test(
      q
    )
  ) {
    return {
      operation:
        "missing",
      column: col,
    };
  }

  if (
    /column|field|attribute|schema/.test(
      q
    ) &&
    !col
  ) {
    return {
      operation:
        "schema",
    };
  }

  if (
    /quality|data quality|issue|duplicate|clean/.test(
      q
    )
  ) {
    return {
      operation:
        "quality",
    };
  }

  if (
    /feature importance|predictive importance|driver/.test(
      q
    )
  ) {
    return {
      operation:
        "importance",
    };
  }

  if (
    /automl|model performance|model|target|prediction/.test(
      q
    )
  ) {
    return {
      operation:
        "model",
    };
  }

  if (
    /correlation|correlated/.test(
      q
    )
  ) {
    const mentioned =
      allColumns.filter(
        (column: string) =>
          q.includes(
            column.toLowerCase()
          )
      );

    return mentioned.length >=
      2
      ? {
          operation:
            "correlation_pair",
          columns:
            mentioned.slice(
              0,
              2
            ),
        }
      : {
          operation:
            "correlation",
        };
  }

  const groupMatch =
    q.match(
      /(?:by|per|for each)\s+([a-z0-9_ -]+?)(?:\s+and|\s+with|\s*$)/i
    );

  const aggregation =
    /average|mean|avg/.test(q)
      ? "mean"
      : /maximum|max|highest|largest/.test(
          q
        )
      ? "max"
      : /minimum|min|lowest|smallest/.test(
          q
        )
      ? "min"
      : /median/.test(q)
      ? "median"
      : /sum|total/.test(q)
      ? "sum"
      : /count|how many|number of/.test(
          q
        )
      ? "count"
      : undefined;

  if (
    aggregation &&
    groupMatch &&
    col
  ) {
    return {
      operation:
        "group_aggregate",
      groupBy:
        groupMatch[1].trim(),
      valueColumn:
        col,
      aggregation,
      topN: 10,
    };
  }

  if (
    /minimum|min|lowest|smallest/.test(
      q
    )
  ) {
    return {
      operation: "min",
      column: col,
    };
  }

  if (
    /maximum|max|highest|largest/.test(
      q
    )
  ) {
    return {
      operation: "max",
      column: col,
    };
  }

  if (
    /average|mean|avg/.test(q)
  ) {
    return {
      operation: "mean",
      column: col,
    };
  }

  if (/median/.test(q)) {
    return {
      operation: "median",
      column: col,
    };
  }

  if (
    /sum|total/.test(q)
  ) {
    return {
      operation: "sum",
      column: col,
    };
  }

  if (
    /standard deviation|std dev|spread/.test(
      q
    )
  ) {
    return {
      operation: "std",
      column: col,
    };
  }

  if (/range/.test(q)) {
    return {
      operation:
        "range",
      column: col,
    };
  }

  if (
    /how many rows|row count|records/.test(
      q
    )
  ) {
    return {
      operation:
        "row_count",
    };
  }

  return {
    operation:
      "stats",
    column: col,
  };
}

// ============================================================
// BUILD ASSISTANT CONTEXT
// ============================================================

function buildAssistantContext(
  context: any
) {
  const rows =
    Array.isArray(context?.rawData)
      ? context.rawData
      : [];

  const summary =
    context?.datasetSummary ||
    {};

  const profiles = Array.isArray(context?.columnProfiles)
    ? context.columnProfiles
    : [];

  const numericProfiles = profiles.filter(
    (p: any) => p.dataType === "numerical" || p.dataType === "binary"
  );

  const categoricalProfiles = profiles.filter(
    (p: any) => p.dataType === "categorical" || p.dataType === "boolean"
  );

  return {
    project: {
      name: "DataMind AI",
      description: "Multi-Agent Autonomous Data Science Platform",
      workflow: [
        "Dataset Upload",
        "Validation",
        "Dataset Overview",
        "Data Quality",
        "Data Cleaning",
        "Exploratory Data Analysis",
        "Problem and Target Detection",
        "AutoML",
        "Model Evaluation",
        "Explainability",
        "AI Insights",
        "Report Generation",
        "AI Data Assistant",
      ],
      capabilities: [
        "CSV/XLSX/XLS dataset ingestion",
        "Automatic schema and data-type detection",
        "Data quality assessment",
        "Cleaning and audit logging",
        "Adaptive EDA",
        "Automatic problem/target detection",
        "Classification and regression AutoML",
        "Multi-metric model evaluation",
        "Feature importance and explainability",
        "AI-generated insights",
        "Report generation",
        "Natural-language dataset Q&A",
      ],
    },

    datasetSummary: {
      ...summary,
      allColumns:
        summary.allColumns ||
        Object.keys(rows[0] || {}),
      previewRowCount: rows.length,
      isSampled: Boolean(summary.isSampled),
      datasetId: summary.datasetId || undefined,
    },

    schemaAnalysis: {
      numericColumns: numericProfiles.map((p: any) => p.name),
      categoricalColumns: categoricalProfiles.map((p: any) => p.name),
      datetimeColumns: profiles.filter((p: any) => p.dataType === "datetime").map((p: any) => p.name),
      booleanColumns: profiles.filter((p: any) => p.dataType === "boolean").map((p: any) => p.name),
      idColumns: profiles.filter((p: any) => p.isPossibleId || p.dataType === "id").map((p: any) => p.name),
      constantColumns: profiles.filter((p: any) => p.isConstant).map((p: any) => p.name),
      highCardinalityColumns: profiles
        .filter((p: any) => p.dataType === "categorical" && p.uniqueCount > 50 && p.uniqueRate > 0.6 && !p.isPossibleId)
        .map((p: any) => p.name),
    },

    columnProfiles: profiles,

    qualityReport:
      context?.qualityReport ||
      {},

    cleaning: {
      logs: context?.cleaningLogs || [],
      rowsBefore: summary.totalRows ?? rows.length,
      rowsAfter: context?.cleanedRowCount ?? rows.length,
      columnsBefore: (summary.allColumns || []).length,
      columnsAfter: context?.cleanedColumns?.length ?? (summary.allColumns || []).length,
      cleanedColumns: context?.cleanedColumns || summary.allColumns || [],
      hasBeenRun: Boolean((context?.cleaningLogs || []).length),
      standardOutlierRule: "Tukey 1.5 × IQR",
    },

    eda: {
      correlations: context?.correlationHighlights || [],
      numericProfiles: numericProfiles.map((p: any) => ({
        name: p.name,
        mean: p.mean,
        median: p.median,
        std: p.std,
        min: p.min,
        max: p.max,
        q1: p.q1,
        q3: p.q3,
        iqr: p.iqr,
        outlierCount: p.outlierCount,
      })),
      categoricalProfiles: categoricalProfiles.map((p: any) => ({
        name: p.name,
        uniqueCount: p.uniqueCount,
        topValues: p.topValues,
      })),
    },

    problemDetection:
      context?.problemDetection ||
      {},

    mlResults:
      context?.mlResults ||
      null,

    evaluation: context?.evaluation || {},

    explainability: context?.explainability || {},

    aiInsights:
      context?.aiInsights ||
      null,

    report:
      context?.report ||
      {
        generated: false,
        availableSections: [
          "Dataset Overview",
          "Data Quality",
          "Data Cleaning",
          "EDA",
          "AutoML",
          "Evaluation",
          "Explainability",
          "AI Insights",
        ],
      },

    correlationHighlights:
      context?.correlationHighlights ||
      [],

    sampleData:
      rows.slice(0, 8),
  };
}

// ============================================================
// UNIVERSAL ASSISTANT
// ============================================================

async function runUniversalAssistant(
  message: string,
  context: any,
  history: any[],
  ai: GoogleGenAI | null
) {
  let rows: Record<string, any>[] = Array.isArray(context?.rawData)
    ? context.rawData
    : [];

  // For uploaded datasets, prefer the server-side source so the browser
  // does not have to send hundreds of thousands/millions of records.
  if (!rows.length && context?.datasetId) {
    rows = await loadAssistantDatasetRows(String(context.datasetId));
  }

  const assistantContext = buildAssistantContext({
    ...context,
    rawData: rows,
  });

  let plan: AssistantPlan;

  if (ai) {
    const plannerPrompt = `
You are the intent-planning component of DataMind AI, a multi-agent autonomous data science platform.

Convert the user's natural-language question into ONE safe JSON analysis plan.

The question may refer to ANY stage of the DataMind workflow, not only raw dataset statistics.

Supported contextual operations:
workflow, project, schema_details, column_profile, quality, cleaning, eda,
target, automl, models, evaluation, metrics, explainability, insights,
recommendations, report

Supported exact dataset operations:
schema, row_count, column_count, missing, missing_rate, quality, model,
importance, correlation, correlation_pair, value_counts, group_aggregate,
filter, min, max, mean, median, sum, count, std, standard_deviation,
range, stats, describe, outliers, top_values, bottom_values, overview

Rules:
- Use the supplied dataset/project context.
- Never invent a column.
- For follow-up questions, use the conversation history.
- Choose a contextual operation when the question is about a DataMind workflow stage.
- Choose an exact dataset operation when the user asks for a calculation.
- Recommendations should use the available evidence and should not fabricate evidence.
- Return ONLY valid JSON.

Allowed keys:
operation, column, columns, groupBy, valueColumn, aggregation,
filterColumn, filterOperator, filterValue, topN, descending, subject

DATASET/PROJECT CONTEXT:
${JSON.stringify(assistantContext)}

CONVERSATION HISTORY:
${history.slice(-10).map((h: any) => `${h.role}: ${h.text}`).join("\n")}

USER QUESTION:
${message}
`;

    try {
      const { response: planned } =
        await generateGeminiWithFallback(
          ai,
          {
            contents: plannerPrompt,
            config: {
              responseMimeType: "application/json",
            },
          }
        );
      plan = JSON.parse(planned.text || "{}");
    } catch {
      plan = heuristicPlan(message, assistantContext);
    }
  } else {
    plan = heuristicPlan(message, assistantContext);
  }

  const result = executeAssistantPlan(plan, rows, assistantContext);

  if (ai) {
    const answerPrompt = `
You are the DataMind AI Assistant.

You are an intelligent assistant for the complete DataMind AI workflow:
Upload → Validation → Overview → Data Quality → Cleaning → EDA →
Problem/Target Detection → AutoML → Evaluation → Explainability →
AI Insights → Report Generation.

Answer the user's question directly using the supplied context and exact analysis result.

IMPORTANT GROUNDING RULES:
1. Use actual DataMind evidence first.
2. Never invent dataset values, columns, models, metrics, cleaning operations, or report contents.
3. Never change an exact calculated number.
4. If information is unavailable, say that it is not currently available.
5. Distinguish measured/calculated facts from interpretation and recommendations.
6. Recommendations must be supported by the supplied evidence.
7. Do not claim correlation proves causation.
8. Do not claim feature importance proves causation.
9. Explain technical concepts in the context of this dataset when possible.
10. For AutoML questions, use the actual leaderboard, primary metric, all available metrics, CV information, test results, and feature importance.
11. For cleaning questions, use the actual cleaning audit log and before/after counts.
12. For EDA questions, use the actual profiles and correlations.
13. For project questions, explain the actual DataMind workflow supplied in the project context.
14. For report questions, describe only the report sections/status supplied in the context.
15. For recommendations, provide practical next steps but clearly label them as recommendations rather than facts.
16. If the user asks a follow-up such as "why?", "what about accuracy?", or "should I do that?", resolve the reference using conversation history.
17. Keep the answer concise but sufficiently explanatory. Use markdown where useful.

USER QUESTION:
${message}

ANALYSIS PLAN:
${JSON.stringify(plan)}

EXACT ANALYSIS RESULT:
${JSON.stringify(result)}

DATASET/PROJECT CONTEXT:
${JSON.stringify(assistantContext)}

CONVERSATION HISTORY:
${history.slice(-10).map((h: any) => `${h.role}: ${h.text}`).join("\n")}
`;

    try {
      const { response } =
        await generateGeminiWithFallback(
          ai,
          {
            contents: answerPrompt,
          }
        );

      return {
        response: response.text || formatAssistantResult(result),
        fallback: false,
      };
    } catch {
      return {
        response: formatAssistantResult(result),
        fallback: true,
      };
    }
  }

  return {
    response: formatAssistantResult(result),
    fallback: true,
  };
}

// ============================================================
// FORMAT ASSISTANT RESULT
// ============================================================

function formatAssistantResult(
  result: any
): string {
  if (result?.error) {
    return `I could not calculate that exactly. ${result.error}`;
  }

  if (["workflow", "project"].includes(result?.operation)) {
    const project = result.project || {};
    const workflow = project.workflow || [];
    return `**DataMind AI workflow**\n\n${workflow.map((step: string, i: number) => `${i + 1}. ${step}`).join("\n")}\n\nThe Assistant can use the current dataset state, cleaning audit, EDA results, target detection, AutoML, evaluation, explainability, insights, and report context when answering questions.`;
  }

  if (result?.operation === "schema_details") {
    const schema = result.schema || {};
    return `**Schema summary**\n\n- Numerical: **${(schema.numericColumns || []).length}**\n- Categorical: **${(schema.categoricalColumns || []).length}**\n- Datetime: **${(schema.datetimeColumns || []).length}**\n- Boolean: **${(schema.booleanColumns || []).length}**\n- Identifier-like: **${(schema.idColumns || []).length}**\n- Constant: **${(schema.constantColumns || []).length}**`;
  }

  if (result?.operation === "column_profile") {
    const p = result.profile;
    if (!p) return result.error || "Column profile is unavailable.";
    return `**${p.name}**\n\n- Type: **${p.dataType}**\n- Unique values: **${p.uniqueCount}** (${p.uniqueRate}%)\n- Missing: **${p.missingCount}** (${p.missingRate}%)\n${p.mean !== undefined ? `- Mean: **${p.mean}**\n- Median: **${p.median}**\n- Min/Max: **${p.min} / ${p.max}**\n- Std. deviation: **${p.std}**\n- Outliers: **${p.outlierCount || 0}**` : ""}`;
  }

  if (result?.operation === "cleaning") {
    const c = result.cleaning || {};
    const logs = c.logs || [];
    return `**Cleaning status**\n\n- Rows before: **${Number(c.rowsBefore || 0).toLocaleString()}**\n- Rows after: **${Number(c.rowsAfter || 0).toLocaleString()}**\n- Columns before: **${c.columnsBefore || 0}**\n- Columns after: **${c.columnsAfter || 0}**\n- Operations recorded: **${logs.length}**\n- Outlier rule: **${c.standardOutlierRule || "Tukey 1.5 × IQR"}**\n\n${logs.slice(0, 10).map((l: any) => `- **${l.operation}** — ${l.column}; affected: ${l.affectedCount}`).join("\n") || "No cleaning operations have been recorded yet."}`;
  }

  if (result?.operation === "eda") {
    const e = result.eda || {};
    const corr = e.correlations || [];
    return `**EDA summary**\n\n- Numeric profiles available: **${(e.numericProfiles || []).length}**\n- Categorical profiles available: **${(e.categoricalProfiles || []).length}**\n- Correlation pairs available: **${corr.length}**\n\n${corr.slice(0, 5).map((c: any) => `- **${c.col1} ↔ ${c.col2}**: r = ${Number(c.correlation).toFixed(3)}`).join("\n") || "No correlation highlights are currently available."}`;
  }

  if (["automl", "models"].includes(result?.operation)) {
    const ml = result.mlResults || result.automl;
    if (!ml) return "AutoML has not been executed yet.";
    const rows = (ml.models || []).filter((m: any) => m.status !== "failed").slice(0, 8);
    return `**AutoML**\n\n- Task: **${ml.taskType}**\n- Target: **${ml.targetColumn}**\n- Primary metric: **${ml.primaryMetricLabel || ml.primaryMetric || ml.selectedModel?.primaryMetric || "N/A"}**\n- Selected model: **${ml.selectedModel?.name || "N/A"}**\n- Models evaluated: **${ml.models?.length || 0}**\n\n${rows.map((m: any) => `- **${m.name}** — primary ${Number(m.primaryMetricValue).toFixed(4)}; accuracy ${m.metrics?.accuracy ?? "N/A"}; F1 ${m.metrics?.f1 ?? "N/A"}; R² ${m.metrics?.r2 ?? "N/A"}; RMSE ${m.metrics?.rmse ?? "N/A"}`).join("\n")}`;
  }

  if (result?.operation === "evaluation" || result?.operation === "metrics") {
    const ml = result.mlResults || result.automl;
    if (!ml) return "Model evaluation is not available until AutoML has been executed.";
    const m = ml.selectedModel;
    return `**Selected model evaluation**\n\n- Model: **${m?.name || "N/A"}**\n- Primary metric: **${m?.primaryMetric || "N/A"} = ${m?.primaryMetricValue !== undefined ? Number(m.primaryMetricValue).toFixed(4) : "N/A"}**\n- Accuracy: **${m?.metrics?.accuracy ?? "N/A"}**\n- Precision: **${m?.metrics?.precision ?? "N/A"}**\n- Recall: **${m?.metrics?.recall ?? "N/A"}**\n- F1: **${m?.metrics?.f1 ?? "N/A"}**\n- ROC-AUC: **${m?.metrics?.rocAuc ?? "N/A"}**\n- MAE: **${m?.metrics?.mae ?? "N/A"}**\n- RMSE: **${m?.metrics?.rmse ?? "N/A"}**\n- R²: **${m?.metrics?.r2 ?? "N/A"}**\n- MAPE: **${m?.metrics?.mape ?? "N/A"}**`;
  }

  if (result?.operation === "target") {
    return `**Target detection**\n\n${JSON.stringify(result.target || {}, null, 2)}`;
  }

  if (result?.operation === "explainability") {
    const fi = result.explainability?.featureImportance || result.mlResults?.selectedModel?.featureImportance || [];
    return fi.length ? `**Top feature importance**\n\n${fi.slice(0, 10).map((f: any, i: number) => `${i + 1}. **${f.feature}** — ${f.importance}%`).join("\n")}` : "Feature-importance information is not currently available.";
  }

  if (result?.operation === "insights") {
    const i = result.aiInsights;
    if (!i) return "AI Insights have not been generated yet.";
    return `**Current AI Insights**\n\n${i.executiveSummary || ""}\n\n${(i.keyFindings || []).map((x: string) => `- ${x}`).join("\n")}`;
  }

  if (result?.operation === "recommendations") {
    const q = result.qualityReport || {};
    const ml = result.mlResults;
    const issues = (q.issues || []).slice(0, 5);
    return `**Evidence available for recommendations**\n\n- Quality score: **${q.qualityScore ?? "N/A"}%**\n- Missing cells: **${q.totalMissingCells ?? 0}**\n- Duplicate rows: **${q.duplicateRows ?? 0}**\n- Outliers: **${q.outlierCount ?? 0}**\n- AutoML: **${ml ? "completed" : "not run"}**\n\n${issues.map((x: any) => `- ${x.message}: ${x.recommendation}`).join("\n") || "No major quality recommendations are currently recorded."}`;
  }

  if (result?.operation === "report") {
    const r = result.report || {};
    return r.generated ? `The report context indicates that report generation is available for the current analysis.` : `The report module can cover: ${(r.availableSections || []).join(", ")}. A generated-report status is not currently recorded in the active session.`;
  }

  if (
    result?.operation ===
    "schema"
  ) {
    return `
The dataset has **${result.rows} rows** and **${result.columns.length} columns**.

Columns:

${result.columns
  .map(
    (column: string) =>
      `- **${column}**`
  )
  .join("\n")}
`;
  }

  if (
    result?.operation ===
    "row_count"
  ) {
    return `The dataset contains **${result.rowCount.toLocaleString()} rows/records**.`;
  }

  if (
    result?.operation ===
    "column_count"
  ) {
    return `The dataset contains **${result.columnCount} columns**.`;
  }

  if (
    result?.operation ===
      "missing" ||
    result?.operation ===
      "missing_rate"
  ) {
    return result.result
      .map(
        (item: any) =>
          `**${item.column}**: ${item.missingCount} missing values (${item.missingRate.toFixed(
            2
          )}%).`
      )
      .join("\n");
  }

  if (
    result?.operation ===
    "quality"
  ) {
    return `Data quality score: **${
      result.qualityReport
        ?.qualityScore ??
      "N/A"
    }%**.

Missing cells: **${
      result.qualityReport
        ?.totalMissingCells ??
      0
    }**

Duplicate rows: **${
      result.qualityReport
        ?.duplicateRows ??
      0
    }**.`;
  }

  if (
    result?.operation ===
    "model"
  ) {
    const model =
      result.mlResults
        ?.selectedModel;

    if (model) {
      return `Target: **${
        result
          .problemDetection
          ?.targetColumn ||
        result.mlResults
          ?.targetColumn ||
        "Unknown"
      }**.

Selected model: **${model.name}**

${model.primaryMetric}: **${Number(
        model.primaryMetricValue
      ).toFixed(3)}**`;
    }

    return `Target/task information: ${JSON.stringify(
      result.problemDetection
    )}

AutoML has not produced a selected model yet.`;
  }

  if (
    result?.operation ===
    "importance"
  ) {
    return result
      .featureImportance
      ?.length
      ? result.featureImportance
          .slice(0, 5)
          .map(
            (
              item: any,
              index: number
            ) =>
              `${
                index + 1
              }. **${item.feature}** — ${item.importance}%`
          )
          .join("\n")
      : "Feature importance is not available yet.";
  }

  if (
    result?.operation ===
    "correlation"
  ) {
    return result
      .correlations?.length
      ? result.correlations
          .slice(0, 5)
          .map(
            (item: any) =>
              `**${item.col1}** ↔ **${item.col2}**: r = ${Number(
                item.correlation
              ).toFixed(3)}`
          )
          .join("\n")
      : "No computed correlation pairs are available.";
  }

  if (
    result?.operation ===
    "correlation_pair"
  ) {
    return `Correlation between **${result.columns.join(
      "** and **"
    )}** is **${Number(
      result.correlation
    ).toFixed(
      4
    )}** based on ${result.pairCount} paired numeric records.`;
  }

  if (
    result?.operation ===
    "group_aggregate"
  ) {
    return result.values
      .map(
        (item: any) =>
          `**${item.group}**: ${Number(
            item.value
          ).toLocaleString(
            undefined,
            {
              maximumFractionDigits: 4,
            }
          )} (${item.count} records)`
      )
      .join("\n");
  }

  if (
    result?.operation ===
    "value_counts"
  ) {
    return result.values
      .map(
        (item: any) =>
          `**${item.value}**: ${item.count} (${item.percentage.toFixed(
            2
          )}%)`
      )
      .join("\n");
  }

  if (
    result?.operation ===
      "top_values" ||
    result?.operation ===
      "bottom_values"
  ) {
    return `Values for **${
      result.column
    }**:

${result.values
  .map(
    (value: any) =>
      `- **${value}**`
  )
  .join("\n")}`;
  }

  if (
    result?.operation ===
    "outliers"
  ) {
    return `For **${
      result.column
    }**, the IQR rule identified **${
      result.outlierCount
    }** outliers (${result.outlierRate.toFixed(
      2
    )}%).

Lower bound: **${result.lowerBound.toLocaleString()}**

Upper bound: **${result.upperBound.toLocaleString()}**`;
  }

  if (
    result?.operation ===
    "overview"
  ) {
    return `The dataset contains **${result.rows.toLocaleString()} rows** and **${result.columns.length} columns**.

Quality score: **${
      result.quality
        ?.qualityScore ??
      "N/A"
    }%.

${
  result.correlations
    ?.length
    ? `Strongest available relationship: **${result.correlations[0].col1}** ↔ **${result.correlations[0].col2}** (r=${Number(
        result.correlations[0]
          .correlation
      ).toFixed(3)}).`
    : "No computed correlation highlights are available."
}`;
  }

  if (
    result?.operation ===
    "filter"
  ) {
    return `**${result.matchingRows}** rows match the condition on **${result.filterColumn}** (${result.operator} ${JSON.stringify(
      result.filterValue
    )}).`;
  }

  if (
    result?.value &&
    typeof result.value ===
      "object"
  ) {
    return `
Statistics for **${result.column}**:

- Count: **${result.value.count}**
- Average: **${result.value.mean.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 4,
      }
    )}**
- Minimum: **${result.value.min.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 4,
      }
    )}**
- Maximum: **${result.value.max.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 4,
      }
    )}**
- Median: **${result.value.median.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 4,
      }
    )}**
- Std. deviation: **${result.value.std.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 4,
      }
    )}**
`;
  }

  return `For **${
    result.column ||
    "the requested value"
  }**, the calculated **${
    result.operation
  }** is **${
    typeof result.value ===
    "number"
      ? result.value.toLocaleString(
          undefined,
          {
            maximumFractionDigits: 6,
          }
        )
      : result.value
  }**.`;
}

// ============================================================
// AI DATA ASSISTANT ENDPOINT
// ============================================================

app.post(
  "/api/gemini/chat",
  requireAuth,
  async (req, res) => {
    try {
      const {
        message,
        history = [],
      } = req.body;

      const context =
        req.body.context ||
        req.body.datasetContext ||
        {};

      if (
        !String(
          message || ""
        ).trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              "A question is required.",
          });
      }

      const result =
        await runUniversalAssistant(
          String(message),
          context,
          history,
          getAi()
        );

      return res.json(
        result
      );

    } catch (error: any) {
      console.error(
        "Universal assistant error:",
        error
      );

      try {
        const context =
          req.body.context ||
          req.body
            .datasetContext ||
          {};

        const result =
          await runUniversalAssistant(
            String(
              req.body.message ||
                ""
            ),
            context,
            req.body
              .history || [],
            null
          );

        return res.json(
          result
        );

      } catch (
        fallbackError: any
      ) {
        return res
          .status(500)
          .json({
            error:
              "Failed to analyze assistant question",

            message:
              fallbackError?.message ||
              error?.message ||
              "Internal error",
          });
      }
    }
  }
);

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  await startMlService();

  const httpServer =
    http.createServer(app);

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    const {
      createServer:
        createViteServer,
    } = await import(
      "vite"
    );

    const vite =
      await createViteServer({
        server: {
          middlewareMode:
            true,

          hmr:
            process.env
              .DISABLE_HMR ===
            "true"
              ? false
              : {
                  server:
                    httpServer,
                },
        },

        appType: "spa",
      });

    app.use(
      vite.middlewares
    );

  } else {
    const distPath =
      path.join(
        process.cwd(),
        "dist"
      );

    app.use(
      express.static(
        distPath
      )
    );

    app.get(
      "*",
      (_req, res) => {
        res.sendFile(
          path.join(
            distPath,
            "index.html"
          )
        );
      }
    );
  }

  httpServer.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `DataMind AI server running on http://0.0.0.0:${PORT}`
      );
    }
  );
}


setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, entry] of datasetFiles) {
    if (entry.createdAt < cutoff) {
      datasetFiles.delete(id);
      fs.rm(entry.path, { force: true }, () => {});
    }
  }
}, 30 * 60 * 1000).unref();

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown() {
  console.log(
    "Shutting down DataMind AI..."
  );

  if (mlProcess) {
    mlProcess.kill();
    mlProcess = null;
  }

  process.exit(0);
}

process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);

// ============================================================
// START
// ============================================================

startServer().catch(
  (error) => {
    console.error(
      "Failed to start DataMind AI server:",
      error
    );

    if (mlProcess) {
      mlProcess.kill();
      mlProcess = null;
    }

    process.exit(1);
  }
);
