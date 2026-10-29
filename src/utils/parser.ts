import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedDataResult {
  fileName: string;
  fileSize: number;
  columns: string[];
  rows: Record<string, any>[];
  totalRows: number;
  totalCols: number;
  datasetId?: string;
  isSampled?: boolean;
  sourceFile?: File;
}

export async function parseFile(file: File): Promise<ParsedDataResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!["csv", "xlsx", "xls"].includes(extension || "")) {
    throw new Error(`Unsupported file type: .${extension}. Please upload a CSV, XLSX, or XLS file.`);
  }

  if (file.size === 0) {
    throw new Error("The uploaded file is empty (0 bytes). Please upload a valid dataset.");
  }

  // XLSX/XLS parsing is not stream-native in the browser. Keep large-file
  // reliability predictable by requiring CSV for very large datasets.
  // Large files are always uploaded first and previewed server-side.
  // This prevents the browser from enumerating millions of row objects.
  if (file.size >= 25 * 1024 * 1024) {
    return parseLargeFileServerSide(file);
  }

  if (extension === "csv") {
    return parseCsvFile(file);
  } else {
    return parseExcelFile(file);
  }
}

export function parseCsvString(csvString: string, fileName: string = "sample.csv"): ParsedDataResult {
  const parsed = Papa.parse(csvString, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: "greedy",
  });

  if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
    throw new Error(`CSV Parsing error: ${parsed.errors[0].message}`);
  }

  const rawRows = (parsed.data as Record<string, any>[]).filter(Boolean);

  if (rawRows.length === 0) {
    throw new Error("The CSV file has headers but contains no data rows.");
  }

  const columns = parsed.meta.fields || Object.keys(rawRows[0]);
  const cleanCols = columns.map((col, idx) => (col && col.trim() ? col.trim() : `Column_${idx + 1}`));

  const sanitizedRows = rawRows.map((row) => {
    const cleanRow: Record<string, any> = {};
    cleanCols.forEach((col, idx) => {
      const origKey = columns[idx];
      let val = row[origKey];
      if (typeof val === "string") {
        const trimmed = val.trim();
        // Check if string can be parsed as number safely
        if (trimmed !== "" && !isNaN(Number(trimmed)) && !trimmed.startsWith("0") && trimmed.length < 15) {
          val = Number(trimmed);
        } else if (trimmed === "true" || trimmed === "True") {
          val = true;
        } else if (trimmed === "false" || trimmed === "False") {
          val = false;
        } else if (trimmed === "" || trimmed === "NA" || trimmed === "N/A" || trimmed === "null" || trimmed === "NULL") {
          val = null;
        } else {
          val = trimmed;
        }
      }
      cleanRow[col] = val;
    });
    return cleanRow;
  });

  return {
    fileName,
    fileSize: csvString.length,
    columns: cleanCols,
    rows: sanitizedRows,
    totalRows: sanitizedRows.length,
    totalCols: cleanCols.length,
  };
}

async function uploadLargeDatasetSource(file: File): Promise<{ datasetId: string }> {
  const response = await fetch("/api/datasets/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-DataMind-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });

  const raw = await response.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* handled below */ }
  if (!response.ok || !data?.datasetId) {
    throw new Error(data?.message || `Dataset upload failed (HTTP ${response.status}).`);
  }
  return { datasetId: data.datasetId };
}

async function parseLargeFileServerSide(file: File): Promise<ParsedDataResult> {
  const { datasetId } = await uploadLargeDatasetSource(file);
  const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/preview`, {
    credentials: "include",
  });
  const raw = await response.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch {}
  if (!response.ok || !data?.columns) {
    throw new Error(data?.message || `Large dataset analysis failed (HTTP ${response.status}).`);
  }
  return {
    fileName: file.name,
    fileSize: file.size,
    columns: data.columns,
    rows: Array.isArray(data.rows) ? data.rows : [],
    totalRows: Number(data.totalRows || 0),
    totalCols: Number(data.totalCols || data.columns.length),
    datasetId,
    isSampled: true,
    sourceFile: file,
  };
}

async function parseCsvFile(file: File): Promise<ParsedDataResult> {
  const { datasetId } = await uploadLargeDatasetSource(file);
  // Even below the 25 MB large-file threshold, parse in a worker and retain
  // only a bounded preview. Empty-row detection is delegated to PapaParse.
  const PREVIEW_LIMIT = 150_000;
  const previewRows: Record<string, any>[] = [];
  let totalRows = 0;
  let columns: string[] = [];

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: "greedy",
      worker: true,
      chunkSize: 1024 * 1024,
      chunk: (results) => {
        try {
          const rawCols = results.meta.fields || [];
          if (!columns.length) columns = rawCols.map((c, idx) => (c && c.trim() ? c.trim() : `Column_${idx + 1}`));
          for (const row of results.data) {
            if (!row) continue;
            totalRows++;
            if (previewRows.length < PREVIEW_LIMIT) previewRows.push(row);
          }
        } catch (err: any) {
          reject(new Error(`Failed to process CSV preview: ${err.message}`));
        }
      },
      complete: () => {
        if (!columns.length || totalRows === 0) {
          reject(new Error("The CSV file is empty or contains no usable data rows."));
          return;
        }
        resolve({
          fileName: file.name, fileSize: file.size, columns, rows: previewRows,
          totalRows, totalCols: columns.length, datasetId, isSampled: totalRows > PREVIEW_LIMIT, sourceFile: file,
        });
      },
      error: (error) => reject(new Error(`CSV reading error: ${error.message}`)),
    });
  });
}

async function parseExcelFile(file: File): Promise<ParsedDataResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("The Excel workbook does not contain any sheets.");
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" is empty.`);
  }

  const fullRange = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  const sourceRowCount = Math.max(0, fullRange.e.r - fullRange.s.r);
  const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null, range: { s: { r: 0, c: 0 }, e: { r: Math.min(fullRange.e.r, 20000), c: fullRange.e.c } } });

  if (!rawJson || rawJson.length === 0) {
    throw new Error("The Excel sheet contains no readable tabular data.");
  }

  const rawCols = Object.keys(rawJson[0]);
  const columns = rawCols.map((c, idx) => (c && c.trim() ? c.trim() : `Column_${idx + 1}`));

  const cleanRows = rawJson.map((row) => {
    const cleanRow: Record<string, any> = {};
    columns.forEach((col, idx) => {
      const origKey = rawCols[idx];
      let val = row[origKey];
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed === "" || trimmed === "NA" || trimmed === "N/A" || trimmed === "null") {
          val = null;
        } else {
          val = trimmed;
        }
      }
      cleanRow[col] = val;
    });
    return cleanRow;
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    columns,
    rows: cleanRows,
    totalRows: sourceRowCount || cleanRows.length,
    totalCols: columns.length,
    isSampled: (sourceRowCount || cleanRows.length) > cleanRows.length,
    sourceFile: file,
  };
}
