import pandas as pd
import numpy as np
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

galaxy_anchors = {}
radius = 45.0 
for i in range(8):
    angle = (i / 8.0) * 2.0 * math.pi
    galaxy_anchors[i] = {"x": math.cos(angle) * radius, "y": math.sin(angle) * radius}

DATA_PATH = "../Data/Raw/spotify_data.csv"
if os.path.exists(DATA_PATH):
    print("Booting up... Loading full 114K dataset into memory!")
    raw_df = pd.read_csv(DATA_PATH).dropna().reset_index(drop=True)
    
    raw_df['super_genre'] = raw_df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['name'])
    raw_df['color_id'] = raw_df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['id'])
    print(f"Dataset loaded successfully with {len(raw_df)} songs.")
else:
    raw_df = None

global_state = {
    "df": None,
    "X_scaled": None,
    "nn_model": None
}

def generate_universe(custom_features=None):
    if raw_df is None:
        return {"error": "Dataset not found"}
    
    df = raw_df.copy()
    
    if not custom_features:
        custom_features = ['popularity', 'danceability', 'energy', 'loudness', 'valence', 'tempo']
    
    valid_features = [f for f in custom_features if f in df.columns]
    if len(valid_features) == 0:
        valid_features = ['energy']

    X_raw = df[valid_features]

    print("\n--- REBUILDING MASSIVE UNIVERSE ---")

    start = time.time()
    X_scaled = StandardScaler().fit_transform(X_raw)
    print(f"Scaling: {time.time() - start:.4f} seconds")

    start = time.time()
    df['cluster'] = MiniBatchKMeans(n_clusters=8, random_state=42, batch_size=2048, n_init='auto').fit_predict(X_scaled)
    print(f"Clustering: {time.time() - start:.4f} seconds")

    start = time.time()
    if len(valid_features) == 1:
        pca_coords = np.zeros((len(df), 2))
        pca_coords[:, 0] = X_scaled[:, 0]
    else:
        pca_coords = PCA(n_components=2).fit_transform(X_scaled)
    print(f"PCA: {time.time() - start:.4f} seconds")

    start = time.time()
    final_x = []
    final_y = []
    for i in range(len(df)):
        c_id = df.iloc[i]['color_id']
        final_x.append((pca_coords[i, 0] * 3.0) + galaxy_anchors[c_id]["x"])
        final_y.append((pca_coords[i, 1] * 3.0) + galaxy_anchors[c_id]["y"])
    df['x'] = final_x
    df['y'] = final_y
    print(f"Coordinate Math: {time.time() - start:.4f} seconds")

    start = time.time()
    nn = NearestNeighbors(metric='euclidean')
    nn.fit(X_scaled)
    print(f"Trained Search Tree: {time.time() - start:.4f} seconds")

    global_state["df"] = df
    global_state["X_scaled"] = X_scaled
    global_state["nn_model"] = nn

    start = time.time()
    result = df[['track_id', 'track_name', 'artists', 'track_genre', 'super_genre', 'color_id', 'cluster', 'x', 'y']].to_dict(orient='records')
    print(f"JSON Conversion: {time.time() - start:.4f} seconds")
    print("-----------------------------------\n")

    return result

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
    distances, indices = nn.kneighbors(song_vector, n_neighbors=40)

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

def rebuild_universe(active_features: list):
    df = global_state["df"]
    if df is None:
        return {"error": "No data loaded."}
        
    if not active_features:
        active_features = ['energy', 'danceability', 'tempo', 'loudness', 'valence', 'popularity']

    print(f"Rebuilding Universe using features: {active_features}")

    X = df[active_features].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = MiniBatchKMeans(n_clusters=8, random_state=42, batch_size=1024)
    df['color_id'] = kmeans.fit_predict(X_scaled)

    pca = PCA(n_components=2, random_state=42)
    coords = pca.fit_transform(X_scaled)
    df['x'] = coords[:, 0]
    df['y'] = coords[:, 1]

    nn = NearestNeighbors(metric='euclidean', algorithm='kd_tree')
    nn.fit(X_scaled)

    global_state["X_scaled"] = X_scaled
    global_state["nn_model"] = nn

    return [{
        "track_id": str(row['track_id']),
        "track_name": str(row['track_name']),
        "artists": str(row['artists']),
        "super_genre": str(row['super_genre']),
        "track_genre": str(row['track_genre']),
        "color_id": int(row['color_id']),
        "x": float(row['x']),
        "y": float(row['y'])
    } for _, row in df.iterrows()]
