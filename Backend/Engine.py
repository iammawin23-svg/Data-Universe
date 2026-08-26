import pandas as pd
import numpy as np
from fastapi.responses import Response
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import MiniBatchKMeans
from sklearn.neighbors import NearestNeighbors
import os
import math
import time

SUPER_GENRES = {
    'Pop & Dance': ['pop', 'dance', 'edm', 'electro', 'k-pop', 'j-pop', 'synth-pop', 'power-pop', 'indie-pop', 'cantopop', 'mandopop', 'j-dance', 'j-idol', 'pop-film', 'disco'],
    'Rock & Punk': ['rock', 'alt-rock', 'punk-rock', 'hard-rock', 'grunge', 'emo', 'psych-rock', 'punk', 'rock-n-roll', 'rockabilly', 'indie', 'alternative', 'j-rock', 'ska', 'goth', 'british', 'german', 'french'],
    'Metal': ['metal', 'heavy-metal', 'death-metal', 'black-metal', 'metalcore', 'grindcore', 'hardcore', 'industrial'],
    'Hip-Hop & R&B': ['hip-hop', 'r-n-b', 'soul', 'funk', 'groove', 'trip-hop', 'reggae', 'dancehall', 'dub'],
    'Electronic': ['house', 'techno', 'trance', 'dubstep', 'drum-and-bass', 'deep-house', 'chicago-house', 'detroit-techno', 'minimal-techno', 'ambient', 'idm', 'chill', 'electronic', 'breakbeat', 'club', 'garage', 'hardstyle', 'progressive-house'],
    'Acoustic & Folk': ['acoustic', 'folk', 'bluegrass', 'country', 'honky-tonk', 'singer-songwriter', 'songwriter', 'guitar'],
    'World & Latin': ['latin', 'latino', 'reggaeton', 'salsa', 'samba', 'sertanejo', 'tango', 'afrobeat', 'brazil', 'forro', 'mpb', 'pagode', 'indian', 'iranian', 'malay', 'spanish', 'swedish', 'turkish', 'world-music'],
    'Classical & Other': ['classical', 'opera', 'piano', 'jazz', 'blues', 'comedy', 'kids', 'children', 'disney', 'show-tunes', 'sleep', 'study', 'new-age', 'romance', 'sad', 'happy', 'party', 'gospel', 'anime']
}

genre_to_super = {}
for i, (super_name, sub_genres) in enumerate(SUPER_GENRES.items()):
    for sub in sub_genres:
        genre_to_super[sub] = {"name": super_name, "id": i}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.abspath(os.path.join(BASE_DIR, "../Data/Raw/spotify_data.csv"))

if os.path.exists(DATA_PATH):
    print(f"Booting up... Loading full 114K dataset from {DATA_PATH}!")
    raw_df = pd.read_csv(DATA_PATH).dropna().reset_index(drop=True)
    
    raw_df['super_genre'] = raw_df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['name'])
    raw_df['color_id'] = raw_df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['id'])
    print(f"Dataset loaded successfully with {len(raw_df)} songs.")
else:
    print(f"CRITICAL ERROR: Could not find dataset at {DATA_PATH}")
    raw_df = None

global_state = {
    "df": None,
    "X_scaled": None,
    "nn_model": None
}

