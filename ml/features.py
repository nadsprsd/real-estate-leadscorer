import pandas as pd

# Load raw data
df = pd.read_csv("leads.csv")

# --- Feature engineering ---

# 1. Buyer readiness score (0–100)
df["buyer_readiness_score"] = (
    (df["budget"] >= 500000).astype(int) * 30 +
    (df["urgency"] <= 30).astype(int) * 30 +
    (df["preapproved"] == 1).astype(int) * 40
)

# 2. Engagement score (0–100)
df["engagement_score"] = (
    (df["views"] / 50.0) * 50 +
    (df["saves"] / 20.0) * 30 +
    (df["open_house"] == 1).astype(int) * 20
)

# 3. Speed-to-contact penalty (slower response = worse)
df["speed_penalty"] = df["agent_response_hours"].clip(0, 72) / 72.0 * 100

# 4. Final feature set
features = df[[
    "budget",
    "urgency",
    "views",
    "saves",
    "bedrooms",
    "preapproved",
    "open_house",
    "agent_response_hours",
    "buyer_readiness_score",
    "engagement_score",
    "speed_penalty",
    "converted"
]]

# Save engineered dataset
features.to_csv("leads_features.csv", index=False)

print("Saved leads_features.csv with shape:", features.shape)
print(features.head())
