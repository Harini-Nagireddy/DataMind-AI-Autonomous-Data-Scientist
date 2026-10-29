import { DatasetSession } from "../types";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateHtmlReport(session: DatasetSession): string {
  const { fileName, uploadedAt, columnProfiles, qualityReport, cleaningLogs, problemDetection, automlSummary, aiInsights } = session;

  const numCols = columnProfiles.filter((c) => (c.dataType === "numerical" || c.dataType === "binary") && !c.isPossibleId).map((c) => c.name);
  const catCols = columnProfiles.filter((c) => c.dataType === "categorical").map((c) => c.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DataMind AI — Comprehensive Autonomous Data Science Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; margin: 0; padding: 40px; }
    .container { max-width: 900px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    h1 { color: #0f172a; font-size: 28px; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
    .badge { display: inline-block; padding: 4px 10px; background: #e0e7ff; color: #4338ca; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 30px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
    .stat-card { background: #f1f5f9; padding: 16px; border-radius: 8px; }
    .stat-card .val { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat-card .lbl { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-top: 4px; }
    h2 { color: #1e293b; font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 36px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
    th { background: #f8fafc; text-align: left; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    .insight-box { background: #eef2ff; border-left: 4px solid #6366f1; padding: 16px 20px; border-radius: 6px; margin-bottom: 16px; }
    .insight-box h3 { margin: 0 0 8px 0; color: #3730a3; font-size: 16px; }
    .insight-box ul { margin: 0; padding-left: 20px; }
    .insight-box li { margin-bottom: 6px; }
    .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    @media print {
      body { background: #fff; padding: 0; }
      .container { box-shadow: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h1>DataMind AI <span class="badge">Automated Data Science Report</span></h1>
        <div class="subtitle">Dataset: <strong>${escapeHtml(fileName)}</strong> &bull; Generated on ${escapeHtml(new Date(uploadedAt).toLocaleString())}</div>
      </div>
      <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Print / Save PDF</button>
    </div>

    <div class="grid">
      <div class="stat-card">
        <div class="val">${session.rawRows.length}</div>
        <div class="lbl">Total Records</div>
      </div>
      <div class="stat-card">
        <div class="val">${session.columns.length}</div>
        <div class="lbl">Total Attributes</div>
      </div>
      <div class="stat-card">
        <div class="val" style="color: ${qualityReport.qualityScore >= 80 ? "#16a34a" : qualityReport.qualityScore >= 60 ? "#d97706" : "#dc2626"};">
          ${qualityReport.qualityScore}%
        </div>
        <div class="lbl">Data Quality Score</div>
      </div>
      <div class="stat-card">
        <div class="val">${problemDetection.hasTarget ? problemDetection.taskType.toUpperCase() : "EDA ONLY"}</div>
        <div class="lbl">ML Task Type</div>
      </div>
    </div>

    <!-- AI Insights Section -->
    ${
      aiInsights
        ? `
      <h2>1. Executive Summary & AI Insights</h2>
      <div class="insight-box">
        <h3>Executive Briefing</h3>
        <p style="margin: 0;">${escapeHtml(aiInsights.executiveSummary)}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="insight-box" style="background: #f0fdf4; border-left-color: #22c55e;">
          <h3 style="color: #15803d;">Key Computed Findings</h3>
          <ul>
            ${aiInsights.keyFindings.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
          </ul>
        </div>
        <div class="insight-box" style="background: #fdf4ff; border-left-color: #d946ef;">
          <h3 style="color: #86198f;">Business Insights</h3>
          <ul>
            ${aiInsights.businessInsights.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
          </ul>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
        <div class="insight-box" style="background: #eff6ff; border-left-color: #3b82f6;">
          <h3 style="color: #1d4ed8;">Recommended Actions</h3>
          <ul>
            ${aiInsights.recommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}
          </ul>
        </div>
        <div class="insight-box" style="background: #fffbeb; border-left-color: #f59e0b;">
          <h3 style="color: #b45309;">Cautions & Limitations</h3>
          <ul>
            ${aiInsights.cautions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `
        : ""
    }

    <!-- Dataset Profiling -->
    <h2>2. Feature Schema & Column Profiles</h2>
    <p>Identified <strong>${numCols.length}</strong> numerical features and <strong>${catCols.length}</strong> categorical/boolean attributes.</p>
    <table>
      <thead>
        <tr>
          <th>Column Name</th>
          <th>Type</th>
          <th>Unique Count</th>
          <th>Missing Cells</th>
          <th>Missing %</th>
          <th>Summary Metrics</th>
        </tr>
      </thead>
      <tbody>
        ${columnProfiles
          .map(
            (cp) => `
          <tr>
            <td><strong>${escapeHtml(cp.name)}</strong> ${cp.isPossibleId ? '<span style="color: #9333ea; font-size: 11px;">[ID]</span>' : ""}</td>
            <td><code>${escapeHtml(cp.dataType)}</code></td>
            <td>${cp.uniqueCount} (${cp.uniqueRate}%)</td>
            <td>${cp.missingCount}</td>
            <td>${cp.missingRate}%</td>
            <td>${
              cp.isBinary || cp.dataType === "binary"
                ? `Binary: [0, 1] • Mean: ${cp.mean}`
                : cp.isDiscrete && cp.dataType === "numerical"
                ? `Discrete Num • Med: ${cp.median}, Min: ${cp.min}, Max: ${cp.max}`
                : cp.dataType === "numerical" && cp.mean !== undefined
                ? `Mean: ${cp.mean}, Med: ${cp.median}, Min: ${cp.min}, Max: ${cp.max}${
                    cp.outlierCount ? ` (${cp.outlierCount} outliers)` : ""
                  }`
                : cp.topValues && cp.topValues.length > 0
                ? `Top: "${escapeHtml(cp.topValues[0].value)}" (${cp.topValues[0].percentage}%)`
                : "-"
            }</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    <!-- Data Quality Audit -->
    <h2>3. Data Quality & Audit Issues</h2>
    <p>Overall Missing Cells: <strong>${qualityReport.totalMissingCells}</strong> (${qualityReport.missingRate}%) | Duplicate Rows: <strong>${qualityReport.duplicateRows}</strong> | Outliers: <strong>${qualityReport.outlierCount}</strong></p>
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Issue</th>
          <th>Description</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${
          qualityReport.issues.length > 0
            ? qualityReport.issues
                .map(
                  (iss) => `
            <tr>
              <td><span style="font-weight: 700; color: ${iss.severity === "high" ? "#dc2626" : iss.severity === "medium" ? "#d97706" : "#2563eb"};">${escapeHtml(iss.severity.toUpperCase())}</span></td>
              <td><strong>${escapeHtml(iss.message)}</strong></td>
              <td>${escapeHtml(iss.description)}</td>
              <td>${escapeHtml(iss.recommendation)}</td>
            </tr>
          `
                )
                .join("")
            : '<tr><td colspan="4" style="text-align: center; color: #16a34a;">No data quality defects detected!</td></tr>'
        }
      </tbody>
    </table>

    <!-- Cleaning Operations -->
    <h2>4. Data Cleaning Audit Log</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Operation</th>
          <th>Column</th>
          <th>Before</th>
          <th>After</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        ${cleaningLogs
          .map(
            (log) => `
          <tr>
            <td>${escapeHtml(log.timestamp)}</td>
            <td><strong>${escapeHtml(log.operation)}</strong></td>
            <td>${escapeHtml(log.column)}</td>
            <td>${escapeHtml(log.before)}</td>
            <td>${escapeHtml(log.after)}</td>
            <td>${escapeHtml(log.reason)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    <!-- AutoML Results -->
    ${
      automlSummary
        ? `
      <h2>5. AutoML Model Evaluation & Selection</h2>
      <p>Target Variable: <strong>${escapeHtml(automlSummary.targetColumn)}</strong> &bull; Selected Model: <strong>${escapeHtml(automlSummary.selectedModel.name)}</strong> (${escapeHtml(automlSummary.selectionReason)})</p>
      <table>
        <thead>
          <tr>
            <th>Model Algorithm</th>
            <th>Primary Score</th>
            <th>Secondary Metrics</th>
            <th>Training Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${automlSummary.models
            .map(
              (m) => `
            <tr style="${m.isBest ? "background: #f0fdf4; font-weight: 600;" : ""}">
              <td>${escapeHtml(m.name)} ${m.isBest ? '<span style="color: #16a34a;">★ Selected</span>' : ""}</td>
              <td>${m.primaryMetric}: <strong>${m.primaryMetricValue.toFixed(3)}</strong></td>
              <td>${
                m.taskType === "classification"
                  ? `Acc: ${m.metrics.accuracy?.toFixed(3)}, Prec: ${m.metrics.precision?.toFixed(3)}, Rec: ${m.metrics.recall?.toFixed(3)}`
                  : `MAE: ${m.metrics.mae?.toFixed(2)}, RMSE: ${m.metrics.rmse?.toFixed(2)}`
              }</td>
              <td>${m.trainingTimeMs} ms</td>
              <td><span style="color: #16a34a;">Trained</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <h3>Feature Importance Breakdown (${escapeHtml(automlSummary.selectedModel.name)})</h3>
      <table>
        <thead>
          <tr>
            <th>Feature Name</th>
            <th>Permutation Importance</th>
          </tr>
        </thead>
        <tbody>
          ${automlSummary.selectedModel.featureImportance
            .slice(0, 8)
            .map(
              (fi) => `
            <tr>
              <td><strong>${escapeHtml(fi.feature)}</strong></td>
              <td>${fi.importance}%</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `
        : ""
    }

    <div class="footer">
      Generated automatically by <strong>DataMind AI</strong> — Your Autonomous AI Data Scientist &bull; Automated Evaluation
    </div>
  </div>
</body>
</html>`;
}

export function downloadHtmlReport(session: DatasetSession) {
  const html = generateHtmlReport(session);
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `DataMind_Report_${session.fileName.replace(/\.[^/.]+$/, "")}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJsonSession(session: DatasetSession) {
  const jsonStr = JSON.stringify(session, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `DataMind_Session_${session.id}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
