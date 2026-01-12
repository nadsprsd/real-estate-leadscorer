import pandas as pd
import random

N = 50000

rows = []

for i in range(N):
    budget = random.choice([100000, 200000, 300000, 500000, 750000, 1000000, 2000000, 5000000])
    urgency = random.randint(0, 90)
    views = random.randint(0, 50)
    saves = random.randint(0, 20)
    bedrooms = random.randint(1, 6)
    preapproved = random.choice([0, 1])
    open_house = random.choice([0, 1])
    agent_response_hours = random.randint(0, 72)

    score = 0
    if budget >= 500000: score += 1
    if urgency <= 30: score += 1
    if preapproved == 1: score += 1
    if views >= 10: score += 1
    if saves >= 3: score += 1

    converted = 1 if score >= 3 and random.random() > 0.3 else 0

    rows.append({
        "budget": budget,
        "urgency": urgency,
        "views": views,
        "saves": saves,
        "bedrooms": bedrooms,
        "preapproved": preapproved,
        "open_house": open_house,
        "agent_response_hours": agent_response_hours,
        "converted": converted
    })

df = pd.DataFrame(rows)
df.to_csv("leads.csv", index=False)

print("Generated leads.csv with", len(df), "rows")
