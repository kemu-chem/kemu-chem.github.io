#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ローカルHTTPサーバー起動スクリプト
bib2ref.htmlをブラウザで開くためのシンプルなHTTPサーバー
"""

import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

PORT = 8000
HTML_FILE = "index.html"

def start_server():
    # カレントディレクトリをスクリプトの場所に変更
    script_dir = Path(__file__).parent
    os.chdir(script_dir)

    # HTTPサーバーの設定
    Handler = http.server.SimpleHTTPRequestHandler

    print("=" * 60)
    print("ローカルHTTPサーバーを起動しています...")
    print("=" * 60)
    print(f"\nサーバーURL: http://localhost:{PORT}/")
    print(f"HTMLファイル: http://localhost:{PORT}/{HTML_FILE}")
    print("\nサーバーを停止するには Ctrl+C を押してください")
    print("=" * 60)

    # ブラウザを自動で開く（オプション）
    try:
        webbrowser.open(f"http://localhost:{PORT}/{HTML_FILE}")
        print("\nブラウザを開きました")
    except:
        print("\nブラウザを手動で開いてください")

    # サーバー起動
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nサーバーを停止しています...")
            print("停止しました。")

if __name__ == "__main__":
    start_server()
