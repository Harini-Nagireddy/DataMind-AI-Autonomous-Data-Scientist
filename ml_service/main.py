from __future__ import annotations

import time
from typing import Any
from pathlib import Path
import os
import re

import numpy as np
import pandas as pd

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, SGDClassifier, SGDRegressor
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_curve,
)
from sklearn.model_selection import (
    train_test_split,
    StratifiedKFold,
    KFold,
    cross_val_score,
)
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
    AdaBoostClassifier,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    AdaBoostRegressor,
)


app = FastAPI(
    title="DataMind AI ML Service",
    version="1.2.0",
)

# Resource-safety limits for browser-uploaded datasets.
# High-cardinality one-hot encoding can otherwise create enormous dense
# matrices and exhaust the Python process memory.
MAX_CATEGORIES_PER_COLUMN = 100
MIN_CATEGORY_FREQUENCY = 2
IMPORTANCE_SAMPLE_SIZE = 160


# ============================================================
# REQUEST MODEL
# ============================================================

class AutoMLRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    targetCol: str
    taskType: str
    columnProfiles: list[dict[str, Any]] = Field(default_factory=list)

    testSize: float = 0.2
    cvFolds: int = 5
    randomState: int = 42
    datasetPath: str | None = None
    sourceFileName: str | None = None
    sourceFileSize: int | None = None
    primaryMetric: str | None = None


# ============================================================
# SAFE HELPERS
# ============================================================

