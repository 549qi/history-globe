# -*- coding: utf-8 -*-
"""《我，地图和小女仆》桌面启动器

本地起一台只监听 127.0.0.1 的微型服务器（壳 + data/ 数据包都在本机），
再用系统 WebView2 开一个独立窗口装下整册地图——不是浏览器套壳，
窗外没有地址栏和标签页，窗内就是完整程序。

数据包与程序分离：exe 只负责开窗户，地图数据在旁边的 data/ 里，
以后更新资料只需替换数据文件，不必重下整个程序。
"""
import functools
import http.server
import os
import socket
import sys
import threading

APP_TITLE = '我，地图和小女仆'
ENTRY = 'program.html'


def app_dir():
    """exe 所在目录（开发时则是脚本所在目录）。"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        # 本地数据允许缓存，二次启动更快
        self.send_header('Cache-Control', 'max-age=86400')
        super().end_headers()


def serve(root, port, ready):
    handler = functools.partial(QuietHandler, directory=root)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    httpd.daemon_threads = True
    ready.set()
    httpd.serve_forever()


def main():
    root = app_dir()
    entry = os.path.join(root, ENTRY)
    if not os.path.isfile(entry):
        show_fatal('没有找到程序文件：\n' + entry +
                   '\n\n请确认 data 文件夹与 program.html 和本程序放在一起。')
        return 1
    port = free_port()
    ready = threading.Event()
    t = threading.Thread(target=serve, args=(root, port, ready), daemon=True)
    t.start()
    ready.wait(5)
    url = 'http://127.0.0.1:%d/%s' % (port, ENTRY)
    try:
        import webview
        webview.create_window(APP_TITLE, url, width=1440, height=900,
                              min_size=(960, 600), text_select=False)
        webview.start()
    except Exception as e:
        show_fatal('窗口打开失败：\n' + str(e) +
                   '\n\n本程序需要系统自带的 Edge WebView2 组件'
                   '（Windows 10/11 一般都有）。\n若刚重装系统，请到微软官网搜索'
                   '「WebView2 Runtime」下载安装后再试。')
        return 1
    return 0


def show_fatal(msg):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, APP_TITLE, 0x10)
    except Exception:
        sys.stderr.write(msg + '\n')


if __name__ == '__main__':
    sys.exit(main())
