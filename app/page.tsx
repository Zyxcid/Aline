'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';
import * as THREE from 'three';

const AVAILABLE_KEYCODES = [
  { group: 'Letters', keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] },
  { group: 'Numbers', keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] },
];

type ColorPalette = {
  name: string;
  case: string;
  keycaps: string;
};

const DEFAULT_PALETTE: ColorPalette = {
  name: 'Dark Stealth',
  case: '#1e293b',
  keycaps: '#334155',
};

type ModeKeymap = string[];

function KeyboardModel({
  colorPalette,
  selectedKey,
  onSelectKey,
}: {
  colorPalette: ColorPalette;
  selectedKey: string | null;
  onSelectKey: (keyName: string) => void;
}) {
  const { scene } = useGLTF('/Aline.glb');

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const rawName = mesh.name.toLowerCase();

        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }

        const material = mesh.material as THREE.MeshStandardMaterial;

        if (material && material.color) {
          const isSelected = selectedKey && rawName.includes(selectedKey.toLowerCase());

          if (isSelected) {
            material.color.set('#f59e0b');
          } else if (rawName.includes('key')) {
            material.color.set(colorPalette.keycaps);
          } else {
            material.color.set(colorPalette.case);
          }

          if (material.emissive) {
            material.emissive.set('#000000');
          }
        }
      }
    });
  }, [scene, colorPalette, selectedKey]);

  return (
    <primitive
      object={scene}
      onClick={(e: any) => {
        e.stopPropagation();
        const rawName = e.object.name.toLowerCase();
        const validKeys = ['key_1', 'key_2', 'key_3', 'key_4', 'key_5'];
        const matchedKey = validKeys.find((k) => rawName.includes(k));

        if (matchedKey) {
          onSelectKey(matchedKey);
        }
      }}
    />
  );
}

