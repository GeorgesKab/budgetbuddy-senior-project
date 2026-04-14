export type RankedPrediction = {
  category: string;
  score: number;
};

export type TransactionAiMeta = {
  modelName: string;
  inputVariant: string;
  cleanedNote: string;
  typeToken: string;
  modelText: string;
  predictedCategory: string;
  topPredictions: RankedPrediction[];
  suggestionAccepted: boolean;
  userCorrected: boolean;
};