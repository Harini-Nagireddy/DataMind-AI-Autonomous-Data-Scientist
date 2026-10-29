/// <reference types="vite/client" />

import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error?.message || "Unexpected application error." }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("DataMind UI error:", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#020617",color:"#e2e8f0",padding:24,fontFamily:"system-ui"}}>
      <div style={{maxWidth:620,width:"100%",padding:28,border:"1px solid #334155",borderRadius:16,background:"#0f172a"}}>
        <h1 style={{fontSize:22,fontWeight:700,marginBottom:10}}>DataMind could not render this page</h1>
        <p style={{color:"#94a3b8",marginBottom:16}}>The application recovered the error instead of showing a blank screen. Your dataset source is not deleted.</p>
        <pre style={{whiteSpace:"pre-wrap",fontSize:12,color:"#fca5a5",background:"#020617",padding:12,borderRadius:10,marginBottom:18}}>{this.state.message}</pre>
        <button onClick={() => window.location.reload()} style={{padding:"10px 16px",borderRadius:10,background:"#4f46e5",color:"white",fontWeight:600,border:0,cursor:"pointer"}}>Reload DataMind</button>
      </div>
    </div>;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>
);
