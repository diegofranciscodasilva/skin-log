"""API Flask do SkinLog: recebe duas fotos, mede e responde. Nada é armazenado."""
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

import analysis

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024    # as duas fotos somam até 12 MB
CORS(app)  # em produção, restrinja: CORS(app, origins=["https://seu-dominio.com.br"])


@app.errorhandler(analysis.AnalysisError)
def analysis_error(error):
    return jsonify({"error": str(error)}), 400


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "As imagens passam do limite de 12 MB."}), 413


@app.errorhandler(Exception)
def unexpected(error):
    if isinstance(error, HTTPException):
        return jsonify({"error": error.description}), error.code
    app.logger.exception("Erro inesperado")          # detalhes só no log do servidor
    return jsonify({"error": "Erro interno ao analisar as imagens."}), 500


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/compare")
def compare():
    before, after = request.files.get("before"), request.files.get("after")
    if not before or not after:
        raise analysis.AnalysisError("Envie as duas fotos (before e after).")
    # As imagens ficam só em memória e são descartadas ao fim da requisição
    return jsonify(analysis.compare(analysis.load(before), analysis.load(after)))


if __name__ == "__main__":
    app.run(debug=False, port=5000)
    