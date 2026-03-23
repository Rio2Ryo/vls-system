import sys, json, base64, tempfile, os
import cv2
from insightface.app import FaceAnalysis

def main():
    if len(sys.argv) > 1:
        image_base64 = open(sys.argv[1], 'r', encoding='utf-8').read().strip()
    else:
        image_base64 = sys.stdin.read().strip()
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(';base64,', 1)[1]
    data = base64.b64decode(image_base64)
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(data)
        path = f.name
    try:
        app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        app.prepare(ctx_id=-1, det_size=(640,640))
        img = cv2.imread(path)
        faces = app.get(img)
        if not faces:
            print(json.dumps({'ok': False, 'error': 'No face detected'}))
            return
        emb = faces[0].embedding.tolist()
        print(json.dumps({'ok': True, 'embedding': emb}))
    finally:
        try: os.unlink(path)
        except Exception: pass

if __name__ == '__main__':
    main()
