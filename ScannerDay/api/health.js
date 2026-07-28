module.exports = async function handler(request, response) {
  response.status(200).json({
    service: "ScannerDay API",
    status: "online",
    timestamp: new Date().toISOString(),
    integrations: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      apiFootball: Boolean(process.env.API_FOOTBALL_KEY)
    }
  });
};

