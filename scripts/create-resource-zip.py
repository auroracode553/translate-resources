"""按清单压缩资源，ZIP 内保存原目录结构；不改写模型或词库内容。"""
import json
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1]).resolve()
files = json.load(sys.stdin)
with zipfile.ZipFile(sys.argv[2], 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
    for index, item in enumerate(files):
        source = (root / item['path']).resolve()
        if not source.is_relative_to(root) or source.stat().st_size != item['size']:
            raise ValueError('资源路径或大小不符')
        if len(files) <= 30 or index % 200 == 0:
            print(f"压缩 {index + 1}/{len(files)}：{item['path']}", flush=True)
        archive.write(source, item['path'])
