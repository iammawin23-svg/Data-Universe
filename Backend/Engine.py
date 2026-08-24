import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
import os
import math

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

def generate_universe(custom_features=None):
    filepath = "../Data/Raw/spotify_data.csv"
    if not os.path.exists(filepath):
        return {"error": "Dataset not found"}

    df = pd.read_csv(filepath).dropna()
    df = df.sample(n=2500, random_state=42).reset_index(drop=True)
    
    if not custom_features:
        custom_features = ['popularity', 'danceability', 'energy', 'loudness', 'valence', 'tempo']
    
    valid_features = [f for f in custom_features if f in df.columns]
    if len(valid_features) == 0:
        valid_features = ['energy']

    X_raw = df[valid_features]
    X_scaled = StandardScaler().fit_transform(X_raw)
    
    df['super_genre'] = df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['name'])
    df['color_id'] = df['track_genre'].apply(lambda x: genre_to_super.get(x, {"name": "Other", "id": 7})['id'])

    # 1. Coordinate Math
    if len(valid_features) == 1:
        pca_coords = np.zeros((len(df), 2))
        pca_coords[:, 0] = X_scaled[:, 0]
    else:
        pca_coords = PCA(n_components=2).fit_transform(X_scaled)

    final_x = []
    final_y = []
    for i in range(len(df)):
        c_id = df.iloc[i]['color_id']
        final_x.append((pca_coords[i, 0] * 3.0) + galaxy_anchors[c_id]["x"])
        final_y.append((pca_coords[i, 1] * 3.0) + galaxy_anchors[c_id]["y"])

    df['x'] = final_x
    df['y'] = final_y
    df['cluster'] = KMeans(n_clusters=8, random_state=42, n_init='auto').fit_predict(X_scaled)

    # 2. Similarity Engine (MOVED DOWN HERE so it can grab the X and Y!)
    nn = NearestNeighbors(n_neighbors=6, metric='euclidean')
    nn.fit(X_scaled)
    distances, indices = nn.kneighbors(X_scaled)
    
    neighbors_list = []
    for i in range(len(df)):
        song_neighbors = []
        for j in range(1, 6):
            idx = indices[i][j]
            dist = distances[i][j]
            match_pct = max(0, int(100 - (dist * 12)))
            # NEW: We now save the exact coordinate and color of the neighbor
            song_neighbors.append({
                "name": df.iloc[idx]['track_name'], 
                "artist": df.iloc[idx]['artists'], 
                "match": match_pct,
                "x": df.iloc[idx]['x'],
                "y": df.iloc[idx]['y'],
                "color_id": int(df.iloc[idx]['color_id'])
            })
        neighbors_list.append(song_neighbors)
    df['neighbors'] = neighbors_list
    
    return df[['track_id', 'track_name', 'artists', 'track_genre', 'super_genre', 'color_id', 'cluster', 'x', 'y', 'neighbors']].to_dict(orient='records')