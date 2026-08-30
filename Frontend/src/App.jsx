import { useEffect, useState, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html, Stars } from '@react-three/drei'
import * as THREE from 'three'

const GALAXY_COLORS = ['#e36658', '#a0caf2', '#f5e7a9', '#d793f8', '#82e063', '#ffa346', '#464acd', '#ffffff']

const SPOTIFY_GALAXY_NAMES = ['Pop & Dance', 'Rock & Punk', 'Metal', 'Hip-Hop & R&B', 'Electronic', 'Acoustic & Folk', 'World & Latin', 'Classical & Other']
const ANIME_GALAXY_NAMES = ['Action & Shounen', 'Romance & Drama', 'Sci-Fi & Mecha', 'Comedy & Slice of Life', 'Fantasy & Isekai', 'Mystery & Psych', 'Movies & OVAs', 'Classics & Kids']

const SPOTIFY_FEATURES = { energy: true, danceability: true, tempo: true, loudness: true, valence: true, popularity: true, acousticness: true, instrumentalness: true, liveness: true, speechiness: true }
const ANIME_FEATURES = { energy: true, popularity: true, episodes: true, ranked: true, members: true, favorites: true }

function ZoomController({ zoomTick }) {
  const { camera } = useThree()
  const prevTick = useRef(zoomTick)

  useEffect(() => {
    if (zoomTick > prevTick.current) {
      camera.translateZ(-30) 
    } else if (zoomTick < prevTick.current) {
      camera.translateZ(30)  
    }
    prevTick.current = zoomTick
  }, [zoomTick, camera])
  
  return null
}

