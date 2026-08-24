import { useEffect, useState, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

export default function App() {
  const [universeData, setUniverseData] = useState([])
  const [selectedStar, setSelectedStar] = useState(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const [features, setFeatures] = useState({
    energy: true,
    danceability: true,
    tempo: true,
    loudness: true,
    valence: true,
    popularity: true
  })

  useEffect(() => {
    fetch('http://127.0.0.1:8000/universe')
      .then(res => res.json())
      .then(data => setUniverseData(data))
  }, [])

  const toggleFeature = (feat) => {
    setFeatures(prev => ({ ...prev, [feat]: !prev[feat] }))
  }

  const handleRebuild = () => {
    setIsBuilding(true)
    const activeFeatures = Object.keys(features).filter(k => features[k])
    
    fetch('http://127.0.0.1:8000/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: activeFeatures })
    })
      .then(res => res.json())
      .then(data => {
        setUniverseData(data)
        setSelectedStar(null)
        setIsBuilding(false)
      })
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      {/* LEFT PANEL */}
      <div style={{
        position: 'absolute', top: '20px', left: '20px', background: 'rgba(15, 15, 20, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px', borderRadius: '12px',
        color: 'white', fontFamily: 'sans-serif', zIndex: 10, backdropFilter: 'blur(12px)',
        width: '280px', display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <h3 style={{ margin: 0, color: '#aa00ff', textTransform: 'uppercase' }}>Universe Controls</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.keys(features).map(feature => (
            <label key={feature} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={features[feature]} 
                onChange={() => toggleFeature(feature)}
                style={{ accentColor: '#aa00ff', cursor: 'pointer' }} 
              />
              <span style={{ textTransform: 'capitalize' }}>{feature}</span>
            </label>
          ))}
        </div>

        <button 
          onClick={handleRebuild}
          disabled={isBuilding}
          style={{ 
            marginTop: '10px', padding: '12px', border: 'none', color: 'white', borderRadius: '6px', 
            cursor: isBuilding ? 'wait' : 'pointer', fontWeight: 'bold',
            background: isBuilding ? '#555' : 'linear-gradient(90deg, #aa00ff 0%, #5500ff 100%)', 
          }}
        >
          {isBuilding ? 'Recalculating Space...' : 'Rebuild Universe'}
        </button>
      </div>

      {/* RIGHT PANEL */}
      {selectedStar && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px', background: 'rgba(15, 15, 20, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px', borderRadius: '12px',
          color: 'white', fontFamily: 'sans-serif', zIndex: 10, backdropFilter: 'blur(12px)', width: '320px',
        }}>
          <h4 style={{ margin: '0 0 4px 0', color: '#ff0055', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Selected Song</h4>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '1.4rem' }}>{selectedStar.track_name}</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}><strong>Artist:</strong> {selectedStar.artists}</p>
            <p style={{ margin: 0 }}><strong>Super Genre:</strong> <span style={{ color: '#00ffff' }}>{selectedStar.super_genre}</span></p>
            <p style={{ margin: 0, color: '#aaa' }}><strong>Sub-Genre:</strong> {selectedStar.track_genre}</p>
          </div>

          {selectedStar.neighbors && (
            <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#aa00ff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Nearest Neighbors
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedStar.neighbors.map((neighbor, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', paddingRight: '10px', maxWidth: '200px' }}>
                      <span style={{ fontWeight: 'bold', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden' }}>{neighbor.name}</span>
                      <span style={{ color: '#888', textOverflow: 'ellipsis', overflow: 'hidden' }}>{neighbor.artist}</span>
                    </div>
                    <span style={{ color: neighbor.match > 85 ? '#00ff00' : '#ffcc00', fontWeight: 'bold' }}>
                      {neighbor.match}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button 
            onClick={() => setSelectedStar(null)}
            style={{ marginTop: '24px', padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', width: '100%' }}
          >
            Close Details
          </button>
        </div>
      )}

      {/* 3D CANVAS */}
      <Canvas camera={{ position: [0, 0, 80], fov: 60 }}>
        <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
        {universeData.length > 0 && (
          <UniverseStars 
            key={Date.now()} 
            data={universeData} 
            selectedStar={selectedStar}
            onStarClick={(index) => setSelectedStar(universeData[index])} 
          />
        )}
      </Canvas>
    </div>
  )
}

// --- ANIMATION ---
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

// --- The Star Rendering ---
function UniverseStars({ data, onStarClick, selectedStar }) {
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

  const colorPalette = [
    new THREE.Color('#ff0055'), new THREE.Color('#00ffff'), new THREE.Color('#ffcc00'),
    new THREE.Color('#aa00ff'), new THREE.Color('#00ff00'), new THREE.Color('#ff6600'),
    new THREE.Color('#0066ff'), new THREE.Color('#ffffff')
  ]

  const bgStars = useMemo(() => {
    const pos = [], col = []
    for(let i = 0; i < 1500; i++) {
      const r = 60 + Math.random() * 120 
      const theta = Math.random() * Math.PI * 2
      pos.push(r * Math.cos(theta), r * Math.sin(theta), -15 - Math.random() * 40)
      
      const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.5, 0.15 + Math.random() * 0.15)
      col.push(c.r, c.g, c.b)
    }
    return { p: new Float32Array(pos), c: new Float32Array(col) }
  }, [])

  const tiers = useMemo(() => {
    const dust = { pos: [], col: [], idx: [] }
    const core = { pos: [], col: [], idx: [] }
    const giants = { pos: [], col: [], idx: [] }

    data.forEach((star, i) => {
      const rand = (i * 137) % 100 
      const c = colorPalette[star.color_id % colorPalette.length]

      let target = dust
      if (rand < 3) target = giants          
      else if (rand < 25) target = core      

      target.pos.push(star.x, star.y, (Math.random() - 0.5) * 2) 
      target.col.push(c.r, c.g, c.b)
      target.idx.push(i) 
    })

    return {
      dust: { p: new Float32Array(dust.pos), c: new Float32Array(dust.col), i: dust.idx },
      core: { p: new Float32Array(core.pos), c: new Float32Array(core.col), i: core.idx },
      giants: { p: new Float32Array(giants.pos), c: new Float32Array(giants.col), i: giants.idx }
    }
  }, [data])

  const handleClick = (tierIndices) => (e) => {
    e.stopPropagation()
    if (e.index !== undefined) onStarClick(tierIndices[e.index])
  }

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={bgStars.p.length / 3} array={bgStars.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={bgStars.c.length / 3} array={bgStars.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={1.2} map={glowTexture} vertexColors transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.core.p.length / 3} array={tiers.core.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.core.c.length / 3} array={tiers.core.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={35.0} map={glowTexture} vertexColors transparent opacity={0.015} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      <points onClick={handleClick(tiers.dust.i)}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.dust.p.length / 3} array={tiers.dust.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.dust.c.length / 3} array={tiers.dust.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={1.8} map={glowTexture} vertexColors transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      <points onClick={handleClick(tiers.core.i)}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.core.p.length / 3} array={tiers.core.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.core.c.length / 3} array={tiers.core.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={3.5} map={glowTexture} vertexColors transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      <points onClick={handleClick(tiers.giants.i)} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'crosshair'; }} onPointerOut={() => { document.body.style.cursor = 'default'; }}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={tiers.giants.p.length / 3} array={tiers.giants.p} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={tiers.giants.c.length / 3} array={tiers.giants.c} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={7.0} map={glowTexture} vertexColors transparent opacity={1.0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {selectedStar && (
        <group>
          <mesh position={[selectedStar.x, selectedStar.y, 2]}>
            <planeGeometry args={[14, 14]} />
            <meshBasicMaterial map={glowTexture} color="#ffffff" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <TargetRing x={selectedStar.x} y={selectedStar.y} radius={2.0} color="#ffffff" speed={3} />
        </group>
      )}

      {selectedStar && selectedStar.neighbors && selectedStar.neighbors.map((neighbor, idx) => {
        const neighborColor = colorPalette[neighbor.color_id % colorPalette.length];
        return (
          <ConnectionLaser 
            key={`conn-${idx}`} 
            start={selectedStar} 
            end={neighbor} 
            match={neighbor.match} 
            color={neighborColor} 
          />
        )
      })}
    </group>
  )
}