def safe_number(value: Any) -> float | None:
    try:
        x = float(value)

        if np.isfinite(x):
            return x

        return None

    except Exception:
        return None


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generic dataset cleaning and type normalization.

    Handles:
    - empty strings
    - whitespace
    - inf / -inf
    - duplicate column names
    - completely empty columns
    - currency-formatted numeric values
    - comma-formatted numbers
    - percentage-formatted numbers
    - accounting-style negative numbers
    - numeric values stored as strings
    """

    df = df.copy()

    # --------------------------------------------------------
    # 1. Normalize column names
    # --------------------------------------------------------
    df.columns = [
        str(col).strip()
        for col in df.columns
    ]

    # --------------------------------------------------------
    # 2. Make duplicate column names unique
    # --------------------------------------------------------
    seen = {}
    new_columns = []

    for col in df.columns:
        if col not in seen:
            seen[col] = 0
            new_columns.append(col)
        else:
            seen[col] += 1
            new_columns.append(
                f"{col}_{seen[col]}"
            )

    df.columns = new_columns

    # --------------------------------------------------------
    # 3. Replace empty strings / whitespace with NaN
    # --------------------------------------------------------
    df = df.replace(
        r"^\s*$",
        np.nan,
        regex=True,
    )

    # --------------------------------------------------------
    # 4. Normalize numeric-looking text
    #
    # Examples:
    # "$-424.65"   -> -424.65
    # "$1,250.50"  -> 1250.50
    # "₹45,000"    -> 45000
    # "1,234.50"   -> 1234.50
    # "(250.00)"   -> -250.00
    # "25.5%"      -> 25.5
    # --------------------------------------------------------
    def convert_numeric_like(series: pd.Series) -> pd.Series:

        if pd.api.types.is_numeric_dtype(series):
            return series

        original = series.copy()

        text = (
            series.astype("string")
            .str.strip()
        )

        # Accounting negatives:
        # (123.45) -> -123.45
        accounting_negative = (
            text.str.match(
                r"^\s*\(.*\)\s*$",
                na=False,
            )
        )

        text = (
            text
            .str.replace(
                r"^\s*\(",
                "-",
                regex=True,
            )
            .str.replace(
                r"\)\s*$",
                "",
                regex=True,
            )
        )

        # Remove common currency symbols.
        text = text.str.replace(
            r"[$€£₹¥]",
            "",
            regex=True,
        )

        # Remove thousands separators.
        text = text.str.replace(
            ",",
            "",
            regex=False,
        )

        # Remove percentage symbol.
        text = text.str.replace(
            "%",
            "",
            regex=False,
        )

        # Remove surrounding spaces.
        text = text.str.strip()

        converted = pd.to_numeric(
            text,
            errors="coerce",
        )

        # Only convert the column if a strong majority of
        # non-null values are genuinely numeric-looking.
        original_non_null = original.notna().sum()

        if original_non_null == 0:
            return original

        valid_numeric = converted.notna().sum()

        numeric_ratio = (
            valid_numeric / original_non_null
        )

        if numeric_ratio >= 0.90:
            return converted

        return original

    # Apply generic numeric detection to object/string columns.
    for col in df.columns:

        if (
            pd.api.types.is_object_dtype(df[col])
            or pd.api.types.is_string_dtype(df[col])
        ):
            df[col] = convert_numeric_like(
                df[col]
            )

    # --------------------------------------------------------
    # 5. Replace infinities
    # --------------------------------------------------------
    df = df.replace(
        [np.inf, -np.inf],
        np.nan,
    )

    # --------------------------------------------------------
    # 6. Remove completely empty columns
    # --------------------------------------------------------
    empty_columns = [
        col
        for col in df.columns
        if df[col].notna().sum() == 0
    ]

    if empty_columns:
        df = df.drop(
            columns=empty_columns
        )

    return df


# ============================================================
# COLUMN PROFILING
# ============================================================

def profile_columns(
    df: pd.DataFrame,
    target: str,
    supplied: list[dict[str, Any]],
):

    supplied_map = {
        str(p.get("name")): p
        for p in supplied
        if p.get("name")
    }

    numeric: list[str] = []
    categorical: list[str] = []
    excluded: list[str] = []

    for col in df.columns:

        if col == target:
            continue

        p = supplied_map.get(
            str(col),
            {},
        )

        is_id = (
            bool(p.get("isPossibleId", False))
            or p.get("dataType") == "id"
        )

        is_constant = bool(
            p.get("isConstant", False)
        )

        # Detect constant columns ourselves too.
        unique_count = df[col].nunique(
            dropna=True
        )

        if unique_count <= 1:
            is_constant = True

        if is_id or is_constant:
            excluded.append(col)
            continue

        dtype = p.get("dataType")

        if dtype in {
            "numerical",
            "binary",
        }:
            numeric.append(col)

        elif dtype in {
            "categorical",
            "boolean",
            "datetime",
        }:
            categorical.append(col)

        elif pd.api.types.is_numeric_dtype(
            df[col]
        ):
            numeric.append(col)

        else:
            categorical.append(col)

    return (
        numeric,
        categorical,
        excluded,
    )


# ============================================================
# PREPROCESSOR
# ============================================================

def make_preprocessor(
    numeric: list[str],
    categorical: list[str],
):

    transformers = []

    if numeric:

        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        (
                            "imputer",
                            SimpleImputer(
                                strategy="median"
                            ),
                        ),
                        (
                            "scaler",
                            StandardScaler(),
                        ),
                    ]
                ),
                numeric,
            )
        )

    if categorical:

        # Compatible with different sklearn versions.
        try:

            encoder = OneHotEncoder(
                handle_unknown="infrequent_if_exist",
                min_frequency=MIN_CATEGORY_FREQUENCY,
                max_categories=MAX_CATEGORIES_PER_COLUMN,
                sparse_output=True,
            )

        except TypeError:

            encoder = OneHotEncoder(
                handle_unknown="infrequent_if_exist",
                min_frequency=MIN_CATEGORY_FREQUENCY,
                max_categories=MAX_CATEGORIES_PER_COLUMN,
                sparse=True,
            )

        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        (
                            "imputer",
                            SimpleImputer(
                                strategy="most_frequent"
                            ),
                        ),
                        (
                            "onehot",
                            encoder,
                        ),
                    ]
                ),
                categorical,
            )
        )

    if not transformers:
        raise ValueError(
            "No usable predictor columns remain."
        )

    return ColumnTransformer(
        transformers=transformers,
        remainder="drop",
        verbose_feature_names_out=False,
    )


# ============================================================
# FEATURE NAMES
# ============================================================

def feature_names_from_pipeline(
    pipe: Pipeline,
) -> list[str]:

    try:

        pre = pipe.named_steps[
            "preprocess"
        ]

        return [
            str(x)
            for x in pre.get_feature_names_out()
        ]

    except Exception:

        return []


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

def normalized_importance(
    pipe: Pipeline,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    scoring: str,
):

    names = feature_names_from_pipeline(
        pipe
    )

    model = pipe.named_steps["model"]

    raw = None

    if hasattr(
        model,
        "feature_importances_",
    ):

        raw = np.asarray(
            model.feature_importances_,
            dtype=float,
        )

    elif hasattr(
        model,
        "coef_",
    ):

        coef = np.asarray(
            model.coef_,
            dtype=float,
        )

        if coef.ndim > 1:
            raw = np.mean(
                np.abs(coef),
                axis=0,
            )
        else:
            raw = np.abs(coef)

    if (
        raw is None
        or len(raw) != len(names)
    ):

        sample_n = min(
            len(X_test),
            160,
        )

        if sample_n == 0:
            return []

        sample = X_test.iloc[
            :sample_n
        ]

        ys = y_test.iloc[
            :sample_n
        ]

        try:

            perm = permutation_importance(
                pipe,
                sample,
                ys,
                n_repeats=3,
                random_state=42,
                scoring=scoring,
            )

            raw = np.maximum(
                perm.importances_mean,
                0,
            )

        except Exception:
            return []

    if raw is None:
        return []

    total = float(
        np.sum(
            np.maximum(raw, 0)
        )
    ) or 1.0

    order = np.argsort(raw)[::-1][
        :20
    ]

    return [
        {
            "feature": (
                names[i]
                if i < len(names)
                else f"feature_{i}"
            ),
            "importance": round(
                float(
                    max(
                        raw[i],
                        0,
                    )
                    / total
                    * 100
                ),
                2,
            ),
            "direction": "positive",
        }
        for i in order
        if float(raw[i]) >= 0
    ]


# ============================================================
# MODEL DEFINITIONS
# ============================================================

def build_models(task: str, random_state: int, large_mode: bool = False, include_gaussian_nb: bool = True, source_rows: int = 0):
    # Large datasets use smaller ensembles/depth to keep AutoML responsive
    # while preserving the same model families.
    trees = 40 if large_mode else 120
    max_depth = 8 if large_mode else 10
    boosting_estimators = 40 if large_mode else 120

    if task == "classification":
        # The core pool is deliberately sparse-matrix compatible so categorical
        # one-hot encoding remains memory-safe on wide datasets.
        models = [
            ("Logistic Regression", "scikit-learn LogisticRegression", LogisticRegression(max_iter=500, solver="lbfgs", random_state=random_state)),
            ("SGD Classifier", "scikit-learn SGDClassifier", SGDClassifier(loss="log_loss", max_iter=1000, tol=1e-3, random_state=random_state)),
            ("Decision Tree", "scikit-learn DecisionTreeClassifier", DecisionTreeClassifier(max_depth=max_depth, min_samples_leaf=3, random_state=random_state)),
            ("Random Forest", "scikit-learn RandomForestClassifier", RandomForestClassifier(n_estimators=trees, max_depth=max_depth, min_samples_leaf=2, n_jobs=-1, random_state=random_state)),
            ("Extra Trees", "scikit-learn ExtraTreesClassifier", ExtraTreesClassifier(n_estimators=trees, max_depth=max_depth, min_samples_leaf=2, n_jobs=-1, random_state=random_state)),
            ("AdaBoost", "scikit-learn AdaBoostClassifier", AdaBoostClassifier(n_estimators=boosting_estimators, learning_rate=0.08, random_state=random_state)),
            ("Linear SVM", "scikit-learn LinearSVC", __import__("sklearn.svm", fromlist=["LinearSVC"]).LinearSVC(C=1.0, random_state=random_state, dual="auto")),
        ]
        if source_rows < 100_000 and include_gaussian_nb:
            models.append(("Gaussian Naive Bayes", "scikit-learn GaussianNB", GaussianNB()))
        if source_rows < 100_000:
            models.append(("K-Nearest Neighbors", "scikit-learn KNeighborsClassifier", KNeighborsClassifier(n_neighbors=7, weights="distance", n_jobs=-1)))
        return models

    models = [
        ("Linear Regression", "scikit-learn LinearRegression", LinearRegression()),
        ("Ridge Regression", "scikit-learn Ridge", Ridge(alpha=1.0)),
        ("SGD Regressor", "scikit-learn SGDRegressor", SGDRegressor(max_iter=1000, tol=1e-3, random_state=random_state)),
        ("Decision Tree Regressor", "scikit-learn DecisionTreeRegressor", DecisionTreeRegressor(max_depth=max_depth, min_samples_leaf=3, random_state=random_state)),
        ("Random Forest Regressor", "scikit-learn RandomForestRegressor", RandomForestRegressor(n_estimators=trees, max_depth=max_depth, min_samples_leaf=2, n_jobs=-1, random_state=random_state)),
        ("Extra Trees Regressor", "scikit-learn ExtraTreesRegressor", ExtraTreesRegressor(n_estimators=trees, max_depth=max_depth, min_samples_leaf=2, n_jobs=-1, random_state=random_state)),
        ("AdaBoost Regressor", "scikit-learn AdaBoostRegressor", AdaBoostRegressor(n_estimators=boosting_estimators, learning_rate=0.08, random_state=random_state)),
    ]
    if source_rows < 100_000:
        models.append(("KNN Regressor", "scikit-learn KNeighborsRegressor", KNeighborsRegressor(n_neighbors=7, weights="distance", n_jobs=-1)))
    return models


def load_source_sample(req: AutoMLRequest) -> tuple[pd.DataFrame, int, bool]:
    """Read the server-side source in chunks, drop empty rows there, and keep a bounded sample."""
    if not req.datasetPath:
        df = pd.DataFrame(req.rows)
        df = df.replace(r"^\s*$", np.nan, regex=True).dropna(how="all")
        return df, len(df), False

    path = Path(req.datasetPath).resolve()
    if not path.exists() or not path.is_file():
        raise ValueError("The stored dataset source is no longer available. Please upload the dataset again.")

    # CSV is the scalable large-file path. Semicolon-delimited CSV is auto-detected.
    if path.suffix.lower() == ".csv" or path.suffix.lower() == ".xls":
        try:
            sample_header = pd.read_csv(path, nrows=0, sep=None, engine="python")
            all_columns = [str(c) for c in sample_header.columns]
            target = str(req.targetCol).strip()
            if target not in all_columns:
                matches = [c for c in all_columns if c.strip().lower() == target.lower()]
                if matches: target = matches[0]

            supplied = {str(p.get("name")): p for p in req.columnProfiles if p.get("name")}
            selected = []
            for col in all_columns:
                if col == target:
                    selected.append(col); continue
                p = supplied.get(col, {})
                if p.get("isPossibleId") or p.get("dataType") == "id" or p.get("isConstant"):
                    continue
                selected.append(col)
            max_predictors = 120
            if len(selected) > max_predictors + 1:
                profiled = [c for c in selected if c != target][:max_predictors]
                selected = [target] + profiled

            # Use a bounded reservoir-like sample across chunks. Empty rows are removed here,
            # not in React, so million-row files never become millions of JS objects.
            max_working_rows = 150_000
            reservoir: list[pd.DataFrame] = []
            total_rows = 0
            rng = np.random.default_rng(req.randomState)
            for chunk in pd.read_csv(path, usecols=selected, sep=None, engine="python", chunksize=50_000):
                chunk = chunk.replace(r"^\s*$", np.nan, regex=True).dropna(how="all")
                if chunk.empty: continue
                total_rows += len(chunk)
                if sum(len(x) for x in reservoir) < max_working_rows:
                    reservoir.append(chunk)
                else:
                    combined = pd.concat(reservoir, ignore_index=True)
                    take = min(max_working_rows, len(combined))
                    idx = rng.choice(len(combined), size=take, replace=False)
                    combined = combined.iloc[idx].copy()
                    reservoir = [combined]

            if total_rows == 0:
                raise ValueError("The uploaded dataset contains no usable data rows after empty-row removal.")
            sample = pd.concat(reservoir, ignore_index=True)
            if len(sample) > max_working_rows:
                sample = sample.sample(n=max_working_rows, random_state=req.randomState)
            return sample.reset_index(drop=True), total_rows, total_rows > len(sample)
        except Exception as exc:
            if path.suffix.lower() == ".xls":
                try:
                    df = pd.read_excel(path, nrows=150_000)
                    df = df.replace(r"^\s*$", np.nan, regex=True).dropna(how="all")
                    return df, len(df), True
                except Exception as excel_exc:
                    raise ValueError(f"Unable to read the uploaded .xls file as delimited text or Excel: {excel_exc}")
            raise ValueError(f"Unable to stream the uploaded dataset: {exc}")

    # Genuine Excel remains supported, but is bounded because Excel parsing is not chunk-native.
    try:
        df = pd.read_excel(path, nrows=150_000)
        df = df.replace(r"^\s*$", np.nan, regex=True).dropna(how="all")
        return df, len(df), True
    except Exception as exc:
        raise ValueError(f"Unable to read the uploaded Excel file: {exc}")


def adaptive_settings(source_rows: int) -> tuple[int, int, int]:
    """
    Adaptive resource policy.

    Small datasets:
      - use the complete dataset
      - 5-fold CV

    Medium datasets (100k-500k):
      - work on at most 80k rows
      - 3-fold CV

    Very large datasets (500k+):
      - work on at most 100k rows
      - 3-fold CV

    The final holdout is still untouched during CV.
    """
    if source_rows < 100_000:
        return source_rows, 5, min(20_000, max(1, int(source_rows * 0.2)))

    if source_rows < 500_000:
        return 80_000, 3, 16_000

    return 100_000, 3, 20_000


# ============================================================
# MAIN AUTOML ENGINE
# ============================================================

def _is_datetime_like(series: pd.Series, column_name: str = "") -> bool:
    """Detect date/time columns without depending on a specific dataset."""
    name = str(column_name).strip().lower()
    tokens = re.split(r"[^a-z0-9]+", name)
    date_words = {"date", "datetime", "timestamp", "time", "year", "month", "day"}
    name_hint = any(t in date_words for t in tokens) or name.endswith("_time")
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    if not (pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)):
        return False
    if not name_hint and len(series) > 5000:
        sample = series.dropna().astype(str).head(1000)
    else:
        sample = series.dropna().astype(str).head(1000)
    if sample.empty:
        return False
    parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    return float(parsed.notna().mean()) >= 0.80


def infer_task_type(y: pd.Series) -> str:
    """Infer classification vs regression from target semantics and cardinality."""
    y = y.dropna()
    if y.empty:
        raise ValueError("Selected target contains no usable values.")

    unique_count = int(y.nunique(dropna=True))
    unique_ratio = unique_count / max(len(y), 1)

    if pd.api.types.is_bool_dtype(y) or pd.api.types.is_categorical_dtype(y):
        return "classification"

    if pd.api.types.is_numeric_dtype(y):
        # Low-cardinality numeric targets commonly represent classes/flags.
        if unique_count <= 2:
            return "classification"
        if unique_count <= 20 and unique_ratio <= 0.05:
            return "classification"
        return "regression"

    return "classification"


def _target_name_score(column_name: str) -> float:
    """Score semantic hints in a column name; this is intentionally generic."""
    name = str(column_name).strip().lower()
    compact = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
    tokens = set(compact.split("_"))

    strong = {
        "target", "label", "outcome", "response", "result", "prediction",
        "class", "status", "churn", "default", "approved", "approval",
        "survived", "diagnosis", "disease", "fraud", "risk", "grade",
        "score", "marks", "mark", "price", "sales", "revenue", "profit",
        "demand", "consumption", "power", "rating", "readmission", "income",
        "salary", "duration", "amount", "quantity", "count", "temperature",
    }
    moderate = {
        "future", "final", "total", "value", "y", "dependent", "classlabel",
    }
    penalty = {"id", "index", "uuid", "guid", "key", "code"}

    score = 0.0
    for token in tokens:
        if token in strong:
            score += 5.0
        elif token in moderate:
            score += 2.0
        elif token in penalty:
            score -= 4.0
    if compact in {"target", "label", "outcome", "response", "y"}:
        score += 8.0
    return score


def _identifier_score(series: pd.Series, column_name: str) -> float:
    """Return a high score when a column strongly resembles an identifier."""
    name = str(column_name).strip().lower()
    tokens = set(re.split(r"[^a-z0-9]+", name))
    name_score = 0.0
    if tokens & {"id", "uuid", "guid", "index", "key"}:
        name_score += 6.0
    if name.endswith("id") or name.endswith("_id"):
        name_score += 6.0

    non_null = series.dropna()
    if non_null.empty:
        return name_score
    ratio = non_null.nunique(dropna=True) / len(non_null)
    if ratio >= 0.995:
        name_score += 8.0
    elif ratio >= 0.95:
        name_score += 4.0
    return name_score


def recommend_target(df: pd.DataFrame, supplied: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Generic target recommendation for unseen structured tabular datasets.

    The detector deliberately returns a recommendation rather than forcing a
    target when evidence is weak. It combines semantic name cues, cardinality,
    data type, missingness, identifier likelihood, datetime detection, and
    column position. No dataset name or specific column name is hard-coded.
    """
    supplied = supplied or []
    supplied_map = {str(p.get("name")): p for p in supplied if p.get("name")}
    candidates: list[dict[str, Any]] = []

    n_rows = max(len(df), 1)
    for position, col in enumerate(df.columns):
        s = df[col]
        non_null = s.dropna()
        if non_null.empty:
            continue
        unique_count = int(non_null.nunique(dropna=True))
        unique_ratio = unique_count / max(len(non_null), 1)
        missing_ratio = 1.0 - (len(non_null) / n_rows)
        profile = supplied_map.get(str(col), {})
        id_score = _identifier_score(s, col)
        datetime_like = _is_datetime_like(s, col)
        name_score = _target_name_score(col)
        score = name_score
        reasons: list[str] = []

        if unique_count <= 1:
            score -= 100
            reasons.append("constant column")
        if datetime_like:
            score -= 12
            reasons.append("date/time-like column is normally a predictor or forecasting dimension")
        if id_score >= 8:
            score -= 25
            reasons.append("strong identifier pattern")
        elif id_score >= 4:
            score -= 10
            reasons.append("possible identifier")

        if missing_ratio > 0.50:
            score -= 12
            reasons.append("more than 50% missing")
        elif missing_ratio > 0.20:
            score -= 4

        if pd.api.types.is_bool_dtype(s) or pd.api.types.is_object_dtype(s) or pd.api.types.is_categorical_dtype(s):
            if 2 <= unique_count <= min(20, max(2, int(n_rows * 0.20))):
                score += 8
                reasons.append("low-cardinality categorical target")
            elif unique_ratio >= 0.95:
                score -= 10
                reasons.append("nearly unique categorical values")
            else:
                score += 1
        elif pd.api.types.is_numeric_dtype(s):
            if unique_count >= 2:
                score += 5
                reasons.append("numeric target can support regression")
            if unique_count <= 20 and unique_ratio <= 0.05:
                score += 3
                reasons.append("low-cardinality numeric target can represent classes")
        else:
            score += 1

        # A mild rightmost-column prior is useful because many supervised
        # datasets place the response near the end, but it can never override
        # identifier/datetime penalties or stronger semantic evidence.
        if len(df.columns) > 1:
            score += 2.0 * (position / (len(df.columns) - 1))

        dtype_label = "numerical" if pd.api.types.is_numeric_dtype(s) else ("datetime" if datetime_like else "categorical")
        task = None if datetime_like else infer_task_type(s)
        candidates.append({
            "column": str(col),
            "score": round(float(score), 3),
            "dataType": dtype_label,
            "taskType": task,
            "uniqueCount": unique_count,
            "uniqueRatio": round(float(unique_ratio), 4),
            "missingRatio": round(float(missing_ratio), 4),
            "possibleIdentifier": bool(id_score >= 4 or profile.get("isPossibleId", False)),
            "reasons": reasons[:5],
        })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    usable = [c for c in candidates if c["score"] > -10]
    if not usable:
        return {"recommendedTarget": None, "taskType": None, "confidence": "low", "candidates": candidates[:8], "message": "No reliable supervised target was identified."}

    top = usable[0]
    second = usable[1] if len(usable) > 1 else None
    gap = top["score"] - second["score"] if second else 999
    confidence = "high" if top["score"] >= 8 and gap >= 3 else ("medium" if top["score"] >= 3 else "low")
    if confidence == "low":
        return {"recommendedTarget": None, "taskType": None, "confidence": "low", "candidates": candidates[:8], "message": "No reliable target was identified automatically; review the candidate columns."}
    return {"recommendedTarget": top["column"], "taskType": top["taskType"], "confidence": confidence, "candidates": candidates[:8], "message": f"Recommended '{top['column']}' based on column semantics, type, cardinality, missingness, and identifier likelihood."}


