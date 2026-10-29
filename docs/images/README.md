# DataMind AI — Visual Assets & Screenshot Gallery

This directory stores verified visual assets and screenshots showcasing DataMind AI's key interface views.

## Recommended Screenshot Checklist

For recruitment portfolios, presentation slides, and campus placement evaluations, capture clean screenshots (1920x1080 or high-DPI window capture) using standard demo data (e.g., California Housing or Breast Cancer datasets) without private credentials or sensitive personal information:

| Filename | View | Key Highlights to Show |
|---|---|---|
| `dashboard.png` | **Smart Dashboard** | KPI summary cards, automated trend charts, categorical distributions |
| `data-quality.png` | **Data Quality Assessment** | Health score meter, missing value detection, duplicate alerts, column health |
| `data-cleaning.png` | **Data Cleaning Audit** | Cleaning configuration panel, audit log with before/after row & column counts |
| `eda-analysis.png` | **Exploratory Data Analysis** | Distribution histograms, interactive scatter plots, Pearson correlation heatmap |
| `automl-leaderboard.png` | **AutoML Engine** | Model comparison leaderboard, cross-validation metrics, best model selection badge |
| `model-evaluation.png` | **Model Evaluation** | Confusion matrix, ROC curve, classification or regression metric breakdowns |
| `model-explainability.png` | **Model Explainability** | Feature importance ranking (model-native and permutation importance) |
| `ai-insights.png` | **AI Insights & Assistant** | Gemini-powered executive summary, business implications, conversational Q&A |

## How to Capture

1. Start the application locally:
   ```powershell
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser.
3. Sign up or log in using local test credentials.
4. Load a sample dataset or upload a standard benchmarking dataset (e.g. from Kaggle/UCI).
5. Capture each tab using Windows Snipping Tool (`Win + Shift + S`) or browser full-element capture.
6. Save images as PNG files in this directory (`docs/images/<filename>.png`).
