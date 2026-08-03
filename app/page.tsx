'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { Settings2, Plug, Save, Check, ArrowLeft, ChevronDown, X, SquareTerminal, Download, Upload } from 'lucide-react';

const MODIFIER_KEYS = [
  { id: 'ctrl', label: 'CTRL' },
  { id: 'shift', label: 'SHIFT' },
  { id: 'alt', label: 'ALT' },
  { id: 'win', label: 'WIN' },
];

const AVAILABLE_KEYCODES = [
  { 
    group: 'Navigation & Special', 
    keys: ['enter', 'backspace', 'space', 'tab', 'esc', 'delete', 'capslock', 'up', 'down', 'left', 'right'] 
  },
  { 
    group: 'Letters', 
    keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] 
  },
  { 
    group: 'Numbers & Symbols', 
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'] 
  },
  {
    group: 'Punctuation',
    keys: ['-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`', '*']
  },
];

// Harus sama persis dengan MAX_COMBOS di firmware (macropad_firmware.ino)
// 26 = jumlah kombinasi unik maksimal yang mungkin dari 5 tombol (kombinasi 2-5 tombol sekaligus)
const MAX_COMBOS = 26;

type ColorPalette = {
  id: string;
  name: string;
  bg: string;
  case: string;
  keycaps: string;
};

const PALETTES: ColorPalette[] = [
  { id: 'dark', name: 'Dark Stealth', bg: '#0f172a', case: '#1e293b', keycaps: '#334155' },
  { id: 'cyber', name: 'Cyberpunk', bg: '#18042c', case: '#2d0b5a', keycaps: '#ec4899' },
  { id: 'retro', name: 'Retro Light', bg: '#f1f5f9', case: '#cbd5e1', keycaps: '#64748b' },
  { id: 'mint', name: 'Mint Breeze', bg: '#022c22', case: '#064e3b', keycaps: '#10b981' },
];

type ModeKeymap = string[];

export interface ComboRule {
  keys: number[]; // Index tombol: [0, 1] berarti Key 1 & Key 2
  modeA: string;
  modeB: string;
}

