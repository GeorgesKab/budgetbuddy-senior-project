import re
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import psycopg2
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.metrics import accuracy_score, f1_score, classification_report

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

TRAINING_TABLE_CANDIDATES = [
    BASE_DIR / "step2_outputs" / "training_ready_table.csv",
    PROJECT_ROOT / "step2_outputs" / "training_ready_table.csv",
]

ARTIFACT_DIR_CANDIDATES = [
    BASE_DIR / "step5_model_artifacts",
    PROJECT_ROOT / "step5_model_artifacts",
]

INPUT_PATH = next((p for p in TRAINING_TABLE_CANDIDATES if p.exists()), None)
ARTIFACT_DIR = next((p for p in ARTIFACT_DIR_CANDIDATES if p.exists()), None)

if INPUT_PATH is None:
    raise FileNotFoundError(
        "Missing training_ready_table.csv. Checked:\n"
        + "\n".join(str(p) for p in TRAINING_TABLE_CANDIDATES)
    )

if ARTIFACT_DIR is None:
    raise FileNotFoundError(
        "Missing step5_model_artifacts folder. Checked:\n"
        + "\n".join(str(p) for p in ARTIFACT_DIR_CANDIDATES)
    )

MODEL_PATH = ARTIFACT_DIR / "budgetbuddy_autocat_pipeline.joblib"
META_PATH = ARTIFACT_DIR / "budgetbuddy_autocat_metadata.json"

OUT_DIR = BASE_DIR / "step7_outputs"
OUT_DIR.mkdir(exist_ok=True)

CANDIDATE_DIR = OUT_DIR / "candidate_model"
CANDIDATE_DIR.mkdir(exist_ok=True)

RANDOM_STATE = 42
TEST_SIZE = 0.20
MIN_MACRO_F1 = 0.88
MIN_ACCURACY = 0.90
MAX_MACRO_F1_DROP = 0.01
MAX_ACCURACY_DROP = 0.01

DATABASE_URL = "postgresql://neondb_owner:npg_FHKq0Cf2rjwD@ep-blue-cloud-ah0xh8zi.c-3.us-east-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require"
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")


