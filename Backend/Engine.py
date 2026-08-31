import pandas as pd
import numpy as np
from fastapi.responses import Response
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import MiniBatchKMeans
from sklearn.neighbors import NearestNeighbors
import umap
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

genre_to_super = {sub: {"name": sup, "id": i} for i, (sup, subs) in enumerate(SUPER_GENRES.items()) for sub in subs}

global_state = {"df": None, "X_scaled": None, "nn_model": None}

def generate_universe(custom_features=None, algorithm='pca', dataset='spotify'):
    total_start = time.time()
    print(f"\nBooting {dataset.upper()} Universe with {algorithm.upper()}...")

    if dataset == 'anime':
        df = pd.read_csv('../Data/Raw/mal_anime.csv')
        for col in ['Episodes', 'Ranked', 'Popularity', 'Members', 'Favorites']:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', '').str.replace('#', ''), errors='coerce').fillna(0)
            
        df = df.rename(columns={'myanimelist_id': 'track_id', 'title': 'track_name', 'Studios': 'artists', 'Type': 'super_genre', 'Genres': 'track_genre', 'Score': 'energy', 'Popularity': 'popularity', 'Episodes': 'episodes', 'Ranked': 'ranked', 'Members': 'members', 'Favorites': 'favorites'})
        for col in ['danceability', 'tempo', 'loudness', 'valence', 'acousticness', 'instrumentalness', 'liveness', 'speechiness']: df[col] = 0.5 
        df = df.dropna(subset=['track_name']).reset_index(drop=True)
    else:
        df = pd.read_csv('../Data/Raw/spotify_data.csv').dropna().reset_index(drop=True)
        df['super_genre'] = df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other"})['name'])
    
    custom_features = custom_features or ['popularity', 'danceability', 'energy', 'loudness', 'valence', 'tempo']
    valid_features = [f for f in custom_features if f in df.columns] or ['energy']

    for col in valid_features:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    X_scaled = StandardScaler().fit_transform(df[valid_features])

    if dataset == 'anime':
        def assign_anime_cluster(row):
            g, t = str(row.get('track_genre', '')).lower(), str(row.get('super_genre', '')).lower()
            if any(x in g for x in ['action', 'shounen', 'martial arts']): return 0
            if any(x in g for x in ['romance', 'drama']): return 1
            if any(x in g for x in ['sci-fi', 'mecha', 'space']): return 2
            if any(x in g for x in ['comedy', 'slice of life', 'parody']): return 3
            if any(x in g for x in ['fantasy', 'magic', 'supernatural']): return 4
            if any(x in g for x in ['mystery', 'psychological', 'horror']): return 5
            return 6 if t in ['movie', 'ova', 'ona', 'special'] else 7
        df['color_id'] = df.apply(assign_anime_cluster, axis=1)
    else:
        df['color_id'] = df['track_genre'].apply(lambda x: genre_to_super.get(x, {"id": 7})['id'])

    if algorithm.lower() == 'umap':
        local_coords = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, n_jobs=-1).fit_transform(X_scaled)
    else:
        n_comp = min(len(valid_features), 3)
        local_coords = np.zeros((len(df), 3))
        local_coords[:, :n_comp] = PCA(n_components=n_comp, random_state=42).fit_transform(X_scaled)

    np.random.seed(42)
    cluster_radii = np.random.uniform(140, 250, size=8)
    cluster_angles = np.linspace(0, 2 * np.pi, 8, endpoint=False) + np.random.uniform(-0.3, 0.3, size=8)
    
    macro_x = cluster_radii[df['color_id']] * np.cos(cluster_angles[df['color_id']])
    macro_y = cluster_radii[df['color_id']] * np.sin(cluster_angles[df['color_id']])
    macro_z = np.random.normal(0, 4, size=8)[df['color_id']] 
    
    mult_x, mult_y, mult_z = (12, 12, 12) if algorithm.lower() == 'umap' else (28, 12, 18)
    lx = local_coords[:, 0] * mult_x + np.random.normal(0, 2.5, size=len(df))
    ly = local_coords[:, 1] * mult_y + np.random.normal(0, 2.5, size=len(df))
    lz = local_coords[:, 2] * mult_z + np.random.normal(0, 2.5, size=len(df))
    
    point_rot = np.random.uniform(0, 2 * np.pi, size=8)[df['color_id']]
    df['x'] = macro_x + (lx * np.cos(point_rot) - ly * np.sin(point_rot))
    df['y'] = macro_y + (lx * np.sin(point_rot) + ly * np.cos(point_rot))
    df['z'] = macro_z + lz

    global_state.update({"df": df, "X_scaled": X_scaled, "nn_model": NearestNeighbors(metric='euclidean', algorithm='kd_tree').fit(X_scaled)})

    df[['color_id', 'x', 'y', 'z']] = df[['color_id', 'x', 'y', 'z']].astype({'color_id': int, 'x': float, 'y': float, 'z': float})
    
    export_cols = ['track_id', 'track_name', 'artists', 'super_genre', 'track_genre', 'color_id', 'x', 'y', 'z', 'popularity', 'energy', 'danceability', 'tempo', 'loudness', 'valence', 'acousticness', 'instrumentalness', 'liveness', 'speechiness', 'episodes', 'ranked', 'members', 'favorites'] 
                   
    valid_export = [c for c in export_cols if c in df.columns]
    for col in valid_export:
        if df[col].dtype in ['float64', 'int64']: df[col] = df[col].fillna(0)
            
    json_str = df[valid_export].to_json(orient='records')
    print(f"Universe Built in {time.time() - total_start:.2f} seconds!\n")

    return Response(content=json_str, media_type="application/json")