def generate_universe(custom_features=None):
    if raw_df is None:
        return {"error": "Dataset not found. Check terminal logs."}
    
    df = raw_df.copy()
    
    if not custom_features:
        custom_features = ['popularity', 'danceability', 'energy', 'loudness', 'valence', 'tempo']
    
    valid_features = [f for f in custom_features if f in df.columns]
    if len(valid_features) == 0:
        valid_features = ['energy']

    X_raw = df[valid_features]

    print(f"\n--- BOOTING UNIVERSE WITH FEATURES: {valid_features} ---")

    start = time.time()
    X_scaled = StandardScaler().fit_transform(X_raw)
    print(f"Scaling: {time.time() - start:.4f} seconds")

    start = time.time()
    kmeans = MiniBatchKMeans(n_clusters=8, random_state=42, batch_size=2048, n_init='auto')
    df['color_id'] = kmeans.fit_predict(X_scaled)
    print(f"Clustering: {time.time() - start:.4f} seconds")

    start = time.time()
    if len(valid_features) == 1:
        local_coords = np.zeros((len(df), 2))
        local_coords[:, 0] = X_scaled[:, 0]
    else:
        pca = PCA(n_components=2, random_state=42)
        local_coords = pca.fit_transform(X_scaled)
    print(f"PCA: {time.time() - start:.4f} seconds")

    start = time.time()
    np.random.seed(42)
    
    cluster_radii = np.random.uniform(60, 120, size=8)
    cluster_angles = np.linspace(0, 2 * np.pi, 8, endpoint=False) + np.random.uniform(-0.3, 0.3, size=8)
    
    macro_x = cluster_radii[df['color_id']] * np.cos(cluster_angles[df['color_id']])
    macro_y = cluster_radii[df['color_id']] * np.sin(cluster_angles[df['color_id']])
    
    lx = local_coords[:, 0] * 28 
    ly = local_coords[:, 1] * 8  
    
    rot_angles = np.random.uniform(0, 2 * np.pi, size=8)
    point_rot = rot_angles[df['color_id']]
    
    final_local_x = lx * np.cos(point_rot) - ly * np.sin(point_rot)
    final_local_y = lx * np.sin(point_rot) + ly * np.cos(point_rot)
    
    df['x'] = macro_x + final_local_x
    df['y'] = macro_y + final_local_y
    print(f"Coordinate Math: {time.time() - start:.4f} seconds")

    start = time.time()
    nn = NearestNeighbors(metric='euclidean', algorithm='kd_tree')
    nn.fit(X_scaled)
    print(f"Trained Search Tree: {time.time() - start:.4f} seconds")

    global_state["df"] = df
    global_state["X_scaled"] = X_scaled
    global_state["nn_model"] = nn

    start = time.time()
    df['color_id'] = df['color_id'].astype(int)
    df['x'] = df['x'].astype(float)
    df['y'] = df['y'].astype(float)
    
    json_str = df[['track_id', 'track_name', 'artists', 'super_genre', 'track_genre', 'color_id', 'x', 'y']].to_json(orient='records')
    print(f"JSON Conversion: {time.time() - start:.4f} seconds")
    print("-----------------------------------\n")

    return Response(content=json_str, media_type="application/json")


def get_song_neighbors(track_id, limit=5):
    df = global_state["df"]
    X_scaled = global_state["X_scaled"]
    nn = global_state["nn_model"]

    if df is None or nn is None:
        return {"error": "Universe not built yet."}

    song_idx_list = df.index[df['track_id'] == track_id].tolist()
    if not song_idx_list:
        return {"error": "Song not found."}
    
    song_idx = song_idx_list[0]
    song_vector = [X_scaled[song_idx]]
    query_song = df.iloc[song_idx]
    distances, indices = nn.kneighbors(song_vector, n_neighbors=100)

    neighbors_list = []
    
    seen_identities = set()
    
    query_identity = (str(query_song['track_name']).lower(), str(query_song['artists']).lower())
    seen_identities.add(query_identity)

    for i in range(1, len(indices[0])): 
        n_idx = indices[0][i]
        dist = distances[0][i]
        row = df.iloc[n_idx]
        
        neighbor_identity = (str(row['track_name']).lower(), str(row['artists']).lower())
        
        if neighbor_identity in seen_identities:
            continue
            
        seen_identities.add(neighbor_identity)
        
        match_pct = max(0, int(100 - (dist * 35)))
        
        neighbors_list.append({
            "track_id": str(row['track_id']),
            "track_name": str(row['track_name']),
            "artists": str(row['artists']),
            "super_genre": str(row['super_genre']),
            "track_genre": str(row['track_genre']),
            "match": match_pct,
            "x": float(row['x']),
            "y": float(row['y']),
            "color_id": int(row['color_id'])
        })
        
        if len(neighbors_list) >= limit:
            break
            
    return neighbors_list


def search_songs(query: str, limit: int = 8):
    df = global_state["df"]
    if df is None:
        return []
        
    q = query.lower()
    mask = df['track_name'].str.lower().str.contains(q, na=False) | \
           df['artists'].str.lower().str.contains(q, na=False)
           
    results = df[mask].head(limit)
    
    return [{
        "track_id": str(row['track_id']),
        "track_name": str(row['track_name']),
        "artists": str(row['artists']),
        "super_genre": str(row['super_genre']),
        "track_genre": str(row['track_genre']),
        "color_id": int(row['color_id']),
        "x": float(row['x']),
        "y": float(row['y'])
    } for _, row in results.iterrows()]


def get_cluster_insights(cluster_id: int):
    df = global_state["df"]
    if df is None:
        return {"error": "Universe not built yet."}
        
    cluster_df = df[df['color_id'] == cluster_id]
    if cluster_df.empty:
        return {"error": "Cluster not found."}
        
    features = ['danceability', 'energy', 'valence', 'popularity', 'loudness']
    
    stats = {}
    for f in features:
        if f in cluster_df.columns:
            stats[f] = float(cluster_df[f].mean())
            
    top_genres = cluster_df['track_genre'].value_counts().head(3).index.tolist()
    
    return {
        "cluster_id": cluster_id,
        "count": len(cluster_df),
        "stats": stats,
        "top_genres": top_genres
    }