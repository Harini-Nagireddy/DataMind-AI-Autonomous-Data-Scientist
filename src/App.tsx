import React, { useEffect, useState } from "react";
import { DatasetSession, ActiveTab, AIInsights, AutoMLSummary, ProblemDetection } from "./types";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { LandingPage } from "./components/LandingPage";
import { UploadSection } from "./components/UploadSection";
import { DatasetOverview } from "./components/DatasetOverview";
import { DataQualityView } from "./components/DataQualityView";
import { DataCleaningView } from "./components/DataCleaningView";
import { EDAView } from "./components/EDAView";
import { AutoMLView } from "./components/AutoMLView";
import { EvaluationView } from "./components/EvaluationView";
import { ExplainabilityView } from "./components/ExplainabilityView";
import { InsightsView } from "./components/InsightsView";
import { SmartDashboardView } from "./components/SmartDashboardView";
import { AssistantView } from "./components/AssistantView";
import { ReportView } from "./components/ReportView";
import { profileDataset } from "./utils/profiler";
import { parseCsvString, ParsedDataResult } from "./utils/parser";
import { SampleDatasetInfo } from "./utils/sampleData";
import { downloadHtmlReport } from "./utils/exportReport";
import { AuthPage, AuthUser } from "./components/AuthPage";

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState<DatasetSession | null>(null);
  const [currentTab, setCurrentTab] = useState<ActiveTab>("landing");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as AuthUser;
      })
      .then((user) => setAuthUser(user))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    setAuthUser(null);
    setSession(null);
    setCurrentTab("landing");
  };

  if (authChecking) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Loading DataMind...</div>;
  }

  if (!authUser) {
    return <AuthPage onAuthenticated={setAuthUser} />;
  }

  const initSessionFromParsed = async (parsed: ParsedDataResult, problemOverride?: Partial<ProblemDetection>) => {
    setIsProcessing(true);

    try {
      const { columnProfiles, qualityReport, correlationMatrix, problemDetection } = profileDataset(
        parsed.columns,
        parsed.rows
      );

      const finalProblemDetection: ProblemDetection = problemOverride
        ? { ...problemDetection, ...problemOverride, isOverride: true }
        : problemDetection;

      const newSession: DatasetSession = {
        id: `session-${Date.now()}`,
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        totalRows: parsed.totalRows,
        isSampled: parsed.isSampled,
        datasetId: parsed.datasetId,
        sourceFile: parsed.sourceFile,
        uploadedAt: new Date().toISOString(),
        rawRows: parsed.rows,
        columns: parsed.columns,
        columnProfiles,
        qualityReport,
        correlationMatrix,
        problemDetection: finalProblemDetection,
        cleanedRows: parsed.rows.map((r) => ({ ...r })),
        cleanedColumns: [...parsed.columns],
        cleaningLogs: [],
      };

      setSession(newSession);
      setCurrentTab("overview");

      // Uploaded datasets use the backend's generic target detector as the
      // source of truth. The local profiler remains an immediate fallback.
      if (!problemOverride) {
        try {
          const recommendationResponse = await fetch("/api/ml/recommend-target", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              datasetId: parsed.datasetId || undefined,
              rows: parsed.datasetId ? [] : parsed.rows.slice(0, 150_000),
              columnProfiles,
              randomState: 42,
            }),
          });

          if (recommendationResponse.ok) {
            const recommendation = await recommendationResponse.json();
            if (recommendation?.recommendedTarget && recommendation?.taskType) {
              setSession((current) => {
                if (!current) return current;
                return {
                  ...current,
                  problemDetection: {
                    hasTarget: true,
                    targetColumn: recommendation.recommendedTarget,
                    taskType: recommendation.taskType,
                    confidence: recommendation.confidence === "high" ? 95 : recommendation.confidence === "medium" ? 75 : 50,
                    reason: recommendation.message || "Target detected automatically from dataset structure.",
                    candidateTargets: Array.isArray(recommendation.candidates)
                      ? recommendation.candidates
                          .filter((c: any) => c?.taskType === "classification" || c?.taskType === "regression")
                          .map((c: any) => ({
                            column: String(c.column),
                            taskType: c.taskType,
                            reason: Array.isArray(c.reasons) && c.reasons.length ? c.reasons.join("; ") : "Candidate identified from column structure.",
                            score: Number(c.score || 0),
                          }))
                      : [],
                    isOverride: true,
                  },
                };
              });
            }
          }
        } catch (recommendationError) {
          console.warn("Generic target recommendation unavailable; keeping local profiling result.", recommendationError);
        }
      }

      setIsProcessing(false);
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      alert(`Error profiling dataset: ${err.message}`);
    }
  };

  const handleLoadSample = (sample: SampleDatasetInfo) => {
    setIsProcessing(true);
    try {
      const parsed = parseCsvString(sample.csvData, sample.fileName);
      initSessionFromParsed(parsed, {
      hasTarget: true,
      targetColumn: sample.recommendedTarget,
      taskType: sample.taskType,
      confidence: 100,
      reason: `Sample dataset configured for ${sample.taskType} using '${sample.recommendedTarget}' as the demonstration target.`,
      candidateTargets: [{
        column: sample.recommendedTarget,
        taskType: sample.taskType,
        reason: `Recommended demonstration target for this sample dataset.`,
        score: 100,
      }],
    });
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      alert(`Error loading sample: ${err.message}`);
    }
  };

  const handleUpdateCleanedData = (
    cleanedRows: Record<string, any>[],
    cleanedColumns: string[],
    newLogs: any[],
    newProfiles: any[],
    newQualityReport: any
  ) => {
    if (!session) return;
    setSession({
      ...session,
      cleanedRows,
      cleanedColumns,
      cleaningLogs: newLogs,
      columnProfiles: newProfiles,
      qualityReport: newQualityReport,
    });
  };

  const handleUpdateAutoML = (automlSummary: AutoMLSummary) => {
    if (!session) return;
    setSession({
      ...session,
      automlSummary,
    });
  };

  const handleUpdateInsights = (aiInsights: AIInsights) => {
    if (!session) return;
    setSession({
      ...session,
      aiInsights,
    });
  };

  const handleNewSession = () => {
    setCurrentTab("upload");
  };

  const handleExportReport = () => {
    if (session) {
      setCurrentTab("report");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Header */}
      <Header
        currentTab={currentTab}
        session={session}
        onNewSession={handleNewSession}
        onExportReport={handleExportReport}
        onTabChange={setCurrentTab}
        authUser={authUser}
        onLogout={handleLogout}
      />

      {/* Main Body with Sidebar and Content View */}
      <div className="flex-1 flex flex-row w-full">
        {/* Persistent Workflow Sidebar */}
        <Sidebar
          currentTab={currentTab}
          session={session}
          onTabChange={setCurrentTab}
        />

        {/* Dynamic View Canvas */}
        <main className="flex-1 overflow-y-auto min-h-[calc(100vh-4rem)]">
          {currentTab === "landing" && (
            <LandingPage
              onStartUpload={() => setCurrentTab("upload")}
              onLoadSample={handleLoadSample}
            />
          )}

          {currentTab === "upload" && (
            <UploadSection
              onDatasetParsed={initSessionFromParsed}
              onLoadSample={handleLoadSample}
              isProcessing={isProcessing}
            />
          )}

          {session && currentTab === "overview" && (
            <DatasetOverview
              session={session}
              onNavigateNext={() => setCurrentTab("quality")}
            />
          )}

          {session && currentTab === "quality" && (
            <DataQualityView
              session={session}
              onNavigateToCleaning={() => setCurrentTab("cleaning")}
            />
          )}

          {session && currentTab === "cleaning" && (
            <DataCleaningView
              session={session}
              onUpdateCleanedData={handleUpdateCleanedData}
              onNavigateNext={() => setCurrentTab("eda")}
            />
          )}

          {session && currentTab === "eda" && (
            <EDAView
              session={session}
              onNavigateNext={() => setCurrentTab("automl")}
            />
          )}

          {session && currentTab === "automl" && (
            <AutoMLView
              session={session}
              onUpdateAutoML={handleUpdateAutoML}
              onNavigateToEvaluation={() => setCurrentTab("evaluation")}
            />
          )}

          {session && currentTab === "evaluation" && (
            <EvaluationView
              session={session}
              onNavigateToExplainability={() => setCurrentTab("explainability")}
            />
          )}

          {session && currentTab === "explainability" && (
            <ExplainabilityView
              session={session}
              onNavigateToInsights={() => setCurrentTab("insights")}
            />
          )}

          {session && currentTab === "insights" && (
            <InsightsView
              session={session}
              onUpdateInsights={handleUpdateInsights}
              onNavigateNext={() => setCurrentTab("dashboard")}
            />
          )}

          {session && currentTab === "dashboard" && (
            <SmartDashboardView
              session={session}
              onNavigateToAssistant={() => setCurrentTab("assistant")}
            />
          )}

          {session && currentTab === "assistant" && (
            <AssistantView session={session} />
          )}

          {session && currentTab === "report" && (
            <ReportView session={session} />
          )}
        </main>
      </div>
    </div>
  );
}
