"""VOICEVOX Engine で台本どおりの WAV を生成する。"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENGINE = "http://127.0.0.1:50021"
AUDIO = ROOT / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)


def post(path: str, params: dict | None = None, data: bytes | None = None, content_type: str | None = None) -> bytes:
    url = ENGINE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def synth(text: str, speaker: int, out: Path) -> None:
    query = post("/audio_query", {"text": text, "speaker": speaker})
    # 少しゆっくりめ・はっきり
    q = json.loads(query.decode("utf-8"))
    q["speedScale"] = 1.05
    q["pitchScale"] = 0.0
    q["intonationScale"] = 1.1
    q["volumeScale"] = 1.0
    wav = post(
        "/synthesis",
        {"speaker": speaker},
        data=json.dumps(q).encode("utf-8"),
        content_type="application/json",
    )
    out.write_bytes(wav)
    print(f"wrote {out.name} ({len(wav)} bytes)")


def main() -> None:
    script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    speaker = int(script["speakerId"])
    for scene in script["scenes"]:
        out = AUDIO / f"{scene['id']}.wav"
        synth(scene["text"], speaker, out)
    print("done")


if __name__ == "__main__":
    main()
