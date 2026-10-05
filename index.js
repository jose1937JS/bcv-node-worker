export default {
  // 1. Ejecución automática mediante Cron Trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateExchangeRate(env));
  },

  // 2. Ejecución manual vía endpoint HTTP (GET/POST /sync)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/sync") {
      try {
        const rate = await updateExchangeRate(env);
        return new Response(
          JSON.stringify({ success: true, updated_rate: rate }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response("Worker activo. Usa /sync para forzar la actualización.", {
      status: 200,
    });
  },
};

/**
 * Consulta la tasa externa y actualiza Cloudflare D1
 */
async function updateExchangeRate(env) {
  const apiUrl = env?.RATES_API_URL || "https://rates-backend.vercel.app/rates/BCV_USD/";

  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "Cloudflare-Worker" },
  });

  if (!response.ok) {
    throw new Error(`Error al consultar el endpoint externo: ${response.statusText}`);
  }

  const data = await response.json();

  // Ajusta la propiedad según el JSON que retorne tu endpoint (ej: data.rate, data.promedio, etc.)
  const newRate = Number(data.rate);

  if (isNaN(newRate)) {
    throw new Error("El valor obtenido de la tasa no es un número válido");
  }

  console.log(newRate)

  // Actualización en Cloudflare D1
  // Si tu tabla tiene múltiples filas, agrega un WHERE (ej: WHERE id = 1)
  const query = `
    UPDATE store_settings 
    SET exchange_rate_ves = ?
    WHERE id = '1'
  `;

  const result = await env.DB.prepare(query)
    .bind(newRate)
    .run();

  if (!result.success) {
    throw new Error("Fallo al escribir en la base de datos D1");
  }

  console.log(`Tasa actualizada a ${newRate} en store_settings`);
  return newRate;
}