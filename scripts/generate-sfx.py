"""Synthesizes the sound effects into public/sfx/ (stdlib only).

Run: python3 scripts/generate-sfx.py
"""

import math
import os
import random
import struct
import wave

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sfx")
random.seed(7)


def write(name, left, right=None):
    right = right if right is not None else left
    peak = max(1e-9, max(abs(s) for s in left + right))
    gain = 0.9 / peak
    with wave.open(os.path.join(OUT, name), "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(
            struct.pack("<hh", int(l * gain * 32767), int(r * gain * 32767))
            for l, r in zip(left, right)
        )
        w.writeframes(frames)


def env(i, n, attack=0.005, curve=4.0):
    t = i / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    return a * (1 - i / n) ** curve


def sweep(f0, f1, dur, curve=4.0, harmonics=(1.0,)):
    n = int(dur * RATE)
    out, phase = [], 0.0
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / n)
        phase += 2 * math.pi * f / RATE
        s = sum(a * math.sin(phase * (k + 1)) for k, a in enumerate(harmonics))
        out.append(s * env(i, n, curve=curve))
    return out


def bell(freq, dur, curve=3.0):
    n = int(dur * RATE)
    partials = [(1.0, 1.0), (2.0, 0.4), (3.01, 0.2), (4.2, 0.1)]
    return [
        sum(a * math.sin(2 * math.pi * freq * m * i / RATE) for m, a in partials)
        * env(i, n, attack=0.002, curve=curve)
        for i in range(n)
    ]


def pluck(freq, dur):
    # Karplus-Strong plucked string
    n = int(dur * RATE)
    period = int(RATE / freq)
    buf = [random.uniform(-1, 1) for _ in range(period)]
    out = []
    for i in range(n):
        s = buf[i % period]
        nxt = buf[(i + 1) % period]
        buf[i % period] = 0.996 * 0.5 * (s + nxt)
        out.append(s * (1 - i / n) ** 0.5)
    return out


def mix(*tracks):
    n = max(len(t) for t, _ in tracks)
    out = [0.0] * n
    for t, offset in tracks:
        for i, s in enumerate(t):
            if offset + i < n:
                out[offset + i] += s
    return out


def pad(track, total):
    return track + [0.0] * (total - len(track))


def swoosh(dur, f_start, f_end, pan_from, pan_to):
    # Band-passed noise with a moving centre frequency and pan
    n = int(dur * RATE)
    left, right = [], []
    y1 = y2 = 0.0
    for i in range(n):
        p = i / n
        f = f_start * (f_end / f_start) ** p
        r = 0.97
        c = 2 * r * math.cos(2 * math.pi * f / RATE)
        x = random.uniform(-1, 1)
        y = x * (1 - r) + c * y1 - r * r * y2
        y2, y1 = y1, y
        e = math.sin(math.pi * p) ** 2
        pan = pan_from + (pan_to - pan_from) * p
        left.append(y * e * math.cos(pan * math.pi / 2))
        right.append(y * e * math.sin(pan * math.pi / 2))
    return left, right


def note_freq(semitones_from_c4):
    return 261.63 * 2 ** (semitones_from_c4 / 12)


PENTATONIC = [0, 2, 4, 7, 9]


def pentatonic(step):
    return note_freq(12 * (step // 5) + PENTATONIC[step % 5])


def main():
    os.makedirs(OUT, exist_ok=True)

    # Split: noise whoosh that spreads from centre out to both sides
    l1, r1 = swoosh(0.35, 3000, 600, 0.5, 0.0)
    l2, r2 = swoosh(0.35, 3000, 600, 0.5, 1.0)
    zap = sweep(900, 300, 0.25, curve=3, harmonics=(1.0, 0.3))
    write("split.wav", mix((l1, 0), (l2, 0), (zap, 0)), mix((r1, 0), (r2, 0), (zap, 0)))

    # Recursive call: soft tick
    write("tick.wav", sweep(2200, 1800, 0.04, curve=6))

    # Base case: bubble pop
    write("pop.wav", sweep(350, 1100, 0.09, curve=2))

    # Copying halves into temp arrays: falling "drop", L slightly higher than R
    write("drop-left.wav", sweep(900, 320, 0.16, curve=2.5, harmonics=(1.0, 0.25)))
    write("drop-right.wav", sweep(760, 260, 0.16, curve=2.5, harmonics=(1.0, 0.25)))

    # Compare: two quick wood-block blips
    blip = sweep(1300, 1250, 0.05, curve=5, harmonics=(1.0, 0.5))
    write("compare.wav", mix((blip, 0), ([s * 0.8 for s in blip], int(0.07 * RATE))))

    # Placing an element: plucked note, pitch by rank
    for step in range(16):
        write(f"note-{step}.wav", pluck(pentatonic(step), 0.6))

    # Subarray merged: rising bell arpeggio
    write(
        "merged.wav",
        mix(
            (bell(note_freq(12), 0.6), 0),
            (bell(note_freq(16), 0.6), int(0.07 * RATE)),
            (bell(note_freq(19), 0.8), int(0.14 * RATE)),
        ),
    )

    # Final: bigger arpeggio + chord
    seq = [0, 4, 7, 12, 16, 19, 24]
    tracks = [(bell(note_freq(s), 1.2, curve=2.5), int(k * 0.08 * RATE)) for k, s in enumerate(seq)]
    tracks.append((pad(bell(note_freq(0), 2.0, curve=2), int(2.6 * RATE)), int(0.6 * RATE)))
    tracks.append((bell(note_freq(12), 2.0, curve=2), int(0.6 * RATE)))
    write("final.wav", mix(*tracks))


if __name__ == "__main__":
    main()
