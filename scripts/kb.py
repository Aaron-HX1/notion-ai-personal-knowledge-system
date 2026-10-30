#!/usr/bin/env python3
"""Local client for the Personal Knowledge System API. Reads API_TOKEN from .env."""
import argparse
import json
import mimetypes
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def settings():
    env_file = ROOT / '.env'
    if not env_file.exists():
        raise RuntimeError('缺少项目根目录的 .env')
    values = {}
    for line in env_file.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    token = values.get('API_TOKEN', '')
    if not token or 'replace' in token.lower():
        raise RuntimeError('.env 中尚未设置有效的 API_TOKEN')
    return 'http://127.0.0.1:' + values.get('PORT', '3000'), token


def request(method, path, payload=None, file_path=None, signed_url=False):
    base, token = settings()
    headers = {} if signed_url else {'Authorization': 'Bearer ' + token}
    data = None
    if file_path:
        source = Path(file_path).expanduser()
        if not source.is_file():
            raise RuntimeError('文件不存在：' + str(source))
        boundary = '----KnowledgeBot' + uuid.uuid4().hex
        content_type = mimetypes.guess_type(source.name)[0] or 'application/octet-stream'
        data = (('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + source.name.replace('"', '_') + '"\r\nContent-Type: ' + content_type + '\r\n\r\n').encode() + source.read_bytes() + ('\r\n--' + boundary + '--\r\n').encode())
        headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
    elif payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    url = path if signed_url else base + path
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        message = exc.read().decode('utf-8', errors='replace')[:800]
        raise RuntimeError('HTTP ' + str(exc.code) + '：' + message) from None
    except urllib.error.URLError as exc:
        raise RuntimeError('连接失败。请先运行 ./run-local.command 并保持该终端打开。') from exc


def api(method, path, payload=None, file_path=None):
    return json.loads(request(method, path, payload, file_path).decode('utf-8'))


def display(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def wait_job(job_id, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = api('GET', '/api/jobs/' + job_id)
        if result['status'] in ('done', 'failed'):
            display({key: result.get(key) for key in ('id', 'status', 'result', 'error', 'retries')})
            return 0 if result['status'] == 'done' else 1
        time.sleep(2)
    print('任务仍在处理，可稍后运行：python3 scripts/kb.py job ' + job_id)
    return 2


def notion_id(value):
    match = re.search(r'([0-9a-fA-F]{32})(?:[/?#]|$)', value)
    if match:
        return str(uuid.UUID(match.group(1)))
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise RuntimeError('请输入专题页面的 Notion URL 或 UUID') from exc


def main():
    parser = argparse.ArgumentParser(description='本地 Notion 知识库命令行客户端（自动读取 .env 中的 API_TOKEN）')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('health', help='检查本地服务')
    p = sub.add_parser('import-url', help='导入公开网页')
    p.add_argument('url'); p.add_argument('--title'); p.add_argument('--body'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('import-github', help='导入公开 GitHub 仓库 README')
    p.add_argument('url'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('import-text', help='导入 UTF-8 文本文件')
    p.add_argument('title'); p.add_argument('path'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('import-file', help='导入 PDF/DOCX/图片/TXT/Markdown 文件')
    p.add_argument('path'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('import-batch', help='从 JSON 文件批量导入')
    p.add_argument('path'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('import-zip', help='导入本系统生成的 ZIP')
    p.add_argument('path'); p.add_argument('--duplicate', choices=['skip', 'merge', 'copy'], default='skip')
    p = sub.add_parser('job', help='查询任务')
    p.add_argument('id')
    p = sub.add_parser('ask', help='向知识库提问')
    p.add_argument('question')
    p = sub.add_parser('summarize', help='综合总结专题')
    p.add_argument('collection'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('export', help='导出专题 ZIP')
    p.add_argument('collection'); p.add_argument('--no-wait', action='store_true')
    p = sub.add_parser('download', help='下载已完成的导出任务')
    p.add_argument('job_id'); p.add_argument('output')
    sub.add_parser('sync', help='立即从 Notion 重建本地索引')
    args = parser.parse_args()
    try:
        if args.command == 'health':
            display(api('GET', '/health')); return 0
        if args.command == 'job':
            display(api('GET', '/api/jobs/' + args.id)); return 0
        if args.command == 'ask':
            display(api('POST', '/api/ask', {'question': args.question})); return 0
        if args.command == 'sync':
            display(api('POST', '/api/index/rebuild')); return 0
        if args.command == 'download':
            result = api('GET', '/api/export/' + args.job_id + '/download')
            target = Path(args.output).expanduser()
            content = request('GET', result['url'], signed_url=True)
            with target.open('xb') as stream:
                stream.write(content)
            print('已保存：' + str(target)); return 0
        if args.command == 'import-zip':
            path = '/api/import/archive?duplicate=' + args.duplicate
            display(api('POST', path, file_path=args.path)); return 0
        if args.command == 'import-url':
            payload = {'url': args.url}
            if args.title: payload['title'] = args.title
            if args.body: payload['body'] = args.body
            result = api('POST', '/api/import/url', payload)
        elif args.command == 'import-github':
            result = api('POST', '/api/import/github', {'url': args.url})
        elif args.command == 'import-text':
            body = Path(args.path).expanduser().read_text(encoding='utf-8')
            result = api('POST', '/api/import/text', {'title': args.title, 'body': body})
        elif args.command == 'import-file':
            result = api('POST', '/api/import/file', file_path=args.path)
        elif args.command == 'import-batch':
            payload = json.loads(Path(args.path).expanduser().read_text(encoding='utf-8'))
            result = api('POST', '/api/import/batch', payload)
        elif args.command == 'summarize':
            result = api('POST', '/api/collections/' + notion_id(args.collection) + '/summarize')
        elif args.command == 'export':
            result = api('POST', '/api/export/collection', {'id': notion_id(args.collection)})
        else:
            return 2
        display(result)
        if not args.no_wait:
            ids = result.get('job_ids', [result.get('job_id')])
            return max(wait_job(job_id) for job_id in ids if job_id)
        return 0
    except (RuntimeError, OSError, ValueError, json.JSONDecodeError) as exc:
        print('错误：' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
