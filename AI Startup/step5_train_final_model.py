import pandas as pd
import json
import joblib
from pathlib import Path

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

# =========================
# CONFIG
# =========================
INPUT_PATH = Path("step2_outputs/training_ready_table.csv")
OUT_DIR = Path("step5_model_artifacts")
OUT_DIR.mkdir(exist_ok=True)

MODEL_PATH = OUT_DIR / "budgetbuddy_autocat_pipeline.joblib"
META_PATH = OUT_DIR / "budgetbuddy_autocat_metadata.json"

# =========================
# LOAD DATA
# =========================
df = pd.read_csv(INPUT_PATH)

required_cols = ["category", "model_text_with_type", "note_clean", "type_token"]
for col in required_cols:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")

df = df.dropna(subset=["category", "model_text_with_type"]).copy()
df["category"] = df["category"].astype(str).str.strip()
df["model_text_with_type"] = df["model_text_with_type"].astype(str).str.strip()

df = df[(df["category"] != "") & (df["model_text_with_type"] != "")].copy()

print("\n" + "="*80)
print("STEP 5 — TRAIN FINAL MODEL ARTIFACT")
print("="*80)
print(f"Rows used for final training: {len(df)}")
print(f"Number of classes: {df['category'].nunique()}")

class_counts = df["category"].value_counts().sort_index()
print("\nClass distribution:")
print(class_counts)

X = df["model_text_with_type"]
y = df["category"]

# =========================
# FINAL PIPELINE
# =========================
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        sublinear_tf=True
    )),
    ("clf", LinearSVC())
])

print("\n" + "="*80)
print("1) TRAINING FINAL PIPELINE")
print("="*80)
print("Pipeline:")
print("- Input: type token + cleaned note")
print("- Vectorizer: TF-IDF (unigram + bigram)")
print("- Classifier: LinearSVC")

pipeline.fit(X, y)

# =========================
# SAVE MODEL
# =========================
joblib.dump(pipeline, MODEL_PATH)

metadata = {
    "model_name": "BudgetBuddy Auto-Categorization",
    "task": "multiclass text classification",
    "input_variant": "type_token + note_clean",
    "vectorizer": {
        "name": "TfidfVectorizer",
        "ngram_range": [1, 2],
        "min_df": 2,
        "sublinear_tf": True
    },
    "classifier": {
        "name": "LinearSVC"
    },
    "training_rows": int(len(df)),
    "num_classes": int(df["category"].nunique()),
    "classes": sorted(df["category"].unique().tolist())
}

with open(META_PATH, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2, ensure_ascii=False)

print("\n" + "="*80)
print("2) SAVED ARTIFACTS")
print("="*80)
print(f"Saved model: {MODEL_PATH}")
print(f"Saved metadata: {META_PATH}")

# =========================
# RELOAD TEST
# =========================
print("\n" + "="*80)
print("3) RELOAD TEST")
print("="*80)
loaded_model = joblib.load(MODEL_PATH)

sample_inputs = [
    "[TYPE_EXPENSE] uber",
    "[TYPE_EXPENSE] zara",
    "[TYPE_EXPENSE] mcdo",
    "[TYPE_EXPENSE] medco",
    "[TYPE_INCOME] payroll",
    "[TYPE_EXPENSE] monthly rent",
    "[TYPE_EXPENSE] pharmacy",
    "[TYPE_EXPENSE] decathlon shoes",
]

sample_preds = loaded_model.predict(sample_inputs)

for text, pred in zip(sample_inputs, sample_preds):
    print(f"{text}  -->  {pred}")

# =========================
# OPTIONAL: SAVE SAMPLE PREDICTIONS
# =========================
sample_df = pd.DataFrame({
    "text_used_by_model": sample_inputs,
    "predicted_category": sample_preds
})
sample_df.to_csv(OUT_DIR / "sample_predictions_after_reload.csv", index=False)

print("\n" + "="*80)
print("4) FEATURE SPACE INFO")
print("="*80)
tfidf = loaded_model.named_steps["tfidf"]
print(f"Vocabulary size: {len(tfidf.vocabulary_)}")

print("\n" + "="*80)
print("STEP 5 COMPLETE")
print("="*80)