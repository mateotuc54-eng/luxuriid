export default async function handler(request) {
  // Autoriser uniquement les requêtes POST
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Méthode non autorisée."
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // Récupérer la clé API depuis les variables d'environnement
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "La clé OPENAI_API_KEY n'est pas configurée."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  try {
    const body = await request.json();

    const {
      company,
      sector,
      style,
      color,
      target,
      values,
      goal,
      description
    } = body;

    if (!company || !sector) {
      return new Response(
        JSON.stringify({
          error: "Le nom de l'entreprise et le secteur sont obligatoires."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const brandBrief = `
Nom de l'entreprise : ${company}

Secteur : ${sector}

Style recherché : ${style || "Non précisé"}

Couleur principale : ${color || "Non précisée"}

Clientèle cible : ${target || "Non précisée"}

Valeurs : ${values || "Non précisées"}

Objectif : ${goal || "Non précisé"}

Description : ${description || "Non précisée"}
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: `
Tu es le directeur artistique de LUXURIID,
une plateforme professionnelle de création d'identités visuelles par IA.

À partir du brief du client, crée exactement 3 concepts
d'identité visuelle très différents.

Concept 1 :
Premium, élégant, intemporel et haut de gamme.

Concept 2 :
Moderne, minimaliste, digital et contemporain.

Concept 3 :
Audacieux, créatif, reconnaissable et impactant.

Pour chaque concept, donne :

- un nom
- un positionnement
- une personnalité
- une description visuelle
- une idée de logo
- une idée de monogramme
- les typographies
- un slogan
- une palette de couleurs avec les codes HEX
- un prompt détaillé pour générer le logo
- un prompt détaillé pour générer l'univers visuel

Adapte tout au secteur, à la clientèle,
aux valeurs, au style et aux couleurs du client.

Retourne UNIQUEMENT un JSON valide avec exactement cette structure :

{
  "brand": {
    "name": "",
    "positioning": "",
    "personality": "",
    "target": ""
  },
  "concepts": [
    {
      "id": 1,
      "name": "",
      "positioning": "",
      "personality": "",
      "description": "",
      "logoIdea": "",
      "monogram": "",
      "fonts": "",
      "slogan": "",
      "palette": [
        {
          "name": "",
          "hex": ""
        }
      ],
      "logoPrompt": "",
      "visualPrompt": ""
    },
    {
      "id": 2,
      "name": "",
      "positioning": "",
      "personality": "",
      "description": "",
      "logoIdea": "",
      "monogram": "",
      "fonts": "",
      "slogan": "",
      "palette": [
        {
          "name": "",
          "hex": ""
        }
      ],
      "logoPrompt": "",
      "visualPrompt": ""
    },
    {
      "id": 3,
      "name": "",
      "positioning": "",
      "personality": "",
      "description": "",
      "logoIdea": "",
      "monogram": "",
      "fonts": "",
      "slogan": "",
      "palette": [
        {
          "name": "",
          "hex": ""
        }
      ],
      "logoPrompt": "",
      "visualPrompt": ""
    }
  ]
}
`
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: brandBrief
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error("OpenAI error:", errorText);

      return new Response(
        JSON.stringify({
          error: "Erreur lors de la génération IA."
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const data = await response.json();

    const outputText = data.output_text || "";

    if (!outputText) {
      return new Response(
        JSON.stringify({
          error: "L'IA n'a retourné aucun résultat."
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const cleanJSON = outputText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleanJSON);
    } catch (error) {
      console.error("JSON invalide:", error);

      return new Response(
        JSON.stringify({
          error: "La réponse de l'IA n'est pas un JSON valide."
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: result
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Erreur serveur:", error);

    return new Response(
      JSON.stringify({
        error: "Erreur interne du serveur."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
