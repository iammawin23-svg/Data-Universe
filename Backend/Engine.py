import pandas as pd
import numpy as np
from fastapi.responses import Response
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import MiniBatchKMeans
from sklearn.neighbors import NearestNeighbors
import umap
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

def generate_universe(custom_features=None, algorithm='pca', dataset='spotify'):
    
    if dataset == 'anime':
        print("\n--- LOADING ANIME UNIVERSE ---")
        df = pd.read_csv('../Data/Raw/mal_anime.csv')
        
        for col in ['Episodes', 'Ranked', 'Popularity', 'Members', 'Favorites']:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', '').str.replace('#', ''), errors='coerce').fillna(0)
            
        df = df.rename(columns={
            'myanimelist_id': 'track_id', 
            'title': 'track_name', 
            'Studios': 'artists',
            'Type': 'super_genre', 
            'Genres': 'track_genre', 
            'Score': 'energy',
            'Popularity': 'popularity',
            'Episodes': 'episodes',
            'Ranked': 'ranked',
            'Members': 'members',
            'Favorites': 'favorites'
        })

        for col in ['danceability', 'tempo', 'loudness', 'valence', 'acousticness', 'instrumentalness', 'liveness', 'speechiness']:
            df[col] = 0.5 
            
        df = df.dropna(subset=['track_name']).reset_index(drop=True)
        
    else:
        print("\n--- LOADING SPOTIFY UNIVERSE ---")
        df = pd.read_csv('../Data/Raw/spotify_data.csv').dropna().reset_index(drop=True)
        df['super_genre'] = df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other"})['name'])
    
    if not custom_features:
        custom_features = ['popularity', 'danceability', 'energy', 'loudness', 'valence', 'tempo']
    
    valid_features = [f for f in custom_features if f in df.columns]
    if len(valid_features) == 0:
        valid_features = ['energy']

    for col in valid_features:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    X_raw = df[valid_features]

    print(f"\n--- BOOTING UNIVERSE WITH FEATURES: {valid_features} ---")

    start = time.time()
    X_scaled = StandardScaler().fit_transform(X_raw)
    print(f"Scaling: {time.time() - start:.4f} seconds")

    start = time.time()
    
    if dataset == 'anime':
        print("Applying Smart Genre Clustering for Anime...")
        def assign_anime_cluster(row):
            g = str(row.get('track_genre', '')).lower()
            t = str(row.get('super_genre', '')).lower()

            if 'action' in g or 'shounen' in g or 'martial arts' in g: return 0
            if 'romance' in g or 'drama' in g: return 1
            if 'sci-fi' in g or 'mecha' in g or 'space' in g: return 2
            if 'comedy' in g or 'slice of life' in g or 'parody' in g: return 3
            if 'fantasy' in g or 'magic' in g or 'supernatural' in g: return 4
            if 'mystery' in g or 'psychological' in g or 'horror' in g: return 5
            
            if t in ['movie', 'ova', 'ona', 'special']: return 6
            return 7
            
        df['color_id'] = df.apply(assign_anime_cluster, axis=1)
        
    else:
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
    if algorithm.lower() == 'umap':
        print("Running UMAP")
        reducer = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, n_jobs=-1)
        local_coords = reducer.fit_transform(X_scaled)
    else:
        if len(valid_features) < 3:
            pca = PCA(n_components=len(valid_features), random_state=42)
            local_coords = np.zeros((len(df), 3))
            res = pca.fit_transform(X_scaled)
            for i in range(len(valid_features)):
                local_coords[:, i] = res[:, i]
        else:
            pca = PCA(n_components=3, random_state=42)
            local_coords = pca.fit_transform(X_scaled)
    print(f"3D {algorithm.upper()}: {time.time() - start:.4f} seconds")

    start = time.time()
    np.random.seed(42)
    
    cluster_radii = np.random.uniform(140, 250, size=8)
    cluster_angles = np.linspace(0, 2 * np.pi, 8, endpoint=False) + np.random.uniform(-0.3, 0.3, size=8)
    
    macro_x = cluster_radii[df['color_id']] * np.cos(cluster_angles[df['color_id']])
    macro_y = cluster_radii[df['color_id']] * np.sin(cluster_angles[df['color_id']])
    macro_z = np.random.normal(0, 4, size=8)[df['color_id']] 
    
    if algorithm.lower() == 'umap':
        lx = local_coords[:, 0] * 12 
        ly = local_coords[:, 1] * 12  
        lz = local_coords[:, 2] * 12
    else:
        lx = local_coords[:, 0] * 28 
        ly = local_coords[:, 1] * 12  
        lz = local_coords[:, 2] * 18
    
    lx += np.random.normal(0, 2.5, size=len(df))
    ly += np.random.normal(0, 2.5, size=len(df))
    lz += np.random.normal(0, 2.5, size=len(df))
    
    rot_angles = np.random.uniform(0, 2 * np.pi, size=8)
    point_rot = rot_angles[df['color_id']]
    
    final_local_x = lx * np.cos(point_rot) - ly * np.sin(point_rot)
    final_local_y = lx * np.sin(point_rot) + ly * np.cos(point_rot)
    
    df['x'] = macro_x + final_local_x
    df['y'] = macro_y + final_local_y
    df['z'] = macro_z + lz
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
    df['z'] = df['z'].astype(float)
    
    export_cols = ['track_id', 'track_name', 'artists', 'super_genre', 'track_genre', 'color_id', 'x', 'y', 'z', 
                   'popularity', 'energy', 'danceability', 'tempo', 'loudness', 'valence',
                   'acousticness', 'instrumentalness', 'liveness', 'speechiness',
                   'episodes', 'ranked', 'members', 'favorites'] 
                   
    valid_export = [c for c in export_cols if c in df.columns]
    
    for col in valid_export:
        if df[col].dtype in ['float64', 'int64']:
            df[col] = df[col].fillna(0)
            
    json_str = df[valid_export].to_json(orient='records')
    print(f"JSON Conversion: {time.time() - start:.4f} seconds")
    print("-----------------------------------\n")

    return Response(content=json_str, media_type="application/json")


def get_song_neighbors(track_id, limit=5):
    df = global_state["df"]
    X_scaled = global_state["X_scaled"]
    nn = global_state["nn_model"]

    if df is None or nn is None:
        return {"error": "Universe not built yet."}

    song_idx_list = df.index[df['track_id'].astype(str) == str(track_id)].tolist()
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
            "z": float(row['z']),
            "color_id": int(row['color_id']),
            "popularity": int(row.get('popularity', 0)),
            "energy": float(row.get('energy', 0)),
            "danceability": float(row.get('danceability', 0)),
            "tempo": float(row.get('tempo', 0)),
            "loudness": float(row.get('loudness', 0)),
            "valence": float(row.get('valence', 0)),
            "acousticness": float(row.get('acousticness', 0)),
            "instrumentalness": float(row.get('instrumentalness', 0)),
            "liveness": float(row.get('liveness', 0)),
            "speechiness": float(row.get('speechiness', 0))
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
        "y": float(row['y']),
        "z": float(row['z']),
        "popularity": int(row.get('popularity', 0)),
        "energy": float(row.get('energy', 0)),
        "danceability": float(row.get('danceability', 0)),
        "tempo": float(row.get('tempo', 0)),
        "loudness": float(row.get('loudness', 0)),
        "valence": float(row.get('valence', 0)),
        "acousticness": float(row.get('acousticness', 0)),
        "instrumentalness": float(row.get('instrumentalness', 0)),
        "liveness": float(row.get('liveness', 0)),
        "speechiness": float(row.get('speechiness', 0))
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