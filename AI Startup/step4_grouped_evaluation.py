import pandas as pd
import re
from pathlib import Path

from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report

# =========================
# CONFIG
# =========================
INPUT_PATH = Path("step2_outputs/training_ready_table.csv")
OUT_DIR = Path("step4_outputs")
OUT_DIR.mkdir(exist_ok=True)

RANDOM_STATE = 42
TEST_SIZE = 0.20

# =========================
# LOAD
# =========================
df = pd.read_csv(INPUT_PATH)

required_cols = ["category", "note_clean", "model_text_with_type"]
for col in required_cols:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")

df = df.dropna(subset=["category", "note_clean", "model_text_with_type"]).copy()
df["category"] = df["category"].astype(str).str.strip()
df["note_clean"] = df["note_clean"].astype(str).str.strip()
df["model_text_with_type"] = df["model_text_with_type"].astype(str).str.strip()

df = df[(df["category"] != "") & (df["note_clean"] != "") & (df["model_text_with_type"] != "")].copy()

# =========================
# NORMALIZE NOTE FOR GROUPING
# =========================
def normalize_for_grouping(text):
    text = str(text).lower().strip()
    text = re.sub(r"\d+", " ", text)
    text = re.sub(r"[^\w\s&/-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

df["group_key"] = df["note_clean"].apply(normalize_for_grouping)

print("\n" + "="*80)
print("STEP 4 — GROUPED EVALUATION")
print("="*80)
print(f"Rows available: {len(df)}")
print(f"Classes: {df['category'].nunique()}")
print(f"Unique group keys: {df['group_key'].nunique()}")

# show most repeated notes
top_groups = df["group_key"].value_counts().head(20)
print("\nTop repeated normalized notes:")
print(top_groups)

# =========================
# GROUPED SPLIT
# =========================
gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
train_idx, test_idx = next(gss.split(df, y=df["category"], groups=df["group_key"]))

train_df = df.iloc[train_idx].copy()
test_df = df.iloc[test_idx].copy()

# verify no overlap in groups
train_groups = set(train_df["group_key"])
test_groups = set(test_df["group_key"])
overlap = train_groups.intersection(test_groups)

print("\n" + "="*80)
print("1) GROUPED TRAIN / TEST SPLIT")
print("="*80)
print(f"Train rows: {len(train_df)}")
print(f"Test rows : {len(test_df)}")
print(f"Train unique groups: {len(train_groups)}")
print(f"Test unique groups : {len(test_groups)}")
print(f"Overlapping groups between train/test: {len(overlap)}")

train_dist = train_df["category"].value_counts().sort_index()
test_dist = test_df["category"].value_counts().sort_index()
split_table = pd.DataFrame({
    "train_count": train_dist,
    "test_count": test_dist
}).fillna(0).astype(int)

print("\nPer-class distribution:")
print(split_table)

split_table.to_csv(OUT_DIR / "grouped_split_distribution.csv")

# =========================
# MODELS
# =========================
X_train = train_df["model_text_with_type"]
X_test = test_df["model_text_with_type"]
y_train = train_df["category"]
y_test = test_df["category"]

svc_model = Pipeline([
    ("tfidf", TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        sublinear_tf=True
    )),
    ("clf", LinearSVC())
])

dummy_model = DummyClassifier(strategy="most_frequent")

models = [
    ("Dummy Most Frequent", dummy_model),
    ("LinearSVC text_plus_type", svc_model)
]

results = []

for model_name, model in models:
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average="macro")

    results.append({
        "model": model_name,
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4)
    })

    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    pd.DataFrame(report).transpose().to_csv(
        OUT_DIR / f"classification_report_{model_name.replace(' ', '_')}.csv"
    )

    pred_df = pd.DataFrame({
        "text_used_by_model": X_test.values,
        "actual_category": y_test.values,
        "predicted_category": y_pred
    })
    pred_df.to_csv(
        OUT_DIR / f"predictions_{model_name.replace(' ', '_')}.csv",
        index=False
    )

print("\n" + "="*80)
print("2) GROUPED EVALUATION RESULTS")
print("="*80)
results_df = pd.DataFrame(results).sort_values(by=["macro_f1", "accuracy"], ascending=False)
print(results_df.to_string(index=False))
results_df.to_csv(OUT_DIR / "grouped_model_results.csv", index=False)

# =========================
# HARD EXAMPLES FOR BEST MODEL
# =========================
svc_model.fit(X_train, y_train)
svc_pred = svc_model.predict(X_test)

errors = pd.DataFrame({
    "text_used_by_model": X_test.values,
    "actual_category": y_test.values,
    "predicted_category": svc_pred
})

errors = errors[errors["actual_category"] != errors["predicted_category"]].copy()

print("\n" + "="*80)
print("3) SAMPLE ERRORS FROM GROUPED EVALUATION")
print("="*80)
if len(errors) == 0:
    print("No errors found.")
else:
    print(errors.head(20).to_string(index=False))

errors.to_csv(OUT_DIR / "grouped_errors_linearsvc.csv", index=False)

print("\n" + "="*80)
print("4) FILES SAVED")
print("="*80)
print(f"Saved: {OUT_DIR / 'grouped_split_distribution.csv'}")
print(f"Saved: {OUT_DIR / 'grouped_model_results.csv'}")
print(f"Saved: {OUT_DIR / 'grouped_errors_linearsvc.csv'}")
print("Saved detailed reports and predictions for each model.")

print("\n" + "="*80)
print("STEP 4 COMPLETE")
print("="*80)