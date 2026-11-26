from flask import Flask, jsonify
from flask_cors import CORS
from routes.coverage import bp
from routes.search import sbp

app = Flask(__name__)
CORS(app)
app.register_blueprint(bp)
app.register_blueprint(sbp)


@app.route("/api/health")
def health_check():
    return jsonify({"status": "ok", "message": "Health coverage API is running"})


if __name__ == "__main__":
    app.run(debug=True)