import pandas as pd
import numpy as np
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report

import matplotlib.pyplot as plt

# =========================
# CONFIG
# =========================
INPUT_PATH = Path("step2_outputs/training_ready_table.csv")
OUT_DIR = Path("step3_outputs")
OUT_DIR.mkdir(exist_ok=True)

RANDOM_STATE = 42
TEST_SIZE = 0.20

# =========================
# LOAD
# =========================
df = pd.read_csv(INPUT_PATH)

required_cols = ["category", "model_text_textonly", "model_text_with_type"]
for col in required_cols:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")

# remove any accidental empty rows
df = df.dropna(subset=["category", "model_text_textonly", "model_text_with_type"]).copy()
df["category"] = df["category"].astype(str).str.strip()
df["model_text_textonly"] = df["model_text_textonly"].astype(str).str.strip()
df["model_text_with_type"] = df["model_text_with_type"].astype(str).str.strip()

df = df[(df["category"] != "") & (df["model_text_textonly"] != "") & (df["model_text_with_type"] != "")].copy()

print("\n" + "="*80)
print("STEP 3 — TRAIN FIRST BASELINES")
print("="*80)
print(f"Rows available: {len(df)}")
print(f"Classes: {df['category'].nunique()}")

# =========================
# SAME SPLIT FOR ALL MODELS
# =========================
train_idx, test_idx = train_test_split(
    df.index,
    test_size=TEST_SIZE,
    random_state=RANDOM_STATE,
    stratify=df["category"]
)

train_df = df.loc[train_idx].copy()
test_df = df.loc[test_idx].copy()

print("\n" + "="*80)
print("1) TRAIN / TEST SPLIT")
print("="*80)
print(f"Train rows: {len(train_df)}")
print(f"Test rows : {len(test_df)}")

split_table = pd.DataFrame({
    "train_count": train_df["category"].value_counts().sort_index(),
    "test_count": test_df["category"].value_counts().sort_index()
}).fillna(0).astype(int)

print("\nPer-class distribution in split:")
print(split_table)

split_table.to_csv(OUT_DIR / "split_distribution.csv")

# =========================
# DATA VARIANTS
# =========================
X_train_text = train_df["model_text_textonly"]
X_test_text = test_df["model_text_textonly"]

X_train_type = train_df["model_text_with_type"]
X_test_type = test_df["model_text_with_type"]

y_train = train_df["category"]
y_test = test_df["category"]

labels = sorted(df["category"].unique())

# =========================
# MODELS
# =========================
def make_logreg():
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=2,
            sublinear_tf=True
        )),
        ("clf", LogisticRegression(
            max_iter=3000,
            random_state=RANDOM_STATE
        ))
    ])

def make_linearsvc():
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=2,
            sublinear_tf=True
        )),
        ("clf", LinearSVC())
    ])

experiments = [
    {
        "name": "Dummy Most Frequent",
        "input_variant": "text_only",
        "model": DummyClassifier(strategy="most_frequent")
    },
    {
        "name": "Logistic Regression",
        "input_variant": "text_only",
        "model": make_logreg()
    },
    {
        "name": "LinearSVC",
        "input_variant": "text_only",
        "model": make_linearsvc()
    },
    {
        "name": "Logistic Regression",
        "input_variant": "text_plus_type",
        "model": make_logreg()
    },
    {
        "name": "LinearSVC",
        "input_variant": "text_plus_type",
        "model": make_linearsvc()
    }
]

results = []
all_reports = []
best_model_name = None
best_input_variant = None
best_macro_f1 = -1
best_y_pred = None