def safe_text(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return text


def clean_text(s: str) -> str:
    s = str(s).lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s&/-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def type_token(t: str) -> str:
    t = str(t).strip().lower()
    if t == "expense":
        return "[TYPE_EXPENSE]"
    if t == "income":
        return "[TYPE_INCOME]"
    if t == "" or t == "nan":
        return "[TYPE_UNKNOWN]"
    return f"[TYPE_{t.upper().replace(' ', '_')}]"


def normalize_for_grouping(text: str) -> str:
    text = str(text).lower().strip()
    text = re.sub(r"\d+", " ", text)
    text = re.sub(r"[^\w\s&/-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_base_training_table() -> pd.DataFrame:
    df = pd.read_csv(INPUT_PATH)

    required_cols = [
        "note",
        "note_clean",
        "type",
        "type_token",
        "amount",
        "date_time",
        "category",
        "model_text_textonly",
        "model_text_with_type",
    ]

    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column in base training table: {col}")

    df = df.copy()
    for col in ["note", "note_clean", "type", "type_token", "category", "model_text_textonly", "model_text_with_type"]:
        df[col] = df[col].astype(str).str.strip()

    df = df[
        (df["category"] != "")
        & (df["note_clean"] != "")
        & (df["model_text_with_type"] != "")
    ].copy()

    return df[required_cols]


def load_metadata() -> dict:
    with open(META_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_untrained_feedback() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    original_message,
                    amount::text AS amount,
                    type,
                    merchant,
                    description,
                    cleaned_note,
                    type_token,
                    model_text,
                    predicted_category,
                    final_category,
                    was_corrected,
                    used_for_training,
                    created_at
                FROM prediction_feedback
                WHERE used_for_training = false
                ORDER BY created_at ASC, id ASC
                """
            )
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
        return pd.DataFrame(rows, columns=columns)
    finally:
        conn.close()


def build_feedback_training_table(feedback_df: pd.DataFrame, official_classes: set[str]) -> pd.DataFrame:
    rows = []

    for record in feedback_df.to_dict(orient="records"):
        feedback_id = int(record["id"])
        tx_type = safe_text(record.get("type")).lower()
        final_category = safe_text(record.get("final_category"))

        if tx_type not in {"income", "expense"}:
            continue

        if not final_category or final_category not in official_classes:
            continue

        raw_note = safe_text(record.get("original_message"))
        if not raw_note:
            raw_note = " ".join(
                part for part in [
                    safe_text(record.get("merchant")),
                    safe_text(record.get("description")),
                ]
                if part
            ).strip()

        if not raw_note:
            continue

        note_clean = safe_text(record.get("cleaned_note")) or clean_text(raw_note)
        tx_type_token = safe_text(record.get("type_token")) or type_token(tx_type)
        model_text_with_type = safe_text(record.get("model_text")) or f"{tx_type_token} {note_clean}".strip()

        if not note_clean or not model_text_with_type:
            continue

        rows.append(
            {
                "feedback_id": feedback_id,
                "note": raw_note,
                "note_clean": note_clean,
                "type": tx_type,
                "type_token": tx_type_token,
                "amount": safe_text(record.get("amount")) or None,
                "date_time": safe_text(record.get("created_at")) or None,
                "category": final_category,
                "model_text_textonly": note_clean,
                "model_text_with_type": model_text_with_type,
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=[
                "feedback_id",
                "note",
                "note_clean",
                "type",
                "type_token",
                "amount",
                "date_time",
                "category",
                "model_text_textonly",
                "model_text_with_type",
            ]
        )

    df = pd.DataFrame(rows)
    df = df.drop_duplicates(
        subset=["model_text_with_type", "category"],
        keep="last",
    ).reset_index(drop=True)

    return df


def evaluate_combined_dataset(df: pd.DataFrame) -> dict:
    eval_df = df.copy()
    eval_df["group_key"] = eval_df["note_clean"].apply(normalize_for_grouping)
    eval_df = eval_df[
        (eval_df["category"] != "")
        & (eval_df["note_clean"] != "")
        & (eval_df["model_text_with_type"] != "")
    ].copy()

    gss = GroupShuffleSplit(
        n_splits=1,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
    )

    train_idx, test_idx = next(
        gss.split(
            eval_df,
            y=eval_df["category"],
            groups=eval_df["group_key"],
        )
    )

    train_df = eval_df.iloc[train_idx].copy()
    test_df = eval_df.iloc[test_idx].copy()

    pipeline = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=2,
                    sublinear_tf=True,
                ),
            ),
            ("clf", LinearSVC()),
        ]
    )

    pipeline.fit(train_df["model_text_with_type"], train_df["category"])
    y_pred = pipeline.predict(test_df["model_text_with_type"])

    accuracy = accuracy_score(test_df["category"], y_pred)
    macro_f1 = f1_score(test_df["category"], y_pred, average="macro")

    report = classification_report(
        test_df["category"],
        y_pred,
        output_dict=True,
        zero_division=0,
    )

    predictions_df = pd.DataFrame(
        {
            "text_used_by_model": test_df["model_text_with_type"].values,
            "actual_category": test_df["category"].values,
            "predicted_category": y_pred,
        }
    )

    predictions_df.to_csv(OUT_DIR / "feedback_retraining_eval_predictions.csv", index=False)
    pd.DataFrame(report).transpose().to_csv(
        OUT_DIR / "feedback_retraining_classification_report.csv"
    )

    return {
        "accuracy": float(round(accuracy, 4)),
        "macro_f1": float(round(macro_f1, 4)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "unique_groups": int(eval_df["group_key"].nunique()),
    }


def train_final_pipeline(df: pd.DataFrame):
    pipeline = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=2,
                    sublinear_tf=True,
                ),
            ),
            ("clf", LinearSVC()),
        ]
    )

    pipeline.fit(df["model_text_with_type"], df["category"])
    return pipeline


def backup_existing_artifacts():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if MODEL_PATH.exists():
        shutil.copy2(
            MODEL_PATH,
            ARTIFACT_DIR / f"budgetbuddy_autocat_pipeline_backup_{timestamp}.joblib",
        )

    if META_PATH.exists():
        shutil.copy2(
            META_PATH,
            ARTIFACT_DIR / f"budgetbuddy_autocat_metadata_backup_{timestamp}.json",
        )


def mark_feedback_as_used(feedback_ids: list[int]):
    if not feedback_ids:
        return

    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE prediction_feedback SET used_for_training = true WHERE id = ANY(%s)",
                (feedback_ids,),
            )
        conn.commit()
    finally:
        conn.close()


def get_current_eval(metadata: dict) -> dict | None:
    value = metadata.get("retraining_evaluation")
    if isinstance(value, dict):
        return value
    return None


def decide_promotion(current_eval: dict | None, candidate_eval: dict) -> dict:
    required_macro_f1 = MIN_MACRO_F1
    required_accuracy = MIN_ACCURACY

    if current_eval:
        current_macro_f1 = float(current_eval.get("macro_f1", 0))
        current_accuracy = float(current_eval.get("accuracy", 0))
        required_macro_f1 = max(required_macro_f1, round(current_macro_f1 - MAX_MACRO_F1_DROP, 4))
        required_accuracy = max(required_accuracy, round(current_accuracy - MAX_ACCURACY_DROP, 4))

    reasons = []

    if candidate_eval["macro_f1"] < required_macro_f1:
        reasons.append(
            f"macro_f1 {candidate_eval['macro_f1']:.4f} is below required {required_macro_f1:.4f}"
        )

    if candidate_eval["accuracy"] < required_accuracy:
        reasons.append(
            f"accuracy {candidate_eval['accuracy']:.4f} is below required {required_accuracy:.4f}"
        )

    return {
        "approved": len(reasons) == 0,
        "required_macro_f1": required_macro_f1,
        "required_accuracy": required_accuracy,
        "reasons": reasons,
    }


def build_candidate_metadata(
    metadata: dict,
    combined_df: pd.DataFrame,
    feedback_rows_added: int,
    evaluation: dict,
) -> dict:
    new_metadata = dict(metadata)
    new_metadata["training_rows"] = int(len(combined_df))
    new_metadata["num_classes"] = int(combined_df["category"].nunique())
    new_metadata["classes"] = sorted(
        combined_df["category"].astype(str).str.strip().unique().tolist()
    )
    new_metadata["feedback_rows_added"] = int(feedback_rows_added)
    new_metadata["retrained_at"] = datetime.now(timezone.utc).isoformat()
    new_metadata["retraining_evaluation"] = evaluation
    return new_metadata


def save_candidate_artifacts(pipeline, metadata: dict) -> tuple[Path, Path]:
    candidate_model_path = CANDIDATE_DIR / "budgetbuddy_autocat_pipeline_candidate.joblib"
    candidate_meta_path = CANDIDATE_DIR / "budgetbuddy_autocat_metadata_candidate.json"

    joblib.dump(pipeline, candidate_model_path)

    with open(candidate_meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    return candidate_model_path, candidate_meta_path


def promote_candidate(candidate_model_path: Path, candidate_meta_path: Path):
    backup_existing_artifacts()
    shutil.copy2(candidate_model_path, MODEL_PATH)
    shutil.copy2(candidate_meta_path, META_PATH)


def main():
    metadata = load_metadata()
    official_classes = set(metadata.get("classes", []))

    if not official_classes:
        raise RuntimeError("Metadata classes are missing")

    base_df = load_base_training_table()
    raw_feedback_df = fetch_untrained_feedback()

    if raw_feedback_df.empty:
        print("No new feedback rows found. Nothing to retrain.")
        return

    feedback_train_df = build_feedback_training_table(raw_feedback_df, official_classes)

    if feedback_train_df.empty:
        print("No eligible feedback rows matched the official category set. Nothing to retrain.")
        return

    feedback_ids_to_mark = feedback_train_df["feedback_id"].astype(int).tolist()

    feedback_train_df.drop(columns=["feedback_id"]).to_csv(
        OUT_DIR / "feedback_training_rows.csv",
        index=False,
    )

    combined_df = pd.concat(
        [
            base_df,
            feedback_train_df.drop(columns=["feedback_id"]),
        ],
        ignore_index=True,
    )

    combined_df.to_csv(
        OUT_DIR / "training_ready_table_with_feedback.csv",
        index=False,
    )

    evaluation = evaluate_combined_dataset(combined_df)
    pipeline = train_final_pipeline(combined_df)

    candidate_metadata = build_candidate_metadata(
        metadata=metadata,
        combined_df=combined_df,
        feedback_rows_added=len(feedback_train_df),
        evaluation=evaluation,
    )

    candidate_model_path, candidate_meta_path = save_candidate_artifacts(
        pipeline=pipeline,
        metadata=candidate_metadata,
    )

    current_eval = get_current_eval(metadata)
    gating = decide_promotion(current_eval=current_eval, candidate_eval=evaluation)

    summary = {
        "approved": gating["approved"],
        "current_eval": current_eval,
        "candidate_eval": evaluation,
        "required_macro_f1": gating["required_macro_f1"],
        "required_accuracy": gating["required_accuracy"],
        "reasons": gating["reasons"],
        "feedback_rows_added": int(len(feedback_train_df)),
        "candidate_model_path": str(candidate_model_path),
        "candidate_meta_path": str(candidate_meta_path),
        "production_model_path": str(MODEL_PATH),
        "production_meta_path": str(META_PATH),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    with open(OUT_DIR / "retraining_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 80)
    print("STEP 7 — RETRAIN FROM FEEDBACK")
    print("=" * 80)
    print(f"Base training rows      : {len(base_df)}")
    print(f"Feedback rows added     : {len(feedback_train_df)}")
    print(f"Final training rows     : {len(combined_df)}")
    print(f"Candidate accuracy      : {evaluation['accuracy']}")
    print(f"Candidate macro F1      : {evaluation['macro_f1']}")
    print(f"Required accuracy       : {gating['required_accuracy']}")
    print(f"Required macro F1       : {gating['required_macro_f1']}")
    print(f"Candidate model saved   : {candidate_model_path}")
    print(f"Candidate metadata saved: {candidate_meta_path}")
    print(f"Summary saved           : {OUT_DIR / 'retraining_summary.json'}")

    if gating["approved"]:
        promote_candidate(candidate_model_path, candidate_meta_path)
        mark_feedback_as_used(feedback_ids_to_mark)

        print("\nPROMOTION RESULT         : APPROVED")
        print(f"Production model updated: {MODEL_PATH}")
        print(f"Production metadata     : {META_PATH}")
        print(f"Feedback rows marked    : {len(feedback_ids_to_mark)}")
    else:
        print("\nPROMOTION RESULT         : REJECTED")
        print("Production model kept as-is")
        print("Feedback rows were not marked as used")
        for reason in gating["reasons"]:
            print(f"- {reason}")


if __name__ == "__main__":
    main()