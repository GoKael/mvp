const http = require('http');
const fs = require('fs');

let accumulated = "";

const server = http.createServer((req, res) => {
    // Add CORS headers so browser fetch works
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            console.log(`[RECEIVER] Received POST payload of length: ${body.length}`);
            // Check if it's the final signal
            if (body === 'DONE') {
                fs.writeFileSync('/Users/kaelwang/.gemini/antigravity/playground/cobalt-curiosity/mvp/server/data/lr_8000.json', accumulated);
                console.log('[RECEIVER] Successfully saved to lr_8000.json');
                res.end('OK');
                process.exit(0);
            } else {
                accumulated += body;
                res.end('ACK');
            }
        });
    } else {
        res.end('Ready to receive json payload');
    }
});

server.listen(9999, '0.0.0.0', () => {
    console.log('[RECEIVER] Listening on http://localhost:9999. Waiting for chunks...');
});
