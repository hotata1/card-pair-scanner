"""
card-pair-scanner AWS認識エンジン用Lambda。
画像を受け取りAmazon Rekognition(DetectText)を呼び出し、単体文字(A-Z)と
3桁数字の検出を近接ペアリングして、フロントエンドのRecognizer契約
(candidates/lowConfidence/cardCount)と同じ形に整形して返す。
"""

import base64
import json
import os
import re

import boto3

rekognition = boto3.client("rekognition")

LETTER_RE = re.compile(r"^[A-Z]$")
DIGITS_RE = re.compile(r"^[0-9]{3}$")

# ペアリング半径: letter/digitのバウンディングボックス高さの最大値のこの倍率以内なら
# 同一タイルとみなす。実表示のフォント・配置が判明したら要調整。
PAIR_RADIUS_FACTOR = 3.0

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _box_px(bbox: dict, width: float, height: float) -> dict:
    return {
        "x": bbox["Left"] * width,
        "y": bbox["Top"] * height,
        "w": bbox["Width"] * width,
        "h": bbox["Height"] * height,
    }


def _center(box: dict) -> tuple:
    return (box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)


def _union(a: dict, b: dict) -> dict:
    x0, y0 = min(a["x"], b["x"]), min(a["y"], b["y"])
    x1 = max(a["x"] + a["w"], b["x"] + b["w"])
    y1 = max(a["y"] + a["h"], b["y"] + b["h"])
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def handler(event: dict, _context: object) -> dict:
    method = event.get("requestContext", {}).get("http", {}).get("method")
    if method == "OPTIONS":
        return _response(200, {})

    # 認証はAPI Gateway側のCognito JWT Authorizerで完結済み(未認証はここに到達しない)。
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "invalid request body"})

    # 疎通・キー確認用(Rekognitionを呼ばないのでコストゼロ。エンジン選択時の検証に使う)。
    if body.get("ping"):
        return _response(200, {"ok": True})

    try:
        image_b64 = body["image"]
        width = float(body["width"])
        height = float(body["height"])
    except (KeyError, ValueError, TypeError):
        return _response(400, {"error": "invalid request body"})

    try:
        image_bytes = base64.b64decode(image_b64)
    except (ValueError, TypeError):
        return _response(400, {"error": "invalid base64 image"})

    try:
        result = rekognition.detect_text(Image={"Bytes": image_bytes})
    except Exception as err:  # noqa: BLE001 - フロントに理由を伝える
        return _response(502, {"error": f"rekognition failed: {err}"})

    words = [d for d in result.get("TextDetections", []) if d.get("Type") == "WORD"]

    letters = []
    digits = []
    for w in words:
        text = re.sub(r"[^A-Za-z0-9]", "", w.get("DetectedText", "")).upper()
        box = _box_px(w["Geometry"]["BoundingBox"], width, height)
        item = {"text": text, "confidence": w.get("Confidence", 0.0), "box": box, "center": _center(box)}
        if LETTER_RE.match(text):
            letters.append(item)
        elif DIGITS_RE.match(text):
            digits.append(item)

    # 近接ペアリング(距離昇順の貪欲マッチ。1letter/1digitは1回だけ使う)。
    pairs = []
    for d in digits:
        for l in letters:
            dist = ((d["center"][0] - l["center"][0]) ** 2 + (d["center"][1] - l["center"][1]) ** 2) ** 0.5
            radius = max(d["box"]["h"], l["box"]["h"]) * PAIR_RADIUS_FACTOR
            if dist <= radius:
                pairs.append((dist, l, d))
    pairs.sort(key=lambda p: p[0])

    used_letters = set()
    used_digits = set()
    candidates = []
    for _, l, d in pairs:
        lid, did = id(l), id(d)
        if lid in used_letters or did in used_digits:
            continue
        used_letters.add(lid)
        used_digits.add(did)
        candidates.append(
            {
                "letter": l["text"],
                "digits": d["text"],
                "confidence": min(l["confidence"], d["confidence"]) / 100.0,
                "cardBox": _union(l["box"], d["box"]),
            }
        )

    # ペア相手が見つからない数字検出 = letter不明として低信頼扱い(再撮影促しの根拠)。
    low_confidence = [
        {
            "letter": "?",
            "digits": d["text"],
            "confidence": d["confidence"] / 100.0,
            "cardBox": d["box"],
        }
        for d in digits
        if id(d) not in used_digits
    ]

    return _response(
        200,
        {
            "candidates": candidates,
            "lowConfidence": low_confidence,
            "cardCount": len(letters),
        },
    )
