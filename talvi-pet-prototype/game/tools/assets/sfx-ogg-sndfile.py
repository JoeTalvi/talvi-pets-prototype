"""WORK-026-2 OGG route B: encode a 16-bit mono WAV to Ogg Vorbis with the installed libsndfile.

Same ctypes form as working/TASK-022/prepare-assets.py (the sfx/place route).
Usage: python3 -I tools/assets/sfx-ogg-sndfile.py <in.wav> <out.ogg>
"""
import ctypes
import struct
import sys
import wave


class SFInfo(ctypes.Structure):
    _fields_ = [('frames', ctypes.c_longlong), ('samplerate', ctypes.c_int), ('channels', ctypes.c_int),
                ('format', ctypes.c_int), ('sections', ctypes.c_int), ('seekable', ctypes.c_int)]


def main(src, dst):
    with wave.open(src, 'rb') as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit('expected 16-bit mono WAV: ' + src)
        rate, frames = w.getframerate(), w.readframes(w.getnframes())
    samples = struct.unpack('<' + 'h' * (len(frames) // 2), frames)
    lib = ctypes.CDLL('/opt/homebrew/lib/libsndfile.1.dylib')
    lib.sf_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(SFInfo)]
    lib.sf_open.restype = ctypes.c_void_p
    lib.sf_write_short.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_short), ctypes.c_longlong]
    lib.sf_write_short.restype = ctypes.c_longlong
    lib.sf_close.argtypes = [ctypes.c_void_p]
    info = SFInfo(0, rate, 1, 0x200000 | 0x0060, 0, 0)  # SF_FORMAT_OGG | SF_FORMAT_VORBIS
    handle = lib.sf_open(dst.encode(), 0x20, ctypes.byref(info))  # SFM_WRITE
    if not handle:
        raise SystemExit('sf_open failed for ' + dst)
    written = lib.sf_write_short(handle, (ctypes.c_short * len(samples))(*samples), len(samples))
    if lib.sf_close(handle) != 0 or written != len(samples):
        raise SystemExit('libsndfile write failed for ' + dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