export default function App() {
  const [universeData, setUniverseData] = useState([])
  const [selectedStar, setSelectedStar] = useState(null)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const [showAllNeighbors, setShowAllNeighbors] = useState(false)
  
  const [features, setFeatures] = useState(SPOTIFY_FEATURES)
  
  const [buildStage, setBuildStage] = useState(null)
  const [buildProgress, setBuildProgress] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)
  const [isHomeView, setIsHomeView] = useState(true)
  const [resetTick, setResetTick] = useState(0)
  const [is2DMode, setIs2DMode] = useState(false)
  const [dimReduction, setDimReduction] = useState('pca')
  const [pointSizeBy, setPointSizeBy] = useState('default')
  const [visibleCluster, setVisibleCluster] = useState('all') 
  const [colorBy, setColorBy] = useState('cluster')
  const [showClusterPaths, setShowClusterPaths] = useState(false)
  const [zoomTick, setZoomTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [dataset, setDataset] = useState('spotify')
  const isFirstMount = useRef(true)

  const currentGalaxyNames = dataset === 'anime' ? ANIME_GALAXY_NAMES : SPOTIFY_GALAXY_NAMES

  const executeRebuild = (targetDataset, targetFeatures, targetDim) => {
    setSelectedStar(null)
    setSelectedCluster(null)
    setFocusTarget(null)
    setIsBuilding(true)
    setBuildProgress(0)
    setUniverseData([]) 

    setBuildStage(targetDataset === 'anime' ? 'ANALYZING 20,000 ANIME RELATIONSHIPS...' : 'ANALYZING 114,000 SONG RELATIONSHIPS...')

    const duration = targetDim === 'umap' ? 25000 : 5000 
    const intervalTime = 100
    const increment = 100 / (duration / intervalTime)

    const progressInterval = setInterval(() => {
      setBuildProgress(prev => {
        if (prev >= 95) return 95
        return prev + increment
      })
    }, intervalTime)

    const activeFeatures = Object.keys(targetFeatures).filter(k => targetFeatures[k])

    fetch('http://127.0.0.1:8000/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        features: activeFeatures, 
        algorithm: targetDim,
        dataset: targetDataset
      }) 
    })
      .then(res => {
        if (!res.ok) throw new Error("Backend connection failed")
        return res.json()
      })
      .then(data => {
        if (data.error) throw new Error(data.error)
        
        clearInterval(progressInterval) 
        setBuildProgress(100) 
        setBuildStage('UNIVERSE REBUILT')
        
        setTimeout(() => {
          setUniverseData(data)
          setIsFading(true)
          
          setTimeout(() => {
            setIsBuilding(false)
            setBuildStage(null)
            setIsFading(false)
          }, 1000)
        }, 800)
      })
      .catch(err => {
        console.error(err)
        clearInterval(progressInterval)
        setBuildStage('ERROR: BACKEND FAILED')
        setTimeout(() => {
          setIsBuilding(false)
          setBuildStage(null)
        }, 3000)
      })
  }

  useEffect(() => {
    fetch('http://127.0.0.1:8000/universe')
      .then(res => res.json())
      .then(data => setUniverseData(data))
      .catch(err => console.error("Fast boot failed:", err))
  }, [])

  useEffect(() => {
    const newFeatures = dataset === 'anime' ? ANIME_FEATURES : SPOTIFY_FEATURES
    setFeatures(newFeatures)
    setVisibleCluster('all')
    setPointSizeBy('default')
    setColorBy('cluster')
    
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    executeRebuild(dataset, newFeatures, dimReduction)
  }, [dataset])

  const handleRebuild = () => {
    executeRebuild(dataset, features, dimReduction)
  }

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(() => {
      fetch(`http://127.0.0.1:8000/search?q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => setSearchResults(data))
    }, 250)
    
    return () => clearTimeout(delay)
  }, [searchQuery])

  const handleSearchSelect = (song) => {
    setSearchQuery('')
    setSearchResults([])
    setSelectedCluster(null)
    setSelectedStar(song)
    setFocusTarget(song)
    setShowAllNeighbors(false)
    
    fetch(`http://127.0.0.1:8000/neighbors/${song.track_id}?limit=50`)
      .then(res => res.json())
      .then(neighborsData => {
        if (neighborsData.error) {
          setSelectedStar(prev => ({ ...prev, neighbors: [] }))
        } else {
          setSelectedStar(prev => ({ ...prev, neighbors: neighborsData }))
        }
      })
      .catch(err => console.error("Sniper fetch failed:", err))
  }

  const toggleFeature = (feat) => {
    setFeatures(prev => ({ ...prev, [feat]: !prev[feat] }))
  }

  const handleStarClick = (index) => {
    const clickedStar = universeData[index]
    setSelectedStar(clickedStar)
    setSelectedCluster(null)
    setShowAllNeighbors(false)
    setFocusTarget(clickedStar)

    fetch(`http://127.0.0.1:8000/neighbors/${clickedStar.track_id}?limit=50`)
      .then(res => res.json())
      .then(neighborsData => {
        if (neighborsData.error) {
          setSelectedStar(prev => ({ ...prev, neighbors: [] }))
        } else {
          setSelectedStar(prev => ({ ...prev, neighbors: neighborsData }))
        }
      })
      .catch(err => console.error("Sniper fetch failed:", err))
  }

  const filteredUniverse = useMemo(() => {
    if (visibleCluster === 'all') return universeData;
    return universeData.filter(star => star.color_id === parseInt(visibleCluster));
  }, [universeData, visibleCluster])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* 👇 SCROLLBAR NUKE: Kills scrollbars globally but keeps scrolling functional! */}
      <style>{`
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; ms-overflow-style: none; }
      `}</style>

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <Canvas camera={{ position: [0, 12, 130], fov: 60 }}>
          <SpaceBackground />
          <Stars 
            radius={300}
            depth={200}
            count={4000}      
            factor={6}        
            saturation={0.5}  
            fade={true}       
            speed={1.5}       
          />
          <OrbitControls 
            makeDefault 
            enableDamping 
            dampingFactor={0.05} 
            enableRotate={!is2DMode} 
            minDistance={20} 
            maxDistance={400}
            mouseButtons={{ 
              LEFT: is2DMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, 
              MIDDLE: THREE.MOUSE.DOLLY, 
              RIGHT: THREE.MOUSE.PAN 
            }}
          />
          <CameraTracker setIsHomeView={setIsHomeView} />
          <CameraRig focusTarget={focusTarget} resetTick={resetTick} is2DMode={is2DMode} />
          
          <ZoomController zoomTick={zoomTick} />

          {universeData.length > 0 && (
            <UniverseStars 
              is2DMode={is2DMode}
              pointSizeBy={pointSizeBy}
              colorBy={colorBy}
              showClusterPaths={showClusterPaths}
              dataset={dataset}
              galaxyNames={currentGalaxyNames}
              key={Date.now()}
              data={filteredUniverse}
              selectedStar={selectedStar}
              onStarClick={handleStarClick} 
              onGalaxyClick={(center, name) => {
                setFocusTarget(center)
                setSelectedStar(null)
                
                fetch(`http://127.0.0.1:8000/cluster/${center.id}`)
                  .then(res => res.json())
                  .then(data => {
                    if (data.error) {
                      console.error("Crash Prevented: Rebuild Universe First!", data.error)
                    } else {
                      setSelectedCluster({ ...data, name })
                    }
                  })
              }} 
            />
          )}
        </Canvas>
      </div>

      {isBuilding && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
          backgroundColor: 'rgba(5, 5, 5, 0.75)', backdropFilter: 'blur(6px)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', flexDirection: 'column', color: 'white',
          pointerEvents: 'auto', userSelect: 'none', opacity: isFading ? 0 : 1, transition: 'opacity 1s ease-in-out',
        }}>
          <h2 style={{ color: '#00ffff', letterSpacing: '4px', margin: '0 0 8px 0', textShadow: '0 0 15px rgba(0,229,255,0.4)', textTransform: 'uppercase' }}>
            {buildStage}
          </h2>
          
          <div style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', marginBottom: '16px', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(buildProgress)}%
          </div>

          <div style={{ width: '350px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', boxShadow: '0 0 20px rgba(170, 0, 255, 0.2)' }}>
            <div style={{ 
              width: `${buildProgress}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #aa00ff 0%, #00ffff 100%)', 
              transition: 'width 0.15s ease-out',
              boxShadow: '0 0 10px rgba(0, 255, 255, 0.8)'
            }} />
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 32px', pointerEvents: 'auto', background: 'linear-gradient(180deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0) 100%)' }}>
          
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', letterSpacing: '6px', color: '#fff', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
              DATA UNIVERSE
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#888' }}>Explore. Discover. Understand your data.</p>
          </div>

          <div style={{ flex: 1 }}></div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: '350px', position: 'relative' }}>
              <input
                type="text" placeholder="🔍 Search..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '12px 20px', borderRadius: '30px', background: 'rgba(20, 20, 25, 0.6)',
                  border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontFamily: 'sans-serif', outline: 'none',
                  backdropFilter: 'blur(10px)', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                }}
              />
              {searchResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '50px', left: 0, right: 0, background: 'rgba(15, 15, 20, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden', backdropFilter: 'blur(15px)', zIndex: 100
                }}>
                  {searchResults.map((song, i) => (
                    <div key={i} onClick={() => handleSearchSelect(song)}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '4px' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {song.track_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#aaaaaa', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{song.artists}</span><span style={{ color: '#00ffff' }}>{song.super_genre}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, padding: '0 32px 32px 32px', gap: '24px', overflow: 'visible', minHeight: 0 }}>
          
          <div style={{ width: '280px', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            
            {/* LEFT SIDEBAR */}
            <div style={{
              background: 'rgba(15, 15, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', 
              padding: '16px 20px',
              borderRadius: '12px', color: 'white', fontFamily: 'sans-serif', backdropFilter: 'blur(12px)',
              display: 'flex', flexDirection: 'column', gap: '10px',
              height: '100%',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Universe Controls</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#00ffff', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px' }}>Active Universe</h4>
                <select 
                  value={dataset} 
                  onChange={(e) => setDataset(e.target.value)} 
                  style={{ 
                    padding: '8px', background: 'rgba(0, 255, 255, 0.1)', border: '1px solid rgba(0, 255, 255, 0.4)', 
                    color: '#00ffff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' 
                  }}
                >
                  <option value="spotify">Spotify Tracks</option>
                  <option value="anime">Anime Catalog</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                {Object.keys(features).map(feature => {
                  let label = feature;
                  if (feature === 'danceability') label = 'Danceable';
                  if (feature === 'acousticness') label = 'Acoustic';
                  if (feature === 'instrumentalness') label = 'Instrumental';
                  if (feature === 'speechiness') label = 'Speech';
                  if (feature === 'energy' && dataset === 'anime') label = 'MAL Score';

                  return (
                    <label key={feature} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
                      <input 
                        type="checkbox" 
                        checked={features[feature]} 
                        onChange={() => toggleFeature(feature)} 
                        style={{ accentColor: '#aa00ff', cursor: 'pointer', width: '13px', height: '13px', margin: 0 }} 
                      />
                      <span style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{label}</span>
                    </label>
                  )
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}>Dimensionality Reduction</h4>
                <select value={dimReduction} onChange={(e) => setDimReduction(e.target.value)} style={{ padding: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <option value="pca">PCA</option>
                  <option value="umap">UMAP</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}>Visible Cluster</h4>
                <select value={visibleCluster} onChange={(e) => setVisibleCluster(e.target.value)} style={{ padding: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <option value="all">All Galaxies</option>
                  {currentGalaxyNames.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}>Point Size By</h4>
                <select value={pointSizeBy} onChange={(e) => setPointSizeBy(e.target.value)} style={{ padding: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <option value="default">Default</option>
                  <option value="popularity">{dataset === 'anime' ? 'MAL Popularity Rank' : 'Popularity'}</option>
                  <option value="energy">{dataset === 'anime' ? 'MAL Score' : 'Energy'}</option>
                  {dataset === 'spotify' && <option value="danceability">Danceability</option>}
                  {dataset === 'spotify' && <option value="valence">Valence (Mood)</option>}
                  {dataset === 'anime' && <option value="favorites">Total Favorites</option>}
                  {dataset === 'anime' && <option value="members">Total Members</option>}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}>Color By</h4>
                <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} style={{ padding: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <option value="cluster">Cluster (Theme)</option>
                  <option value="popularity">Popularity Heatmap</option>
                  <option value="energy">{dataset === 'anime' ? 'Score Heatmap' : 'Energy Heatmap'}</option>
                  {dataset === 'spotify' && <option value="danceability">Dance Heatmap</option>}
                  {dataset === 'spotify' && <option value="valence">Valence Heatmap</option>}
                  {dataset === 'anime' && <option value="favorites">Favorites Heatmap</option>}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px' }}>Universe View</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  
                  <button 
                    onClick={() => setIs2DMode(true)}
                    style={{
                      padding: '8px 14px',
                      background: is2DMode ? 'linear-gradient(90deg, rgba(170,0,255,0.4) 0%, rgba(85,0,255,0.4) 100%)' : 'rgba(0,0,0,0.4)',
                      border: `1px solid ${is2DMode ? '#aa00ff' : 'rgba(255,255,255,0.1)'}`,
                      color: is2DMode ? '#fff' : '#aaa',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'sans-serif',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem', opacity: is2DMode ? 1 : 0.5 }}>🌌</span> 
                    <span style={{ fontWeight: is2DMode ? 'bold' : 'normal' }}>2D Galaxy</span>
                  </button>

                  <button 
                    onClick={() => setIs2DMode(false)}
                    style={{
                      padding: '8px 14px',
                      background: !is2DMode ? 'linear-gradient(90deg, rgba(170,0,255,0.4) 0%, rgba(85,0,255,0.4) 100%)' : 'rgba(0,0,0,0.4)',
                      border: `1px solid ${!is2DMode ? '#aa00ff' : 'rgba(255,255,255,0.1)'}`,
                      color: !is2DMode ? '#fff' : '#aaa',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'sans-serif',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem', opacity: !is2DMode ? 1 : 0.5 }}>🧊</span> 
                    <span style={{ fontWeight: !is2DMode ? 'bold' : 'normal' }}>3D Galaxy</span>
                  </button>
                  
                </div>
              </div>

              <button onClick={handleRebuild} disabled={isBuilding} style={{
                marginTop: 'auto',
                minHeight: '40px',
                flexShrink: 0,
                border: 'none', color: 'white', borderRadius: '6px',
                cursor: isBuilding ? 'wait' : 'pointer', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.85rem',
                background: isBuilding ? '#555' : 'linear-gradient(90deg, #aa00ff 0%, #5500ff 100%)', 
              }}>
                {isBuilding ? 'CALCULATING...' : 'Rebuild Universe'}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', gap: '16px', pointerEvents: 'auto', marginTop: '-75px' }}>
              {[ 
                { val: universeData.length ? universeData.length.toLocaleString() : 0, label: dataset === 'anime' ? 'Shows' : 'Songs' },
                { val: '8', label: 'Clusters' },
                { val: Object.keys(features).filter(k => features[k]).length, label: 'Features' },
                { val: '2', label: 'Dimensions' }
              ].map((stat, i) => (
                <div key={i} style={{ 
                  background: 'rgba(20, 20, 25, 0.6)', border: '1px solid rgba(255,255,255,0.05)',
                  borderTop: '1px solid rgba(255,255,255,0.15)', padding: '12px 32px', borderRadius: '12px',
                  textAlign: 'center', minWidth: '90px', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#00e5ff', textShadow: '0 0 15px rgba(0,229,255,0.4)' }}>{stat.val}</div>
                  <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '6px' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              width: '100%', pointerEvents: 'auto', 
              marginTop: 'auto',
              fontFamily: 'sans-serif'
            }}>
              
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: '16px',
                background: 'rgba(15, 15, 20, 0.8)', padding: '12px 24px',
                borderRadius: '12px', 
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <button onClick={() => setZoomTick(p => p - 1)} style={{ fontFamily: 'sans-serif', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>➖</span> Zoom Out
                </button>
                <button onClick={() => setZoomTick(p => p + 1)} style={{ fontFamily: 'sans-serif', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>➕</span> Zoom In
                </button>
                
                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 8px' }} />
                
                <button onClick={() => { setFocusTarget(null); setResetTick(prev => prev + 1); }} style={{ fontFamily: 'sans-serif', background: 'transparent', border: 'none', color: '#00ffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  <span style={{ fontSize: '1.2rem' }}>🔄</span> Reset View
                </button>

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 8px' }} />
                
                <label style={{ fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '1px' }}>
                  Show Cluster Path
                  <div style={{
                    width: '36px', height: '20px', background: showClusterPaths ? '#aa00ff' : 'rgba(255,255,255,0.2)',
                    borderRadius: '10px', position: 'relative', transition: 'all 0.2s ease'
                  }}>
                    <div style={{
                      width: '16px', height: '16px', background: '#fff', borderRadius: '50%',
                      position: 'absolute', top: '2px', left: showClusterPaths ? '18px' : '2px', transition: 'all 0.2s ease'
                    }} />
                  </div>
                  <input type="checkbox" checked={showClusterPaths} onChange={() => setShowClusterPaths(!showClusterPaths)} style={{ display: 'none' }} />
                </label>
              </div>

              <div style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px',
                background: 'rgba(15, 15, 20, 0.8)', padding: '12px 24px',
                borderRadius: '12px', 
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                width: '100%', flexWrap: 'nowrap', overflowX: 'auto' 
              }}>
                {currentGalaxyNames.map((name, i) => (
                  <div key={i} style={{ fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#ccc', whiteSpace: 'nowrap' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: GALAXY_COLORS[i], boxShadow: `0 0 8px ${GALAXY_COLORS[i]}` }} />
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '16px', pointerEvents: 'auto', maxHeight: '100%' }}>
            
            {selectedStar && (
              <>
                <div style={{
                  background: 'rgba(15, 15, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px',
                  borderRadius: '12px', color: 'white', fontFamily: 'sans-serif', backdropFilter: 'blur(12px)'
                }}>
                  <h4 style={{ margin: '0 0 16px 0', color: '#ff0055', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px' }}>
                    Selected {dataset === 'anime' ? 'Anime' : 'Song'}
                  </h4>
                
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px', lineHeight: '1.2' }}>
                      {selectedStar.track_name}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
                      {selectedStar.artists}
                    </div>
                  </div>

                  {dataset === 'spotify' && (
                    <iframe 
                      src={`https://open.spotify.com/embed/track/${selectedStar.track_id}?utm_source=generator&theme=0`} 
                      width="100%" 
                      height="152" 
                      frameBorder="0" 
                      allowFullScreen="" 
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                      loading="lazy"
                      style={{ borderRadius: '12px', marginBottom: '16px', background: '#282828' }}
                    ></iframe>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                    <p style={{ margin: 0 }}><strong>Super Genre:</strong> <span style={{ color: '#00ffff' }}>{selectedStar.super_genre}</span></p>
                    <p style={{ margin: 0 }}><strong>Sub-Genre:</strong> <span style={{ color: '#888' }}>{selectedStar.track_genre}</span></p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                    {dataset === 'spotify' ? (
                      <button 
                        onClick={() => window.open(`https://genius.com/search?q=${encodeURIComponent(selectedStar.artists + ' ' + selectedStar.track_name)}`, '_blank')}
                        style={{ flex: 1, padding: '8px', background: '#ffff64', border: 'none', color: 'black', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                      >
                        📖 Lyrics
                      </button>
                    ) : (
                      <button 
                        onClick={() => window.open(`https://myanimelist.net/anime/${selectedStar.track_id}`, '_blank')}
                        style={{ flex: 1, padding: '8px', background: '#2e51a2', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                      >
                        📺 View MAL
                      </button>
                    )}
                    
                    <button 
                      onClick={() => setSelectedStar(null)} 
                      style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Close Details
                    </button>
                  </div>
                </div>

                {selectedStar.neighbors && (
                  <div style={{
                    background: 'rgba(15, 15, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px',
                    borderRadius: '12px', color: 'white', fontFamily: 'sans-serif', backdropFilter: 'blur(12px)',
                    flex: 1, overflowY: 'auto', minHeight: 0
                  }}>
                    <h4 style={{ margin: '0 0 16px 0', color: '#aa00ff', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Nearest Neighbors</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {selectedStar.neighbors.slice(0, showAllNeighbors ? 50 : 5).map((neighbor, idx) => (
                        <div key={idx} onClick={() => handleSearchSelect(neighbor)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingRight: '10px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{neighbor.track_name}</span>
                            <span style={{ fontSize: '0.75rem', color: '#888', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{neighbor.artists}</span>
                          </div>
                          <span style={{ fontSize: '0.85rem', color: neighbor.match > 85 ? '#00ff00' : '#ffcc00', fontWeight: 'bold' }}>{neighbor.match}%</span>
                        </div>
                      ))}
                    </div>

                    {!showAllNeighbors && selectedStar.neighbors.length > 5 && (
                      <button 
                        onClick={() => setShowAllNeighbors(true)}
                        style={{ 
                          width: '100%', marginTop: '20px', padding: '10px', background: 'rgba(255,255,255,0.05)', 
                          border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '6px', 
                          cursor: 'pointer', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' 
                        }}
                      >
                        View All Neighbors ({selectedStar.neighbors.length})
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {!selectedStar && selectedCluster && (
              <div style={{
                background: 'rgba(15, 15, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px',
                borderRadius: '12px', color: 'white', fontFamily: 'sans-serif', backdropFilter: 'blur(12px)',
                display: 'flex', flexDirection: 'column', gap: '16px',
                overflowY: 'auto', flex: 1, minHeight: 0 
              }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', color: '#aa00ff', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px' }}>Cluster Insights</h4>
                  <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedCluster.name}</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#00ffff' }}>{selectedCluster.count.toLocaleString()}</span>
                  <span style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total {dataset === 'anime' ? 'Shows' : 'Songs'}</span>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }}>Dominant Sub-Genres</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedCluster.top_genres.map((g, i) => (
                      <span key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', color: '#ccc' }}>
                        {g}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }}>Average Characteristics</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {Object.entries(selectedCluster.stats).map(([key, val]) => {
                      let widthPct = val * 100;
                      let displayVal = val.toFixed(2);
                      
                      if (key === 'loudness') { 
                        widthPct = Math.max(0, (val + 60) / 60 * 100); 
                        displayVal = `${val.toFixed(1)} dB`; 
                      } else if (key === 'popularity') { 
                        widthPct = dataset === 'anime' ? Math.max(0, 100 - (val / 50)) : val;
                        displayVal = dataset === 'anime' ? `#${val.toFixed(0)}` : val.toFixed(0); 
                      } else if (key === 'energy' && dataset === 'anime') { 
                        widthPct = (val / 10) * 100; 
                        displayVal = val.toFixed(2); 
                      } else if (key === 'episodes') { 
                        widthPct = Math.min(100, val); 
                        displayVal = val.toFixed(0); 
                      } else if (key === 'members' || key === 'favorites') { 
                        widthPct = Math.min(100, val / 10000); 
                        displayVal = val.toLocaleString(undefined, {maximumFractionDigits:0}); 
                      }

                      return (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', textTransform: 'capitalize', color: '#aaa' }}>
                            <span>{key === 'energy' && dataset === 'anime' ? 'MAL Score' : key}</span>
                            <span style={{ color: '#fff', fontWeight: 'bold' }}>{displayVal}</span>
                          </div>
                          <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${widthPct}%`, background: 'linear-gradient(90deg, #aa00ff, #00ffff)', height: '100%', borderRadius: '3px' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                
                <button onClick={() => setSelectedCluster(null)} style={{ marginTop: '10px', padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', width: '100%' }}>
                  Close Insights
                </button>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  )
}

function SpaceBackground() {
  const { scene, size } = useThree()
  const [bgTexture, setBgTexture] = useState(null)
  
  useEffect(() => {
    new THREE.TextureLoader().load('/deep-space.jpg', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace 
      setBgTexture(texture)
      scene.background = texture
    })
  }, [scene])
  
  useEffect(() => {
    if (!bgTexture) return
    const canvasAspect = size.width / size.height
    const imageAspect = bgTexture.image.width / bgTexture.image.height
    if (canvasAspect > imageAspect) {
      bgTexture.repeat.set(1, imageAspect / canvasAspect)
      bgTexture.offset.set(0, (1 - bgTexture.repeat.y) / 2)
    } else {
      bgTexture.repeat.set(canvasAspect / imageAspect, 1)
      bgTexture.offset.set((1 - bgTexture.repeat.x) / 2, 0)
    }
  }, [bgTexture, size]) 
  
  return (
    <mesh>
      <sphereGeometry args={[2000, 32, 32]} />
      <meshBasicMaterial 
        color="#000000" 
        transparent 
        opacity={0.7} 
        depthWrite={false} 
        side={THREE.BackSide} 
      />
    </mesh>
  )
}

function TargetRing({ x, y, radius, color, speed }) {
  const ringRef = useRef()
  
  useFrame(({ clock }) => {
    const scale = 1 + Math.sin(clock.elapsedTime * speed) * 0.15
    ringRef.current.scale.set(scale, scale, 1)
  })
  
  return (
    <mesh ref={ringRef} position={[x, y, 2.1]}>
      <ringGeometry args={[radius, radius + 0.3, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  )
}

function ConnectionLaser({ start, end, match, color }) {
  const particleRef = useRef()
  const intensity = Math.max(0, (match - 85) / 10) 
  const lineOpacity = 0.02 + (intensity * 0.20)
  
  const points = useMemo(() => new Float32Array([start.x, start.y, 1.5, end.x, end.y, 1.5]), [start, end])

  useFrame(({ clock }) => {
    const speed = 0.4 + (intensity * 0.4)
    const t = (clock.elapsedTime * speed) % 1.0
    
    particleRef.current.position.x = start.x + (end.x - start.x) * t
    particleRef.current.position.y = start.y + (end.y - start.y) * t
    
    particleRef.current.material.opacity = (1 - t) * (0.3 + intensity * 0.5)
  })

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={points} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial attach="material" color={color} transparent opacity={lineOpacity} blending={THREE.AdditiveBlending} />
      </line>
      
      <mesh ref={particleRef} position={[start.x, start.y, 2.5]}>
        <circleGeometry args={[0.3, 16]} />
        <meshBasicMaterial color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <TargetRing x={end.x} y={end.y} radius={0.8} color={color} speed={2 + intensity * 2} />
    </group>
  )
}

function AnimatedClusterPath({ points, color }) {
  const particleRef = useRef()
  
  const positions = useMemo(() => {
    const arr = new Float32Array(points.length * 3)
    points.forEach((p, i) => {
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z
    })
    return arr
  }, [points])

  useFrame(({ clock }) => {
    if (!particleRef.current) return
    
    const t = (clock.elapsedTime * 0.4) % 1.0 
    const totalSegments = points.length - 1
    const scaledT = t * totalSegments
    const index = Math.floor(scaledT)
    const segmentT = scaledT - index
    
    if (index < totalSegments) {
      particleRef.current.position.lerpVectors(points[index], points[index + 1], segmentT)
    }
  })

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={points.length} array={positions} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </line>
      
      <mesh ref={particleRef}>
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial color={'#ffffff'} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function CameraTracker({ setIsHomeView }) {
  const { camera } = useThree()
  const homePos = useMemo(() => new THREE.Vector3(0, 12, 130), [])
  
  useFrame(() => {
    const isHome = camera.position.distanceTo(homePos) < 2
    setIsHomeView(isHome) 
  })
  return null
}

function CameraRig({ focusTarget, resetTick, is2DMode }) {
  const { camera, controls } = useThree()
  const [isFlying, setIsFlying] = useState(false)
  const targetPos = useMemo(() => new THREE.Vector3(), [])
  const targetLook = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (focusTarget) {
      const targetZ = is2DMode ? 0 : (focusTarget.z || 0) 

      if (focusTarget.track_name) {
        targetPos.set(focusTarget.x, focusTarget.y - (is2DMode ? 0 : 2), targetZ + 25)
        targetLook.set(focusTarget.x, focusTarget.y, targetZ)
      } else {
        targetPos.set(focusTarget.x, focusTarget.y - (is2DMode ? 0 : 12), targetZ + 45)
        targetLook.set(focusTarget.x, focusTarget.y, targetZ)
      }
    } else {
      targetPos.set(0, is2DMode ? 0 : 12, 250)
      targetLook.set(0, is2DMode ? 0 : 12, 0)
    }
    setIsFlying(true)
  }, [focusTarget, resetTick, is2DMode, targetPos, targetLook])

  useFrame(() => {
    if (controls && isFlying) {
      camera.position.lerp(targetPos, 0.05)
      controls.target.lerp(targetLook, 0.05)
      
      if (camera.position.distanceTo(targetPos) < 0.5) {
        setIsFlying(false)
      }
      controls.update()
    }
  })
  
  return null
}

function UniverseStars({ data, onStarClick, selectedStar, onGalaxyClick, is2DMode, pointSizeBy, colorBy, showClusterPaths, dataset, galaxyNames }) {
  const groupRef = useRef()

  useFrame(() => {
    if (groupRef.current) {
      const targetZ = is2DMode ? 0.0001 : 1
      groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, targetZ, 0.08)
    }
  })

  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.08, 'rgba(255, 255, 255, 0.6)')
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(canvas)
  }, [])

  const cloudTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.3)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])

  const colorPalette = useMemo(() => GALAXY_COLORS.map(c => new THREE.Color(c)), [])

  const galaxyCenters = useMemo(() => {
    const centers = {}
    data.forEach(star => {
      if(!centers[star.color_id]) centers[star.color_id] = {x: 0, y: 0, count: 0, id: star.color_id}
      centers[star.color_id].x += star.x
      centers[star.color_id].y += star.y
      centers[star.color_id].count += 1
    })
    
    return Object.values(centers).map(c => ({ x: c.x / c.count, y: c.y / c.count, id: c.id, count: c.count }))
  }, [data])

  const tiers = useMemo(() => {
    const dust = { pos: [], col: [], idx: [] }
    const core = { pos: [], col: [], idx: [] }
    const giants = { pos: [], col: [], idx: [] }

    data.forEach((star, i) => {
      
      const c = new THREE.Color()
      if (colorBy === 'cluster') {
        c.copy(colorPalette[star.color_id % colorPalette.length])
      } else {
        const val = star[colorBy] || 0
        let norm = val
        if (colorBy === 'popularity') norm = dataset === 'anime' ? Math.max(0, 1 - (val / 5000)) : val / 100
        if (colorBy === 'energy' && dataset === 'anime') norm = Math.max(0, (val - 5) / 5)
        if (colorBy === 'favorites') norm = Math.min(1, val / 50000)
        
        c.lerpColors(new THREE.Color('#00ffff'), new THREE.Color('#ff00ff'), norm)
      }

      let target = dust
      
      if (pointSizeBy !== 'default') {
        const val = star[pointSizeBy] || 0
        let isGiant = false
        let isCore = false
        
        if (pointSizeBy === 'popularity') { 
          if (dataset === 'anime') {
            isGiant = val > 0 && val <= 500; 
            isCore = val > 0 && val <= 2500; 
          } else {
            isGiant = val >= 75; 
            isCore = val >= 45; 
          }
        } else if (pointSizeBy === 'energy') { 
          if (dataset === 'anime') {
            isGiant = val >= 8.0; 
            isCore = val >= 7.0; 
          } else {
            isGiant = val >= 0.75; 
            isCore = val >= 0.5; 
          }
        } else if (pointSizeBy === 'favorites') {
          isGiant = val >= 10000; 
          isCore = val >= 1000;
        } else if (pointSizeBy === 'members') {
          isGiant = val >= 500000; 
          isCore = val >= 100000;
        }

        if (isGiant) target = giants
        else if (isCore) target = core
      } else {
        const rand = (i * 137) % 100 
        if (rand < 3) target = giants          
        else if (rand < 25) target = core 
      }

      target.pos.push(star.x, star.y, star.z || 0)
      target.col.push(c.r, c.g, c.b)
      target.idx.push(i) 
    })

    return {
      dust: { p: new Float32Array(dust.pos), c: new Float32Array(dust.col), i: dust.idx },
      core: { p: new Float32Array(core.pos), c: new Float32Array(core.col), i: core.idx },
      giants: { p: new Float32Array(giants.pos), c: new Float32Array(giants.col), i: giants.idx }
    }
  }, [data, pointSizeBy, colorBy, dataset, colorPalette])

  const handleClick = (tierIndices) => (e) => {
    e.stopPropagation()
    if (e.index !== undefined) onStarClick(tierIndices[e.index])
  }

  const [hoveredStar, setHoveredStar] = useState(null)
  const hoverTimeout = useRef(null)
  const handlePointerOver = (tierIndices) => (e) => {
    e.stopPropagation()
    document.body.style.cursor = 'crosshair'
    
    if (e.index !== undefined) {
      const star = data[tierIndices[e.index]]
      clearTimeout(hoverTimeout.current)
      
      hoverTimeout.current = setTimeout(() => {
        setHoveredStar(star)
      }, 150) 
    }
  }

  const handlePointerOut = () => {
    document.body.style.cursor = 'default'
    clearTimeout(hoverTimeout.current) 
    setHoveredStar(null)
  }

  return (
    <group ref={groupRef}>
      {galaxyCenters.map((center, i) => {
        const c = colorPalette[center.id % colorPalette.length]
        return (
          <sprite key={`cloud-${i}`} position={[center.x, center.y, -15]} scale={[140, 140, 1]}>
            <spriteMaterial 
              map={cloudTexture} 
              color={c} 
              transparent 
              opacity={0.12}
              blending={THREE.AdditiveBlending} 
              depthWrite={false} 
            />
          </sprite>
        )
      })}

      {/* Dust Layer */}
      <points onClick={handleClick(tiers.dust.i)}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.dust.p.length / 3} array={tiers.dust.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.dust.c.length / 3} array={tiers.dust.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={2.5} map={glowTexture} vertexColors transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* Core Layer */}
      <points 
        onClick={handleClick(tiers.core.i)}
        onPointerOver={handlePointerOver(tiers.core.i)}
        onPointerOut={handlePointerOut}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.core.p.length / 3} array={tiers.core.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.core.c.length / 3} array={tiers.core.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={4.0} map={glowTexture} vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* Giants Layer */}
      <points 
        onClick={handleClick(tiers.giants.i)}
        onPointerOver={handlePointerOver(tiers.giants.i)}
        onPointerOut={handlePointerOut}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.giants.p.length / 3} array={tiers.giants.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.giants.c.length / 3} array={tiers.giants.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={6.0} map={glowTexture} vertexColors transparent opacity={1.0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {showClusterPaths && (
        selectedStar && selectedStar.neighbors ? (() => {
          
          const targetCenter = galaxyCenters.find(c => c.id === selectedStar.color_id) || { x: 0, y: 0 }
          
          const pathPoints = [
            new THREE.Vector3(selectedStar.x, selectedStar.y, 2.5),
            ...selectedStar.neighbors.slice(0, 4).map(n => new THREE.Vector3(n.x, n.y, 2.5)),
            new THREE.Vector3(targetCenter.x, targetCenter.y, 0)
          ]

          return <AnimatedClusterPath points={pathPoints} color={colorPalette[selectedStar.color_id % colorPalette.length]} />
          
        })() : galaxyCenters.map((center, i) => (
          <line key={`path-${i}`}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0, 0, 0, center.x, center.y, 0])} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial color={colorPalette[center.id % colorPalette.length]} transparent opacity={0.2} />
          </line>
        ))
      )}

      {/* TARGET RING & NEIGHBOR LASERS */}
      {selectedStar && (
        <group position={[0, 0, 1]}>
          
          <TargetRing 
            x={selectedStar.x} 
            y={selectedStar.y} 
            radius={0.8} 
            color={colorPalette[selectedStar.color_id % colorPalette.length].getStyle()} 
            speed={0.02} 
          />
          
          {selectedStar.neighbors && selectedStar.neighbors.slice(0, 5).map((neighbor, idx) => (
            <ConnectionLaser 
              key={`conn-${idx}`}
              start={selectedStar}
              end={neighbor}
              match={neighbor.match}
              color={colorPalette[neighbor.color_id % colorPalette.length].getStyle()}
            />
          ))}
        </group>
      )}

      {/* Galaxy Labels */}
      {galaxyCenters.map((center, i) => {
        const c = colorPalette[center.id % colorPalette.length]
        return (
          <Html key={`label-${i}`} position={[center.x, center.y + 8, 0]} center zIndexRange={[100, 0]}>
            <div 
              onClick={(e) => {
                e.stopPropagation() 
                onGalaxyClick(center, galaxyNames[center.id])
              }}
              style={{
                background: 'rgba(15, 15, 20, 0.7)',
                border: `1px solid ${c.getStyle()}`,
                padding: '6px 12px',
                borderRadius: '6px',
                color: 'white',
                fontFamily: 'sans-serif',
                fontSize: '0.8rem',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: `0 0 10px ${c.getStyle()}40`
              }}
            >
              <span style={{ color: c.getStyle(), fontSize: '1rem' }}>✦</span>
              <strong>{galaxyNames[center.id]}</strong>
              <span style={{ color: '#aaa', fontSize: '0.7rem', marginLeft: '4px' }}>
                {center.count.toLocaleString()} {dataset === 'anime' ? 'shows' : 'songs'}
              </span>
            </div>
          </Html>
        )
      })}

      {hoveredStar && (() => {
        const glowColor = colorPalette[hoveredStar.color_id % colorPalette.length].getStyle()
        
        return (
          <group position={[hoveredStar.x, hoveredStar.y, 2]}>
            <mesh>
              <ringGeometry args={[1.0, 1.4, 32]} />
              <meshBasicMaterial color={glowColor} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            
            <Html zIndexRange={[100, 0]}>
              <div style={{
                background: 'rgba(10, 10, 15, 0.9)',
                border: `1px solid ${glowColor}`,
                padding: '12px 16px',
                borderRadius: '8px',
                color: 'white',
                fontFamily: 'sans-serif',
                whiteSpace: 'nowrap',
                transform: 'translate3d(20px, -20px, 0)',
                pointerEvents: 'none',
                backdropFilter: 'blur(8px)',
                boxShadow: `0 4px 20px ${glowColor}40`
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                  {hoveredStar.track_name}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#ccc', marginTop: '4px' }}>
                  {hoveredStar.artists}
                </div>
                <div style={{ 
                  fontSize: '0.75rem', color: glowColor, marginTop: '10px', 
                  textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' 
                }}>
                  <span style={{ fontSize: '1rem' }}>✦</span> {hoveredStar.super_genre}
                </div>
              </div>
            </Html>
          </group>
        )
      })()}
    </group>
  )
}