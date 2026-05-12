#!/usr/bin/env python3
"""
Faz upload do AAB para o Google Play e publica no internal testing track.
Uso: python3 scripts/upload_to_play.py <caminho_do_aab>
"""
import sys
import os

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PACKAGE_NAME = "com.trokvibe.app"
TRACK = "internal"
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "..", "secrets", "play-service-account.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

def upload(aab_path: str):
    if not os.path.exists(aab_path):
        print(f"❌ AAB não encontrado: {aab_path}")
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    service = build("androidpublisher", "v3", credentials=credentials)

    # 1. Criar edit
    edit = service.edits().insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"📝 Edit criado: {edit_id}")

    # 2. Upload do AAB
    media = MediaFileUpload(aab_path, mimetype="application/octet-stream", resumable=True)
    bundle = service.edits().bundles().upload(
        packageName=PACKAGE_NAME,
        editId=edit_id,
        media_body=media
    ).execute()
    version_code = bundle["versionCode"]
    print(f"📦 AAB enviado — versionCode: {version_code}")

    # 3. Atribuir ao track internal
    service.edits().tracks().update(
        packageName=PACKAGE_NAME,
        editId=edit_id,
        track=TRACK,
        body={
            "releases": [{
                "versionCodes": [version_code],
                "status": "completed"
            }]
        }
    ).execute()
    print(f"🎯 Track '{TRACK}' atualizado")

    # 4. Commit
    service.edits().commit(packageName=PACKAGE_NAME, editId=edit_id).execute()
    print(f"✅ Publicado no internal testing! versionCode {version_code}")

if __name__ == "__main__":
    aab = sys.argv[1] if len(sys.argv) > 1 else "android/app/build/outputs/bundle/release/app-release.aab"
    upload(os.path.abspath(aab))
