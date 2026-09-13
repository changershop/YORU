// Cloudflare Pages Function: /api/sync-manager
// Processes MultiServer sync events from MultiServer Manager into Firestore

const FIRESTORE_PROJECT_ID = "yuro-live";
const FIRESTORE_DATABASE_ID = "(default)";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-sync-key, x-api-key, x-event-id, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: "online",
    service: "YORU MultiServer Webhook Sync Endpoint",
    methodsAllowed: ["POST"],
    timestamp: Date.now()
  }), {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    }
  });
}

export async function onRequestPost({ request, env }: any) {
  try {
    const url = new URL(request.url);
    const providedKey = request.headers.get("x-sync-key") || 
                        request.headers.get("x-api-key") || 
                        url.searchParams.get("key") ||
                        url.searchParams.get("secret");

    const expectedKey = env.SYNC_SECRET_KEY;

    if (!providedKey || !expectedKey || providedKey !== expectedKey) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized: Invalid API sync token",
        diagnostic: {
          xSyncKeyReceived: !!providedKey,
          envSyncSecretKeyConfigured: !!expectedKey,
          tokenMatched: providedKey === expectedKey
        }
      }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    let payload: any = {};
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({
        success: false,
        error: "Malformed JSON payload"
      }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const eventId = payload.eventId || request.headers.get("x-event-id") || `EVT-${Date.now()}`;
    const action = payload.action || payload.event || "update_episode";
    const anilistId = payload.anilistId || payload.id || payload.aniId;
    const episodeNumber = Number(payload.episodeNumber || payload.episode || 1);
    const embedUrl = payload.embedUrl || payload.url || payload.link || `https://yumestream.pages.dev/${anilistId}/${episodeNumber}`;
    const serverName = payload.serverName || "YUME";
    const serverType = payload.serverType || "multi";

    if (!anilistId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required field: anilistId"
      }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const aniIdNum = Number(anilistId);

    // Call AniList API to find or resolve title
    let title = payload.customTitle || payload.title;
    let coverImage = "";
    let totalEpisodes = episodeNumber;
    let idMal: number | null = null;

    try {
      const anilistRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query ($id: Int) {
            Media(id: $id, type: ANIME) {
              id
              idMal
              title { english romaji native }
              episodes
              coverImage { large }
            }
          }`,
          variables: { id: aniIdNum }
        })
      });
      const aniData = await anilistRes.json();
      if (aniData?.data?.Media) {
        const m = aniData.data.Media;
        if (!title) title = m.title.english || m.title.romaji || m.title.native;
        coverImage = m.coverImage?.large || "";
        if (m.episodes) totalEpisodes = m.episodes;
        if (m.idMal) idMal = m.idMal;
      }
    } catch {
      // Fallback
    }

    if (!title) title = `Anime #${aniIdNum}`;

    // Target anime ID format: e.g. "a_185407" or custom
    const animeDocId = `a_${aniIdNum}`;
    const epDocId = `${animeDocId}_s1_${episodeNumber}`;

    // Query or fetch existing episode from Firestore REST
    const epUrl = `${FIRESTORE_BASE_URL}/episodes/${epDocId}`;
    const existingEpRes = await fetch(epUrl);
    let existingServers: any[] = [];
    let isNewAnime = false;

    if (existingEpRes.status === 200) {
      const epData = await existingEpRes.json();
      if (epData?.fields?.servers?.arrayValue?.values) {
        existingServers = epData.fields.servers.arrayValue.values.map((v: any) => {
          const map = v.mapValue?.fields || {};
          return {
            serverName: map.serverName?.stringValue || "",
            serverType: map.serverType?.stringValue || "sub",
            embedLink: map.embedLink?.stringValue || ""
          };
        });
      }
    } else {
      // Create anime doc if not exists
      const animeUrl = `${FIRESTORE_BASE_URL}/anime/${animeDocId}`;
      const existingAnimeRes = await fetch(animeUrl);
      if (existingAnimeRes.status !== 200) {
        isNewAnime = true;
        await fetch(animeUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              id: { stringValue: animeDocId },
              anilistId: { integerValue: String(aniIdNum) },
              title: { stringValue: title },
              titleEnglish: { stringValue: title },
              titleRomaji: { stringValue: title },
              coverImage: { stringValue: coverImage },
              episodes: { integerValue: String(totalEpisodes) },
              seasons: { arrayValue: { values: [{ mapValue: { fields: { seasonId: { stringValue: "s1" }, seasonNumber: { integerValue: "1" }, title: { stringValue: "Season 1" }, episodeCount: { integerValue: String(totalEpisodes) } } } }] } },
              published: { booleanValue: true },
              createdAt: { integerValue: String(Date.now()) },
              updatedAt: { integerValue: String(Date.now()) }
            }
          })
        });
      }

      // Default native servers (HD-1 Sub/Dub and HD-2 Sub/Dub)
      existingServers = [
        { serverName: "HD-1", serverType: "sub", embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${episodeNumber}/sub` },
        { serverName: "HD-1", serverType: "dub", embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${episodeNumber}/dub` }
      ];
      if (idMal) {
        existingServers.push(
          { serverName: "HD-2", serverType: "sub", embedLink: `https://megaplay.buzz/stream/mal/${idMal}/${episodeNumber}/sub` },
          { serverName: "HD-2", serverType: "dub", embedLink: `https://megaplay.buzz/stream/mal/${idMal}/${episodeNumber}/dub` }
        );
      }
    }

    // Merge or delete YUME/MultiServer without touching HD-1, HD-2
    const cleanServers = existingServers.filter((s: any) => {
      const name = (s.serverName || "").toLowerCase();
      const link = (s.embedLink || "").toLowerCase();
      const isMulti = s.serverType === "multi" || name === "yume" || name === "multi" || name === "multiserver" || link.includes("yumestream.pages.dev") || link.includes("multiserver.pages.dev");
      return !isMulti;
    });

    const isDelete = action === "delete_episode" || action === "delete_server";
    const updatedServers = [...cleanServers];

    if (!isDelete) {
      updatedServers.push({
        serverName: serverName,
        serverType: serverType,
        embedLink: embedUrl
      });
    }

    // Save updated episode doc to Firestore REST API
    const firestoreServerValues = updatedServers.map(s => ({
      mapValue: {
        fields: {
          serverName: { stringValue: s.serverName },
          serverType: { stringValue: s.serverType },
          embedLink: { stringValue: s.embedLink }
        }
      }
    }));

    await fetch(epUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          id: { stringValue: epDocId },
          animeId: { stringValue: animeDocId },
          seasonId: { stringValue: "s1" },
          episodeNumber: { integerValue: String(episodeNumber) },
          title: { stringValue: `Episode ${episodeNumber}` },
          servers: { arrayValue: { values: firestoreServerValues } },
          thumbnailUrl: { stringValue: coverImage },
          published: { booleanValue: true },
          updatedAt: { integerValue: String(Date.now()) }
        }
      })
    });

    return new Response(JSON.stringify({
      success: true,
      eventId: eventId,
      action: action,
      anilistId: aniIdNum,
      episodeNumber: episodeNumber,
      embedUrl: isDelete ? null : embedUrl,
      isNewAnime: isNewAnime,
      retainedNativeServers: cleanServers.map(s => `${s.serverName} (${s.serverType})`),
      message: isDelete 
        ? `MultiServer entry successfully deleted from Episode ${episodeNumber}`
        : `MultiServer entry successfully synchronized for ${title} Episode ${episodeNumber}`,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json"
      }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Internal server error in Cloudflare Pages sync function"
    }), {
      status: 500,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json"
      }
    });
  }
}
