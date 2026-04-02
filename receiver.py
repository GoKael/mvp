import http.server
import ssl
import json
import base64

class RequestHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        # We expect a payload that's a direct string or JSON 
        # But we will write directly to file
        with open('/Users/kaelwang/.gemini/antigravity/playground/cobalt-curiosity/mvp/server/data/lr_8000.json', 'wb') as f:
            f.write(post_data)
            
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b"OK")
        print("[HTTPS-RECEIVER] Saved lr_8000.json perfectly!")
        
        import os, signal
        os.kill(os.getpid(), signal.SIGTERM)

if __name__ == '__main__':
    # Create self signed cert inline using openssl
    import subprocess
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:4096', '-nodes', 
        '-out', 'cert.pem', '-keyout', 'key.pem', '-days', '365', 
        '-subj', '/CN=localhost'
    ])
    
    server_address = ('0.0.0.0', 9999)
    httpd = http.server.HTTPServer(server_address, RequestHandler)
    httpd.socket = ssl.wrap_socket(httpd.socket, server_side=True, certfile='cert.pem', keyfile='key.pem', ssl_version=ssl.PROTOCOL_TLS)
    print("HTTPS Receiver listening on port 9999...")
    httpd.serve_forever()
