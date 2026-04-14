import pandas as pd
import re
import sys
from pathlib import Path

# =========================
# CONFIG
# =========================
FILE_PATH = sys.argv[1] if len(sys.argv) > 1 else "wallet_records.xlsx"
OUT_DIR = Path("step2_outputs")
OUT_DIR.mkdir(exist_ok=True)

# =========================
# LOAD FILE
# =========================
if FILE_PATH.endswith(".xlsx"):
    df = pd.read_excel(FILE_PATH)
else:
    df = pd.read_csv(FILE_PATH)

print("\n" + "="*80)
print("STEP 2 — DEFINE TRAINING TABLE")
print("="*80)
print(f"Loaded file: {FILE_PATH}")
print(f"Rows: {len(df)}")
print(f"Columns: {list(df.columns)}")

# =========================
# DETECT IMPORTANT COLUMNS
# =========================
def find_col(possible_keywords):
    for c in df.columns:
        c_low = c.lower().strip()
        for kw in possible_keywords:
            if kw in c_low:
                return c
    return None

category_col = find_col(["category"])
note_col = find_col(["note", "description"])
type_col = find_col(["type"])
amount_col = find_col(["amount"])
date_col = find_col(["date", "time"])

print("\nDetected columns:")
print(f"category_col = {category_col}")
print(f"note_col     = {note_col}")
print(f"type_col     = {type_col}")
print(f"amount_col   = {amount_col}")
print(f"date_col     = {date_col}")

if category_col is None or note_col is None:
    raise ValueError("Could not detect category or note/description column.")

# =========================
# KEEP ONLY NEEDED COLUMNS
# =========================
keep_cols = [c for c in [category_col, note_col, type_col, amount_col, date_col] if c is not None]
data = df[keep_cols].copy()

# Rename to standard names
rename_map = {category_col: "category", note_col: "note"}
if type_col: rename_map[type_col] = "type"
if amount_col: rename_map[amount_col] = "amount"
if date_col: rename_map[date_col] = "date_time"

data = data.rename(columns=rename_map)

# Ensure columns exist even if missing
for col in ["type", "amount", "date_time"]:
    if col not in data.columns:
        data[col] = None

# =========================
# BASIC CLEANING
# =========================
for col in ["category", "note", "type"]:
    data[col] = data[col].astype(str).fillna("").str.strip()

before_rows = len(data)

# Remove rows with missing category or missing note
data = data[(data["category"] != "") & (data["note"] != "")]
after_rows = len(data)

print("\n" + "="*80)
print("1) BASIC CLEANING")
print("="*80)
print(f"Rows before cleaning: {before_rows}")
print(f"Rows after removing empty category/note: {after_rows}")
print(f"Rows removed: {before_rows - after_rows}")

# =========================
# LABEL CLEANING
# =========================
# Light label cleaning only: strip + collapse spaces
data["category"] = (
    data["category"]
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

print("\n" + "="*80)
print("2) TARGET DEFINITION")
print("="*80)
print("Target y = category")
print(f"Number of classes: {data['category'].nunique()}")
print("\nClass distribution:")
print(data["category"].value_counts())

# =========================
# TEXT CLEANING
# =========================
def clean_text(s):
    s = str(s).lower().strip()
    s = re.sub(r"\s+", " ", s)          # collapse spaces
    s = re.sub(r"[^\w\s&/-]", " ", s)   # remove most punctuation, keep words/slashes/&/-
    s = re.sub(r"\s+", " ", s).strip()
    return s

def type_token(t):
    t = str(t).strip().lower()
    if t == "expense":
        return "[TYPE_EXPENSE]"
    elif t == "income":
        return "[TYPE_INCOME]"
    elif t == "" or t == "nan":
        return "[TYPE_UNKNOWN]"
    else:
        return f"[TYPE_{t.upper().replace(' ', '_')}]"

data["note_clean"] = data["note"].apply(clean_text)
data["type_token"] = data["type"].apply(type_token)

# Candidate A: text only
data["model_text_textonly"] = data["note_clean"]

# Candidate B: text + type
data["model_text_with_type"] = (data["type_token"] + " " + data["note_clean"]).str.strip()

# Remove rows that became empty after cleaning
before_empty_clean = len(data)
data = data[data["note_clean"] != ""].copy()
after_empty_clean = len(data)

print("\n" + "="*80)
print("3) INPUT FEATURE DEFINITION")
print("="*80)
print("Candidate A = note_clean")
print("Candidate B = type_token + note_clean")
print(f"Rows before removing empty cleaned text: {before_empty_clean}")
print(f"Rows after removing empty cleaned text: {after_empty_clean}")

# =========================
# PREVIEW EXAMPLES
# =========================
print("\n" + "="*80)
print("4) FEATURE PREVIEW")
print("="*80)

preview_cols = ["note", "type", "category", "note_clean", "model_text_with_type"]
preview = data[preview_cols].head(20)
print(preview.to_string(index=False))

# =========================
# DESIGN DECISION SUMMARY
# =========================
print("\n" + "="*80)
print("5) DESIGN DECISION SUMMARY")
print("="*80)
print("Chosen ML problem: multiclass text classification")
print("Target (y): category")
print("Baseline input A: cleaned note only")
print("Baseline input B: cleaned note + type token")
print("Excluded for first baseline: amount, date_time")
print("Reason: keep first model simple, interpretable, and easy to defend")

# =========================
# SAVE TRAINING-READY TABLE
# =========================
final_cols = [
    "note",
    "note_clean",
    "type",
    "type_token",
    "amount",
    "date_time",
    "category",
    "model_text_textonly",
    "model_text_with_type"
]

data[final_cols].to_csv(OUT_DIR / "training_ready_table.csv", index=False)

# Save a smaller preview too
preview.to_csv(OUT_DIR / "training_preview.csv", index=False)

print("\n" + "="*80)
print("6) FILES SAVED")
print("="*80)
print(f"Saved: {OUT_DIR / 'training_ready_table.csv'}")
print(f"Saved: {OUT_DIR / 'training_preview.csv'}")

print("\n" + "="*80)
print("STEP 2 COMPLETE")
print("="*80)