# =========================
# TRAIN + EVALUATE
# =========================
for exp in experiments:
    name = exp["name"]
    input_variant = exp["input_variant"]
    model = exp["model"]

    if input_variant == "text_only":
        Xtr, Xte = X_train_text, X_test_text
    else:
        Xtr, Xte = X_train_type, X_test_type

    model.fit(Xtr, y_train)
    y_pred = model.predict(Xte)

    acc = accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average="macro")

    results.append({
        "model": name,
        "input_variant": input_variant,
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4)
    })

    # save classification report
    report_dict = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    report_df = pd.DataFrame(report_dict).transpose()
    safe_name = f"{name.replace(' ', '_')}_{input_variant}"
    report_df.to_csv(OUT_DIR / f"classification_report_{safe_name}.csv")

    # confusion matrix CSV
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    cm_df = pd.DataFrame(cm, index=labels, columns=labels)
    cm_df.to_csv(OUT_DIR / f"confusion_matrix_{safe_name}.csv")

    # confusion matrix image
    plt.figure(figsize=(12, 10))
    plt.imshow(cm, interpolation="nearest")
    plt.title(f"Confusion Matrix — {name} ({input_variant})")
    plt.colorbar()
    tick_marks = np.arange(len(labels))
    plt.xticks(tick_marks, labels, rotation=90)
    plt.yticks(tick_marks, labels)
    plt.xlabel("Predicted label")
    plt.ylabel("True label")
    plt.tight_layout()
    plt.savefig(OUT_DIR / f"confusion_matrix_{safe_name}.png", dpi=200, bbox_inches="tight")
    plt.close()

    # save best model result info
    if macro_f1 > best_macro_f1:
        best_macro_f1 = macro_f1
        best_model_name = name
        best_input_variant = input_variant
        best_y_pred = y_pred.copy()

results_df = pd.DataFrame(results).sort_values(
    by=["macro_f1", "accuracy"],
    ascending=False
).reset_index(drop=True)

print("\n" + "="*80)
print("2) MODEL COMPARISON")
print("="*80)
print(results_df.to_string(index=False))

results_df.to_csv(OUT_DIR / "model_comparison.csv", index=False)

# =========================
# BEST MODEL ANALYSIS
# =========================
print("\n" + "="*80)
print("3) BEST MODEL")
print("="*80)
print(f"Best model      : {best_model_name}")
print(f"Input variant   : {best_input_variant}")
print(f"Best macro F1   : {best_macro_f1:.4f}")

best_cm = confusion_matrix(y_test, best_y_pred, labels=labels)
best_cm_df = pd.DataFrame(best_cm, index=labels, columns=labels)

# top confusion pairs
confusions = []
for i, actual_label in enumerate(labels):
    for j, predicted_label in enumerate(labels):
        if i != j and best_cm[i, j] > 0:
            confusions.append({
                "actual": actual_label,
                "predicted": predicted_label,
                "count": int(best_cm[i, j])
            })

confusions_df = pd.DataFrame(confusions).sort_values(by="count", ascending=False)

print("\nTop confusion pairs (best model):")
if len(confusions_df) == 0:
    print("No off-diagonal confusions found.")
else:
    print(confusions_df.head(15).to_string(index=False))

confusions_df.to_csv(OUT_DIR / "best_model_top_confusions.csv", index=False)

# =========================
# SAMPLE PREDICTIONS
# =========================
best_input_series = X_test_text if best_input_variant == "text_only" else X_test_type

sample_preds = pd.DataFrame({
    "text_used_by_model": best_input_series.values,
    "actual_category": y_test.values,
    "predicted_category": best_y_pred
}).head(30)

print("\n" + "="*80)
print("4) SAMPLE PREDICTIONS")
print("="*80)
print(sample_preds.head(15).to_string(index=False))

sample_preds.to_csv(OUT_DIR / "sample_predictions_best_model.csv", index=False)

print("\n" + "="*80)
print("5) FILES SAVED")
print("="*80)
print(f"Saved: {OUT_DIR / 'model_comparison.csv'}")
print(f"Saved: {OUT_DIR / 'split_distribution.csv'}")
print(f"Saved: {OUT_DIR / 'best_model_top_confusions.csv'}")
print(f"Saved: {OUT_DIR / 'sample_predictions_best_model.csv'}")
print("Saved classification reports and confusion matrices for each experiment.")

print("\n" + "="*80)
print("STEP 3 COMPLETE")
print("="*80)