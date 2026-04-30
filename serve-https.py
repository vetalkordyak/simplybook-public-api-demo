import ssl, http.server, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('localhost.pem', 'localhost-key.pem')

httpd = http.server.HTTPServer(('', 8443), http.server.SimpleHTTPRequestHandler)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print('Serving at https://localhost:8443')
httpd.serve_forever()
