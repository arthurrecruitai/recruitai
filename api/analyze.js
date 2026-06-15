import { Resend } from 'resend';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { job, cv } = req.body;
  if (!job || !cv) return res.status(400).json({ error: 'Champs manquants : job et cv requis' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Expert RH. Le texte du CV ci-dessous provient d'une extraction PDF automatique : il peut être désordonné (mise en page en colonnes, dates séparées de leur contexte, sections mélangées). Reconstitue mentalement la structure logique du CV avant de l'analyser.

Analyse ce CV par rapport à la fiche de poste. Réponds UNIQUEMENT en JSON sans markdown ni backticks.
FICHE DE POSTE: ${job}
CV (texte brut extrait, potentiellement désordonné): ${cv}
Format JSON exact:
{"name":"Prénom Nom du candidat","email":"email du candidat ou null si absent","title":"Poste actuel ou dernier poste","score":<entier 0-100>,"criteria":[{"name":"Expérience","score":"X/10"},{"name":"Compétences","score":"X/10"},{"name":"Formation","score":"X/10"},{"name":"Adéquation","score":"X/10"}],"summary":"2 phrases sur les points forts et points faibles du candidat.","recommendation":"OUI"|"PEUT-ÊTRE"|"NON"}`
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content.map(i => i.text || '').join('');
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (result.email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'RecruitAI <noreply@recruitai.fr>',
        to: result.email,
        subject: 'Votre candidature a bien été reçue',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a;">Bonjour ${result.name},</h2>
            <p>Nous avons bien reçu votre candidature et elle a été étudiée avec attention.</p>
            <p>Nous reviendrons vers vous prochainement.</p>
            <br/>
            <p style="color: #666; font-size: 13px;">Ce message est envoyé automatiquement via RecruitAI.</p>
          </div>
        `
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