def get_song_neighbors(track_id, limit=5):
    df, X_scaled, nn = global_state["df"], global_state["X_scaled"], global_state["nn_model"]
    if df is None or nn is None: return {"error": "Universe not built yet."}

    song_idx_list = df.index[df['track_id'].astype(str) == str(track_id)].tolist()
    if not song_idx_list: return {"error": "Song not found."}
    
    query_song = df.iloc[song_idx_list[0]]
    distances, indices = nn.kneighbors([X_scaled[song_idx_list[0]]], n_neighbors=100)

    neighbors_list, seen = [], {(str(query_song['track_name']).lower(), str(query_song['artists']).lower())}

    for i in range(1, len(indices[0])): 
        row = df.iloc[indices[0][i]]
        identity = (str(row['track_name']).lower(), str(row['artists']).lower())
        
        if identity not in seen:
            seen.add(identity)
            neighbor_data = {
                "track_id": str(row['track_id']), "track_name": str(row['track_name']), "artists": str(row['artists']),
                "super_genre": str(row['super_genre']), "track_genre": str(row['track_genre']),
                "match": max(0, int(100 - (distances[0][i] * 35))), "color_id": int(row['color_id']),
                "x": float(row['x']), "y": float(row['y']), "z": float(row['z'])
            }
            neighbors_list.append(neighbor_data)
            if len(neighbors_list) >= limit: break
            
    return neighbors_list


def search_songs(query: str, limit: int = 8):
    if global_state["df"] is None: return []
    q = query.lower()
    mask = global_state["df"]['track_name'].str.lower().str.contains(q, na=False) | global_state["df"]['artists'].str.lower().str.contains(q, na=False)
    results = global_state["df"][mask].head(limit)
    
    return [{"track_id": str(r['track_id']), "track_name": str(r['track_name']), "artists": str(r['artists']), "super_genre": str(r['super_genre']), "track_genre": str(r['track_genre']), "color_id": int(r['color_id'])} for _, r in results.iterrows()]


def get_cluster_insights(cluster_id: int):
    df = global_state["df"]
    if df is None: return {"error": "Universe not built yet."}
        
    cluster_df = df[df['color_id'] == cluster_id]
    if cluster_df.empty: return {"error": "Cluster not found."}
        
    features = ['energy', 'popularity', 'episodes', 'members', 'favorites'] if 'episodes' in df.columns else ['danceability', 'energy', 'valence', 'popularity', 'loudness']
    
    return {
        "cluster_id": cluster_id,
        "count": len(cluster_df),
        "stats": {f: float(cluster_df[f].mean()) for f in features if f in cluster_df.columns},
        "top_genres": cluster_df['track_genre'].value_counts().head(3).index.tolist()
    }