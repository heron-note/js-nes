"""静止画 + VOICEVOX WAV を結合してスマホ縦動画を作る。"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FFMPEG = Path(r"D:\ffmpeg\bin\ffmpeg.exe")
FFPROBE = Path(r"D:\ffmpeg\bin\ffprobe.exe")
WORK = ROOT / "work"
OUT = ROOT / "herocon-play-guide.mp4"

# shot 名 → 画像ファイル
SHOT_MAP = {
    "intro": "intro.png",
    "pad": "pad.png",
    "capture": "capture.png",
    "cassette": "cassette.png",
    "samples": "samples.png",
    "lawn": "lawn.png",
    "github": "github.png",
    "end": "end.png",
}


def duration(wav: Path) -> float:
    out = subprocess.check_output(
        [
            str(FFPROBE),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(wav),
        ],
        text=True,
    ).strip()
    return float(out)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    clips = []
    concat_lines = []

    for i, scene in enumerate(script["scenes"]):
        wav = ROOT / "audio" / f"{scene['id']}.wav"
        img = ROOT / "shots" / SHOT_MAP[scene["shot"]]
        if not wav.exists():
            raise SystemExit(f"missing {wav}")
        if not img.exists():
            raise SystemExit(f"missing {img}")
        dur = duration(wav) + 0.35  # 余韻
        clip = WORK / f"clip_{i:02d}.mp4"
        # 390x844 を偶数に（yuv420p）
        cmd = [
            str(FFMPEG),
            "-y",
            "-loop",
            "1",
            "-i",
            str(img),
            "-i",
            str(wav),
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=390:844:force_original_aspect_ratio=decrease,pad=390:844:(ow-iw)/2:(oh-ih)/2:color=0x101218",
            "-t",
            f"{dur:.3f}",
            "-shortest",
            str(clip),
        ]
        print(" ".join(cmd[-8:]))
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        clips.append(clip)
        concat_lines.append(f"file '{clip.as_posix()}'")

    list_file = WORK / "concat.txt"
    list_file.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    subprocess.check_call(
        [
            str(FFMPEG),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(OUT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
