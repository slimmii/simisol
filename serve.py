#!/usr/bin/env python3
"""Start de Simisol notentrainer op http://localhost:8765 (met Range-ondersteuning voor audio)."""
import http.server, os, re, sys, webbrowser

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8765)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_head(self):
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r'bytes=(\d*)-(\d*)', rng)
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        if not m.group(1) and m.group(2):
            start, end = size - int(m.group(2)), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, '_remaining', None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    url = f'http://localhost:{PORT}/'
    print(f'Simisol draait op {url}  (stoppen: Ctrl+C)')
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
