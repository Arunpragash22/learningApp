"""
KMeans Predictor
================

Loads the pre-trained KMeans (k=3) model and predicts student
engagement clusters from preprocessed data.

Usage:
    predictor = KMeansPredictor()
    labels = predictor.predict(student_features_df)
"""

import os
import joblib
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple


# ── Path to the saved model ────────────────────────────────────────
_MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_MODEL_PATH = os.path.join(_MODEL_DIR, "kmeans_k3.pkl")

# ── Features the model was trained on ──────────────────────────────
# Update this list if your notebook used different / more features.
MODEL_FEATURES = ["engagement_score_scaled"]


class KMeansPredictor:
    """Singleton wrapper around the saved KMeans .pkl model."""

    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ── Load model ──────────────────────────────────────────────────
    def load(self, model_path: str = _DEFAULT_MODEL_PATH) -> None:
        """Load the .pkl model from disk (called once at startup)."""
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"KMeans model not found at {model_path}. "
                f"Please place your kmean_k3.pkl file in: {_MODEL_DIR}"
            )
        self._model = joblib.load(model_path)
        print(f"✅ KMeans model loaded from {model_path}")
        print(f"   Cluster centers: {self._model.cluster_centers_}")

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Predict ─────────────────────────────────────────────────────
    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """
        Predict cluster labels for each row in the DataFrame.

        Parameters
        ----------
        df : pd.DataFrame
            Must contain the columns listed in MODEL_FEATURES.

        Returns
        -------
        np.ndarray of int  — cluster labels (0, 1, or 2)
        """
        if not self.is_loaded:
            self.load()

        X = df[MODEL_FEATURES].values
        return self._model.predict(X)

    # ── Map labels → engagement levels ──────────────────────────────
    def get_label_mapping(self) -> Dict[int, str]:
        """
        Automatically map KMeans numeric labels (0, 1, 2) to
        engagement levels ("high", "medium", "low") based on
        cluster centers.

        The cluster with the highest center → "high"
        Middle center                      → "medium"
        Lowest center                      → "low"
        """
        if not self.is_loaded:
            self.load()

        centers = self._model.cluster_centers_  # shape (3, n_features)
        # Use the first feature (engagement_score_scaled) to rank
        center_means = centers.mean(axis=1)     # one value per cluster
        sorted_indices = np.argsort(center_means)  # ascending order

        mapping = {
            int(sorted_indices[0]): "low",
            int(sorted_indices[1]): "medium",
            int(sorted_indices[2]): "high",
        }
        return mapping

    # ── Convenience: full prediction pipeline ───────────────────────
    def predict_students(
        self, preprocessed_docs: List[dict]
    ) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
        """
        Given preprocessed engagement docs (one per student×question),
        aggregate per student, predict cluster labels, and return:

        1. student_labels : { studentId: "high" | "medium" | "low" }
        2. cluster_students: { "high": [sid, ...], "medium": [...], "low": [...] }
        """
        if not preprocessed_docs:
            print("⚠️  predict_students: no preprocessed docs received")
            return {}, {"high": [], "medium": [], "low": []}

        df = pd.DataFrame(preprocessed_docs)
        print(f"📊 predict_students: {len(df)} rows, columns: {list(df.columns)}")

        # ── Aggregate per student (mean of features across questions) ──
        agg_cols = {col: "mean" for col in MODEL_FEATURES if col in df.columns}

        # If engagement_score_scaled is not directly available, compute it
        if "engagement_score_scaled" not in df.columns and "engagement_score" in df.columns:
            from sklearn.preprocessing import StandardScaler
            scaler = StandardScaler()
            df["engagement_score_scaled"] = scaler.fit_transform(
                df[["engagement_score"]]
            )
            agg_cols["engagement_score_scaled"] = "mean"

        if not agg_cols:
            print(f"❌ predict_students: MODEL_FEATURES {MODEL_FEATURES} "
                  f"not found in columns {list(df.columns)}")
            return {}, {"high": [], "medium": [], "low": []}

        student_df = df.groupby("studentId").agg(agg_cols).reset_index()
        print(f"📊 predict_students: {len(student_df)} unique students")
        print(f"📊 Student engagement values: {student_df['engagement_score_scaled'].tolist()}")

        if student_df.empty:
            return {}, {"high": [], "medium": [], "low": []}

        # ── Predict ────────────────────────────────────────────────────
        labels = self.predict(student_df)
        label_map = self.get_label_mapping()
        print(f"📊 KMeans labels: {labels.tolist()}, mapping: {label_map}")

        # ── Build results ──────────────────────────────────────────────
        student_labels: Dict[str, str] = {}
        cluster_students: Dict[str, List[str]] = {
            "high": [], "medium": [], "low": []
        }

        student_ids = student_df["studentId"].tolist()
        for idx in range(len(student_ids)):
            sid = student_ids[idx]
            level = label_map[int(labels[idx])]
            student_labels[sid] = level
            cluster_students[level].append(sid)

        print(f"✅ predict_students result: "
              f"high={len(cluster_students['high'])}, "
              f"medium={len(cluster_students['medium'])}, "
              f"low={len(cluster_students['low'])}")

        return student_labels, cluster_students
