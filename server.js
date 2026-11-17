const http = require("node:http");

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const origin = request.headers.origin;
  const isEvent = url.pathname === "/event";

  const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    isEvent ? process.env.EVENT_NETLIFY_ORIGIN : process.env.NETLIFY_ORIGIN
  ];

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Vary", "Origin");

  function sendJson(status, data) {
    response.statusCode = status;
    response.end(JSON.stringify(data));
  }

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return sendJson(403, { error: "허용되지 않은 사이트입니다." });
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (request.method !== "GET" || (!isEvent && url.pathname !== "/subway")) {
    return sendJson(404, { error: "/subway 또는 /event 경로를 사용해 주세요." });
  }

  let apiPath;

  if (isEvent) {
    const start = Number(url.searchParams.get("start") ?? "1");
    const end = start + 999;

    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end)) {
      return sendJson(400, { error: "start에 1 이상의 정수를 입력해 주세요." });
    }

    apiPath = `culturalEventInfo/${start}/${end}`;
  } else {
    const date = url.searchParams.get("date");

    if (!date || !/^\d{8}$/.test(date)) {
      return sendJson(400, { error: "날짜를 YYYYMMDD 형식으로 입력해 주세요." });
    }

    apiPath = `CardSubwayStatsNew/1/1000/${date}`;
  }

  const apiKey = process.env.SEOUL_API_KEY;

  if (!apiKey) {
    return sendJson(500, { error: "서울시 API 인증키가 설정되지 않았습니다." });
  }

  const apiUrl =
    `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${apiPath}`;

  try {
    const result = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15000)
    });

    if (!result.ok) {
      return sendJson(502, { error: "서울시 API 요청에 실패했습니다." });
    }

    const data = await result.json();
    const eventInfo = data.culturalEventInfo;

    if (isEvent && Array.isArray(eventInfo?.row)) {
      eventInfo.row = eventInfo.row.map(({ CODENAME, TITLE, DATE, PLACE, MAIN_IMG, ORG_LINK }) => ({
        CODENAME, TITLE, DATE, PLACE, MAIN_IMG, ORG_LINK
      }));
    }

    return sendJson(200, data);
  } catch {
    return sendJson(502, { error: "서울시 API 응답을 읽지 못했습니다." });
  }
});

server.listen(process.env.PORT || 10000, "0.0.0.0");
