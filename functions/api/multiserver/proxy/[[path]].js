export async function onRequest(context) {
  const { request, params } = context;
  const path = params.path ? params.path.join('/') : '';
  const url = new URL(request.url);
  const targetUrl = `https://yumestream.pages.dev/api/${path}${url.search}`;
  
  const headers = new Headers(request.headers);
  headers.delete('Origin');
  headers.delete('Referer');
  
  try {
    let response;
    try {
      response = await fetch(targetUrl, {
        method: request.method,
        headers: headers
      });
    } catch {
      // Fallback to legacy multiserver domain
      response = await fetch(`https://multiserver.pages.dev/api/${path}${url.search}`, {
        method: request.method,
        headers: headers
      });
    }
    
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return newResponse;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
