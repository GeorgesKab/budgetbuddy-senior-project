from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
import joblib
import json
import re
from typing import List

# =========================================================
# CONFIG
# =========================================================
MODEL_PATH = Path("step5_model_artifacts/budgetbuddy_autocat_pipeline.joblib")
META_PATH = Path("step5_model_artifacts/budgetbuddy_autocat_metadata.json")

# =========================================================
# LOAD MODEL + METADATA
# =========================================================
if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)

metadata = {}
if META_PATH.exists():
    with open(META_PATH, "r", encoding="utf-8") as f:
        metadata = json.load(f)

# =========================================================
# FASTAPI APP
# =========================================================
app = FastAPI(
    title="BudgetBuddy Auto-Categorization API",
    version="1.0.0",
    description="Local ML inference service for transaction category prediction."
)

# Allow local frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# REQUEST / RESPONSE SCHEMAS
# =========================================================
class PredictRequest(BaseModel):
    note: str = Field(..., min_length=1, description="Raw transaction note")
    type: str = Field(..., min_length=1, description="Transaction type, e.g. Expense or Income")
    top_k: int = Field(default=3, ge=1, le=5)

class RankedPrediction(BaseModel):
    category: str
    score: float

class PredictResponse(BaseModel):
    input_note: str
    input_type: str
    cleaned_note: str
    type_token: str
    model_text: str
    predicted_category: str
    top_predictions: List[RankedPrediction]
    model_name: str
    input_variant: str
    note: str

# =========================================================
# PREPROCESSING
# Must match training logic
# =========================================================
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
    elif t == "income":
        return "[TYPE_INCOME]"
    elif t == "" or t == "nan":
        return "[TYPE_UNKNOWN]"
    else:
        return f"[TYPE_{t.upper().replace(' ', '_')}]"

def build_model_text(note: str, tx_type: str) -> dict:
    cleaned_note = clean_text(note)
    tx_type_token = type_token(tx_type)
    model_text = f"{tx_type_token} {cleaned_note}".strip()
    return {
        "cleaned_note": cleaned_note,
        "type_token": tx_type_token,
        "model_text": model_text
    }

# =========================================================
# ROUTES
# =========================================================
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": True,
        "model_name": metadata.get("model_name", "BudgetBuddy Auto-Categorization"),
        "num_classes": metadata.get("num_classes"),
    }

@app.get("/metadata")
def get_metadata():
    return metadata

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    prepared = build_model_text(req.note, req.type)

    if not prepared["cleaned_note"]:
        raise HTTPException(status_code=400, detail="Transaction note becomes empty after cleaning.")

    text_for_model = prepared["model_text"]

    try:
        predicted_category = model.predict([text_for_model])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    # decision_function gives ranking scores, not probabilities
    try:
        scores = model.decision_function([text_for_model])[0]
        classes = list(model.named_steps["clf"].classes_)

        ranked = sorted(
            zip(classes, scores),
            key=lambda x: x[1],
            reverse=True
        )[:req.top_k]

        top_predictions = [
            RankedPrediction(category=cat, score=float(score))
            for cat, score in ranked
        ]
    except Exception:
        # fallback if decision_function is unavailable
        top_predictions = [RankedPrediction(category=str(predicted_category), score=0.0)]

    return PredictResponse(
        input_note=req.note,
        input_type=req.type,
        cleaned_note=prepared["cleaned_note"],
        type_token=prepared["type_token"],
        model_text=text_for_model,
        predicted_category=str(predicted_category),
        top_predictions=top_predictions,
        model_name=metadata.get("model_name", "BudgetBuddy Auto-Categorization"),
        input_variant=metadata.get("input_variant", "type_token + note_clean"),
        note="Scores are LinearSVC decision scores used for ranking; they are not probabilities."
    )