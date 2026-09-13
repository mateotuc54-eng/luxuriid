import http from "http";
import handler from "./API/generate.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Autoriser les requêtes depuis ton site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Requête OPTIONS (CORS)
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Récupérer le corps de la requête
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);

    // Transformer la requête Node en Request standard
    const request = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: body.length > 0 ? body : undefined
    });

    // Appeler ton generate.js
    const response = await handler(request);

    // Renvoyer la réponse
    res.statusCode = response.status;

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await response.arrayBuffer();

    res.end(Buffer.from(responseBody));

  } catch (error) {
    console.error("Erreur serveur :", error);

    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    res.end(
      JSON.stringify({
        error: "Erreur interne du serveur."
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`LUXURIID API démarrée sur le port ${PORT}`);
});
