import sys, os, json, base64, tempfile, urllib.request
import numpy as np
import cv2
from insightface.app import FaceAnalysis

ACCOUNT='adeecb44ed0b5f045d01370f5dae595d'
TOKEN='wPYPF6_-IbPFe-tiofdjGJFLKLS2eGGhgDv-kKsT'
DB='7b473bde-bdc7-4481-bcf4-5d4f216749ea'
BASE='https://vls-system.vercel.app'

def d1(sql, params=None):
    body={'sql':sql}
    if params: body['params']=params
    req=urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization':f'Bearer {TOKEN}','Content-Type':'application/json'},
        method='POST')
    return json.loads(urllib.request.urlopen(req, timeout=60).read())['result'][0]['results']

def cos(a,b):
    a=np.asarray(a); b=np.asarray(b)
    return float(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)))

def main():
    event_id = sys.argv[1]
    threshold = float(sys.argv[2])
    limit = int(sys.argv[3])
    query_path = sys.argv[4]
    image_base64 = open(query_path, 'r', encoding='utf-8').read().strip()
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(';base64,', 1)[1]
    img_bytes = base64.b64decode(image_base64)
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(img_bytes)
        query_path = f.name
    try:
        app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        app.prepare(ctx_id=-1, det_size=(640,640))
        query = cv2.imread(query_path)
        qfaces = app.get(query)
        if not qfaces:
            print(json.dumps({'matchCount': 0, 'results': [], 'error': 'No face detected in query'}))
            return
        q = qfaces[0].embedding
        rows = d1("SELECT photo_id, embedding, bbox, id FROM face_embeddings WHERE event_id = ?", [event_id])
        scored = []
        for r in rows:
            try:
                emb = json.loads(r['embedding'])
                sim = cos(q, emb)
                if sim >= threshold:
                    scored.append({
                        'photoId': r['photo_id'],
                        'faceId': r['id'],
                        'similarity': round(sim, 4),
                        'bbox': json.loads(r['bbox']) if r.get('bbox') else None,
                    })
            except Exception:
                pass
        scored.sort(key=lambda x: x['similarity'], reverse=True)
        dedup=[]; seen=set()
        for r in scored:
            if r['photoId'] in seen:
                continue
            seen.add(r['photoId'])
            dedup.append(r)
            if len(dedup) >= limit:
                break
        print(json.dumps({
            'matchCount': len(dedup),
            'results': dedup,
            'provider': 'insightface-poc',
            'threshold': threshold,
        }))
    finally:
        try: os.unlink(query_path)
        except Exception: pass

if __name__ == '__main__':
    main()