def engineer_datetime_features(df: pd.DataFrame) -> pd.DataFrame:
    """Dynamically convert date/time-like predictors into numeric calendar features."""
    df = df.copy()
    for col in list(df.columns):
        if col not in df.columns:
            continue
        if not _is_datetime_like(df[col], col):
            continue
        parsed = pd.to_datetime(df[col], errors="coerce", format="mixed")
        if parsed.notna().mean() < 0.60:
            continue
        name = str(col).strip().lower()
        is_time_only = name == "time" or name.endswith("_time")
        if not is_time_only:
            df[f"{col}__year"] = parsed.dt.year
            df[f"{col}__month"] = parsed.dt.month
            df[f"{col}__day"] = parsed.dt.day
            df[f"{col}__day_of_week"] = parsed.dt.dayofweek
        if is_time_only or parsed.dt.hour.notna().any():
            df[f"{col}__hour"] = parsed.dt.hour
            df[f"{col}__minute"] = parsed.dt.minute
            df[f"{col}__second"] = parsed.dt.second
        df.drop(columns=[col], inplace=True)
    return df


def automl(req: AutoMLRequest):
    started_total = time.perf_counter()
    if not req.targetCol:
        raise ValueError("No target column was selected.")
    if req.taskType not in {"classification", "regression"}:
        raise ValueError("AutoML requires either classification or regression.")

    df, source_rows, source_is_large = load_source_sample(req)
    if df.empty:
        raise ValueError("The uploaded dataset is empty.")

    df = clean_dataframe(df)
    target = str(req.targetCol).strip()
    if target not in df.columns:
        matches = [c for c in df.columns if str(c).strip().lower() == target.lower()]
        if matches: target = matches[0]
    if target not in df.columns:
        raise ValueError(f"Target column '{req.targetCol}' was not found in the dataset.")

    before = len(df)
    df = df.dropna(subset=[target]).copy()
    removed_target_rows = before - len(df)
    if len(df) < 20:
        raise ValueError(f"Only {len(df)} usable rows remain after removing missing target values.")

    raw_target = df[target]

    # Correct an incorrect frontend task selection automatically.
    detected_task = infer_task_type(raw_target)

    if req.taskType == "regression":
        converted_target = pd.to_numeric(raw_target, errors="coerce")

        if converted_target.notna().mean() < 0.80:
            raise ValueError(
                f"Target '{target}' is not numeric enough for regression."
            )

        task_type = "regression"

    elif req.taskType == "classification":
        # Continuous numeric targets such as Global_active_power
        # must be handled as regression.
        task_type = (
            "regression"
            if detected_task == "regression"
            else "classification"
        )

    else:
        task_type = detected_task

    if task_type == "regression":
        y = pd.to_numeric(raw_target, errors="coerce")
        mask = y.notna()

        df = df.loc[mask].copy()
        y = y.loc[mask]

        if len(y) < 20:
            raise ValueError("Not enough valid target rows for regression.")

        if y.nunique() < 2:
            raise ValueError(
                "Regression target must contain at least two distinct numeric values."
            )

    else:
        y = raw_target.astype(str).str.strip()

        invalid_target = y.isin({"", "nan", "None", "?", "NaT"})
        if invalid_target.any():
            keep = ~invalid_target
            df = df.loc[keep].copy()
            y = y.loc[keep]

        if y.nunique() < 2:
            raise ValueError(
                "Classification target must contain at least two classes."
            )

        class_count = int(y.nunique())

        if class_count > 100:
            raise ValueError(
                f"The selected target has {class_count} unique classes. "
                "Choose a categorical target or use regression."
            )

    # Engineer date/time predictors before profiling so generated numeric
    # features are included in the actual ML pipeline. The target itself is
    # never transformed here.
    predictor_df = df.drop(columns=[target], errors="ignore")
    predictor_df = engineer_datetime_features(predictor_df)
    df = pd.concat([predictor_df, df[[target]]], axis=1)

    numeric, categorical, excluded = profile_columns(df, target, req.columnProfiles)
    numeric = [c for c in numeric if c in df.columns]
    categorical = [c for c in categorical if c in df.columns]
    if not numeric and not categorical:
        raise ValueError("No usable predictor columns remain after excluding IDs, constants, and empty columns.")

    X = df.drop(columns=[target], errors="ignore")
    usable = [c for c in X.columns if X[c].notna().sum() > 0]
    X = X[usable]
    numeric = [c for c in numeric if c in usable]
    categorical = [c for c in categorical if c in usable]

    working_cap, adaptive_folds, max_test = adaptive_settings(source_rows)
    large_mode = source_rows >= 100_000

    # A final bounded sample protects even JSON fallback requests.
    if len(X) > working_cap:
        if task_type == "classification":
            temp = X.copy(); temp["__target__"] = y.values
            try:
                temp, _ = train_test_split(temp, train_size=working_cap, random_state=req.randomState, stratify=temp["__target__"])
            except ValueError:
                temp = temp.sample(n=working_cap, random_state=req.randomState)
            y = temp.pop("__target__"); X = temp
        else:
            idx = np.random.default_rng(req.randomState).choice(len(X), size=working_cap, replace=False)
            X = X.iloc[idx].copy(); y = y.iloc[idx].copy()

    test_size = min(max(float(req.testSize), 0.1), 0.25)
    stratify = y if task_type == "classification" else None
    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=req.randomState, stratify=stratify)
    except ValueError as exc:
        raise ValueError(f"Unable to create a reliable train/test split: {exc}")

    # The primary metric controls cross-validation ranking. All applicable
    # holdout metrics are still calculated and returned for every model.
    classification_metrics = {
        "accuracy": ("Accuracy", "accuracy"),
        "precision": ("Precision (Macro)", "precision_macro"),
        "recall": ("Recall (Macro)", "recall_macro"),
        "f1": ("F1 (Macro)", "f1_macro"),
        "rocAuc": ("ROC-AUC", "roc_auc"),
    }
    regression_metrics = {
        "r2": ("R²", "r2"),
        "mae": ("MAE", "neg_mean_absolute_error"),
        "mse": ("MSE", "neg_mean_squared_error"),
        "rmse": ("RMSE", "neg_root_mean_squared_error"),
        "mape": ("MAPE", "neg_mean_absolute_percentage_error"),
    }

    requested_metric = req.primaryMetric or ("f1" if task_type == "classification" else "r2")
    metric_config = classification_metrics if task_type == "classification" else regression_metrics
    if requested_metric not in metric_config:
        requested_metric = "f1" if task_type == "classification" else "r2"

    # ROC-AUC is intentionally limited to binary classification in this UI.
    if task_type == "classification" and requested_metric == "rocAuc" and int(pd.Series(y_train).nunique()) != 2:
        raise ValueError("ROC-AUC can be selected as the primary metric only for binary classification targets.")

    primary_metric_label, scoring = metric_config[requested_metric]

    if task_type == "classification":
        counts = y_train.value_counts(); min_class = int(counts.min())
        if min_class < 2: raise ValueError("The selected classification target has too few examples in at least one class.")
        folds = min(adaptive_folds, min_class)
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=req.randomState)
        majority = y_train.mode().iloc[0]
        baseline_pred = np.repeat(majority, len(y_test))
        if requested_metric == "accuracy":
            baseline_value = float(accuracy_score(y_test, baseline_pred))
        elif requested_metric == "precision":
            baseline_value = float(precision_score(y_test, baseline_pred, average="macro", zero_division=0))
        elif requested_metric == "recall":
            baseline_value = float(recall_score(y_test, baseline_pred, average="macro", zero_division=0))
        elif requested_metric == "f1":
            baseline_value = float(f1_score(y_test, baseline_pred, average="macro", zero_division=0))
        else:
            baseline_value = 0.5
        baseline_metric = f"{primary_metric_label} baseline"
    else:
        folds = min(adaptive_folds, len(y_train))
        if folds < 2: raise ValueError("Not enough training records for cross-validation.")
        cv = KFold(n_splits=folds, shuffle=True, random_state=req.randomState)
        baseline_pred = np.repeat(float(y_train.mean()), len(y_test))
        y_test_num = np.asarray(y_test, dtype=float)
        baseline_mae = float(mean_absolute_error(y_test_num, baseline_pred))
        baseline_mse = float(mean_squared_error(y_test_num, baseline_pred))
        baseline_rmse = float(np.sqrt(baseline_mse))
        baseline_r2 = float(r2_score(y_test_num, baseline_pred)) if len(y_test_num) > 1 else 0.0
        nz = np.abs(y_test_num) > 1e-12
        baseline_mape = float(np.mean(np.abs((y_test_num[nz] - baseline_pred[nz]) / y_test_num[nz]))) if np.any(nz) else 0.0
        baseline_value = {"r2": baseline_r2, "mae": baseline_mae, "mse": baseline_mse, "rmse": baseline_rmse, "mape": baseline_mape}[requested_metric]
        baseline_metric = f"{primary_metric_label} (mean-target baseline)"

    models = build_models(task_type, req.randomState, large_mode=large_mode, include_gaussian_nb=(len(categorical) == 0), source_rows=source_rows)
    results = []
    feature_names = []

    # For 100k+ sources, CV is performed on a small bounded benchmark subset.
    # The final fit and untouched holdout evaluation still use the bounded
    # training/test partitions, preserving model selection quality
    # without multiplying 100k+ rows by every fold and algorithm.
    cv_X_train = X_train
    cv_y_train = y_train
    if source_rows >= 100_000:
        # CV is for model comparison, not for consuming the whole dataset.
        # Keep the benchmark small enough that 7 models x 3 folds remain
        # practical on 100k-1M+ row datasets.
        benchmark_size = 20_000 if source_rows < 500_000 else 15_000

        if len(X_train) > benchmark_size:
            if task_type == "classification":
                cv_frame = X_train.copy()
                cv_frame["__target__"] = y_train.to_numpy()

                try:
                    cv_frame, _ = train_test_split(
                        cv_frame,
                        train_size=benchmark_size,
                        random_state=req.randomState,
                        stratify=cv_frame["__target__"]
                    )
                except ValueError:
                    cv_frame = cv_frame.sample(
                        n=benchmark_size,
                        random_state=req.randomState
                    )

                cv_y_train = cv_frame.pop("__target__")
                cv_X_train = cv_frame

            else:
                idx = np.random.default_rng(req.randomState).choice(
                    len(X_train),
                    size=benchmark_size,
                    replace=False
                )
                cv_X_train = X_train.iloc[idx].copy()
                cv_y_train = y_train.iloc[idx].copy()

    for name, algorithm, estimator in models:
        model_started = time.perf_counter()
        try:
            pipe = Pipeline([("preprocess", make_preprocessor(numeric, categorical)), ("model", estimator)])
            cv_scores = cross_val_score(pipe, cv_X_train, cv_y_train, cv=cv, scoring=scoring, n_jobs=1, error_score="raise")
            pipe.fit(X_train, y_train)
            elapsed = int((time.perf_counter() - model_started) * 1000)
            feature_names = feature_names_from_pipeline(pipe)
            pred = pipe.predict(X_test)

            if task_type == "classification":
                y_true = pd.Series(y_test).astype(str).to_numpy(); y_pred = pd.Series(pred).astype(str).to_numpy()
                accuracy = float(accuracy_score(y_true, y_pred)); precision = float(precision_score(y_true, y_pred, average="macro", zero_division=0)); recall = float(recall_score(y_true, y_pred, average="macro", zero_division=0)); f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
                labels = sorted(pd.Series(y_train).astype(str).unique().tolist())
                cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()
                roc_auc = None; roc_points = None
                try:
                    if len(labels) == 2 and (hasattr(pipe, "predict_proba") or hasattr(pipe, "decision_function")):
                        classes = [str(x) for x in pipe.named_steps["model"].classes_]; positive = labels[1]; pos_idx = classes.index(positive) if positive in classes else 1
                        if hasattr(pipe, "predict_proba"):
                            scores_all = pipe.predict_proba(X_test); scores = scores_all[:, pos_idx]
                        else:
                            scores_all = pipe.decision_function(X_test); scores = scores_all if np.ndim(scores_all) == 1 else scores_all[:, pos_idx]
                        binary_true = (y_true == positive).astype(int); roc_auc = float(roc_auc_score(binary_true, scores)); fpr, tpr, thresholds = roc_curve(binary_true, scores); roc_points = [{"fpr": round(float(a),5), "tpr": round(float(b),5), "threshold": round(float(c),5) if np.isfinite(c) else 1.0} for a,b,c in zip(fpr,tpr,thresholds)]
                except Exception: pass
                metric_values = {"accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1, "rocAuc": roc_auc}
                primary_value = metric_values.get(requested_metric)
                if primary_value is None:
                    raise ValueError(f"{primary_metric_label} is not available for this model/target combination.")
                importance = normalized_importance(pipe, X_test, pd.Series(y_test), scoring)
                results.append({"id": name.lower().replace(" ","-"), "name": name, "algorithm": algorithm, "taskType": task_type, "primaryMetric": primary_metric_label, "primaryMetricKey": requested_metric, "primaryMetricValue": float(primary_value), "metrics": metric_values, "trainingTimeMs": elapsed, "confusionMatrix": {"labels": labels, "matrix": cm}, "rocCurve": roc_points, "featureImportance": importance, "status": "trained", "cvMean": float(np.mean(cv_scores)), "cvStd": float(np.std(cv_scores)), "cvFolds": folds})
            else:
                pred = np.asarray(pred, dtype=float); y_true = np.asarray(y_test, dtype=float); mae = float(mean_absolute_error(y_true,pred)); mse = float(mean_squared_error(y_true,pred)); rmse = float(np.sqrt(mse)); r2 = float(r2_score(y_true,pred)) if len(y_true)>1 else 0.0
                nz = np.abs(y_true) > 1e-12; mape = float(np.mean(np.abs((y_true[nz] - pred[nz]) / y_true[nz]))) if np.any(nz) else 0.0
                metric_values = {"mae": mae, "mse": mse, "rmse": rmse, "r2": r2, "mape": mape}
                importance = normalized_importance(pipe, X_test, pd.Series(y_test), scoring)
                results.append({"id": name.lower().replace(" ","-"), "name": name, "algorithm": algorithm, "taskType": task_type, "primaryMetric": primary_metric_label, "primaryMetricKey": requested_metric, "primaryMetricValue": float(metric_values[requested_metric]), "metrics": metric_values, "trainingTimeMs": elapsed, "featureImportance": importance, "status": "trained", "cvMean": float(np.mean(cv_scores)), "cvStd": float(np.std(cv_scores)), "cvFolds": folds})
        except Exception as exc:
            results.append({"id": name.lower().replace(" ","-"), "name": name, "algorithm": algorithm, "taskType": task_type, "primaryMetric": primary_metric_label, "primaryMetricKey": requested_metric, "primaryMetricValue": 0, "metrics": {}, "trainingTimeMs": 0, "featureImportance": [], "status": "failed", "errorMessage": str(exc), "cvMean": 0, "cvStd": 0, "cvFolds": folds})

    trained = [r for r in results if r.get("status") == "trained"]
    if not trained:
        raise ValueError("All AutoML models failed. " + " | ".join(f"{r['name']}: {r.get('errorMessage','unknown error')}" for r in results))

    # sklearn's loss scorers are negated, so a larger CV score still means a
    # better model even when the real-world metric (MAE/MSE/RMSE/MAPE) is lower-is-better.
    trained.sort(key=lambda r: r.get("cvMean", float("-inf")), reverse=True)
    trained[0]["isBest"] = True
    direction = "highest" if requested_metric in {"accuracy", "precision", "recall", "f1", "rocAuc", "r2"} else "lowest"
    reason = (f"Selected '{trained[0]['name']}' using the {direction} {primary_metric_label} objective across "
              f"{trained[0]['cvFolds']}-fold cross-validation, then verified it with all applicable metrics on an untouched test set.")

    return {
        "taskType": task_type, "targetColumn": target, "primaryMetric": requested_metric, "primaryMetricLabel": primary_metric_label, "selectedModel": trained[0], "models": trained + [r for r in results if r.get("status") != "trained"],
        "trainCount": int(len(X_train)), "testCount": int(len(X_test)), "featureNames": feature_names, "selectionReason": reason,
        "baselineMetric": baseline_metric, "baselineValue": round(baseline_value,6), "testSplitRatio": float(test_size), "cvFolds": int(folds),
        "excludedColumns": excluded, "removedTargetRows": int(removed_target_rows), "predictorColumns": numeric + categorical,
        "preprocessing": "Median imputation + StandardScaler for numeric features; most-frequent imputation + sparse OneHotEncoder for categorical features with rare-category grouping and category caps.",
        "resourceSafety": {
            "serverSideSource": bool(req.datasetPath), "sourceRows": int(source_rows), "workingRows": int(len(X)), "largeDatasetMode": bool(large_mode),
            "maxWorkingRows": int(working_cap), "cvFolds": int(folds), "modelsEvaluated": len(models), "permutationImportance": False,
            "sparseOneHotEncoding": True, "maxCategoriesPerColumn": MAX_CATEGORIES_PER_COLUMN,
            "message": "Large datasets are streamed from disk; model training uses a bounded working set and cross-validation uses a stratified benchmark subset for predictable runtime."
        },
        "sourceFileName": req.sourceFileName,
        "sourceFileSize": req.sourceFileSize,
        "totalRuntimeMs": int((time.perf_counter()-started_total)*1000),
    }


# ============================================================
# GENERIC TARGET RECOMMENDATION API
# ============================================================

@app.post("/recommend-target")
def recommend_target_api(req: AutoMLRequest):
    """Return a dataset-agnostic target recommendation before AutoML."""
    try:
        df, source_rows, _ = load_source_sample(req)
        df = clean_dataframe(df)
        if df.empty:
            raise ValueError("The uploaded dataset is empty.")
        recommendation = recommend_target(df, req.columnProfiles)
        recommendation["sourceRows"] = int(source_rows)
        return JSONResponse(status_code=200, content=recommendation)
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": "Target recommendation failed", "detail": str(exc)})


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "scikit-learn",
        "sklearn": __import__(
            "sklearn"
        ).__version__,
    }


# ============================================================
# AUTOML API
# ============================================================

@app.post("/automl")
def run_automl(
    req: AutoMLRequest,
):

    try:

        result = automl(req)

        return JSONResponse(
            status_code=200,
            content=result,
        )

    except Exception as exc:

        print(
            f"[AutoML ERROR] {type(exc).__name__}: {exc}"
        )

        return JSONResponse(
            status_code=400,
            content={
                "error": "AutoML failed",
                "detail": str(exc),
                "type": type(exc).__name__,
            },
        )
