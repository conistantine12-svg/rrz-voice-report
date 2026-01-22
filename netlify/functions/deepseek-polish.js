/**
 * Netlify Function: DeepSeek polish proxy
 * - Keeps DEEPSEEK_API_KEY on the server (Netlify env vars)
 * - Expects POST JSON: { text, patient?, template? }
 * - Returns JSON: { findings, impression }
 */
exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const text = (body.text || "").toString().trim();
    const patient = body.patient || {};
    const template = (body.template || "").toString();

    if (!text) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing text" })
      };
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Server missing DEEPSEEK_API_KEY" })
      };
    }

    const system = "You are a radiology report editor. Return ONLY valid JSON with keys: findings, impression. Keep the same language as the input.";
    const user = [
      "Rewrite and polish this dictated dental radiology report text.",
      "- Keep the medical meaning.",
      "- Fix grammar, spelling, and structure.",
      "- If the text is short/fragmented, complete it into a professional report.",
      "- Output JSON ONLY in this schema:",
      '{ "findings": "...", "impression": "..." }',
      "",
      `Template: ${template || "N/A"}`,
      `Patient: ${patient.name || ""} | ID: ${patient.id || ""} | Date: ${patient.date || ""}`,
      "",
      "Raw text:",
      text
    ].join("\n");

    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "DeepSeek error", details: errText })
      };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { findings: content || text, impression: "" };
    }

    const out = {
      findings: (parsed.findings || parsed.FINDINGS || "").toString().trim(),
      impression: (parsed.impression || parsed.IMPRESSION || "").toString().trim()
    };
    if (!out.findings) out.findings = text;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(out)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server exception", details: String(e) })
    };
  }
};