// Helper untuk mendeteksi apakah warna HEX tergolong terang
function isLightColor(hex: string): boolean {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

function getDynamicContrastColor(hex: string) {
  return isLightColor(hex) ? '#1e3a8a' : '#fbbf24';
}

function KeyboardModel({
  colorPalette,
  selectedKey,
  onSelectKey,
  isInteractive,
}: {
  colorPalette: ColorPalette;
  selectedKey: string | null;
  onSelectKey: (keyName: string) => void;
  isInteractive: boolean;
}) {
  const { scene } = useGLTF('/Aline.glb');
  const selectionColor = getDynamicContrastColor(colorPalette.keycaps);

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
            material.color.set(selectionColor);
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
  }, [scene, colorPalette, selectedKey, selectionColor]);

  return (
    <primitive
      object={scene}
      onPointerDown={(e: any) => {
        if (!isInteractive) return;
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
  const [currentPalette, setCurrentPalette] = useState<ColorPalette>(PALETTES[0]);
  const [isCustomTheme, setIsCustomTheme] = useState(false);
  const [selectedKeyName, setSelectedKeyName] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'hero' | 'config'>('hero');

  const [activeMode, setActiveMode] = useState<'modeA' | 'modeB'>('modeA');
  const [modeAName, setModeAName] = useState('Default Work');
  const [modeBName, setModeBName] = useState('Gaming / Secondary');

  const [modeA, setModeA] = useState<ModeKeymap>(['s', 'a', 'w', 'd', 'r']);
  const [modeB, setModeB] = useState<ModeKeymap>(['tab', 'ctrl', 'alt', 't', 'w']);

  // Tap-vs-Hold: binding terpisah yang aktif kalau tombol ditahan melewati holdThresholdMs.
  // String kosong = fitur hold nonaktif untuk tombol itu (perilaku identik seperti sebelumnya).
  const [modeAHold, setModeAHold] = useState<ModeKeymap>(['', '', '', '', '']);
  const [modeBHold, setModeBHold] = useState<ModeKeymap>(['', '', '', '', '']);

  // Ambang tekan-tahan (ms) — harus sinkron dengan HOLD_THRESHOLD_MIN_MS/MAX_MS di firmware
  const HOLD_THRESHOLD_MIN = 100;
  const HOLD_THRESHOLD_MAX = 1000;
  const [holdThresholdMs, setHoldThresholdMs] = useState(200);

  // Saat panel Map Key terbuka: apakah sedang mengedit TAP binding (default) atau HOLD binding
  const [editingHoldBinding, setEditingHoldBinding] = useState(false);

  // STATE COMBO RULES
  const [combos, setCombos] = useState<ComboRule[]>([
    { keys: [0, 1], modeA: 'q', modeB: 'ctrl+q' }
  ]);

  // Jendela deteksi combo (ms) — harus sinkron dengan CHORD_WINDOW_MIN_MS/MAX_MS di firmware
  const CHORD_WINDOW_MIN = 15;
  const CHORD_WINDOW_MAX = 150;
  const [chordWindowMs, setChordWindowMs] = useState(35);

  // Combo list ditampilkan collapsed (ringkasan 1 baris) supaya gampang dipindai
  // begitu jumlah combo mulai banyak. Cuma 1 yang boleh terbuka sekaligus (accordion).
  const [expandedComboIndex, setExpandedComboIndex] = useState<number | null>(null);

  // Deteksi status kontras warna berdasarkan warna latar saat ini
  const isBgLight = isLightColor(currentPalette.bg);
  const textColor = isBgLight ? '#0f172a' : '#ffffff';
  const subTextColor = isBgLight ? '#334155' : '#94a3b8';
  const glassBg = isBgLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 23, 42, 0.55)';
  const glassPanelBg = isBgLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.85)';
  const glassBorder = isBgLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
  const itemBg = isBgLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';

  // Scroll handler untuk Hero
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleWheel = (e: WheelEvent) => {
      if (viewMode === 'hero') {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (e.deltaY > 20) {
            setViewMode('config');
          }
        }, 50);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      clearTimeout(timeoutId);
    };
  }, [viewMode]);

  // Load LocalStorage
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('aline_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.modeA) setModeA(parsed.modeA);
        if (parsed.modeB) setModeB(parsed.modeB);
        if (parsed.modeAHold) setModeAHold(parsed.modeAHold);
        if (parsed.modeBHold) setModeBHold(parsed.modeBHold);
        if (parsed.combos) setCombos(parsed.combos);
        if (typeof parsed.chordWindowMs === 'number') setChordWindowMs(parsed.chordWindowMs);
        if (typeof parsed.holdThresholdMs === 'number') setHoldThresholdMs(parsed.holdThresholdMs);
        if (parsed.modeAName) setModeAName(parsed.modeAName);
        if (parsed.modeBName) setModeBName(parsed.modeBName);
        if (parsed.palette) setCurrentPalette(parsed.palette);
        if (parsed.isCustomTheme !== undefined) setIsCustomTheme(parsed.isCustomTheme);
      }
    } catch (e) {
      console.error('Failed to load LocalStorage:', e);
    }
  }, []);

  // Save LocalStorage
  useEffect(() => {
    try {
      const dataToSave = {
        modeA,
        modeB,
        modeAHold,
        modeBHold,
        combos,
        chordWindowMs,
        holdThresholdMs,
        modeAName,
        modeBName,
        palette: currentPalette,
        isCustomTheme,
      };
      localStorage.setItem('aline_config', JSON.stringify(dataToSave));
    } catch (e) {
      console.error('Failed to save LocalStorage:', e);
    }
  }, [modeA, modeB, modeAHold, modeBHold, combos, chordWindowMs, holdThresholdMs, modeAName, modeBName, currentPalette, isCustomTheme]);

  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  // Saat mengedit binding sebuah combo (bukan tombol fisik), simpan target di sini
  const [comboEditTarget, setComboEditTarget] = useState<{ index: number; field: 'modeA' | 'modeB' } | null>(null);

  useEffect(() => {
    if (selectedKeyName && selectedKeyName.startsWith('key_')) {
      const keyIndex = parseInt(selectedKeyName.replace('key_', '')) - 1;
      const currentBinding = editingHoldBinding
        ? (activeMode === 'modeA' ? modeAHold[keyIndex] : modeBHold[keyIndex])
        : (activeMode === 'modeA' ? modeA[keyIndex] : modeB[keyIndex]);
      const parts = (currentBinding || '').split('+');
      const existingMods = parts.slice(0, parts.length - 1);
      setSelectedModifiers(existingMods);
    } else if (comboEditTarget) {
      const currentBinding = combos[comboEditTarget.index]?.[comboEditTarget.field] || '';
      const parts = currentBinding.split('+');
      const existingMods = parts.slice(0, parts.length - 1);
      setSelectedModifiers(existingMods);
    }
  }, [selectedKeyName, comboEditTarget, activeMode, modeA, modeB, modeAHold, modeBHold, editingHoldBinding, combos]);

  // WEB SERIAL MANAGEMENT
  const [isConnected, setIsConnected] = useState(false);
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);

  // --- TEST INPUT (uji keystroke fisik langsung di halaman config) ---
  // Sengaja TIDAK disimpan ke localStorage / disinkron ke hardware — murni tampilan sementara.
  const TEST_INPUT_IDLE_MS = 2500;   // jeda tanpa input sebelum mulai fade
  const TEST_INPUT_FADE_MS = 900;    // durasi animasi fade-out
  const [testInputValue, setTestInputValue] = useState('');
  const [testInputFading, setTestInputFading] = useState(false);
  const testIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTestTimers = () => {
    if (testIdleTimerRef.current) clearTimeout(testIdleTimerRef.current);
    if (testFadeTimerRef.current) clearTimeout(testFadeTimerRef.current);
    testIdleTimerRef.current = null;
    testFadeTimerRef.current = null;
  };

  const handleTestInputChange = (value: string) => {
    clearTestTimers();
    setTestInputFading(false);
    setTestInputValue(value);

    if (value.length === 0) return;

    testIdleTimerRef.current = setTimeout(() => {
      setTestInputFading(true);
      testFadeTimerRef.current = setTimeout(() => {
        setTestInputValue('');
        setTestInputFading(false);
      }, TEST_INPUT_FADE_MS);
    }, TEST_INPUT_IDLE_MS);
  };

  // --- HIGHLIGHT SAAT TESTING ---
  // Saat mengetik di field LIVE TEST, cocokkan tombol yang benar-benar ditekan
  // (termasuk modifier, lewat KeyboardEvent) dengan binding modeA/modeB/combos.
  // Kalau cocok, K-badge tombol terkait berkedip sebentar di panel "SELECT KEY TO EDIT".
  const KEY_HIGHLIGHT_MS = 700;
  const [highlightedKeys, setHighlightedKeys] = useState<number[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notifikasi kecil di bawah field "Type here..." saat combo/tombol terdeteksi
  const MATCH_LABEL_MS = 1500;
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const detectedLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ubah KeyboardEvent browser jadi string binding senada format firmware ("ctrl+shift+w", dst)
  const normalizeKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>): string | null => {
    const mods: string[] = [];
    if (e.ctrlKey) mods.push('ctrl');
    if (e.shiftKey) mods.push('shift');
    if (e.altKey) mods.push('alt');
    if (e.metaKey) mods.push('win');

    const rawKey = e.key;

    // Modifier ditekan sendirian -> cocokkan dengan binding modifier-only ("alt", "ctrl+shift", dst)
    if (rawKey === 'Control' || rawKey === 'Shift' || rawKey === 'Alt' || rawKey === 'Meta') {
      return mods.length > 0 ? mods.join('+') : null;
    }

    const specialMap: Record<string, string> = {
      Enter: 'enter',
      ' ': 'space',
      Tab: 'tab',
      Escape: 'esc',
      Backspace: 'backspace',
      Delete: 'delete',
      CapsLock: 'capslock',
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    let mainKey: string;
    if (specialMap[rawKey]) mainKey = specialMap[rawKey];
    else if (/^F([1-9]|1[0-2])$/.test(rawKey)) mainKey = rawKey.toLowerCase();
    else if (rawKey.length === 1) mainKey = rawKey.toLowerCase();
    else return null; // tombol lain yang firmware tidak kenali (mis. "Insert", "PageUp")

    return [...mods, mainKey].join('+');
  };

  // Cari index tombol fisik (0-4) yang bindingnya (di modeA, modeB, atau salah satu combo) cocok
  const findMatchingKeyIndices = (bindingStr: string): number[] => {
    const target = bindingStr.toLowerCase();
    const indices = new Set<number>();
    // Hanya cocokkan terhadap mode (A/B) yang sedang kamu lihat di tab editor.
    // Kalau dua binding sama persis ("w") tapi ada di kunci fisik berbeda antar
    // Mode A dan Mode B, mengecek keduanya sekaligus akan menyalakan dua-duanya
    // walau kamu cuma menekan satu tombol fisik -> membingungkan. Web app tidak
    // tahu posisi saklar SPDT fisik secara real-time, jadi asumsi paling masuk akal
    // adalah: kamu sedang menguji mode yang sedang terbuka di layar.
    const currentModeArr = activeMode === 'modeA' ? modeA : modeB;
    currentModeArr.forEach((b, i) => { if (b && b.toLowerCase() === target) indices.add(i); });
    combos.forEach((c) => {
      const bindingForActiveMode = activeMode === 'modeA' ? c.modeA : c.modeB;
      if (bindingForActiveMode && bindingForActiveMode.toLowerCase() === target) {
        c.keys.forEach((k) => indices.add(k));
      }
    });
    return Array.from(indices);
  };

  const handleTestInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const normalized = normalizeKeyEvent(e);
    if (!normalized) return;

    const matches = findMatchingKeyIndices(normalized);
    if (matches.length === 0) return;

    setHighlightedKeys(matches);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedKeys([]), KEY_HIGHLIGHT_MS);

    // Tentukan label: kalau cocok dengan sebuah combo, tunjukkan nomor combo + tombol
    // pemicunya; kalau bukan, berarti tombol individu biasa.
    const target = normalized.toLowerCase();
    const comboIdx = combos.findIndex((c) => {
      const b = activeMode === 'modeA' ? c.modeA : c.modeB;
      return b && b.toLowerCase() === target;
    });
    const label = comboIdx !== -1
      ? `Combo #${comboIdx + 1} \u2022 K${combos[comboIdx].keys.map((k) => k + 1).sort().join('+K')}`
      : `Key ${matches[0] + 1}`;

    setDetectedLabel(label);
    if (detectedLabelTimerRef.current) clearTimeout(detectedLabelTimerRef.current);
    detectedLabelTimerRef.current = setTimeout(() => setDetectedLabel(null), MATCH_LABEL_MS);
  };

  // Bersihkan timer kalau komponen unmount, supaya tidak ada setState setelah unmount
  useEffect(() => () => {
    clearTestTimers();
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // Status balasan dari firmware saat SET_KEYMAP (success / warning / error)
  const [syncStatus, setSyncStatus] = useState<{ level: string; message: string } | null>(null);
  useEffect(() => {
    if (!syncStatus) return;
    const t = setTimeout(() => setSyncStatus(null), 4000);
    return () => clearTimeout(t);
  }, [syncStatus]);

  // --- AUTO-SYNC (debounced) ---
  // Dipicu tiap kali modeA/modeB/combos/chordWindowMs berubah, tapi TIDAK langsung
  // commit ke EEPROM. Menunggu jeda AUTO_SYNC_DEBOUNCE_MS tanpa perubahan lagi dulu,
  // baru kirim satu kali. Ini penting supaya menggeser slider atau color picker
  // (yang menembak banyak onChange sekaligus) tidak menghabiskan siklus erase/write
  // flash EEPROM berkali-kali dalam hitungan detik.
  const AUTO_SYNC_DEBOUNCE_MS = 3000; // dinaikkan dari 1200ms supaya tidak buru-buru saat masih ngatur beberapa combo
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSyncRef = useRef(false); // true saat perubahan state berasal dari KEYMAP_RESPONSE, bukan dari user
  const [autoSyncPending, setAutoSyncPending] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    if (skipNextAutoSyncRef.current) {
      // Perubahan ini datang dari firmware (GET_KEYMAP response), bukan dari
      // editan user -> jangan kirim balik, itu akan jadi sync yang sia-sia.
      skipNextAutoSyncRef.current = false;
      return;
    }
    if (!isConnected) return;

    setAutoSyncPending((prev) => (prev ? prev : true)); // hindari re-render sia-sia saat drag slider terus menembak onChange
    const t = setTimeout(() => {
      handleSaveToRP2040();
    }, AUTO_SYNC_DEBOUNCE_MS);
    autoSyncTimerRef.current = t;

    return () => clearTimeout(t);
    // isConnected sengaja TIDAK dimasukkan sebagai dependency: begitu baru connect,
    // GET_KEYMAP response akan mengubah modeA/modeB/combos lewat skipNextAutoSyncRef
    // di atas, jadi effect ini tidak boleh ikut jalan hanya karena isConnected berubah
    // (kalau ikut, bisa menimpa keymap asli di hardware dengan state lokal yang lama
    // sebelum GET_KEYMAP sempat balas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeA, modeB, modeAHold, modeBHold, combos, chordWindowMs, holdThresholdMs]);

  const connectSerial = async () => {
    if (!('serial' in navigator)) {
      alert('Your browser does not support the Web Serial API.');
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
      console.error('Serial Connection error:', err);
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
              // Ini data DARI firmware (baik saat GET_KEYMAP maupun echo setelah SET_KEYMAP
              // berhasil) -> jangan kirim balik lewat auto-sync, atau akan jadi loop tanpa
              // henti (kirim -> firmware balas -> dianggap "berubah" -> kirim lagi -> ...).
              skipNextAutoSyncRef.current = true;
              if (data.modeA) setModeA(data.modeA);
              if (data.modeB) setModeB(data.modeB);
              if (data.modeAHold) setModeAHold(data.modeAHold);
              if (data.modeBHold) setModeBHold(data.modeBHold);
              if (data.combos) setCombos(data.combos);
              if (typeof data.chordWindowMs === 'number') setChordWindowMs(data.chordWindowMs);
              if (typeof data.holdThresholdMs === 'number') setHoldThresholdMs(data.holdThresholdMs);
            } else if (data.status) {
              // Firmware mengirim baris terpisah seperti {"status":"warning","message":"..."}
              setSyncStatus({ level: data.status, message: data.message || '' });
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
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    sendSerialMessage({ type: 'SET_KEYMAP', modeA, modeB, modeAHold, modeBHold, combos, chordWindowMs, holdThresholdMs });
    setLastSyncedAt(Date.now());
    setAutoSyncPending(false);
  };

  // --- EXPORT / IMPORT CONFIG ---
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportConfig = () => {
    const data = {
      _format: 'aline-configurator',
      _exportedAt: new Date().toISOString(),
      modeA,
      modeB,
      modeAHold,
      modeBHold,
      combos,
      chordWindowMs,
      holdThresholdMs,
      modeAName,
      modeBName,
      palette: currentPalette,
      isCustomTheme,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aline-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => importFileInputRef.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset supaya file yang sama bisa dipilih lagi nanti
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!Array.isArray(parsed.modeA) || !Array.isArray(parsed.modeB)) {
          throw new Error('Missing modeA/modeB');
        }
        setModeA(parsed.modeA);
        setModeB(parsed.modeB);
        if (Array.isArray(parsed.modeAHold)) setModeAHold(parsed.modeAHold);
        if (Array.isArray(parsed.modeBHold)) setModeBHold(parsed.modeBHold);
        if (Array.isArray(parsed.combos)) setCombos(parsed.combos);
        if (typeof parsed.chordWindowMs === 'number') setChordWindowMs(parsed.chordWindowMs);
        if (typeof parsed.holdThresholdMs === 'number') setHoldThresholdMs(parsed.holdThresholdMs);
        if (typeof parsed.modeAName === 'string') setModeAName(parsed.modeAName);
        if (typeof parsed.modeBName === 'string') setModeBName(parsed.modeBName);
        if (parsed.palette) setCurrentPalette(parsed.palette);
        if (typeof parsed.isCustomTheme === 'boolean') setIsCustomTheme(parsed.isCustomTheme);
        setSyncStatus({ level: 'success', message: 'Config imported. Sync to Hardware to apply.' });
      } catch (err) {
        console.error('Import config error:', err);
        setSyncStatus({ level: 'error', message: 'Invalid config file' });
      }
    };
    reader.readAsText(file);
  };

  // HANDLERS COMBO
  const addComboRule = () => {
    if (combos.length >= MAX_COMBOS) return; // firmware cuma menyimpan sampai MAX_COMBOS
    const newIndex = combos.length;
    setCombos([...combos, { keys: [0, 1], modeA: 'q', modeB: 'ctrl+q' }]);
    setExpandedComboIndex(newIndex); // langsung buka combo baru ini untuk diedit
    // PENTING: kalau panel picker masih terbuka dari combo lain sebelumnya,
    // comboEditTarget masih menunjuk ke combo LAMA itu. Tanpa baris ini, klik
    // keycode setelah "+ Add Combo" akan menimpa combo yang sudah diedit
    // sebelumnya, bukan combo yang baru dibuat. Sekalian arahkan langsung ke
    // Out A combo baru supaya siap diedit.
    setSelectedKeyName(null);
    setEditingHoldBinding(false);
    setComboEditTarget({ index: newIndex, field: 'modeA' });
  };

  const removeComboRule = (index: number) => {
    setCombos(combos.filter((_, i) => i !== index));
    setExpandedComboIndex(null); // hindari nyangkut di index yang sudah bergeser
    setComboEditTarget(null);    // sama alasannya: index combo lain bisa bergeser setelah dihapus
    setEditingHoldBinding(false);
  };

  const toggleComboKey = (comboIndex: number, keyIndex: number) => {
    const updated = [...combos];
    const currentKeys = updated[comboIndex].keys;

    if (currentKeys.includes(keyIndex)) {
      if (currentKeys.length > 2) {
        updated[comboIndex].keys = currentKeys.filter((k) => k !== keyIndex);
      }
    } else {
      updated[comboIndex].keys = [...currentKeys, keyIndex].sort();
    }
    setCombos(updated);
  };

  const handleComboOutputChange = (comboIndex: number, mode: 'modeA' | 'modeB', value: string) => {
    const updated = [...combos];
    if (mode === 'modeA') updated[comboIndex].modeA = value;
    else updated[comboIndex].modeB = value;
    setCombos(updated);
  };

  const toggleModifier = (modId: string) => {
    if (selectedModifiers.includes(modId)) {
      setSelectedModifiers(selectedModifiers.filter((m) => m !== modId));
    } else {
      setSelectedModifiers([...selectedModifiers, modId]);
    }
  };

  const assignBinding = (binding: string) => {
    if (comboEditTarget) {
      handleComboOutputChange(comboEditTarget.index, comboEditTarget.field, binding);
      return;
    }

    if (!selectedKeyName || !selectedKeyName.startsWith('key_')) return;
    const keyIndex = parseInt(selectedKeyName.replace('key_', '')) - 1;

    if (editingHoldBinding) {
      if (activeMode === 'modeA') {
        const updated = [...modeAHold];
        updated[keyIndex] = binding;
        setModeAHold(updated);
      } else {
        const updated = [...modeBHold];
        updated[keyIndex] = binding;
        setModeBHold(updated);
      }
      return;
    }

    if (activeMode === 'modeA') {
      const updated = [...modeA];
      updated[keyIndex] = binding;
      setModeA(updated);
    } else {
      const updated = [...modeB];
      updated[keyIndex] = binding;
      setModeB(updated);
    }
  };

  const handleAssignKeycode = (primaryKey: string) => {
    assignBinding([...selectedModifiers, primaryKey.toLowerCase()].join('+'));
  };

  // Pasang modifier itu sendiri sebagai binding (mis. hanya "alt", tanpa tombol lain)
  const handleAssignModifierOnly = () => {
    if (selectedModifiers.length === 0) return;
    assignBinding(selectedModifiers.join('+'));
  };

  const handleCustomColorChange = (key: 'bg' | 'case' | 'keycaps', colorValue: string) => {
    setIsCustomTheme(true);
    setCurrentPalette((prev) => ({
      ...prev,
      id: 'custom',
      name: 'Custom',
      [key]: colorValue,
    }));
  };

  const currentKeymap = activeMode === 'modeA' ? modeA : modeB;
  const currentModeLabel = activeMode === 'modeA' ? modeAName : modeBName;

  return (
    <main
      style={{
        backgroundColor: currentPalette.bg,
        color: textColor,
        fontFamily: "'Manrope', system-ui, sans-serif",
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        position: 'relative',
        transition: 'background-color 0.5s ease, color 0.5s ease',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Manrope:wght@400;500;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible {
          outline: 2px solid #38bdf8;
          outline-offset: 2px;
        }
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      {/* 1. PERSISTENT 3D CANVAS LAYER */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: viewMode === 'hero' ? 'scale(1)' : 'scale(1.08)',
          pointerEvents: viewMode === 'config' ? 'auto' : 'none',
        }}
      >
        <Canvas camera={{ position: [0, 4, 8], fov: 40 }} style={{ width: '100%', height: '100%' }}>
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.7}>
              <KeyboardModel
                colorPalette={currentPalette}
                selectedKey={selectedKeyName}
                isInteractive={viewMode === 'config'}
                onSelectKey={(keyName) => {
                  setComboEditTarget(null);
                  setEditingHoldBinding(false);
                  setSelectedKeyName(keyName);
                }}
              />
            </Stage>
          </Suspense>
          <OrbitControls
            enableRotate={viewMode === 'config'}
            enableZoom={viewMode === 'config'}
            autoRotate={viewMode === 'hero'}
            autoRotateSpeed={1.2}
            makeDefault
          />
        </Canvas>
      </div>

      {/* 2. OVERLAY DYNAMIC DARK/LIGHT FADE */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          backgroundColor: currentPalette.bg,
          opacity: viewMode === 'hero' ? 0.75 : 0.05,
          backdropFilter: viewMode === 'hero' ? 'blur(10px)' : 'blur(0px)',
          WebkitBackdropFilter: viewMode === 'hero' ? 'blur(10px)' : 'blur(0px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      />

      {/* 3. HERO OVERLAY UI */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          padding: '0 80px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          opacity: viewMode === 'hero' ? 1 : 0,
          pointerEvents: 'none',
          transform: viewMode === 'hero' ? 'translateY(0)' : 'translateY(-30px)',
          transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Left Hero Text */}
        <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '24px', pointerEvents: viewMode === 'hero' ? 'auto' : 'none' }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', 'Manrope', sans-serif",
              fontSize: '4rem',
              fontWeight: '700',
              lineHeight: '1.05',
              letterSpacing: '-0.03em',
              margin: 0,
              color: textColor,
            }}
          >
            Aline Configurator
          </h1>

          <p style={{ fontSize: '1.15rem', color: subTextColor, lineHeight: '1.6', margin: 0 }}>
            Craft your ultimate physical productivity tool. Customize keybindings, switch profiles, and sync live to RP2040 hardware via Web Serial.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
            <button
              onClick={() => setViewMode('config')}
              style={{
                position: 'relative',
                padding: '18px 40px',
                fontSize: '1.05rem',
                fontWeight: '800',
                color: '#ffffff',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                cursor: 'pointer',
                boxShadow: '0 12px 30px -6px rgba(37, 99, 235, 0.5)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }}
            >
              <span>Start Customizing</span>
              <Settings2 size={18} strokeWidth={2.5} />
            </button>

            <div
              onClick={() => setViewMode('config')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: subTextColor,
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <ChevronDown size={14} />
              <span>Scroll down or click to customize</span>
            </div>
          </div>
        </div>

        {/* Right Glass Card */}
        <div
          style={{
            width: '360px',
            backgroundColor: glassBg,
            backdropFilter: 'blur(20px)',
            borderRadius: '28px',
            padding: '28px',
            border: `1px solid ${glassBorder}`,
            boxShadow: '0 30px 60px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            pointerEvents: viewMode === 'hero' ? 'auto' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '10px', color: isBgLight ? '#d97706' : '#f59e0b', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '4px' }}>
                LIVE KEYMAP OVERVIEW
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: textColor }}>
                5 Physical Keys Mapping
              </div>
            </div>

            <div
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: isBgLight ? 'rgba(2, 132, 199, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                border: isBgLight ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                color: isBgLight ? '#0284c7' : '#38bdf8',
                fontSize: '11px',
                fontWeight: 'bold',
                maxWidth: '110px',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              title={currentModeLabel}
            >
              {activeMode === 'modeA' ? 'Mode A' : 'Mode B'}: {currentModeLabel}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {currentKeymap.map((binding, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: itemBg,
                  border: `1px solid ${glassBorder}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '26px',
                      height: '24px',
                      borderRadius: '6px',
                      backgroundColor: currentPalette.keycaps,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.2)',
                    }}
                  >
                    K{idx + 1}
                  </span>
                  <span style={{ fontSize: '12px', color: subTextColor }}>Key {idx + 1}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", color: isBgLight ? '#0284c7' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  {binding || 'Unassigned'}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={isConnected ? handleSaveToRP2040 : connectSerial}
            style={{
              padding: '12px',
              borderRadius: '14px',
              backgroundColor: isConnected ? '#10b981' : currentPalette.keycaps,
              border: 'none',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#34d399' : '#f87171',
                boxShadow: isConnected ? '0 0 8px #34d399' : '0 0 8px #f87171',
              }}
            />
            {isConnected ? 'Save Keymap to Hardware' : 'Disconnected: Click to Connect'}
          </button>
        </div>
      </div>

      {/* 4. CONFIGURATOR OVERLAY UI */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          opacity: viewMode === 'config' ? 1 : 0,
          pointerEvents: 'none',
          transform: viewMode === 'config' ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Sync Status Banner (dari respons SET_KEYMAP firmware) */}
        {syncStatus && (
          <div
            style={{
              position: 'absolute',
              top: '30px',
              left: '50%',
              transform: 'translateX(-50%) translateY(56px)',
              zIndex: 15,
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor:
                syncStatus.level === 'success' ? '#10b981' :
                syncStatus.level === 'warning' ? '#f59e0b' : '#ef4444',
              boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}
          >
            {syncStatus.message || syncStatus.level}
          </div>
        )}

        {/* Live Test — pill kecil di kanan atas, sengaja minim teks */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            right: '40px',
            zIndex: 10,
            pointerEvents: viewMode === 'config' ? 'auto' : 'none',
          }}
        >
          <input
            type="text"
            value={testInputValue}
            onChange={(e) => handleTestInputChange(e.target.value)}
            onKeyDown={handleTestInputKeyDown}
            placeholder="Type here..."
            style={{
              width: '160px',
              padding: '9px 14px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              borderRadius: '999px',
              border: testInputValue ? '1px solid rgba(16, 185, 129, 0.6)' : `1px solid ${glassBorder}`,
              backgroundColor: glassPanelBg,
              backdropFilter: 'blur(12px)',
              color: textColor,
              outline: 'none',
              textAlign: 'center',
              opacity: testInputFading ? 0 : 1,
              boxShadow: testInputValue ? '0 0 0 3px rgba(16, 185, 129, 0.12), 0 8px 20px rgba(0,0,0,0.15)' : '0 8px 20px rgba(0,0,0,0.1)',
              transition: `opacity ${TEST_INPUT_FADE_MS}ms ease, box-shadow 0.25s ease, border-color 0.25s ease, width 0.25s ease`,
            }}
            onFocus={(e) => { e.currentTarget.style.width = '200px'; }}
            onBlur={(e) => { e.currentTarget.style.width = '160px'; }}
          />
          {detectedLabel && (
            <div
              style={{
                marginTop: '6px',
                textAlign: 'center',
                fontSize: '9px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                color: '#10b981',
                backgroundColor: glassPanelBg,
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '999px',
                padding: '3px 10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                animation: 'fadeInUp 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              ✓ {detectedLabel}
            </div>
          )}
        </div>

        {/* Top Navbar */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: viewMode === 'config' ? 'auto' : 'none',
          }}
        >
          <button
            onClick={() => {
              setViewMode('hero');
              setSelectedKeyName(null);
              setEditingHoldBinding(false);
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: `1px solid ${glassBorder}`,
              backgroundColor: glassPanelBg,
              color: textColor,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '12px',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <ArrowLeft size={14} />
            Back to Overview
          </button>

          <button
            onClick={connectSerial}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: isConnected ? '#10b981' : currentPalette.keycaps,
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '12px',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#ffffff' : '#f87171',
                boxShadow: isConnected ? '0 0 6px #ffffff' : '0 0 6px #f87171',
              }}
            />
            {isConnected ? <Check size={14} /> : <Plug size={14} />}
            {isConnected ? 'Hardware Connected' : 'Connect RP2040'}
          </button>

          {isConnected && (
            <button
              onClick={handleSaveToRP2040}
              style={{
                position: 'relative',
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#f59e0b',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Save size={14} />
              Sync to Hardware
              {autoSyncPending && (
                <span
                  title="Auto-syncing shortly..."
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#fbbf24',
                    border: '2px solid rgba(0,0,0,0.15)',
                    animation: 'pulseDot 1s ease-in-out infinite',
                  }}
                />
              )}
            </button>
          )}
        </div>

        {/* Left Control Panel */}
        <div
          style={{
            position: 'absolute',
            top: '90px',
            bottom: '40px',
            left: '40px',
            backgroundColor: glassPanelBg,
            backdropFilter: 'blur(16px)',
            padding: '20px',
            borderRadius: '20px',
            border: `1px solid ${glassBorder}`,
            color: textColor,
            zIndex: 10,
            width: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            overflowY: 'auto',
            pointerEvents: viewMode === 'config' ? 'auto' : 'none',
          }}
        >
          {/* Export / Import Config */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleExportConfig}
              title="Export config as JSON"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '8px',
                border: `1px solid ${glassBorder}`,
                backgroundColor: itemBg,
                color: textColor,
                cursor: 'pointer',
              }}
            >
              <Download size={12} /> Export
            </button>
            <button
              onClick={handleImportClick}
              title="Import config from JSON"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '8px',
                border: `1px solid ${glassBorder}`,
                backgroundColor: itemBg,
                color: textColor,
                cursor: 'pointer',
              }}
            >
              <Upload size={12} /> Import
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>

          {/* Theme Selector */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: isBgLight ? '#0284c7' : '#38bdf8' }}>
              THEME PALETTE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '8px' }}>
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setIsCustomTheme(false);
                    setCurrentPalette(p);
                  }}
                  style={{
                    padding: '6px 8px',
                    fontSize: '10px',
                    borderRadius: '6px',
                    border: currentPalette.id === p.id && !isCustomTheme ? '1px solid #38bdf8' : `1px solid ${glassBorder}`,
                    backgroundColor: currentPalette.id === p.id && !isCustomTheme ? 'rgba(56, 189, 248, 0.2)' : itemBg,
                    color: textColor,
                    cursor: 'pointer',
                    fontWeight: currentPalette.id === p.id && !isCustomTheme ? 'bold' : 'normal',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: itemBg, padding: '8px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: subTextColor, fontWeight: 'bold' }}>Custom Colors:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                <span>Background</span>
                <input type="color" value={currentPalette.bg} onChange={(e) => handleCustomColorChange('bg', e.target.value)} style={{ border: 'none', width: '20px', height: '20px', cursor: 'pointer', background: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                <span>Case</span>
                <input type="color" value={currentPalette.case} onChange={(e) => handleCustomColorChange('case', e.target.value)} style={{ border: 'none', width: '20px', height: '20px', cursor: 'pointer', background: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                <span>Keycaps</span>
                <input type="color" value={currentPalette.keycaps} onChange={(e) => handleCustomColorChange('keycaps', e.target.value)} style={{ border: 'none', width: '20px', height: '20px', cursor: 'pointer', background: 'none' }} />
              </div>
            </div>
          </div>

          <hr style={{ borderColor: glassBorder, margin: 0 }} />

          {/* Mode Switcher */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', background: itemBg, padding: '4px', borderRadius: '8px' }}>
              <button
                onClick={() => setActiveMode('modeA')}
                style={{
                  flex: 1,
                  padding: '6px',
                  fontSize: '11px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: activeMode === 'modeA' ? '#2563eb' : 'transparent',
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
                  backgroundColor: activeMode === 'modeB' ? '#2563eb' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Mode B
              </button>
            </div>

            <input
              type="text"
              value={activeMode === 'modeA' ? modeAName : modeBName}
              onChange={(e) => {
                if (activeMode === 'modeA') setModeAName(e.target.value);
                else setModeBName(e.target.value);
              }}
              placeholder="Label Mode..."
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '6px',
                backgroundColor: itemBg,
                border: `1px solid ${glassBorder}`,
                color: isBgLight ? '#0284c7' : '#38bdf8',
                fontWeight: 'bold',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Quick Select Key */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: isBgLight ? '#d97706' : '#f59e0b' }}>
              SELECT KEY TO EDIT:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
              {[0, 1, 2, 3, 4].map((idx) => {
                const keyName = `key_${idx + 1}`;
                const isHighlighted = highlightedKeys.includes(idx);
                return (
                  <div
                    key={keyName}
                    onClick={() => { setComboEditTarget(null); setEditingHoldBinding(false); setSelectedKeyName(keyName); }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      backgroundColor: selectedKeyName === keyName ? (isBgLight ? 'rgba(217, 119, 6, 0.15)' : 'rgba(245, 158, 11, 0.2)') : 'transparent',
                      border: selectedKeyName === keyName ? '1px solid #f59e0b' : '1px solid transparent',
                      boxShadow: isHighlighted ? '0 0 0 2px rgba(16, 185, 129, 0.6)' : 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, box-shadow 0.3s ease',
                    }}
                  >
                    <span style={{ color: subTextColor }}>Key {idx + 1}:</span>
                    <span style={{ fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", color: isBgLight ? '#0284c7' : '#38bdf8', textTransform: 'uppercase' }}>
                      {currentKeymap[idx] || 'empty'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <hr style={{ borderColor: glassBorder, margin: 0 }} />

          {/* MODUL COMBO RULES (CHORDING) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: isBgLight ? '#10b981' : '#34d399' }}>
                COMBO RULES ({combos.length}/{MAX_COMBOS})
              </span>
              <button
                onClick={addComboRule}
                disabled={combos.length >= MAX_COMBOS}
                title={combos.length >= MAX_COMBOS ? `Maximum ${MAX_COMBOS} combos (firmware limit)` : undefined}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: combos.length >= MAX_COMBOS ? '#6b7280' : '#10b981',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: combos.length >= MAX_COMBOS ? 'not-allowed' : 'pointer',
                  opacity: combos.length >= MAX_COMBOS ? 0.6 : 1,
                }}
              >
                + Add Combo
              </button>
            </div>

            {/* Chord Detection Window */}
            <div style={{ background: itemBg, padding: '8px 10px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '9px', color: subTextColor, fontWeight: 'bold' }}>CHORD WINDOW</span>
                <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isBgLight ? '#10b981' : '#34d399' }}>
                  {chordWindowMs}ms
                </span>
              </div>
              <input
                type="range"
                min={CHORD_WINDOW_MIN}
                max={CHORD_WINDOW_MAX}
                step={5}
                value={chordWindowMs}
                onChange={(e) => setChordWindowMs(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
              />
              <div style={{ fontSize: '8.5px', color: subTextColor, lineHeight: 1.4 }}>
                Lower = combo keys must be pressed more precisely together. Higher = more forgiving, but single key presses feel a touch delayed. Click "Sync to Hardware" to apply.
              </div>
            </div>

            {combos.length === 0 ? (
              <div style={{ fontSize: '10px', color: subTextColor, fontStyle: 'italic' }}>
                No combos configured yet.
              </div>
            ) : (() => {
              // Deteksi combo yang trigger key-nya persis sama (kemungkinan besar tidak sengaja)
              const seenSignatures = new Map<string, number>();
              const duplicateIndices = new Set<number>();
              combos.forEach((c, idx) => {
                const sig = [...c.keys].sort((a, b) => a - b).join(',');
                if (seenSignatures.has(sig)) {
                  duplicateIndices.add(idx);
                  duplicateIndices.add(seenSignatures.get(sig)!);
                } else {
                  seenSignatures.set(sig, idx);
                }
              });

              return combos.map((c, cIdx) => {
                const isExpanded = expandedComboIndex === cIdx;
                const isDuplicate = duplicateIndices.has(cIdx);
                const keySummary = `K${[...c.keys].sort((a, b) => a - b).map((k) => k + 1).join('+K')}`;

                return (
                  <div
                    key={cIdx}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: itemBg,
                      border: isDuplicate ? '1px solid #f87171' : `1px solid ${glassBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div
                      onClick={() => setExpandedComboIndex(isExpanded ? null : cIdx)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '8px' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: textColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Combo #{cIdx + 1}
                          {isDuplicate && (
                            <span style={{ fontSize: '8px', fontWeight: 700, color: '#f87171', border: '1px solid #f87171', borderRadius: '4px', padding: '1px 4px' }}>
                              SAME TRIGGER
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: "'JetBrains Mono', monospace",
                            color: subTextColor,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {keySummary} &rarr; {c.modeA ? c.modeA.toUpperCase() : '\u2014'} / {c.modeB ? c.modeB.toUpperCase() : '\u2014'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeComboRule(cIdx); }}
                          style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Remove
                        </button>
                        <ChevronDown
                          size={14}
                          style={{
                            color: subTextColor,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '9px', color: subTextColor }}>Trigger Keys:</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {[0, 1, 2, 3, 4].map((kIdx) => (
                            <label key={kIdx} style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={c.keys.includes(kIdx)}
                                onChange={() => toggleComboKey(cIdx, kIdx)}
                              />
                              K{kIdx + 1}
                            </label>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
                          {(['modeA', 'modeB'] as const).map((field) => {
                            const isEditingThis = comboEditTarget?.index === cIdx && comboEditTarget?.field === field;
                            const value = c[field];
                            return (
                              <button
                                key={field}
                                onClick={() => { setSelectedKeyName(null); setEditingHoldBinding(false); setComboEditTarget({ index: cIdx, field }); }}
                                title="Click to pick modifier / keycode"
                                style={{
                                  padding: '6px 4px',
                                  fontSize: '9px',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 700,
                                  borderRadius: '4px',
                                  border: isEditingThis ? '1px solid #2563eb' : `1px solid ${glassBorder}`,
                                  backgroundColor: isEditingThis ? 'rgba(37, 99, 235, 0.15)' : glassPanelBg,
                                  color: value ? (isBgLight ? '#0284c7' : '#38bdf8') : subTextColor,
                                  outline: 'none',
                                  cursor: 'pointer',
                                  textTransform: 'uppercase',
                                  textAlign: 'left',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {value || `Out ${field === 'modeA' ? 'A' : 'B'}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* MODUL TAP VS HOLD */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: isBgLight ? '#0284c7' : '#38bdf8' }}>
              TAP vs HOLD
            </span>
            <div style={{ background: itemBg, padding: '8px 10px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '9px', color: subTextColor, fontWeight: 'bold' }}>HOLD THRESHOLD</span>
                <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isBgLight ? '#10b981' : '#34d399' }}>
                  {holdThresholdMs}ms
                </span>
              </div>
              <input
                type="range"
                min={HOLD_THRESHOLD_MIN}
                max={HOLD_THRESHOLD_MAX}
                step={25}
                value={holdThresholdMs}
                onChange={(e) => setHoldThresholdMs(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
              />
              <div style={{ fontSize: '8.5px', color: subTextColor, lineHeight: 1.4 }}>
                How long a key must be held before its Hold binding activates. Only affects keys that actually have a Hold binding set — other keys behave exactly as before, with zero added delay. Set a key's Hold binding from its Map Key panel.
              </div>
            </div>
          </div>
        </div>

        {/* Right Mapping Panel — dipakai untuk tombol fisik MAUPUN binding combo */}
        {((selectedKeyName && selectedKeyName.startsWith('key_')) || comboEditTarget) && (
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              right: '40px',
              width: '320px',
              backgroundColor: glassPanelBg,
              backdropFilter: 'blur(16px)',
              padding: '20px',
              borderRadius: '20px',
              border: '1px solid #2563eb',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              color: textColor,
              zIndex: 20,
              pointerEvents: viewMode === 'config' ? 'auto' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: textColor, fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                {comboEditTarget
                  ? `Combo #${comboEditTarget.index + 1} \u2013 Out ${comboEditTarget.field === 'modeA' ? 'A' : 'B'}`
                  : `Map Key: ${selectedKeyName?.toUpperCase()}`}
              </span>
              <button
                onClick={() => { setSelectedKeyName(null); setComboEditTarget(null); setEditingHoldBinding(false); }}
                style={{ background: 'none', border: 'none', color: subTextColor, cursor: 'pointer', display: 'flex', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            {!comboEditTarget && selectedKeyName && (() => {
              const editingKeyIndex = parseInt(selectedKeyName.replace('key_', '')) - 1;
              const currentHoldVal = activeMode === 'modeA' ? modeAHold[editingKeyIndex] : modeBHold[editingKeyIndex];
              return (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setEditingHoldBinding(false)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: !editingHoldBinding ? '1px solid #2563eb' : `1px solid ${glassBorder}`,
                        backgroundColor: !editingHoldBinding ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                        color: textColor,
                        cursor: 'pointer',
                      }}
                    >
                      TAP
                    </button>
                    <button
                      onClick={() => setEditingHoldBinding(true)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: editingHoldBinding ? '1px solid #f59e0b' : `1px solid ${glassBorder}`,
                        backgroundColor: editingHoldBinding ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                        color: textColor,
                        cursor: 'pointer',
                      }}
                    >
                      HOLD{currentHoldVal ? ' \u25cf' : ''}
                    </button>
                  </div>
                  {editingHoldBinding && (
                    <div style={{ fontSize: '8.5px', color: subTextColor, marginTop: '6px', lineHeight: 1.4 }}>
                      Activates only if this key is held past the Hold Threshold (see TAP vs HOLD section below).
                      {currentHoldVal && (
                        <>
                          {' '}
                          <span
                            onClick={() => assignBinding('')}
                            style={{ color: '#ef4444', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Clear hold binding
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Modifiers Selection */}
            <div style={{ marginBottom: '12px', background: itemBg, padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: isBgLight ? '#0284c7' : '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>
                1. PICK MODIFIER (optional, can stand alone):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {MODIFIER_KEYS.map((mod) => {
                  const active = selectedModifiers.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModifier(mod.id)}
                      style={{
                        padding: '6px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        borderRadius: '6px',
                        border: active ? '1px solid #2563eb' : `1px solid ${glassBorder}`,
                        backgroundColor: active ? '#2563eb' : 'transparent',
                        color: active ? '#ffffff' : textColor,
                        cursor: 'pointer',
                      }}
                    >
                      {mod.label}
                    </button>
                  );
                })}
              </div>

              {selectedModifiers.length > 0 && (
                <button
                  onClick={handleAssignModifierOnly}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '8px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    borderRadius: '6px',
                    border: '1px dashed #2563eb',
                    backgroundColor: 'transparent',
                    color: isBgLight ? '#1d4ed8' : '#60a5fa',
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  Assign {selectedModifiers.map((m) => m.toUpperCase()).join('+')} only (no keycode)
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0 10px' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: glassBorder }} />
              <span style={{ fontSize: '9px', color: subTextColor, fontWeight: 'bold' }}>OR</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: glassBorder }} />
            </div>

            {/* Keycode Selection */}
            <div style={{ background: itemBg, padding: '10px', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              <div style={{ fontSize: '10px', color: isBgLight ? '#0284c7' : '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>
                2. OR PICK KEYCODE:
              </div>
              {AVAILABLE_KEYCODES.map((group) => (
                <div key={group.group} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', color: subTextColor, fontWeight: 'bold', marginBottom: '4px' }}>
                    {group.group}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {group.keys.map((k) => (
                      <button
                        key={k}
                        onClick={() => handleAssignKeycode(k)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: '600',
                          borderRadius: '4px',
                          border: `1px solid ${glassBorder}`,
                          backgroundColor: glassPanelBg,
                          color: textColor,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          transition: 'transform 0.1s ease, background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = glassPanelBg; e.currentTarget.style.color = textColor; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}