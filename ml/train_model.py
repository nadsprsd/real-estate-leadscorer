import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
import joblib
import os

# Load engineered data
df = pd.read_csv("leads_features.csv")

# Split features and target
X = df.drop(columns=["converted"])
y = df["converted"]

# Train/validation split
X_train, X_val, y_train, y_val = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# XGBoost model
model = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric="auc",
    random_state=42
)

# Train
model.fit(X_train, y_train)

# Evaluate
y_pred = model.predict_proba(X_val)[:, 1]
auc = roc_auc_score(y_val, y_pred)

print(f"Validation AUC: {auc:.4f}")

# Save model
os.makedirs("../models", exist_ok=True)
joblib.dump(model, "../models/lead_scorer_v1.pkl")

print("Model saved to models/lead_scorer_v1.pkl")
