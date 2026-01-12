from fastapi import FastAPI

app = FastAPI(
    title = "Real Estate Lead Scorer",
    version= "1.0.0"
)


@app.get("/")
def health():
    return{"status":"ok"}
