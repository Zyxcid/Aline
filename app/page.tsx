'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';
import * as THREE from 'three';

const AVAILABLE_KEYCODES = [
  { group: 'Huruf', keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] },
  { group: 'Angka', keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] },
];

type ColorPalette = {
  name: string;
  case: string;
  keycaps: string;
  accent: string;
};

const DEFAULT_PALETTE: ColorPalette = {
  name: 'Dark Stealth',
  case: '#1e293b',
  keycaps: '#334155',
  accent: '#3b82f6',
};

type ModeKeymap = string[]; // Array 5 elemen [key0, key1, key2, key3, key4]

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
          } else if (rawName.includes('spdt')) {
            material.color.set(colorPalette.accent);
          } else {
            material.color.set(colorPalette.case);
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
        const validKeys = ['key_1', 'key_2', 'key_3', 'key_4', 'key_5', 'spdt_toggle'];
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

  // Status SPDT & Mode Aktif yang sedang diedit (modeA atau modeB)
  const [activeMode, setActiveMode] = useState<'modeA' | 'modeB'>('modeA');

  // Keymap untuk masing-masing mode (5 tombol)
  const [modeA, setModeA] = useState<ModeKeymap>(['s', 'a', 'w', 'd', 'r']);
  const [modeB, setModeB] = useState<ModeKeymap>(['z', 'x', 'c', 'v', 'y']);

  // Web Serial API Refs & States
  const [isConnected, setIsConnected] = useState(false);
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);

  // ----------------------------------------------------
  // FUNGSI WEB SERIAL (KONEKSI RP2040)
  // ----------------------------------------------------
  const connectSerial = async () => {
    if (!('serial' in navigator)) {
      alert('Browser Anda belum mendukung Web Serial API. Gunakan Chrome, Edge, atau Opera.');
      return;
    }

    try {
      // Minta izin ke pengguna untuk memilih Port USB RP2040 Zero
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setIsConnected(true);

      // Mulai mendengarkan balasan Serial dari RP2040
      readSerialData(port);

      // Minta data keymap dari RP2040 saat pertama kali terhubung
      sendSerialMessage({ type: 'GET_KEYMAP' });
    } catch (err) {
      console.error('Gagal terhubung via Serial:', err);
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
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Simpan sisa data yang belum lengkap

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line.trim());
            // Jika menerima balasan KEYMAP_RESPONSE dari RP2040
            if (data.type === 'KEYMAP_RESPONSE') {
              if (data.modeA) setModeA(data.modeA);
              if (data.modeB) setModeB(data.modeB);
              alert('Keymap berhasil dibaca dari RP2040!');
            } else if (data.status === 'SUCCESS') {
              alert('Keymap berhasil disimpan ke RP2040!');
            }
          } catch (e) {
            console.log('Raw Serial Response:', line);
          }
        }
      }
    } catch (err) {
      console.error('Error membaca serial:', err);
    } finally {
      reader.releaseLock();
    }
  };

  // Simpan perubahan ke Flash EEPROM RP2040
  const handleSaveToRP2040 = () => {
    sendSerialMessage({
      type: 'SET_KEYMAP',
      modeA,
      modeB,
    });
  };

  // Mengubah keycode tombol terpilih
  const handleAssignKeycode = (keycode: string) => {
    if (!selectedKeyName || !selectedKeyName.startsWith('key_')) return;

    // Ambil indeks tombol (key_1 -> index 0)
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
    <main style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0f172a', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      {/* Header Info & Connection Button */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, color: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>5x1 RP2040 Configurator</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>Hubungkan keyboard untuk membaca & menyimpan keymap</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
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
            {isConnected ? '✓ Connected to USB' : '🔌 Connect Keyboard'}
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
              💾 Save to RP2040
            </button>
          )}
        </div>
      </div>

      {/* Canvas Three.js */}
      <Canvas camera={{ position: [0, 5, 10], fov: 45 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            <KeyboardModel
              colorPalette={currentPalette}
              selectedKey={selectedKeyName}
              onSelectKey={(name) => setSelectedKeyName(name)}
            />
          </Stage>
        </Suspense>
        <OrbitControls autoRotate={!selectedKeyName} autoRotateSpeed={0.8} makeDefault />
      </Canvas>

      {/* Switch Mode Tab (Mode A vs Mode B) & List Keymap */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(8px)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          zIndex: 10,
          minWidth: '220px',
        }}
      >
        {/* Toggle Mode A / Mode B */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: '#0f172a', padding: '4px', borderRadius: '8px' }}>
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
            Mode A (Gaming)
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
            Mode B (Ctrl+)
          </button>
        </div>

        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#f59e0b' }}>
          Peta Tombol ({activeMode === 'modeA' ? 'Gaming' : 'Editing Ctrl+'}):
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          {[0, 1, 2, 3, 4].map((idx) => {
            const keyName = `key_${idx + 1}`;
            return (
              <div
                key={keyName}
                onClick={() => setSelectedKeyName(keyName)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
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

      {/* Modal Pengatur Keycode saat Tombol Diklik */}
      {selectedKeyName && selectedKeyName.startsWith('key_') && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            maxWidth: '360px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid #3b82f6',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            color: '#fff',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Atur {selectedKeyName} ({activeMode.toUpperCase()})
              </span>
              <h3 style={{ margin: 0, fontSize: '16px' }}>
                Posisi: Tombol #{selectedKeyName.replace('key_', '')}
              </h3>
            </div>
            <button
              onClick={() => setSelectedKeyName(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px' }}>Pilih karakter baru untuk tombol ini:</div>

          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {AVAILABLE_KEYCODES.map((group, idx) => (
              <div key={idx}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>{group.group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {group.keys.map((kc) => {
                    const keyIdx = parseInt(selectedKeyName.replace('key_', '')) - 1;
                    const isSelected = currentKeymap[keyIdx] === kc;
                    return (
                      <button
                        key={kc}
                        onClick={() => handleAssignKeycode(kc)}
                        style={{
                          padding: '6px 10px',
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
    </main>
  );
}