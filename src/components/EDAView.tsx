import React, { useEffect, useMemo, useState } from "react";
import { DatasetSession } from "../types";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { BarChart2, TrendingUp, PieChart, ScatterChart as ScatterIcon, Grid, ArrowRight, Layers, AlertCircle } from "lucide-react";

interface EDAViewProps { session: DatasetSession; onNavigateNext: () => void; }
type ChartType = "histogram" | "bar" | "scatter" | "line" | "box" | "correlation";

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center">
    <div className="space-y-2">
      <AlertCircle className="w-7 h-7 text-slate-500 mx-auto" />
      <p className="text-xs text-slate-400">{message}</p>
    </div>
  </div>
);

export const EDAView: React.FC<EDAViewProps> = ({ session, onNavigateNext }) => {
  const { cleanedRows = [], columnProfiles = [], correlationMatrix = [] } = session;
  const numCols = useMemo(() => columnProfiles.filter(c => (c.dataType === "numerical" || c.dataType === "binary") && !c.isPossibleId).map(c => c.name), [columnProfiles]);
  const catCols = useMemo(() => columnProfiles.filter(c => c.dataType === "categorical" || c.dataType === "boolean").map(c => c.name), [columnProfiles]);
  const dateCols = useMemo(() => columnProfiles.filter(c => c.dataType === "datetime").map(c => c.name), [columnProfiles]);
  const anyCols = columnProfiles.map(c => c.name);

  const [chartType, setChartType] = useState<ChartType>("histogram");
  const [xAxisCol, setXAxisCol] = useState("");
  const [yAxisCol, setYAxisCol] = useState("");
  const [groupByCol, setGroupByCol] = useState("");

  // Each visualization gets only the column types that make sense for it.
  // Most importantly, X and Y are kept different whenever a chart has both axes.
  const xOptions = useMemo(() => {
    if (chartType === "histogram") return numCols;
    if (chartType === "bar" || chartType === "box") return catCols;
    if (chartType === "scatter") return numCols;
    if (chartType === "line") {
      // Prefer time/category dimensions for trends, while still allowing a
      // numeric dimension when the dataset does not contain a temporal field.
      const ordered = [...dateCols, ...catCols, ...numCols];
      return [...new Set(ordered)];
    }
    return anyCols;
  }, [chartType, numCols, catCols, dateCols, anyCols]);

  const yOptions = useMemo(() => {
    if (chartType !== "scatter" && chartType !== "line" && chartType !== "box") {
      return numCols;
    }
    // Never offer the selected X column as a Y metric.
    return numCols.filter(c => c !== xAxisCol);
  }, [chartType, numCols, xAxisCol]);

  useEffect(() => {
    const preferredX =
      chartType === "histogram"
        ? numCols[0] || ""
        : chartType === "bar" || chartType === "box"
          ? catCols[0] || ""
          : chartType === "scatter"
            ? numCols[0] || ""
            : chartType === "line"
              ? dateCols[0] || catCols[0] || numCols[0] || ""
              : anyCols[0] || "";

    if (!xOptions.includes(xAxisCol)) {
      setXAxisCol(preferredX);
    }

    const currentX = xOptions.includes(xAxisCol) ? xAxisCol : preferredX;
    const validYOptions = numCols.filter(c => c !== currentX);

    if (
      (chartType === "scatter" || chartType === "line" || chartType === "box") &&
      (!validYOptions.includes(yAxisCol) || yAxisCol === currentX)
    ) {
      setYAxisCol(validYOptions[0] || "");
    } else if (chartType !== "scatter" && chartType !== "line" && chartType !== "box") {
      if (!yAxisCol || !numCols.includes(yAxisCol)) {
        setYAxisCol(numCols[0] || "");
      }
    }

    if (groupByCol && !catCols.includes(groupByCol)) setGroupByCol("");
  }, [
    chartType,
    xAxisCol,
    yAxisCol,
    groupByCol,
    xOptions,
    numCols,
    catCols,
    dateCols,
    anyCols
  ]);

  // Guard against a transient state where X and Y become identical.
  // This applies to every two-axis representation, not just scatter plots.
  useEffect(() => {
    if (chartType !== "scatter" && chartType !== "line" && chartType !== "box") return;
    if (xAxisCol && yAxisCol && xAxisCol === yAxisCol) {
      const replacement = numCols.find(c => c !== xAxisCol) || "";
      if (replacement !== yAxisCol) setYAxisCol(replacement);
    }
  }, [chartType, xAxisCol, yAxisCol, numCols]);

  const effectiveX =
    chartType === "histogram"
      ? (numCols.includes(xAxisCol) ? xAxisCol : numCols[0] || "")
      : xAxisCol;

  const effectiveBarX = catCols.includes(xAxisCol) ? xAxisCol : catCols[0] || "";

  const effectiveY =
    numCols.includes(yAxisCol) && yAxisCol !== xAxisCol
      ? yAxisCol
      : numCols.find(c => c !== xAxisCol) || "";

  const histogramData = useMemo(() => {
    if (!effectiveX || !cleanedRows.length) return [];
    const vals = cleanedRows.map(r => Number(r[effectiveX])).filter(Number.isFinite);
    if (!vals.length) return [];
    const min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) return [{ bin: String(min), count: vals.length }];
    const bins = 10, step = (max - min) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({ bin: `${(min + i * step).toFixed(1)} - ${(min + (i + 1) * step).toFixed(1)}`, count: 0 }));
    vals.forEach(v => out[Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step)))].count++);
    return out;
  }, [effectiveX, cleanedRows]);

  const categoricalBarData = useMemo(() => {
    if (!effectiveBarX || !cleanedRows.length) return [];
    const counts = new Map<string, number>();
    cleanedRows.forEach(r => { const k = String(r[effectiveBarX] ?? "Missing"); counts.set(k, (counts.get(k) || 0) + 1); });
    return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,15).map(([name,count]) => ({ name, count, percentage: Number((count/cleanedRows.length*100).toFixed(1)) }));
  }, [effectiveBarX, cleanedRows]);

  const scatterData = useMemo(() => {
    if (!xAxisCol || !effectiveY || !cleanedRows.length || !numCols.includes(xAxisCol)) return [];
    return cleanedRows.map((r,i) => ({ id:i, x:Number(r[xAxisCol]), y:Number(r[effectiveY]), group:groupByCol ? String(r[groupByCol] ?? "Missing") : undefined }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0,500);
  }, [xAxisCol, effectiveY, groupByCol, cleanedRows, numCols.join("|")]);

  const lineData = useMemo(() => {
    const x = xAxisCol || dateCols[0] || catCols[0] || "";
    if (!x || !effectiveY || !cleanedRows.length) return [];
    const map = new Map<string,{sum:number;count:number}>();
    cleanedRows.forEach(r => { const xv=String(r[x] ?? ""); const y=Number(r[effectiveY]); if(xv && Number.isFinite(y)){const c=map.get(xv)||{sum:0,count:0}; map.set(xv,{sum:c.sum+y,count:c.count+1});} });
    return [...map.entries()].slice(0,50).map(([xv,s]) => ({x:xv,y:Number((s.sum/s.count).toFixed(2)),count:s.count}));
  }, [xAxisCol, dateCols.join("|"), catCols.join("|"), effectiveY, cleanedRows]);

  const boxPlotData = useMemo(() => {
    const group = catCols.includes(xAxisCol) ? xAxisCol : catCols[0] || "";
    if (!group || !effectiveY || !cleanedRows.length) return [];
    const groups = new Map<string,number[]>();
    cleanedRows.forEach(r=>{const g=String(r[group]??"Missing"),v=Number(r[effectiveY]); if(Number.isFinite(v)){const a=groups.get(g)||[];a.push(v);groups.set(g,a);}});
    const q=(a:number[],p:number)=>a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))];
    return [...groups.entries()].slice(0,8).map(([name,vals])=>{vals.sort((a,b)=>a-b);return {name,min:vals[0],q1:q(vals,.25),median:q(vals,.5),q3:q(vals,.75),max:vals[vals.length-1],count:vals.length};});
  }, [xAxisCol, effectiveY, catCols.join("|"), cleanedRows]);

  const chartTitle = chartType === "histogram" ? `Distribution of '${effectiveX || "numeric feature"}'` : chartType === "bar" ? `Categorical Counts: '${effectiveBarX || "category"}'` : chartType === "scatter" ? `Scatter Plot: '${xAxisCol || "X"}' vs '${effectiveY || "Y"}'` : chartType === "line" ? `Aggregated Trend: '${effectiveY || "metric"}'` : chartType === "box" ? `Group Distribution: '${effectiveY || "metric"}'` : "Pairwise Pearson Correlation Matrix";

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-white">Dynamic Exploratory Data Analysis</h1><span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">Adaptive EDA</span></div><p className="text-xs text-slate-400 mt-1">Visualizations automatically adapt to the columns available in the uploaded dataset.</p></div>
        <button onClick={onNavigateNext} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"><span>Proceed to AutoML</span><ArrowRight className="w-4 h-4"/></button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          {[{id:"histogram",label:"Distribution Histogram",icon:BarChart2},{id:"bar",label:"Categorical Frequencies",icon:PieChart},{id:"scatter",label:"Scatter Relationship",icon:ScatterIcon},{id:"line",label:"Trend Line",icon:TrendingUp},{id:"box",label:"Group Comparison",icon:Layers},{id:"correlation",label:"Correlation Matrix",icon:Grid}].map(t=>{const Icon=t.icon;return <button key={t.id} onClick={()=>setChartType(t.id as ChartType)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${chartType===t.id?"bg-indigo-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700"}`}><Icon className="w-3.5 h-3.5"/><span>{t.label}</span></button>})}
        </div>
        {chartType !== "correlation" && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div><label className="block text-slate-400 font-semibold mb-1">{chartType==="histogram"?"Numerical Feature (X)":chartType==="box"?"Group Category (X)":"Primary Dimension (X-Axis)"}</label><select value={xAxisCol} onChange={e=>{
            const nextX = e.target.value;
            setXAxisCol(nextX);
            if ((chartType==="scatter"||chartType==="line"||chartType==="box") && yAxisCol === nextX) {
              setYAxisCol(numCols.find(c => c !== nextX) || "");
            }
          }} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">{xOptions.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          {(chartType==="scatter"||chartType==="line"||chartType==="box") && <div><label className="block text-slate-400 font-semibold mb-1">Target Metric (Y-Axis)</label><select value={yAxisCol} onChange={e=>setYAxisCol(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">{yOptions.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          {chartType==="scatter" && <div><label className="block text-slate-400 font-semibold mb-1">Color / Group (Optional)</label><select value={groupByCol} onChange={e=>setGroupByCol(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"><option value="">None</option>{catCols.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
        </div>}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-100 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-cyan-400"/>{chartTitle}</h2><span className="text-xs text-slate-400 font-mono">{cleanedRows.length} active samples</span></div>
        <div className="h-80 w-full pt-4">
          {chartType === "histogram" && (histogramData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={histogramData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="bin" fontSize={10}/><YAxis fontSize={11}/><Tooltip/><Bar dataKey="count" fill="#6366f1">{histogramData.map((_,i)=><Cell key={i} fill={i%2?"#4f46e5":"#6366f1"}/>)}</Bar></BarChart></ResponsiveContainer> : <EmptyChart message={numCols.length ? "Choose a numeric column to display a distribution." : "This dataset has no numeric feature suitable for a histogram."}/>) }
          {chartType === "bar" && (categoricalBarData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={categoricalBarData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" fontSize={10}/><YAxis fontSize={11}/><Tooltip/><Bar dataKey="count" fill="#06b6d4"/></BarChart></ResponsiveContainer> : <EmptyChart message={catCols.length ? "No categorical values are available for this chart." : "This dataset has no categorical feature suitable for a frequency chart."}/>) }
          {chartType === "scatter" && (numCols.length < 2 ? <EmptyChart message="At least two distinct numeric features are required for a scatter plot."/> : scatterData.length ? <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="x" name={xAxisCol}/><YAxis type="number" dataKey="y" name={effectiveY}/><Tooltip/><Scatter data={scatterData} fill="#38bdf8"/></ScatterChart></ResponsiveContainer> : <EmptyChart message="Select two different numeric features for a scatter plot."/>) }
          {chartType === "line" && (lineData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={lineData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="x" fontSize={10}/><YAxis fontSize={11}/><Tooltip/><Line type="monotone" dataKey="y" stroke="#8b5cf6" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer> : <EmptyChart message={numCols.length>=2 ? "Select a dimension and a different numeric metric to build a trend." : "At least one numeric metric is required for a trend chart."}/>) }
          {chartType === "box" && (boxPlotData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={boxPlotData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" fontSize={10}/><YAxis fontSize={11}/><Tooltip/><Bar dataKey="median" fill="#6366f1"/><Bar dataKey="q3" fill="#06b6d4"/></BarChart></ResponsiveContainer> : <EmptyChart message={catCols.length && numCols.length ? "Select a categorical group and numeric metric." : "A categorical feature and numeric feature are required for group comparison."}/>) }
          {chartType === "correlation" && (correlationMatrix.length ? <div className="h-full overflow-auto"><table className="w-full text-xs text-slate-200"><thead><tr><th className="p-2 text-left">Feature 1</th><th className="p-2 text-left">Feature 2</th><th className="p-2">Pearson r</th></tr></thead><tbody className="divide-y divide-slate-800/60">{correlationMatrix.filter(c=>c.col1!==c.col2).slice(0,30).map((c,i)=><tr key={`${c.col1}-${c.col2}-${i}`}><td className="p-2">{c.col1}</td><td className="p-2">{c.col2}</td><td className="p-2 text-center font-mono">{c.correlation.toFixed(3)}</td></tr>)}</tbody></table></div> : <EmptyChart message="At least two usable numeric columns are required for correlation analysis."/>)}
        </div>
      </div>
    </div>
  );
};