export default function Home() {
  const [currentPalette] = useState<ColorPalette>(DEFAULT_PALETTE);
  const [selectedKeyName, setSelectedKeyName] = useState<string | null>(null);

  const [activeMode, setActiveMode] = useState<'modeA' | 'modeB'>('modeA');
  const [modeA, setModeA] = useState<ModeKeymap>(['s', 'a', 'w', 'd', 'r']);
  const [modeB, setModeB] = useState<ModeKeymap>(['z', 'x', 'c', 'v', 'y']);

  const [isConnected, setIsConnected] = useState(false);
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const configSectionRef = useRef<HTMLDivElement>(null);

  const scrollToConfig = () => {
    configSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHero = () => {
    heroRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const connectSerial = async () => {
    if (!('serial' in navigator)) {
      alert('Your browser does not support Web Serial API. Please use Chrome, Edge, or Opera.');
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setIsConnected(true);

      readSerialData(port);
      sendSerialMessage({ type: 'GET_KEYMAP' });
    } catch (err) {
      console.error('Failed to connect via Serial:', err);
      setIsConnected(false);
    }
  };

  const sendSerialMessage = async (dataObj: any) => {
    if (!portRef.current || !portRef.current.writable) return;

    const writer = portRef.current.writable.getWriter();
    const jsonString = JSON.stringify(dataObj) + '\n';
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(jsonString));
    writer.releaseLock();
  };

  const readSerialData = async (port: any) => {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line.trim());
            if (data.type === 'KEYMAP_RESPONSE') {
              if (data.modeA) setModeA(data.modeA);
              if (data.modeB) setModeB(data.modeB);
              alert('Keymap successfully read from Aline!');
            } else if (data.status === 'SUCCESS') {
              alert('Keymap successfully saved to Aline!');
            }
          } catch (e) {
            console.log('Raw Serial Response:', line);
          }
        }
      }
    } catch (err) {
      console.error('Error reading serial data:', err);
    } finally {
      reader.releaseLock();
    }
  };

  const handleSaveToRP2040 = () => {
    sendSerialMessage({
      type: 'SET_KEYMAP',
      modeA,
      modeB,
    });
  };

  const handleAssignKeycode = (keycode: string) => {
    if (!selectedKeyName || !selectedKeyName.startsWith('key_')) return;

    const keyIndex = parseInt(selectedKeyName.replace('key_', '')) - 1;

    if (activeMode === 'modeA') {
      const updated = [...modeA];
      updated[keyIndex] = keycode.toLowerCase();
      setModeA(updated);
    } else {
      const updated = [...modeB];
      updated[keyIndex] = keycode.toLowerCase();
      setModeB(updated);
    }
  };

  const currentKeymap = activeMode === 'modeA' ? modeA : modeB;

  return (
    <main
      style={{
        backgroundColor: '#0f172a',
        color: '#fff',
        fontFamily: 'sans-serif',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* SECTION 1: HERO */}
      <section
        ref={heroRef}
        style={{
          height: '100vh',
          width: '100vw',
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          maxWidth: '800px',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{ fontSize: '3.2rem', fontWeight: 'bold', marginBottom: '16px', background: 'linear-gradient(to right, #60a5fa, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Aline
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '32px' }}>
          An interactive web configurator for custom 5-key macropads. Effortlessly remap keys in real-time and save directly to your RP2040 EEPROM via Web Serial.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', width: '100%', marginBottom: '40px', textAlign: 'left' }}>
          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold' }}>MICROCONTROLLER</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>RP2040 Zero</div>
          </div>
          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold' }}>SWITCHES</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>5x MX Mechanical Switches</div>
          </div>
          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold' }}>MODE SWITCH</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>SPDT Slide Switch</div>
          </div>
        </div>

        <button
          onClick={scrollToConfig}
          style={{
            padding: '14px 28px',
            fontSize: '1rem',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.4)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          Config Aline ⚙️
        </button>
      </section>

      {/* SECTION 2: FULLSCREEN 3D MODEL & CONFIGURATOR (100vw x 100vh) */}
      <section
        ref={configSectionRef}
        style={{
          height: '100vh',
          width: '100vw',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'absolute', top: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={scrollToHero}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #334155',
                backgroundColor: 'rgba(30, 41, 59, 0.8)',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '12px',
                backdropFilter: 'blur(8px)',
              }}
            >
              ← Back
            </button>

            <button
              onClick={connectSerial}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isConnected ? '#10b981' : '#2563eb',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {isConnected ? '✓ Connected' : '🔌 Connect Aline'}
            </button>

            {isConnected && (
              <button
                onClick={handleSaveToRP2040}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#f59e0b',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                💾 Save to Aline
              </button>
            )}
          </div>

          <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backdropFilter: 'blur(8px)' }}>
            💡 Hint: Click any keycap to customize
          </div>
        </div>

        {/* Fullscreen 3D Canvas */}
        <Canvas camera={{ position: [0, 5, 10], fov: 45 }} style={{ width: '100%', height: '100%' }}>
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.6}>
              <KeyboardModel
                colorPalette={currentPalette}
                selectedKey={selectedKeyName}
                onSelectKey={(name) => setSelectedKeyName(name)}
              />
            </Stage>
          </Suspense>
          <OrbitControls enableZoom={false} autoRotate={!selectedKeyName} autoRotateSpeed={0.8} makeDefault />
        </Canvas>

        {/* Floating Panel: Mode Selection (Bottom Left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '40px',
            backgroundColor: 'rgba(30, 41, 59, 0.85)',
            backdropFilter: 'blur(12px)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            zIndex: 10,
            minWidth: '220px',
          }}
        >
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', background: '#0f172a', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setActiveMode('modeA')}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '11px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeMode === 'modeA' ? '#3b82f6' : 'transparent',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Mode A
            </button>
            <button
              onClick={() => setActiveMode('modeB')}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '11px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeMode === 'modeB' ? '#3b82f6' : 'transparent',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Mode B
            </button>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#f59e0b' }}>
            Keymap:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
            {[0, 1, 2, 3, 4].map((idx) => {
              const keyName = `key_${idx + 1}`;
              return (
                <div
                  key={keyName}
                  onClick={() => setSelectedKeyName(keyName)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    backgroundColor: selectedKeyName === keyName ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                    border: selectedKeyName === keyName ? '1px solid #f59e0b' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: '#94a3b8' }}>{keyName}:</span>
                  <span style={{ fontWeight: 'bold', color: '#f8fafc', textTransform: 'uppercase' }}>
                    {activeMode === 'modeB' ? `CTRL + ${currentKeymap[idx]}` : currentKeymap[idx]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Panel: Clean Key Selection Box (Bottom Right) */}
        {selectedKeyName && selectedKeyName.startsWith('key_') && (
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              right: '40px',
              maxWidth: '340px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(12px)',
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid #3b82f6',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              color: '#fff',
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>
                Select Keycode
              </span>
              <button
                onClick={() => setSelectedKeyName(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {AVAILABLE_KEYCODES.map((group, idx) => (
                <div key={idx}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>{group.group}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {group.keys.map((kc) => {
                      const keyIdx = parseInt(selectedKeyName.replace('key_', '')) - 1;
                      const isSelected = currentKeymap[keyIdx] === kc;
                      return (
                        <button
                          key={kc}
                          onClick={() => handleAssignKeycode(kc)}
                          style={{
                            padding: '5px 8px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                            backgroundColor: isSelected ? '#2563eb' : '#1e293b',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 'bold' : 'normal',
                            textTransform: 'uppercase',
                          }}
                        >
                          {kc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}