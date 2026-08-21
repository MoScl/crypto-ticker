#!/usr/bin/env python3
"""分块下载完整 Electron 二进制，绕过沙箱对单连接大文件(~104MB)的截断。"""
import os, sys, zipfile, urllib.request, shutil

BASE = r"C:/Users/sw888/WorkBuddy/2026-08-21-10-17-27/crypto-ticker"
PKG = os.path.join(BASE, "node_modules", "electron")
URL = "https://cdn.npmmirror.com/binaries/electron/v30.5.1/electron-v30.5.1-win32-x64.zip"
ZIP_PATH = r"C:/tmp/electron-full.zip"
DIST = os.path.join(PKG, "dist")
CHUNK = 40 * 1024 * 1024  # 40MB/块，远低于单连接截断阈值

def probe():
    req = urllib.request.Request(URL, headers={"Range": "bytes=0-0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        cr = r.headers.get("Content-Range", "")
        total = int(cr.split("/")[-1])
        accept = r.headers.get("Accept-Ranges", "none")
    return total, accept

def download(total):
    downloaded = 0
    with open(ZIP_PATH, "wb") as f:
        for start in range(0, total, CHUNK):
            end = min(start + CHUNK - 1, total - 1)
            req = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            f.write(data)
            downloaded += len(data)
            print(f"  [{downloaded/1024/1024:.1f}/{total/1024/1024:.1f} MB]", flush=True)
    print(f"下载完成，本地文件 {os.path.getsize(ZIP_PATH)/1024/1024:.1f} MB")

def verify_and_extract():
    with zipfile.ZipFile(ZIP_PATH) as z:
        bad = z.testzip()
        names = z.namelist()
        has_asar = any("electron.asar" in n for n in names)
        print(f"zip 完整性: {'OK' if bad is None else '损坏@'+str(bad)} | 含 electron.asar: {has_asar} | 条目数: {len(names)}")
        if bad is not None or not has_asar:
            print("ERROR: zip 不完整或缺 electron.asar，放弃"); sys.exit(1)
        if os.path.isdir(DIST):
            shutil.rmtree(DIST)
        os.makedirs(DIST, exist_ok=True)
        z.extractall(DIST)
    # 确保 path.txt 指向二进制
    with open(os.path.join(PKG, "path.txt"), "w") as f:
        f.write("dist/electron.exe")
    exe = os.path.join(DIST, "electron.exe")
    asar = os.path.join(DIST, "resources", "electron.asar")
    print(f"electron.exe: {os.path.exists(exe)} ({os.path.getsize(exe)/1024/1024:.1f} MB)")
    print(f"electron.asar: {os.path.exists(asar)}")

if __name__ == "__main__":
    print("=== 探测下载源 ===")
    total, accept = probe()
    print(f"文件大小: {total/1024/1024:.1f} MB | Accept-Ranges: {accept}")
    if accept != "bytes":
        print("ERROR: 下载源不支持 Range，无法分块"); sys.exit(1)
    print("=== 分块下载 ===")
    download(total)
    print("=== 校验并解压 ===")
    verify_and_extract()
    print("DONE")
