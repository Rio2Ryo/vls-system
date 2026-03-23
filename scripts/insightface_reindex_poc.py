import sys, json, urllib.request, os, tempfile
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

def d1_exec(sql, params=None):
    return d1(sql, params)

def main():
    event_id = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    events = json.loads(d1("SELECT value FROM kv_store WHERE key='vls_admin_events'")[0]['value'])
    ev = next(e for e in events if e['id'] == event_id)
    photos = ev['photos'][:limit]

    app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=-1, det_size=(640,640))

    indexed_photos = 0
    indexed_faces = 0
    for p in photos:
        photo_id = p['id']
        url = p.get('originalUrl') or p.get('thumbnailUrl') or p.get('url')
        if not url:
            continue
        if not url.startswith('http'):
            url = BASE + url
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                f.write(data)
                tmp = f.name
            img = cv2.imread(tmp)
            faces = app.get(img)
            os.unlink(tmp)
            face_count = 0
            for i, face in enumerate(faces):
                emb = face.embedding.tolist()
                bbox = [int(x) for x in face.bbox.tolist()]
                d1_exec(
                    "INSERT OR REPLACE INTO face_embeddings (id, event_id, photo_id, face_index, embedding, bbox, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        f"{photo_id}_if_{i}",
                        event_id,
                        photo_id,
                        i,
                        json.dumps(emb),
                        json.dumps({"x": bbox[0], "y": bbox[1], "width": bbox[2]-bbox[0], "height": bbox[3]-bbox[1]}),
                        'insightface-poc',
                        0,
                    ]
                )
                face_count += 1
                indexed_faces += 1
            if face_count > 0:
                indexed_photos += 1
            print(f"{photo_id}: {face_count} faces")
        except Exception as e:
            print(f"{photo_id}: ERROR {e}")
    print(json.dumps({'indexedPhotos': indexed_photos, 'indexedFaces': indexed_faces}))

if __name__ == '__main__':
    main()
