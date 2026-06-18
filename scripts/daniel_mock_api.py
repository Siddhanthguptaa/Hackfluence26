import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import re
import time
import random

sample_data = [
    {
        "labels": ["UBC", "teen", "golf", "female"],
        "data": {
            "text": "this girl is clearly an avid golf player who regularly goes to <Golf Course Name> on saturdays. They seem to attend UBC."
        }
    },
    {
        "labels": ["UAB", "teen", "skiing", "male", "food", "travel"],
        "data": {
            "text": "this person likes to travel a lot on vacations, especially to ski resorts. They also seem to enjoy trying out different foods and food photography."
        }
    }
]

class SimpleHandler(BaseHTTPRequestHandler):
    """
    Mock service exposing two GET endpoints:
      1. /profile-instagram-user/<username>
         Returns mock classification labels + explanatory text (existing behavior).
      2. /enrich-profile/<username>
         Returns a simplified enrichment payload: { "username": str, "raw_text": str }
         (No caching, auth, or rate limiting; matches Phase 2 spec constraints).

    Run with: python scripts/daniel_mock_api.py
    """

    enrichment_samples = [
        "Active university student, interested in startups and productivity workflows.",
        "Outdoor enthusiast; frequent posts about hiking, skiing, and mountain photography.",
        "Food lover experimenting with fusion recipes; occasional travel diaries.",
        "Aspiring content creator focused on tech gadgets and workflow optimization.",
        "Golfer on weekends, studies engineering, shares campus club activities.",
    ]

    def _json(self, status: int, payload: dict):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_GET(self):
        # Endpoint 1: legacy classifier-style labels
        match_classifier = re.match(r'^/profile-instagram-user/([^/]+)$', self.path)

        # Endpoint 2: simple enrichment
        match_enrich = re.match(r'^/enrich-profile/([^/]+)$', self.path)

        if match_classifier:
            username = match_classifier.group(1)
            time.sleep(random.uniform(1.5, 2.5))  # Simulate latency
            result = random.choice(sample_data)
            # Preserve original shape; optionally include username for clarity
            result_with_username = {**result, "username": username}
            self._json(200, result_with_username)
            return

        if match_enrich:
            username = match_enrich.group(1)
            # Slightly shorter delay for enrichment to simulate different service profile
            time.sleep(random.uniform(0.4, 0.9))
            raw_text = random.choice(self.enrichment_samples)
            self._json(200, {
                "username": username,
                "raw_text": raw_text
            })
            return

        # Not found
        self._json(404, {"error": "Not Found"})

def run(server_class=HTTPServer, handler_class=SimpleHandler, port=13732):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f'Serving on port {port}...')
    httpd.serve_forever()

if __name__ == '__main__':
    run()