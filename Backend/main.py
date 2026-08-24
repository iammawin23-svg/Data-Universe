from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
from engine import generate_universe

app = FastAPI(title="Data Universe API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RebuildRequest(BaseModel):
    features: list[str]

@app.get("/universe")
def get_universe():
    return generate_universe()

@app.post("/rebuild")
def rebuild_universe(request: RebuildRequest):
    print(f"Recalculating universe with: {request.features}")
    return generate_universe(request.features)