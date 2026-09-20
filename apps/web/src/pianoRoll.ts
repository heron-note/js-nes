/**
 * Create 用ピアノロール（4ch × 時間ステップ × 音階）。
 * 編集結果は SoundAsset.events / lengthFrames に書き戻す。
 */
import { noteIndexToLabel, type AudioEngine } from "./audio.js";
import type { SoundAsset } from "./projectV3.js";
import {
  PIANO_ROLL_FRAMES_PER_STEP,
  PIANO_ROLL_NOTE_ROWS,
  PIANO_ROLL_STEPS_DEFAULT,
  defaultLengthFrames,
  soundToEvents,
  syncToneFieldsFromEvents,
  type SoundChannel,
  type ToneEvent,
} from "./soundSequence.js";

export type PianoRollHandle = {
  destroy: () => void;
  refresh: () => void;
};

const CH_LABELS = ["Pulse1", "Pulse2", "三角", "ノイズ"] as const;

export function mountPianoRoll(
  host: HTMLElement,
  opts: {
    getSound: () => SoundAsset;
    onChange: () => void;
    audio: AudioEngine;
  },
): PianoRollHandle {
  let channel: SoundChannel = 0;
  let brushNote = 24;
  let brushDurSteps = 2;
  let steps = PIANO_ROLL_STEPS_DEFAULT;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewToken = 0;

  const sound0 = opts.getSound();
  if (sound0.lengthFrames) {
    steps = Math.max(8, Math.min(64, Math.ceil(sound0.lengthFrames / PIANO_ROLL_FRAMES_PER_STEP)));
  }

  host.innerHTML = `
    <div class="piano-roll">
      <div class="piano-roll-toolbar">
        <div class="piano-roll-channels" role="tablist">
          ${CH_LABELS.map(
            (lab, i) =>
              `<button type="button" class="piano-ch-btn${i === 0 ? " active" : ""}" data-ch="${i}">${lab}</button>`,
          ).join("")}
        </div>
        <label>音階
          <select id="pr-brush-note"></select>
        </label>
        <label>長さ(ステップ)
          <input type="number" id="pr-brush-dur" min="1" max="16" value="${brushDurSteps}" />
        </label>
        <label>小節長
          <input type="number" id="pr-steps" min="8" max="64" step="8" value="${steps}" />
        </label>
        <button type="button" id="pr-preview">▶ 試聴</button>
        <button type="button" id="pr-stop" class="secondary">停止</button>
        <button type="button" id="pr-clear" class="secondary">このchをクリア</button>
      </div>
      <p class="muted piano-roll-hint">横＝時間、縦＝音階。クリックで配置、もう一度クリックで削除。4ch 同時に鳴らせます。</p>
      <div class="piano-roll-scroll">
        <div class="piano-roll-grid" id="pr-grid"></div>
      </div>
    </div>
  `;

  const noteSelect = host.querySelector<HTMLSelectElement>("#pr-brush-note")!;
  const durInput = host.querySelector<HTMLInputElement>("#pr-brush-dur")!;
  const stepsInput = host.querySelector<HTMLInputElement>("#pr-steps")!;
  const grid = host.querySelector<HTMLDivElement>("#pr-grid")!;

  function fillNoteSelect(): void {
    const max = channel === 3 ? 15 : PIANO_ROLL_NOTE_ROWS - 1;
    noteSelect.innerHTML = "";
    for (let i = max; i >= 0; i--) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = channel === 3 ? `周期 ${i}` : `${i}: ${noteIndexToLabel(i)}`;
      noteSelect.appendChild(opt);
    }
    brushNote = Math.min(brushNote, max);
    noteSelect.value = String(brushNote);
  }

  function eventsForChannel(ch: SoundChannel): ToneEvent[] {
    return soundToEvents(opts.getSound()).filter((e) => e.channel === ch);
  }

  function setEvents(next: ToneEvent[]): void {
    const sound = opts.getSound();
    sound.events = next.slice().sort((a, b) => a.t - b.t || a.channel - b.channel);
    sound.lengthFrames = steps * PIANO_ROLL_FRAMES_PER_STEP;
    syncToneFieldsFromEvents(sound);
    opts.onChange();
    renderGrid();
  }

  function stopPreview(): void {
    previewToken++;
    if (previewTimer !== null) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
  }

  function renderGrid(): void {
    const rows = channel === 3 ? 16 : PIANO_ROLL_NOTE_ROWS;
    const evs = eventsForChannel(channel);
    const cellW = 22;
    const cellH = 14;
    grid.style.setProperty("--pr-cols", String(steps));
    grid.style.setProperty("--pr-rows", String(rows));
    grid.style.width = `${steps * cellW + 48}px`;
    grid.style.height = `${rows * cellH}px`;

    const cells: string[] = [];
    // note labels column baked into grid via data
    for (let r = 0; r < rows; r++) {
      const note = rows - 1 - r;
      const label = channel === 3 ? `N${note}` : noteIndexToLabel(note);
      cells.push(`<div class="pr-note-lab" style="grid-row:${r + 1};grid-column:1">${label}</div>`);
      for (let c = 0; c < steps; c++) {
        const t0 = c * PIANO_ROLL_FRAMES_PER_STEP;
        const hit = evs.find(
          (e) => e.note === note && e.t < t0 + PIANO_ROLL_FRAMES_PER_STEP && e.t + e.duration > t0,
        );
        const start = hit && hit.t === t0;
        cells.push(
          `<button type="button" class="pr-cell${hit ? " filled" : ""}${start ? " start" : ""}" data-step="${c}" data-note="${note}" style="grid-row:${r + 1};grid-column:${c + 2}"></button>`,
        );
      }
    }
    grid.innerHTML = cells.join("");
    grid.querySelectorAll<HTMLButtonElement>(".pr-cell").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        const note = Number(btn.dataset.note);
        const t = step * PIANO_ROLL_FRAMES_PER_STEP;
        const sound = opts.getSound();
        let all = soundToEvents(sound);
        const existing = all.find(
          (e) => e.channel === channel && e.note === note && e.t === t,
        );
        if (existing) {
          all = all.filter((e) => e !== existing);
        } else {
          // 同じ ch・同じ開始時刻の別音は置き換え
          all = all.filter((e) => !(e.channel === channel && e.t === t));
          all.push({
            t,
            channel,
            note,
            duration: brushDurSteps * PIANO_ROLL_FRAMES_PER_STEP,
          });
        }
        setEvents(all);
        void opts.audio.resume().then(() => {
          opts.audio.previewTone(channel, note, brushDurSteps * PIANO_ROLL_FRAMES_PER_STEP);
        });
      });
    });
  }

  fillNoteSelect();
  renderGrid();

  host.querySelectorAll<HTMLButtonElement>(".piano-ch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      channel = Number(btn.dataset.ch) as SoundChannel;
      host.querySelectorAll(".piano-ch-btn").forEach((b) => b.classList.toggle("active", b === btn));
      fillNoteSelect();
      renderGrid();
    });
  });

  noteSelect.addEventListener("change", () => {
    brushNote = Number(noteSelect.value) | 0;
  });
  durInput.addEventListener("change", () => {
    brushDurSteps = Math.max(1, Math.min(16, Number(durInput.value) | 0));
  });
  stepsInput.addEventListener("change", () => {
    steps = Math.max(8, Math.min(64, Number(stepsInput.value) | 0));
    const sound = opts.getSound();
    sound.lengthFrames = steps * PIANO_ROLL_FRAMES_PER_STEP;
    opts.onChange();
    renderGrid();
  });

  host.querySelector("#pr-clear")!.addEventListener("click", () => {
    const all = soundToEvents(opts.getSound()).filter((e) => e.channel !== channel);
    setEvents(all);
  });

  host.querySelector("#pr-stop")!.addEventListener("click", () => stopPreview());

  host.querySelector("#pr-preview")!.addEventListener("click", () => {
    stopPreview();
    const token = previewToken;
    const events = soundToEvents(opts.getSound()).slice().sort((a, b) => a.t - b.t);
    void opts.audio.resume().then(() => {
      if (token !== previewToken) return;
      for (const ev of events) {
        const delay = (ev.t / 60) * 1000;
        previewTimer = setTimeout(() => {
          if (token !== previewToken) return;
          opts.audio.previewTone(ev.channel, ev.note, ev.duration);
        }, delay);
      }
    });
  });

  // 初回: events が無ければ単発を events に昇格してロール表示可能に
  const s = opts.getSound();
  if (!s.events || s.events.length === 0) {
    s.events = soundToEvents(s);
    s.lengthFrames = s.lengthFrames ?? defaultLengthFrames();
    syncToneFieldsFromEvents(s);
    opts.onChange();
    renderGrid();
  }

  return {
    destroy: () => {
      stopPreview();
      host.innerHTML = "";
    },
    refresh: () => renderGrid(),
  };
}
