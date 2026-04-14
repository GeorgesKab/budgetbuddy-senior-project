export type RankedPrediction = {
  category: string;
  score: number;
};

export type AutoCategorizeResponse = {
  input_note: string;
  input_type: string;
  cleaned_note: string;
  type_token: string;
  model_text: string;
  predicted_category: string;
  top_predictions: RankedPrediction[];
  model_name: string;
  input_variant: string;
  note: string;
};

export async function predictCategory(
  note: string,
  type: string,
  topK = 3
): Promise<AutoCategorizeResponse> {
  const response = await fetch("/api/ml/predict-category", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      note,
      type,
      topK,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prediction failed: ${response.status} ${text}`);
  }

  return response.json();
}