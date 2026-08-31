import time
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
from engine import generate_universe, get_song_neighbors, search_songs, get_cluster_insights

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
    algorithm: str = "pca"
    dataset: str = "spotify" 

@app.get("/universe")
def get_initial_universe():
    return generate_universe(["energy", "danceability", "valence"], "pca", "spotify")

@app.post("/rebuild")
def rebuild(req: RebuildRequest):
    return generate_universe(req.features, req.algorithm, req.dataset)

@app.get("/neighbors/{track_id}")
def fetch_neighbors(track_id: str, limit: int = 5):
    return get_song_neighbors(track_id, limit)

@app.get("/search")
def search(q: str):
    if not q or len(q) < 2: return []
    return search_songs(q)

@app.get("/cluster/{cluster_id}")
def cluster_insights(cluster_id: int):
    return get_cluster_insights(cluster_id)

if os.path.exists("dist/assets"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

@app.get("/{file_name}.jpg")
def serve_images(file_name: str):
    file_path = f"dist/{file_name}.jpg"
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "Image not found"}

@app.get("/")
def serve_frontend():
    return FileResponse("dist/index.html")