import React, { useState, useRef, useEffect } from "react";
import { DatasetSession } from "../types";
import {
  Bot,
  Send,
  Sparkles,
  User,
  Copy,
  Check,
  RefreshCw,
  HelpCircle,
  Briefcase
} from "lucide-react";

interface AssistantViewProps {
  session: DatasetSession;
}

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

export const AssistantView: React.FC<AssistantViewProps> = ({ session }) => {
  const {
    fileName,
    rawRows,
    columns,
    columnProfiles,
    qualityReport,
    automlSummary,
    cleaningLogs,
    cleanedRows,
    cleanedColumns,
    aiInsights,
    problemDetection,
  } = session;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-welcome",
      sender: "assistant",
      text: `Hello! I am your DataMind AI Assistant for **${fileName}**. I can answer questions across the complete workflow — dataset schema, data quality, cleaning, EDA, target detection, AutoML, metrics, model comparison, explainability, insights, and reports. The current analysis contains ${session.totalRows.toLocaleString()} records across ${columns.length} attributes with a quality score of **${qualityReport.qualityScore}%**. What would you like to investigate?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const promptSuggestions = [
    "Give me an overview of the complete dataset analysis",
    "What cleaning operations were performed?",
    "Explain the EDA findings and strongest relationships",
    "Compare all AutoML models and metrics",
    "Why was the selected model chosen?",
    "What recommendations do you have for this dataset?",
  ];

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input.trim();
    if (!textToSend || isTyping) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput("");
    setIsTyping(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          context: {
            datasetId: session.datasetId,
            cleaningLogs,
            cleanedColumns,
            cleanedRowCount: cleanedRows?.length ?? rawRows.length,
            datasetSummary: {
              name: fileName,
              totalRows: session.totalRows,
              totalCols: columns.length,
              isSampled: Boolean(session.isSampled),
              datasetId: session.datasetId,
              numCols: columnProfiles.filter((p) => p.dataType === "numerical" || p.dataType === "binary").map((p) => p.name),
              catCols: columnProfiles.filter((p) => p.dataType === "categorical" || p.dataType === "boolean" || p.dataType === "id").map((p) => p.name),
              allColumns: columns,
            },
            columnProfiles,
            qualityReport,
            correlationHighlights: session.correlationMatrix || [],
            problemDetection,
            mlResults: automlSummary || null,
            aiInsights: aiInsights || null,
            evaluation: automlSummary
              ? {
                  selectedModel: automlSummary.selectedModel,
                  models: automlSummary.models,
                  primaryMetric: automlSummary.primaryMetric,
                  primaryMetricLabel: automlSummary.primaryMetricLabel,
                  baselineMetric: automlSummary.baselineMetric,
                  baselineValue: automlSummary.baselineValue,
                  testCount: automlSummary.testCount,
                  cvFolds: automlSummary.cvFolds,
                }
              : {},
            explainability: automlSummary
              ? {
                  featureImportance: automlSummary.selectedModel?.featureImportance || [],
                }
              : {},
            report: {
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
            // For datasets uploaded through the server-side dataset store, the
            // backend loads the source directly by datasetId. This avoids sending
            // hundreds of thousands/millions of rows through the browser request.
            rawData: session.datasetId ? [] : rawRows,
            sampleData: rawRows.slice(0, 8),
          },
          history: messages.map((m) => ({
            role: m.sender,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: "assistant",
        text: data.response || data.reply || "No response generated.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    } catch (err) {
      console.warn("Generating grounded local fallback assistant response:", err);
      const fallbackReply = generateFallbackChatResponse(textToSend, session);
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: "assistant",
        text: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto h-[calc(100vh-6rem)] flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shadow-md shadow-purple-600/20">
            <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <span>DataMind AI Assistant</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                Grounded Knowledge
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Contextual query engine directly grounded in &apos;{fileName}&apos;</p>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {session.totalRows.toLocaleString()} rows{session.isSampled ? " • preview analyzed" : ""} &bull; {qualityReport.qualityScore}% quality
        </span>
      </div>

      {/* Message History Window */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 pt-2">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed space-y-1 relative group ${
                  isUser
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-md"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <div className="flex items-center justify-between pt-1 text-[10px] opacity-70">
                  <span>{msg.timestamp}</span>
                  {!isUser && (
                    <button
                      onClick={() => copyToClipboard(msg.text, msg.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 hover:text-white"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl text-slate-300 animate-pulse">
              DataMind AI is formulating analysis...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2">
        {promptSuggestions.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            disabled={isTyping}
            className="text-[11px] px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-indigo-500/50 hover:bg-slate-850 shrink-0 transition-all disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-2 pt-2 border-t border-slate-800"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your dataset, models, drivers, or business actions..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || isTyping}
          className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};

function generateFallbackChatResponse(query: string, session: DatasetSession): string {
  // Local emergency fallback for the rare case where the Assistant endpoint itself
  // cannot be reached. It intentionally uses the real uploaded rows and profiles,
  // so custom numerical questions still work without Gemini.
  const q = query.toLowerCase();
  const { fileName, rawRows, columns, columnProfiles, qualityReport, automlSummary } = session;
  const numericProfiles = columnProfiles.filter((p) => p.dataType === "numerical" || p.dataType === "binary");
  const findColumn = () => {
    const ordered = [...columns].sort((a, b) => b.length - a.length);
    return ordered.find((c) => q.includes(c.toLowerCase())) || numericProfiles.find((p) => q.includes(p.name.toLowerCase()))?.name;
  };
  const col = findColumn();
  const nums = col ? rawRows.map((r) => Number(r[col!])).filter(Number.isFinite) : [];
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : NaN;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });

  if (/column|field|attribute|schema/.test(q) && !col) {
    return `The dataset **${fileName}** has **${rawRows.length.toLocaleString()} rows** and **${columns.length} columns**.\n\nColumns: ${columns.map((c) => `**${c}**`).join(", ")}`;
  }
  if (/quality|issue|missing|duplicate|clean/.test(q)) {
    return `For **${fileName}**:\n- Quality score: **${qualityReport.qualityScore}%**\n- Missing cells: **${qualityReport.totalMissingCells}** (${qualityReport.missingRate}%)\n- Duplicate rows: **${qualityReport.duplicateRows}**\n- Flagged issues: **${qualityReport.issues.length}**`;
  }
  if (/importance|driver|predictive/.test(q)) {
    const top = automlSummary?.selectedModel?.featureImportance?.slice(0, 5) || [];
    return top.length ? top.map((f, i) => `${i + 1}. **${f.feature}** — ${f.importance}%`).join("\n") : "Feature importance is not available yet. Run AutoML first.";
  }
  if (/automl|model|target|prediction/.test(q)) {
    if (!automlSummary) return "AutoML has not been executed yet.";
    const m = automlSummary.selectedModel;
    return `Target: **${automlSummary.targetColumn}**\nModel: **${m.name}**\n${m.primaryMetric}: **${m.primaryMetricValue.toFixed(3)}**`;
  }
  if (/correlation|correlated/.test(q)) {
    const pairs = session.correlationMatrix || [];
    return pairs.length ? pairs.slice(0, 5).map((c) => `**${c.col1}** ↔ **${c.col2}**: r = ${c.correlation.toFixed(3)}`).join("\n") : "No computed correlation pairs are available.";
  }
  if (/average|mean|avg/.test(q) && col && nums.length) return `The average of **${col}** is **${fmt(nums.reduce((a, b) => a + b, 0) / nums.length)}** based on ${nums.length.toLocaleString()} numeric records.`;
  if (/minimum|min|lowest|smallest/.test(q) && col && nums.length) return `The minimum of **${col}** is **${fmt(Math.min(...nums))}**.`;
  if (/maximum|max|highest|largest/.test(q) && col && nums.length) return `The maximum of **${col}** is **${fmt(Math.max(...nums))}**.`;
  if (/median/.test(q) && col && nums.length) return `The median of **${col}** is **${fmt(median)}**.`;
  if (/sum|total/.test(q) && col && nums.length) return `The sum of **${col}** is **${fmt(nums.reduce((a, b) => a + b, 0))}.`;
  if (/standard deviation|std dev/.test(q) && col && nums.length) {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const std = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length);
    return `The standard deviation of **${col}** is **${fmt(std)}**.`;
  }
  if (/count|how many|number of/.test(q) && col) return `There are **${rawRows.filter((r) => r[col!] !== null && r[col!] !== undefined && String(r[col!]).trim() !== "").length.toLocaleString()}** non-empty values in **${col}**.`;

  if (col && nums.length) return `I could analyze **${col}** from the uploaded dataset, but the emergency fallback could not confidently identify the requested operation. Available numeric statistics include average, minimum, maximum, median, sum, count, and standard deviation.`;
  return `I could not confidently interpret that question in the emergency local fallback. The dataset **${fileName}** contains **${rawRows.length.toLocaleString()} rows** and **${columns.length} columns**. Available columns: ${columns.join(", ")}.`;
}
