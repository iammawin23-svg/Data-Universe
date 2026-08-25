from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic import BaseModel
from typing import List
from engine import generate_universe, get_song_neighbors, search_songs, get_cluster_insights, rebuild_universe

app = FastAPI(title="Data Universe API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RebuildRequest(BaseModel):
    features: List[str]

@app.post("/rebuild")
def rebuild(req: RebuildRequest):
    return rebuild_universe(req.features)

@app.get("/universe")
def get_universe():
    return generate_universe()

@app.post("/rebuild")
def rebuild_universe(req: RebuildRequest):
    return generate_universe(req.features)

@app.get("/neighbors/{track_id}")
def fetch_neighbors(track_id: str, limit: int = 5):
    return get_song_neighbors(track_id, limit)

@app.get("/search")
def search(q: str):
    if not q or len(q) < 2:
        return []
    return search_songs(q)

@app.get("/cluster/{cluster_id}")
def cluster_insights(cluster_id: int):
    return get_cluster_insights(cluster_id)